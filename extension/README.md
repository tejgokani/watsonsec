# WatsonSec

Real-time AI-powered security scanning for VS Code, using Claude by Anthropic.

## Setup

1. Install the extension.
2. Open the Command Palette (`Cmd+Shift+P`) and run **WatsonSec: Set Anthropic API Key**.
3. Enter your key (starts with `sk-ant-`). The extension will immediately begin scanning your workspace.

## Features

- Scans every file on save and on open.
- Gutter icons mark vulnerable lines (🔴 critical · 🟠 high · 🟡 medium · 🔵 low).
- Hover over a gutter icon to see the full finding with CWE, CVE, and a fix suggestion.
- `security-report.md` is generated and kept up to date in your workspace root.
- Resolved findings are automatically detected and marked when you fix code and save.

## Commands

| Command | Description |
|---|---|
| Set Anthropic API Key | Store your API key securely |
| Run Full Scan | Scan the entire workspace |
| Scan Current File | Scan only the active file |
| Open Security Report | Open `security-report.md` |
| Clear Resolved Findings | Remove resolved findings from view |
| Enable / Disable | Toggle the extension on/off |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `watsonSec.enabled` | `true` | Enable/disable scanning |
| `watsonSec.scanOnSave` | `true` | Scan on every file save |
| `watsonSec.scanOnOpen` | `true` | Scan when a file is opened |
| `watsonSec.minSeverity` | `"low"` | Minimum severity to show |
| `watsonSec.reportPath` | `"security-report.md"` | Path for the report file |

## Privacy

Your API key is stored in VS Code's secret storage. No code leaves your machine except to the Anthropic API.
