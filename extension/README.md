<div align="center">

# 🛡️ WatsonSec

**Real-time AI-powered security scanning, living inside your VS Code session.**

[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://open-vsx.org/extension/watsonsec/watsonsec)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-watsonsec-purple.svg)](https://open-vsx.org/extension/watsonsec/watsonsec)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-WatsonSec-black.svg)](https://github.com/tejgokani/WatsonSec)

WatsonSec is a VS Code extension that runs a continuous, intelligent security audit across your entire codebase — from the moment you open a project to every file save. It uses the AI agent already running in your session (GitHub Copilot, Cursor, Claude, Codex, and more) as its reasoning engine, requiring **zero API keys and zero configuration**.

</div>

---

## ✨ Features

- **Zero setup** — works with any AI agent already active in your VS Code session. No API keys, no accounts, no configuration.
- **Real-time scanning** — every file save triggers an instant re-scan of that file.
- **Full workspace scan** — scans every file on activation, open files first, then by most recently modified.
- **Background refresh loop** — periodically re-checks files with active findings to detect resolutions automatically, even without a save.
- **Inline gutter markers** — colored circle icons mark vulnerable lines directly in the editor.
- **Rich hover messages** — hover any gutter icon to see the full finding: type, CWE, CVE, description, and a concrete fix.
- **Live security report** — `security-report.md` is generated and kept up to date in your workspace root, organized by severity.
- **Automatic resolution detection** — when you fix a vulnerability and save, WatsonSec detects it and marks the finding resolved.
- **Multi-root workspace support** — each workspace folder is analyzed independently with the correct project type.
- **Language-aware analysis** — detects your stack (Node.js, Python, Go, Rust, Java, PHP, Ruby, and more) and tailors the analysis accordingly.
- **Smart chunking** — large files are split into overlapping 300-line chunks so no vulnerability gets missed at a split point.
- **Exponential backoff** — automatically retries on rate-limit or model-busy errors.
- **Priority scanning** — open files are scanned before the rest of the workspace.

---

## 🔍 Vulnerability Coverage

WatsonSec checks for every major class of web and application vulnerability, including:

| Category | Examples |
|---|---|
| **Injection** | SQL, NoSQL, Command, LDAP, XPath |
| **Cross-site scripting** | Reflected XSS, Stored XSS, DOM XSS |
| **Access control** | IDOR, CSRF, Broken authentication |
| **Server-side** | SSRF, RCE, Path traversal |
| **Secrets** | Hardcoded API keys, credentials, tokens |
| **Cryptography** | Weak algorithms, improper key handling |
| **Configuration** | Missing CSP/CORS/HSTS headers, exposed debug endpoints |
| **Dependencies** | Outdated packages with known CVEs |
| **Logic flaws** | Mass assignment, open redirects, business logic issues |
| **Deserialization** | Insecure deserialization vulnerabilities |

---

## 🚀 Installation

### VS Codium / Cursor / Gitpod
Search **WatsonSec** in the Extensions sidebar — it's available directly from the Open VSX registry.

### VS Code (Manual Install)
1. Download the latest `.vsix` from the [GitHub Releases](https://github.com/tejgokani/WatsonSec/releases)
2. Open VS Code → Extensions sidebar (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Click the `···` menu → **Install from VSIX...**
4. Select the downloaded file

### Command Line
```bash
code --install-extension watsonsec.watsonsec
```

---

## ⚡ Getting Started

1. **Install WatsonSec** using any method above
2. **Open a project folder** in VS Code
3. **Activate an AI agent** in your session — any of the following work:
   - GitHub Copilot
   - Cursor's built-in AI
   - Claude for VS Code
   - Any extension that registers with VS Code's Language Model API
4. **That's it.** WatsonSec starts scanning your workspace automatically.

---

## 🎨 Editor Experience

### Gutter Icons
Vulnerable lines are marked with colored circle icons in the editor gutter:

| Icon | Severity |
|---|---|
| 🔴 Red | Critical |
| 🟠 Orange | High |
| 🟡 Yellow | Medium |
| 🔵 Blue | Low |
| ⚪ Grey | Info |

### Hover Messages
Hover over any gutter icon to see the full finding detail:

```
SQL Injection — CRITICAL

CWE: CWE-89

User input is concatenated directly into a SQL query without
parameterization, allowing attackers to manipulate query logic.

Fix: Use parameterized queries or a prepared statement library
such as pg's $1/$2 syntax or an ORM query builder.
```

### Status Bar
The bottom status bar shows a live count of active findings:

```
🛡 🔴 2 critical  🟠 5 high  🟡 3 medium
```

Click it to open the security report instantly.

---

## 📋 Security Report

WatsonSec writes a `security-report.md` to your workspace root after every scan. It's organized by severity and updates automatically.

```markdown
# WatsonSec — Report

**Project:** my-app
**Last scanned:** 2026-06-14T17:00:00.000Z
**Status:** 2 critical · 5 high · 3 medium · 1 low

---

## 🔴 Critical

### src/db.js:42 — SQL Injection
**CWE:** CWE-89 | **Severity:** Critical
User input concatenated directly into SQL query.
**Fix:** Use parameterized queries.

---

## ✅ Resolved

### ~~src/auth.js:17 — Hardcoded Secret~~ — resolved 2026-06-14
```

---

## ⚙️ Configuration

All settings are available under **WatsonSec** in VS Code Settings (`Cmd+,`):

| Setting | Type | Default | Description |
|---|---|---|---|
| `watsonSec.enabled` | boolean | `true` | Enable or disable all scanning |
| `watsonSec.scanOnSave` | boolean | `true` | Scan a file whenever it is saved |
| `watsonSec.scanOnOpen` | boolean | `true` | Scan a file when it is opened |
| `watsonSec.minSeverity` | string | `"low"` | Minimum severity level to show (`critical`, `high`, `medium`, `low`, `info`) |
| `watsonSec.reportPath` | string | `"security-report.md"` | Path for the report file, relative to workspace root |
| `watsonSec.refreshInterval` | number | `60` | Seconds between background refresh checks. Set to `0` to disable. |

---

## 🖥️ Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and type **WatsonSec**:

| Command | Description |
|---|---|
| `WatsonSec: Run Full Scan` | Scan every file in the workspace |
| `WatsonSec: Scan Current File` | Scan only the file currently open in the editor |
| `WatsonSec: Open Security Report` | Open `security-report.md` in a side panel |
| `WatsonSec: Clear Resolved Findings` | Remove all resolved findings from the report |
| `WatsonSec: Enable` | Enable WatsonSec |
| `WatsonSec: Disable` | Disable WatsonSec |

---

## 🔄 How Resolution Detection Works

WatsonSec tracks every finding by a deterministic ID based on file path, line number, and vulnerability type. When you save a file after fixing an issue:

1. WatsonSec re-scans the file
2. It compares new findings against existing ones (with a ±3 line tolerance for line number shifts)
3. Any finding that no longer appears is automatically marked **resolved** with a timestamp
4. The gutter icon disappears and the finding moves to the Resolved section of the report

The **background refresh loop** does the same check on a configurable interval — so if you fix something in a terminal or external editor without saving through VS Code, WatsonSec still catches it.

---

## 🏗️ Supported Languages & Frameworks

| Language | Detection |
|---|---|
| JavaScript / TypeScript | `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs` |
| Python | `.py` |
| PHP | `.php` |
| Go | `.go` |
| Rust | `.rs` |
| Java | `.java` |
| Ruby | `.rb` |
| C / C++ | `.c`, `.cpp` |
| C# | `.cs` |
| Shell | `.sh` |
| HTML / CSS | `.html`, `.css` |
| YAML / JSON | `.yaml`, `.yml`, `.json` |
| Environment files | `.env` |

**Project type auto-detection:**

| Files present | Detected as |
|---|---|
| `package.json` + `express` | Node.js / Express |
| `package.json` + `next` | Next.js |
| `requirements.txt` / `pyproject.toml` | Python |
| `composer.json` | PHP / Laravel |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pom.xml` / `build.gradle` | Java / Spring |
| `Gemfile` | Ruby / Rails |

---

## 🔒 Privacy & Security

- **No data leaves your machine** except to the AI model provider active in your VS Code session (e.g. GitHub Copilot's servers, Anthropic's API via Claude for VS Code, etc.)
- **No API keys stored** — WatsonSec uses VS Code's built-in Language Model API and never touches your credentials
- **No telemetry** — WatsonSec collects nothing
- **Only reads files within your open workspace** — it cannot access files outside the workspace folders you have open
- **Prompt injection hardened** — code is enclosed in XML delimiters and the model is instructed to treat it as data, not instructions
- **Path traversal protected** — the report path is validated to stay within the workspace root

---

## 🤝 Compatible AI Agents

WatsonSec works with any AI agent that registers with VS Code's Language Model API:

- ✅ GitHub Copilot
- ✅ Cursor
- ✅ Claude for VS Code
- ✅ GitHub Copilot Chat
- ✅ Any extension implementing `vscode.lm`

---

## 📦 Building from Source

```bash
git clone https://github.com/tejgokani/WatsonSec.git
cd WatsonSec/extension
npm install
npx tsc
```

To package:
```bash
npx vsce package
```

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

## 🐛 Issues & Contributions

Found a bug or want to request a feature? Open an issue on [GitHub](https://github.com/tejgokani/WatsonSec/issues).

Pull requests are welcome.

---

<div align="center">
Built with ❤️ — WatsonSec keeps your code secure while you build.
</div>
