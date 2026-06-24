import * as fs from "fs";
import * as path from "path";
import type { Finding } from "../types";

export interface GraphNode {
  id: string;           // workspace-relative file path
  label: string;        // filename only
  findings: string[];   // finding IDs on this file
  maxSeverity: string;  // worst severity across its findings
}

export interface GraphEdge {
  source: string;       // workspace-relative path
  target: string;       // workspace-relative path
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Parsers for each language's import syntax.
// These are intentionally regex-based and file-level only —
// function-level dataflow analysis is a Phase 4 stretch goal.
const IMPORT_PARSERS: Array<{
  ext: string[];
  pattern: RegExp;
  extractTarget: (match: RegExpMatchArray) => string;
}> = [
  {
    // Python: import x.y, from x.y import z
    ext: [".py"],
    pattern: /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm,
    extractTarget: (m) => (m[1] ?? m[2] ?? "").replace(/\./g, "/"),
  },
  {
    // JavaScript / TypeScript: import ... from './foo', require('./foo')
    ext: [".js", ".ts", ".jsx", ".tsx", ".mjs"],
    pattern: /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"]([^'"]+)['"]/gm,
    extractTarget: (m) => m[1],
  },
  {
    // Go: import "path/to/pkg" or import ( "path/to/pkg" )
    ext: [".go"],
    pattern: /^\s*"([^"]+)"\s*$/gm,
    extractTarget: (m) => m[1],
  },
  {
    // Rust: mod foo; use foo::bar;
    ext: [".rs"],
    pattern: /^\s*(?:mod|use)\s+([\w:]+)/gm,
    extractTarget: (m) => m[1].replace(/::/g, "/"),
  },
];

const MAX_FILES = 500;      // skip graph building on huge repos
const MAX_FILE_SIZE = 100_000; // bytes; skip binary/generated files

export function buildDependencyGraph(workspaceRoot: string, findings: Finding[]): DependencyGraph {
  const allFiles = collectSourceFiles(workspaceRoot);
  if (allFiles.length > MAX_FILES) {
    // Too large to be useful — return just the files that have findings.
    return buildFindingsOnlyGraph(findings);
  }

  const fileSet = new Set(allFiles.map((f) => relative(f, workspaceRoot)));
  const edges: GraphEdge[] = [];

  for (const absPath of allFiles) {
    const relPath = relative(absPath, workspaceRoot);
    const imports = extractImports(absPath);
    for (const imp of imports) {
      const resolved = resolveImport(imp, relPath, fileSet);
      if (resolved && resolved !== relPath) {
        edges.push({ source: relPath, target: resolved });
      }
    }
  }

  // Index findings by file.
  const findingsByFile = indexFindingsByFile(findings);

  const nodes: GraphNode[] = allFiles.map((absPath) => {
    const relPath = relative(absPath, workspaceRoot);
    const filefindings = findingsByFile.get(relPath) ?? [];
    return {
      id: relPath,
      label: path.basename(relPath),
      findings: filefindings.map((f) => f.id),
      maxSeverity: maxSeverity(filefindings),
    };
  });

  return { nodes, edges: dedupeEdges(edges) };
}

// Fallback: only show files that have active findings, no edges.
function buildFindingsOnlyGraph(findings: Finding[]): DependencyGraph {
  const byFile = indexFindingsByFile(findings);
  const nodes: GraphNode[] = [];
  for (const [filePath, filefindings] of byFile.entries()) {
    nodes.push({
      id: filePath,
      label: path.basename(filePath),
      findings: filefindings.map((f) => f.id),
      maxSeverity: maxSeverity(filefindings),
    });
  }
  return { nodes, edges: [] };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function collectSourceFiles(root: string): string[] {
  const results: string[] = [];
  const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out", "build", "__pycache__", ".venv", "vendor", "target"]);
  const SOURCE_EXTS = new Set([".py", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".go", ".rs"]);

  function walk(dir: string, depth: number): void {
    if (depth > 8) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (SOURCE_EXTS.has(path.extname(entry).toLowerCase()) && stat.size < MAX_FILE_SIZE) {
        results.push(full);
        if (results.length >= MAX_FILES) return;
      }
    }
  }

  walk(root, 0);
  return results;
}

function extractImports(filePath: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const ext = path.extname(filePath).toLowerCase();
  const imports: string[] = [];
  for (const parser of IMPORT_PARSERS) {
    if (!parser.ext.includes(ext)) continue;
    let m: RegExpMatchArray | null;
    const re = new RegExp(parser.pattern.source, parser.pattern.flags);
    while ((m = re.exec(content)) !== null) {
      const target = parser.extractTarget(m);
      if (target) imports.push(target);
    }
  }
  return imports;
}

function resolveImport(importPath: string, fromFile: string, fileSet: Set<string>): string | undefined {
  // Only resolve relative imports (start with . or /) — skip npm/stdlib.
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) return undefined;

  const dir = path.dirname(fromFile);
  const base = path.join(dir, importPath).replace(/\\/g, "/");

  // Try with common extensions.
  for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]) {
    const candidate = (base + ext).replace(/^\//, "");
    if (fileSet.has(candidate)) return candidate;
  }
  // Try as index file.
  for (const idx of ["/index.ts", "/index.js", "/__init__.py"]) {
    const candidate = (base + idx).replace(/^\//, "");
    if (fileSet.has(candidate)) return candidate;
  }
  return undefined;
}

function indexFindingsByFile(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.status === "resolved") continue;
    const arr = map.get(f.filePath) ?? [];
    arr.push(f);
    map.set(f.filePath, arr);
  }
  return map;
}

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function maxSeverity(findings: Finding[]): string {
  let max = "none";
  let maxRank = -1;
  for (const f of findings) {
    const r = SEV_RANK[f.severity] ?? 0;
    if (r > maxRank) { maxRank = r; max = f.severity; }
  }
  return max;
}

function relative(absPath: string, workspaceRoot: string): string {
  return absPath.startsWith(workspaceRoot)
    ? absPath.slice(workspaceRoot.length).replace(/^[\\/]/, "")
    : absPath;
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.source}→${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
