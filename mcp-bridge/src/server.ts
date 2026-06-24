#!/usr/bin/env node
/**
 * WatsonSec MCP Bridge — exposes the findings store as a read-only MCP server.
 *
 * Usage: watsonsec-mcp --store <path-to-findings.json>
 *
 * Configure in your coding agent's MCP settings:
 *   {
 *     "command": "node",
 *     "args": ["/path/to/watsonsec-mcp-bridge/dist/server.js",
 *              "--store", "/path/to/.watsonsec-store/findings.json"]
 *   }
 *
 * Resolution policy: findings are resolved by re-running the scanner, not by
 * agent self-report. This server is intentionally read-only so the store
 * stays grounded in what the real tools actually detected.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

// ─── Store loading ─────────────────────────────────────────────────────────

interface Finding {
  id: string;
  tool: string[];
  ruleId: string[];
  category: string;
  cwe?: number;
  severity: string;
  filePath: string;
  startLine: number;
  endLine: number;
  message: string;
  status: string;
  firstSeen: number;
  lastSeen: number;
  scanId: string;
}

interface StoreData {
  findings: Record<string, Finding>;
  scans: unknown[];
}

function loadStore(storePath: string): StoreData {
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    return JSON.parse(raw) as StoreData;
  } catch {
    return { findings: {}, scans: [] };
  }
}

function getStorePath(): string {
  const idx = process.argv.indexOf("--store");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  // Default: look relative to CWD (common when the MCP server is started
  // in the same directory as the VS Code workspace).
  return path.join(process.cwd(), ".watsonsec", "findings.json");
}

// ─── MCP server ────────────────────────────────────────────────────────────

const server = new Server(
  { name: "watsonsec", version: "0.3.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_findings",
      description:
        "Returns all active (non-resolved) security findings from the last WatsonSec scan. " +
        "Findings come from real scanner output (Semgrep, Gitleaks, Trivy, Checkov, Bandit, gosec, Grype, TruffleHog, CodeQL) " +
        "— not from LLM inference. Use this to understand what's currently flagged in the project.",
      inputSchema: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low", "info"],
            description: "Filter by severity. Omit to return all severities.",
          },
          category: {
            type: "string",
            description: "Filter by finding category (e.g. 'hardcoded-secret', 'sqli', 'vulnerable-dependency').",
          },
          limit: {
            type: "number",
            description: "Maximum number of findings to return. Default: 50.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "get_findings_for_file",
      description:
        "Returns active security findings for a specific file (by workspace-relative path). " +
        "Useful for checking what's flagged in the file you just wrote or modified.",
      inputSchema: {
        type: "object",
        required: ["filePath"],
        properties: {
          filePath: {
            type: "string",
            description: "Workspace-relative path to the file (e.g. 'src/auth/login.py').",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "get_summary",
      description:
        "Returns a summary of active findings grouped by severity and category. " +
        "Quick way to understand the current security posture without listing every finding.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "get_recent_scans",
      description:
        "Returns metadata for the most recent scan runs — which tools ran, how long they took, and any errors.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent scans to return. Default: 5.",
          },
        },
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const storePath = getStorePath();
  const store = loadStore(storePath);
  const allFindings = Object.values(store.findings);

  switch (request.params.name) {
    case "get_findings": {
      const args = (request.params.arguments ?? {}) as {
        severity?: string;
        category?: string;
        limit?: number;
      };
      let active = allFindings.filter((f) => f.status !== "resolved");
      if (args.severity) active = active.filter((f) => f.severity === args.severity);
      if (args.category) active = active.filter((f) => f.category === args.category);
      active.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
      const limit = args.limit ?? 50;
      const results = active.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: active.length,
                returned: results.length,
                findings: results.map(summarizeFinding),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_findings_for_file": {
      const { filePath } = (request.params.arguments ?? {}) as { filePath: string };
      // Reject absolute paths and traversal sequences — findings are keyed by
      // workspace-relative paths only, so any absolute path or ".." is invalid input.
      if (!filePath || path.isAbsolute(filePath) || filePath.includes("..")) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "filePath must be a workspace-relative path with no '..' segments" }) }],
        };
      }
      const active = allFindings.filter(
        (f) => f.status !== "resolved" && f.filePath === filePath
      );
      active.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { filePath, count: active.length, findings: active.map(summarizeFinding) },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_summary": {
      const active = allFindings.filter((f) => f.status !== "resolved");
      const resolved = allFindings.filter((f) => f.status === "resolved");

      const bySeverity: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      for (const f of active) {
        bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
        byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                activeFindings: active.length,
                resolvedFindings: resolved.length,
                bySeverity,
                byCategory,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_recent_scans": {
      const { limit = 5 } = (request.params.arguments ?? {}) as { limit?: number };
      const scans = (store.scans as unknown[]).slice(-limit).reverse();
      return {
        content: [{ type: "text", text: JSON.stringify(scans, null, 2) }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[watsonsec-mcp]", err);
  process.exit(1);
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function severityRank(s: string): number {
  return ({ critical: 4, high: 3, medium: 2, low: 1, info: 0 } as Record<string, number>)[s] ?? 0;
}

function summarizeFinding(f: Finding) {
  return {
    id: f.id,
    severity: f.severity,
    category: f.category,
    file: `${f.filePath}:${f.startLine}`,
    rule: f.ruleId[0],
    tool: f.tool.join(", "),
    message: f.message.slice(0, 200),
    status: f.status,
    cwe: f.cwe ? `CWE-${f.cwe}` : undefined,
  };
}
