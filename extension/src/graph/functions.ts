/**
 * Function-level graph layer.
 *
 * Extracts function/method definitions from source files and determines
 * which findings fall within each function. This is the "graph fidelity"
 * improvement from Phase 4 — not full dataflow (that requires a real AST
 * and is a multi-week problem), but it shows findings attached to the
 * function that contains them rather than just the file.
 *
 * Approach: regex-based function boundary detection per language.
 * Limitations: misses dynamic dispatch, closures, lambdas defined inline,
 * and deeply nested functions. Good enough for the "where does this finding
 * live?" use case without requiring an external parser.
 */

import * as fs from "fs";
import * as path from "path";
import type { Finding } from "../types";

export interface FunctionNode {
  id: string;          // "<filePath>::<functionName>"
  filePath: string;
  functionName: string;
  startLine: number;
  endLine: number;     // best-effort (indent-based for Python, brace-counting for others)
  findings: string[];  // finding IDs whose line range overlaps this function
  maxSeverity: string;
}

export interface FunctionEdge {
  caller: string;  // FunctionNode.id
  callee: string;  // FunctionNode.id (resolved to same file for now)
}

export interface FunctionGraph {
  functions: FunctionNode[];
  calls: FunctionEdge[];
}

// ─── Language parsers ─────────────────────────────────────────────────────

interface FunctionDef {
  name: string;
  startLine: number;
  endLine: number;
}

// Python: def/async def at any indentation level.
const PY_DEF = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/gm;

// JS/TS: function declarations, arrow functions, class methods.
const JS_DEF = /^[ \t]*(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{)/gm;

// Go: func declarations (methods and standalone).
const GO_DEF = /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/gm;

// Rust: fn declarations.
const RS_DEF = /^(?:\s*)(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/gm;

type LangParser = {
  exts: string[];
  pattern: RegExp;
  nameIdx: number[];
  endStrategy: "indent" | "brace";
};

const PARSERS: LangParser[] = [
  { exts: [".py"], pattern: PY_DEF, nameIdx: [2], endStrategy: "indent" },
  { exts: [".js", ".ts", ".jsx", ".tsx", ".mjs"], pattern: JS_DEF, nameIdx: [1, 2, 3], endStrategy: "brace" },
  { exts: [".go"], pattern: GO_DEF, nameIdx: [1], endStrategy: "brace" },
  { exts: [".rs"], pattern: RS_DEF, nameIdx: [1], endStrategy: "brace" },
];

const MAX_FILE_SIZE = 200_000;

function extractFunctions(filePath: string): FunctionDef[] {
  const ext = path.extname(filePath).toLowerCase();
  const parser = PARSERS.find((p) => p.exts.includes(ext));
  if (!parser) return [];

  let content: string;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return [];
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const defs: FunctionDef[] = [];
  let m: RegExpMatchArray | null;
  const re = new RegExp(parser.pattern.source, parser.pattern.flags);

  while ((m = re.exec(content)) !== null) {
    const name = parser.nameIdx.map((i) => m![i]).find(Boolean) ?? "<anonymous>";
    const matchIndex = m.index ?? 0;
    const startLine = lineOf(content, matchIndex) + 1;
    const endLine = estimateEnd(content, lines, matchIndex, parser.endStrategy, startLine);
    defs.push({ name, startLine, endLine });
  }

  return defs;
}

// Estimate end line of a function.
// For Python: find next def/class at same or lesser indentation.
// For brace-based languages: count braces from the opening {.
function estimateEnd(
  content: string,
  lines: string[],
  matchIndex: number,
  strategy: "indent" | "brace",
  startLine: number
): number {
  if (strategy === "indent") {
    const baseIndent = lines[startLine - 1]?.match(/^\s*/)?.[0].length ?? 0;
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= baseIndent && /^(\s*)(?:def|class|async\s+def)\s/.test(line) && i > startLine) {
        return i; // exclusive end = start of next def
      }
    }
    return lines.length;
  }

  // Brace strategy: scan forward from matchIndex to find balanced {}.
  let depth = 0;
  let inBraces = false;
  for (let i = matchIndex; i < content.length; i++) {
    const ch = content[i];
    if (ch === "{") { depth++; inBraces = true; }
    else if (ch === "}") {
      depth--;
      if (inBraces && depth === 0) {
        return lineOf(content, i) + 1;
      }
    }
  }
  return lines.length;
}

