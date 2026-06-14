import * as vscode from 'vscode';
import { Finding } from './types';

let statusBarItem: vscode.StatusBarItem | null = null;

export function createStatusBar(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'watsonSec.openReport';
  statusBarItem.text = '$(shield) WatsonSec';
  statusBarItem.show();
  return statusBarItem;
}

export function updateStatusBar(findings: Finding[]): void {
  if (!statusBarItem) return;
  const active = findings.filter(f => !f.resolvedAt);
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of active) counts[f.severity]++;

  if (active.length === 0) {
    statusBarItem.text = '$(shield) No issues';
    statusBarItem.tooltip = 'WatsonSec — No active findings';
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const parts: string[] = [];
  if (counts['critical']) parts.push(`🔴 ${counts['critical']} critical`);
  if (counts['high']) parts.push(`🟠 ${counts['high']} high`);
  if (counts['medium']) parts.push(`🟡 ${counts['medium']} medium`);
  if (counts['low']) parts.push(`🔵 ${counts['low']} low`);
  if (counts['info']) parts.push(`⚪ ${counts['info']} info`);

  statusBarItem.text = `$(shield) ${parts.join('  ')}`;
  statusBarItem.tooltip = 'WatsonSec — Click to open report';
  statusBarItem.backgroundColor = counts['critical'] > 0
    ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : undefined;
}
