<div align="center">

<img src="extension/assets/icon.png" width="160" alt="WatsonSec logo"/>

# WatsonSec

**Local-first security engine for AI-generated code.**  
Real scanners. Zero terminal setup. Runs on every save.

[![Version](https://img.shields.io/badge/version-1.0.0-orange)](https://github.com/tejgokani/watsonsec/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.125-blueviolet)](https://code.visualstudio.com)

</div>

---

## What it does

WatsonSec is a VS Code extension that runs **11 real open-source security scanners** against your codebase on every save — no terminal, no manual installs, no configuration. It normalizes findings across all tools, deduplicates them, surfaces them as inline squiggly lines in VS Code, and exposes them via a local dashboard and an MCP bridge your AI coding agent can query.

> **The hybrid principle:** A real entropy engine running on actual bytes is not the same as an LLM reasoning about "how secrets look." WatsonSec runs the real tools. The agent handles what tools cannot — correlation, business-logic flaws, prioritization, and report writing.

---

## Why it saves tokens

Security review is one of the highest-token tasks in an AI coding workflow. Without WatsonSec:

```
You:   "Review auth.py for security issues"
Agent: reads auth.py (≈ 4 000 tokens)
       reasons about patterns (≈ 3 000 tokens)
       writes findings (≈ 1 500 tokens)
       ──────────────────────────────────────
       Total: ≈ 8 500 tokens   |   accuracy: best-effort
```

With WatsonSec + MCP bridge:

```
You:   "Review auth.py for security issues"
Agent: calls get_findings_for_file("auth.py") → 3 findings (≈ 300 tokens)
       correlates + explains context (≈ 400 tokens)
       ──────────────────────────────────────────────
       Total: ≈ 700 tokens   |   accuracy: deterministic tools

Savings: ≈ 90 % fewer tokens per security review
```

**Why it's more accurate, not just cheaper:**
- Semgrep runs 5 000+ peer-reviewed rules — not pattern matching from training data
- Gitleaks uses 150+ regex detectors tuned for each credential type
- Grype queries a continuously updated CVE database
- None of these hallucinate

The agent's reasoning is reserved for what it's actually good at: explaining *why* a finding matters in the context of your specific business logic, and correlating findings across files.

---

## How it works

```
┌─────────────────────────────────────────────────────────────────────┐
│  VS Code                                                             │
│                                                                      │
│  ┌──────────┐  save   ┌────────────────────────────────────────┐   │
│  │  Editor  │────────▶│  Orchestrator                           │   │
│  └──────────┘         │                                         │   │
│                        │  1. Fingerprint workspace               │   │
│  ┌──────────┐         │     (stack detection — no LLM)          │   │
│  │ Problems │◀──┐     │                                         │   │
│  │  Panel   │   │     │  2. ToolManager auto-downloads          │   │
│  └──────────┘   │     │     any missing scanner binaries        │   │
│                  │     │                                         │   │
│  ┌──────────┐   │     │  3. Run adapters in parallel            │   │
│  │Dashboard │◀──┤     │                                         │   │
│  │ :7891    │   │     │  ┌────────┐ ┌────────┐ ┌────────┐      │   │
│  └──────────┘   │     │  │Semgrep │ │Gitleaks│ │ Trivy  │ ...  │   │
│                  │     │  └───┬────┘ └───┬────┘ └───┬────┘      │   │
│  ┌──────────┐   │     │      │  SARIF / JSON output  │          │   │
│  │   MCP    │◀──┘     │  ┌───▼──────────▼────────────▼───┐     │   │
│  │  Bridge  │         │  │  Aggregator                    │     │   │
│  └──────────┘         │  │  Normalize → Dedup → Store     │     │   │
│                        │  └────────────────────────────────┘     │   │
└─────────────────────────────────────────────────────────────────────┘
```

### Scan cadence

| Trigger | Adapters | When |
|---|---|---|
| **Fast** | 9 scanners in parallel | Every save (2s debounce) |
| **Full** | Fast + CodeQL | Every 15th save, or `Run Full Scan` |
| **SBOM** | Syft only | On demand via command |

### Finding lifecycle

```
new  ──▶  confirmed  ──▶  resolved
           ▲                  │
           └──────────────────┘
                reopened (regression)
```

Findings have **stable IDs** (SHA-256 of file + rule + content fingerprint) so they survive line-number shifts between saves. A finding that was `confirmed` doesn't become `new` again after a trivial refactor.

### Dedup engine (3-strategy)

Multiple scanners often flag the same issue. WatsonSec collapses them:

1. **unique_id** — trust the tool's own stable rule ID (Semgrep, CodeQL)
2. **hash_code** — SHA-256 of normalized `(file, category, ruleId, contentFp)` across tools
3. **near-match** — merge findings within ±5 lines with the same category bucket (catches Gitleaks + TruffleHog flagging the same secret with different rule IDs)

---

## Installation

### Step 1 — Install VS Code

[Download VS Code](https://code.visualstudio.com) if you don't have it.

### Step 2 — Install WatsonSec

**Option A (easiest):** Drag `watsonsec-1.0.0.vsix` onto the VS Code window.

**Option B:** Extensions panel → `⋯` → Install from VSIX → pick the file.

**Option C (from source):**
```bash
git clone https://github.com/tejgokani/watsonsec
cd watsonsec/extension
npm install
npm run build
npx vsce package --no-dependencies
# drag the generated .vsix onto VS Code
```

### Step 3 — Open a project

That's it. WatsonSec activates on any workspace. On first scan it detects which scanners are needed for your stack and downloads them automatically — no terminal required.

> **Large tools** (Semgrep 130 MB, Trivy 50 MB, CodeQL 900 MB) show a prompt before downloading so you can approve the bandwidth. Small tools download silently in the background.

---

## Scanner coverage

| Scanner | What it finds | Cadence | Size | Install |
|---|---|---|---|---|
| **Semgrep** | SAST — bugs and security issues across 30+ languages | Fast | 130 MB | Auto |
| **Gitleaks** | Hardcoded secrets and credentials | Fast | 12 MB | Auto |
| **TruffleHog** | Deep secret scanning — 700+ credential detectors, entropy analysis | Fast | 25 MB | Auto |
| **OSV-Scanner** | Dependency CVEs (lockfile scanning) | Fast | 15 MB | Auto |
| **Grype** | Container + filesystem CVE scanning against Anchore's DB | Fast | 30 MB | Auto |
| **Trivy** | Vulns + secrets + misconfigs in one pass | Fast | 50 MB | Auto (prompt) |
| **Bandit** | Python SAST — eval, subprocess, pickle, weak crypto | Fast | 5 MB | Auto (pip) |
| **gosec** | Go SAST — unsafe packages, MD5, shell injection | Fast | 8 MB | Auto |
| **Checkov** | Terraform, Dockerfile, k8s misconfiguration | Fast | 50 MB | Auto (pip, prompt) |
| **CodeQL** | Deep dataflow + taint tracking — finds injection, SSRF, deserialization | Slow | 900 MB | Prompt |
| **Syft** | SBOM generation — CycloneDX JSON for supply-chain compliance | On demand | 45 MB | Auto |

**Language-conditional:** Bandit only downloads for Python repos, gosec only for Go repos, Checkov only for IaC repos. The fingerprinter reads manifest files — no LLM inference.

---

## Dashboard

Open `WatsonSec: Open Dashboard` from the Command Palette → `http://127.0.0.1:7891`

```
┌─────────────────────────────────────────────────────┐
│ WatsonSec   47 active   Last scan: 14:23:01         │
│                                                      │
│ [Findings] [File Graph] [Function Graph] [History]  │
│                                                      │
│ Severity  Category      File              Line       │
│ ● CRIT    injection     src/auth.py       42         │
│ ● HIGH    secret        .env              3          │
│ ● HIGH    dependency    package-lock.json —          │
│ ● MED     misconfig     main.tf           17         │
│ ○ LOW     crypto        utils/hash.go     89         │
│                                                      │
│ Filter: [All severities ▼] [All tools ▼] [search]  │
└─────────────────────────────────────────────────────┘
```

**Four tabs:**
- **Findings** — full finding list with severity, category, file, line, and message. Filterable by severity, status, tool, and text search.
- **File Graph** — force-directed dependency graph. Nodes colored by worst finding severity. Shows which files are most connected to vulnerable files.
- **Function Graph** — findings mapped to individual functions within files. Identifies which function contains each vulnerability.
- **Scan History** — timeline of scans with tool run/skip/error status.

---

## VS Code inline diagnostics

Findings appear directly in the editor:

```python
def login(username, password):
    query = f"SELECT * FROM users WHERE name='{username}'"  # ← red squiggle
    #                                                           SQL Injection (CWE-89)
    cursor.execute(query)                                       Semgrep: python.lang.security.sqli
```

All findings also appear in **View → Problems** (`Ctrl+Shift+M` / `Cmd+Shift+M`), sortable by file and severity.

---

## MCP bridge — agent integration

The MCP bridge lets your AI coding agent (Claude, Cursor, Copilot) query live findings without re-reading source files.

### Setup

```bash
cd mcp-bridge
npm install && npm run build
```

Add to your agent's MCP config (`~/.claude/claude_desktop_config.json` or equivalent):

```json
{
  "mcpServers": {
    "watsonsec": {
      "command": "node",
      "args": [
        "/path/to/watsonsec/mcp-bridge/dist/server.js",
        "--store",
        "/path/to/your-project/.watsonsec/findings.json"
      ]
    }
  }
}
```

### Available tools

| Tool | Description |
|---|---|
| `get_findings` | All active findings, filterable by severity and category |
| `get_findings_for_file` | Findings for a specific file — agent calls this after writing code |
| `get_summary` | Security posture snapshot: counts by severity and category |
| `get_recent_scans` | Scan history, tool error log, finding deltas |

### Example agent workflow

```
Agent writes src/api/auth.ts
→ calls get_findings_for_file("src/api/auth.ts")
→ sees: "HIGH: JWT secret hardcoded at line 12 (Gitleaks)"
→ fixes it
→ WatsonSec re-scans on next save
→ finding transitions new → resolved
```

**Read-only by design.** The bridge cannot mark findings resolved. Resolution is driven exclusively by re-scans — the agent cannot self-report that it fixed something.

---

## Commands

`Cmd+Shift+P` / `Ctrl+Shift+P`:

| Command | Description |
|---|---|
| `WatsonSec: Run Fast Scan` | Trigger all fast scanners immediately |
| `WatsonSec: Run Full Scan (includes CodeQL)` | Fast + CodeQL deep analysis |
| `WatsonSec: Open Dashboard` | Open findings dashboard at localhost:7891 |
| `WatsonSec: Export Markdown Report` | Write `watsonsec-report.md` to workspace root |
| `WatsonSec: Generate SBOM (Syft)` | Write `watsonsec-sbom.cyclonedx.json` — feed to Grype for CVE analysis |

---

## Configuration

`Code → Settings → WatsonSec` (or `settings.json`):

| Setting | Default | Description |
|---|---|---|
| `watsonsec.semgrepPath` | `semgrep` | Override managed binary path |
| `watsonsec.gitleaksPath` | `gitleaks` | Override managed binary path |
| `watsonsec.trivyPath` | `trivy` | Override managed binary path |
| `watsonsec.checkovPath` | `checkov` | Override managed binary path |
| `watsonsec.banditPath` | `bandit` | Override managed binary path |
| `watsonsec.gosecPath` | `gosec` | Override managed binary path |
| `watsonsec.grypeePath` | `grype` | Override managed binary path |
| `watsonsec.trufflehogPath` | `trufflehog` | Override managed binary path |
| `watsonsec.codeqlPath` | `codeql` | Override managed binary path |
| `watsonsec.syftPath` | `syft` | Override managed binary path |
| `watsonsec.dashboardPort` | `7891` | Dashboard port |
| `watsonsec.debounceMs` | `2000` | ms to wait after save before scanning |
| `watsonsec.slowScanSaveInterval` | `15` | Fast scans between automatic full scans (0 = never) |

Path settings only needed if you have a custom install location. By default WatsonSec manages its own binaries in VS Code's extension storage — no system pollution.

---

## Project structure

```
watsonsec/
├── extension/                  VS Code extension (TypeScript + esbuild)
│   └── src/
│       ├── orchestrator/       Adapter runner + tiered cadence engine
│       │   └── adapters/       One file per scanner (11 adapters)
│       ├── toolManager/        Auto-download + binary resolution
│       ├── aggregator/         SARIF normalization + 3-strategy dedup
│       ├── store/              JSON persistence with backup + batched writes
│       ├── dashboard/          Local HTTP server + 4-tab UI + SVG graphs
│       ├── diagnostics/        VS Code Problems panel + squiggly lines
│       ├── graph/              File-level + function-level dependency graphs
│       ├── reports/            Markdown exporter
│       └── updater/            Scanner version checker
│
├── mcp-bridge/                 Standalone MCP server (stdio)
│   └── src/server.ts           4 read-only tools for agent integration
│
└── fixtures/                   Known-vulnerable samples for adapter testing
    ├── semgrep/                Python: SQLi, command injection, eval
    ├── gitleaks/               Fake AWS + GitHub credentials
    ├── osv/                    package-lock.json with known-CVE deps
    ├── trivy/                  Insecure Dockerfile
    ├── checkov/                Insecure Terraform (S3, SG, IAM, RDS)
    ├── bandit/                 Python: exec, pickle, weak crypto, SQLi
    ├── gosec/                  Go: MD5, shell injection, open redirect
    └── syft/                   package.json for SBOM generation testing
```

---

## Security

WatsonSec was audited against its own codebase (v0.4.1). Fixes applied:

- **CORS** — dashboard API removes the wildcard `Access-Control-Allow-Origin: *` that allowed any page in your browser to silently read your findings
- **MCP input validation** — `filePath` parameter rejects absolute paths and `..` traversal
- **Scan mutex** — concurrent scans are queued, not run simultaneously
- **Store backup** — `findings.json.bak` created before every write; loaded on corruption
- **Checksum verification** — downloaded binaries verified against each tool's published SHA-256 checksums
- **No shell expansion** — all subprocesses use `execFile` (array args), never `exec` (shell string)
- **Secret redaction** — secrets from Gitleaks and TruffleHog are redacted before reaching the findings store

---

## License

MIT — see [LICENSE](LICENSE)

Scanner licenses: Semgrep (LGPL-2.1), Gitleaks (MIT), TruffleHog (AGPL-3.0 — invoked as unmodified subprocess), OSV-Scanner (Apache-2.0), Grype (Apache-2.0), Trivy (Apache-2.0), Bandit (Apache-2.0), gosec (Apache-2.0), Checkov (Apache-2.0), CodeQL (engine proprietary / queries MIT+Apache-2.0), Syft (Apache-2.0).