function lineOf(content: string, index: number): number {
  let line = 0;
  for (let i = 0; i < index; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

// ─── Call extraction ───────────────────────────────────────────────────────

// Extract function calls within a file to build intra-file call edges.
// Only resolves to functions defined in the same file — cross-file call
// resolution requires a proper symbol table (Phase 4 stretch goal).
function extractCalls(content: string, definedNames: Set<string>): Array<[string, string]> {
  const calls: Array<[string, string]> = [];
  const CALL_RE = /\b(\w+)\s*\(/gm;
  let m: RegExpMatchArray | null;
  while ((m = CALL_RE.exec(content)) !== null) {
    if (definedNames.has(m[1])) {
      calls.push(["_context_", m[1]]); // caller resolution below
    }
  }
  return calls;
}

// ─── Main builder ─────────────────────────────────────────────────────────

export function buildFunctionGraph(
  sourceFiles: string[],
  workspaceRoot: string,
  findings: Finding[]
): FunctionGraph {
  const nodes: FunctionNode[] = [];
  const calls: FunctionEdge[] = [];

  // Index findings by file for O(1) lookup.
  const findingsByFile = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.status === "resolved") continue;
    const arr = findingsByFile.get(f.filePath) ?? [];
    arr.push(f);
    findingsByFile.set(f.filePath, arr);
  }

  for (const absPath of sourceFiles) {
    const relPath = absPath.startsWith(workspaceRoot)
      ? absPath.slice(workspaceRoot.length).replace(/^[\\/]/, "")
      : absPath;

    const defs = extractFunctions(absPath);
    if (!defs.length) continue;

    const filefindings = findingsByFile.get(relPath) ?? [];
    const nameSet = new Set(defs.map((d) => d.name));

    // Read content once for call extraction.
    let content = "";
    try { content = fs.readFileSync(absPath, "utf8"); } catch { /* skip */ }

    const fileNodes: FunctionNode[] = defs.map((def) => {
      const nodeId = `${relPath}::${def.name}`;
      const contained = filefindings.filter(
        (f) => f.startLine >= def.startLine && f.startLine <= def.endLine
      );
      return {
        id: nodeId,
        filePath: relPath,
        functionName: def.name,
        startLine: def.startLine,
        endLine: def.endLine,
        findings: contained.map((f) => f.id),
        maxSeverity: maxSeverity(contained),
      };
    });

    nodes.push(...fileNodes);

    // Intra-file call edges: figure out which function contains each call site.
    if (content && fileNodes.length > 1) {
      const callRe = /\b(\w+)\s*\(/gm;
      let m: RegExpMatchArray | null;
      while ((m = callRe.exec(content)) !== null) {
        const calleeName = m[1];
        if (!nameSet.has(calleeName)) continue;
        const callLine = content.slice(0, m.index).split("\n").length;
        const callerNode = fileNodes.find(
          (n) => callLine >= n.startLine && callLine <= n.endLine
        );
        const calleeNode = fileNodes.find((n) => n.functionName === calleeName);
        if (callerNode && calleeNode && callerNode.id !== calleeNode.id) {
          const edgeKey = `${callerNode.id}→${calleeNode.id}`;
          if (!calls.some((e) => `${e.caller}→${e.callee}` === edgeKey)) {
            calls.push({ caller: callerNode.id, callee: calleeNode.id });
          }
        }
      }
    }
  }

  return { functions: nodes, calls };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function maxSeverity(findings: Finding[]): string {
  let max = "none", maxR = -1;
  for (const f of findings) {
    const r = SEV_RANK[f.severity] ?? 0;
    if (r > maxR) { maxR = r; max = f.severity; }
  }
  return max;
}
