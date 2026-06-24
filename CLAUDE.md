# CLAUDE.md — watsonsec

This file covers Claude Code-specific guidance for working in this repo.

## The hybrid principle

When asked to "have the agent check for X security issue," ask first: is there already a deterministic scanner that checks for X? If yes, wire up or extend that adapter in `extension/src/orchestrator/adapters/`. Do not write a prompt asking yourself to detect X by reading the file.

Reserve your own reasoning for what tools cannot do: cross-finding correlation, business-logic flaws (IDOR, broken authorization), prioritizing which of many findings actually matters in context, and writing the human-readable report.

## Context before touching the pipeline

Before modifying `orchestrator/`, `aggregator/`, or `store/`:
- The aggregation/dedup layer is the most likely to silently regress
- Three dedup strategies in order: unique_id → hash_code → near-match (see `aggregator/dedup.ts`)
- Stable finding IDs are SHA-256 of (filePath, category, ruleId, contentFp) — they must survive line-number shifts
- The store writes a `.bak` before every save and loads from it on corruption

## Adding a new scanner adapter

1. Add file to `extension/src/orchestrator/adapters/<tool>.ts` implementing `ScannerAdapter`
2. Add entry to `TOOL_MANIFESTS` in `extension/src/toolManager/manifest.ts` with verified asset names
3. Register in `FAST_ADAPTERS` or `SLOW_ADAPTERS` in `extension/src/orchestrator/index.ts`
4. Add a fixture under `fixtures/<tool>/` with a known-vulnerable sample — do not skip this
5. Add setting to `extension/package.json` contributes.configuration

Never invent CLI flags or output formats for upstream tools. If unsure of a tool's interface, look it up — a wrong assumption produces a silently broken adapter.

## Tool manifest asset names

Asset names in `toolManager/manifest.ts` must be verified against the actual GitHub Release before committing. Use:
```bash
curl -s https://api.github.com/repos/<owner>/<repo>/releases/latest \
  | python3 -c "import sys,json; [print(a['name']) for a in json.load(sys.stdin)['assets']]"
```
Semgrep has no standalone binary — it is pip-only. OSV-Scanner asset names contain no version number.

## Dashboard and MCP bridge

- Dashboard (`dashboard/`) reads only from the findings store — never calls a scanner directly
- MCP bridge (`mcp-bridge/`) is read-only by design — resolution is always driven by re-scans
- Be conservative about adding write-capable MCP tools

## Things not to do

- Don't add ZAP, Nuclei, Falco, OPA, or OSSF Scorecard to the orchestrator — they target running infrastructure, not local files
- Don't use `exec()` (shell string) for subprocesses — always `execFile()` (array args)
- Don't set `Access-Control-Allow-Origin: *` on the dashboard API
- Don't commit real secrets even as test fixtures — use obviously-fake patterns (AKIAFAKEFAKEFAKEFAKE)
