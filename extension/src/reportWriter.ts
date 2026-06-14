import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Finding } from './types';

const DEBOUNCE_MS = 2000;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const SEVERITY_ORDER: Finding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪',
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function formatSection(severity: Finding['severity'], findings: Finding[]): string {
  const active = findings.filter(f => f.severity === severity && !f.resolvedAt);
  if (active.length === 0) return '';
  const emoji = SEVERITY_EMOJI[severity] ?? '';
  const title = severity.charAt(0).toUpperCase() + severity.slice(1);
  let out = `## ${emoji} ${title}\n\n`;
  for (const f of active) {
    out += `### ${esc(f.filePath)}:${f.line} — ${esc(f.type)}\n`;
    out += `**CWE:** ${esc(f.cwe)}`;
    if (f.cve) out += ` | **CVE:** ${esc(f.cve)}`;
    out += ` | **Severity:** ${title}\n`;
    out += `${esc(f.description)}\n`;
    out += `**Fix:** ${esc(f.fix)}\n\n---\n\n`;
  }
  return out;
}

function buildReport(findings: Finding[], workspaceName: string): string {
  const active = findings.filter(f => !f.resolvedAt);
  const resolved = findings.filter(f => f.resolvedAt);

  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of active) if (f.severity !== 'info') counts[f.severity]++;

  const statusParts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(' · ');

  let md = `# WatsonSec — Report\n\n`;
  md += `**Project:** ${esc(workspaceName)}\n`;
  md += `**Last scanned:** ${new Date().toISOString()}\n`;
  md += `**Status:** ${statusParts || 'No issues found'}\n\n---\n\n`;

  for (const sev of SEVERITY_ORDER) {
    md += formatSection(sev, active);
  }

  if (resolved.length > 0) {
    md += `## ✅ Resolved\n\n`;
    for (const f of resolved) {
      const date = f.resolvedAt!.toISOString().split('T')[0];
      md += `### ~~${esc(f.filePath)}:${f.line} — ${esc(f.type)}~~ — resolved ${date}\n\n`;
    }
  }

  return md;
}

export function writeReport(findings: Finding[], workspaceRoot: string, workspaceName: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const reportPath = vscode.workspace.getConfiguration('watsonSec').get<string>('reportPath') ?? 'security-report.md';
    const resolved = path.resolve(workspaceRoot, reportPath);
    const safeRoot = path.resolve(workspaceRoot) + path.sep;
    if (!resolved.startsWith(safeRoot)) {
      console.error('[WatsonSec] reportPath escapes workspace root — write aborted.');
      return;
    }
    const tmp = resolved + '.tmp';
    const content = buildReport(findings, workspaceName);
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, resolved);
    } catch (err) {
      console.error('[WatsonSec] Failed to write report:', err);
    }
  }, DEBOUNCE_MS);
}
