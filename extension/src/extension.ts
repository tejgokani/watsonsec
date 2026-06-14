import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createDecorationTypes, disposeDecorationTypes, updateDecorations } from './decorationManager';
import { createStatusBar } from './statusBar';
import { initialize, onFileSaved, onFileOpened, scanCurrentFile, runFullScan, clearResolved, startRefreshLoop, stopRefreshLoop, dispose as disposeOrchestrator } from './orchestrator';
import { getFileFindings } from './resolver';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  createDecorationTypes();
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  initialize(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('watsonSec.openReport', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('No workspace open.');
        return;
      }
      const cfg = vscode.workspace.getConfiguration('watsonSec');
      const reportPath = cfg.get<string>('reportPath') ?? 'security-report.md';
      const workspaceRoot = folders[0].uri.fsPath;
      const fullPath = path.resolve(workspaceRoot, reportPath);
      const safeRoot = path.resolve(workspaceRoot) + path.sep;
      if (!fullPath.startsWith(safeRoot)) {
        vscode.window.showErrorMessage('WatsonSec: reportPath is outside the workspace — open aborted.');
        return;
      }
      if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, '# WatsonSec — Report\n\nNo issues found yet. Run a scan to get started.\n', 'utf8');
      }
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fullPath), { viewColumn: vscode.ViewColumn.Beside });
    }),

    vscode.commands.registerCommand('watsonSec.scanAll', () => { void runFullScan(); }),
    vscode.commands.registerCommand('watsonSec.scanFile', () => { scanCurrentFile(); }),
    vscode.commands.registerCommand('watsonSec.clearResolved', clearResolved),

    vscode.commands.registerCommand('watsonSec.enable', () => {
      vscode.workspace.getConfiguration('watsonSec').update('enabled', true, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage('WatsonSec enabled.');
    }),

    vscode.commands.registerCommand('watsonSec.disable', () => {
      vscode.workspace.getConfiguration('watsonSec').update('enabled', false, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage('WatsonSec disabled.');
    }),

    vscode.workspace.onDidSaveTextDocument(doc => { onFileSaved(doc); }),
    vscode.workspace.onDidOpenTextDocument(doc => { onFileOpened(doc); }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) updateDecorations(editor, getFileFindings(editor.document.uri.fsPath));
    }),

    { dispose: disposeDecorationTypes },
    { dispose: disposeOrchestrator },
  );

  void runFullScan();
  startRefreshLoop();
}

export function deactivate(): void {
  stopRefreshLoop();
  disposeOrchestrator();
  disposeDecorationTypes();
}
