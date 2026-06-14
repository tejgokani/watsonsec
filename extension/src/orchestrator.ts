import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeChunk } from './claudeClient';
import { chunkFile, shouldExclude, shouldExcludeByContent } from './chunker';
import { updateFindings, getAllFindings, getFileFindings, clearResolved as clearResolvedStore } from './resolver';
import { updateDecorationsForFile } from './decorationManager';
import { updateStatusBar } from './statusBar';
import { writeReport } from './reportWriter';
import { resetProjectTypeCache } from './promptEngine';
import { Finding } from './types';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

let workspaceFolders: vscode.WorkspaceFolder[] = [];
let workspaceRoot: string | null = null;
let workspaceName = 'Unknown';
let outputChannel: vscode.OutputChannel | null = null;

const inFlight = new Map<string, vscode.CancellationTokenSource>();

// Tracks the mtime of each file at the time it was last successfully scanned.
// The refresh loop skips files whose mtime hasn't changed — no point re-scanning
// a file that hasn't been touched since the last scan.
const lastScannedMtime = new Map<string, number>();

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const _findingsUpdatedEmitter = new vscode.EventEmitter<Finding[]>();
export const onFindingsUpdated = _findingsUpdatedEmitter.event;

export function getOutputChannel(): vscode.OutputChannel | null {
  return outputChannel;
}

function log(msg: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

function getRootForFile(filePath: string): string {
  const normalized = path.normalize(filePath);
  for (const folder of workspaceFolders) {
    const folderPath = path.normalize(folder.uri.fsPath) + path.sep;
    if (normalized.startsWith(folderPath)) return folder.uri.fsPath;
  }
  return workspaceRoot ?? path.dirname(filePath);
}

function refreshFolders(): void {
  workspaceFolders = [...(vscode.workspace.workspaceFolders ?? [])];
  if (workspaceFolders.length > 0) {
    workspaceRoot = workspaceFolders[0].uri.fsPath;
    workspaceName = workspaceFolders[0].name;
  }
}

export function initialize(ctx: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('WatsonSec');
  ctx.subscriptions.push(outputChannel);

  refreshFolders();
  resetProjectTypeCache();

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshFolders();
      resetProjectTypeCache();
      log('Workspace folders changed — re-initialised.');
    })
  );
}

function getMinSeverityRank(): number {
  const minSev = vscode.workspace.getConfiguration('watsonSec').get<string>('minSeverity') ?? 'low';
  return SEVERITY_RANK[minSev] ?? 3;
}

function notifyUpdate(): void {
  const all = getAllFindings();
  updateStatusBar(all);
  if (workspaceRoot) writeReport(all, workspaceRoot, workspaceName);
  _findingsUpdatedEmitter.fire(all);
}

async function scanFileInternal(filePath: string, token: vscode.CancellationToken): Promise<void> {
  if (!workspaceRoot) return;
  if (shouldExclude(filePath)) return;

  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return;
  }

  if (shouldExcludeByContent(content)) return;
  if (token.isCancellationRequested) return;

  const chunks = chunkFile(filePath, content);
  if (chunks.length === 0) return;

  const fileRoot = getRootForFile(filePath);
  const allNewFindings: Finding[] = [];
  const minRank = getMinSeverityRank();

  await Promise.all(
    chunks.map(async chunk => {
      if (token.isCancellationRequested) return;
      try {
        const findings = await analyzeChunk(chunk, fileRoot, token);
        if (!token.isCancellationRequested) allNewFindings.push(...findings);
      } catch (err) {
        if (err instanceof vscode.CancellationError) return;
        log(`Error scanning ${path.basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  if (token.isCancellationRequested) return;

  const seen = new Set<string>();
  const deduped = allNewFindings.filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  const filtered = deduped.filter(f => (SEVERITY_RANK[f.severity] ?? 4) <= minRank);

  // Record mtime so the refresh loop can skip unchanged files
  try {
    const stat = await fs.promises.stat(filePath);
    lastScannedMtime.set(filePath, stat.mtimeMs);
  } catch { /* file may have been deleted mid-scan */ }

  updateFindings(filePath, filtered);
  updateDecorationsForFile(filePath, getFileFindings(filePath));
  notifyUpdate();
}

function startScan(filePath: string): void {
  const existing = inFlight.get(filePath);
  if (existing) existing.cancel();

  const cts = new vscode.CancellationTokenSource();
  inFlight.set(filePath, cts);

  scanFileInternal(filePath, cts.token).finally(() => {
    if (inFlight.get(filePath) === cts) inFlight.delete(filePath);
    cts.dispose();
  });
}

export function onFileSaved(document: vscode.TextDocument): void {
  const cfg = vscode.workspace.getConfiguration('watsonSec');
  if (!cfg.get<boolean>('enabled', true)) return;
  if (!cfg.get<boolean>('scanOnSave', true)) return;
  startScan(document.uri.fsPath);
}

export function onFileOpened(document: vscode.TextDocument): void {
  const cfg = vscode.workspace.getConfiguration('watsonSec');
  if (!cfg.get<boolean>('enabled', true)) return;
  if (!cfg.get<boolean>('scanOnOpen', true)) return;
  if (document.uri.scheme !== 'file') return;
  startScan(document.uri.fsPath);
}

export function scanCurrentFile(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor to scan.');
    return;
  }
  startScan(editor.document.uri.fsPath);
}

function getOpenFilePaths(): Set<string> {
  return new Set(vscode.workspace.textDocuments.filter(d => d.uri.scheme === 'file').map(d => d.uri.fsPath));
}

async function getFilesSortedByPriority(): Promise<vscode.Uri[]> {
  const files = await vscode.workspace.findFiles(
    '**/*',
    '{node_modules,vendor,.git,dist,build,.next}/**'
  );

  const openPaths = getOpenFilePaths();

  type Stamped = { uri: vscode.Uri; mtime: number; isOpen: boolean };
  const stamped: Stamped[] = await Promise.all(
    files.map(async uri => {
      try {
        const stat = await fs.promises.stat(uri.fsPath);
        return { uri, mtime: stat.mtimeMs, isOpen: openPaths.has(uri.fsPath) };
      } catch {
        return { uri, mtime: 0, isOpen: false };
      }
    })
  );

  stamped.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    return b.mtime - a.mtime;
  });

  return stamped.map(s => s.uri);
}

export async function runFullScan(): Promise<void> {
  if (!workspaceRoot) return;

  const cfg = vscode.workspace.getConfiguration('watsonSec');
  if (!cfg.get<boolean>('enabled', true)) return;

  for (const cts of inFlight.values()) cts.cancel();
  inFlight.clear();

  const files = await getFilesSortedByPriority();
  const scannable = files.filter(f => !shouldExclude(f.fsPath));
  const total = scannable.length;

  if (total === 0) {
    vscode.window.showInformationMessage('WatsonSec: No scannable files found.');
    return;
  }

  log(`Full scan started — ${total} files.`);
  const fullScanCts = new vscode.CancellationTokenSource();

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'WatsonSec', cancellable: true },
    async (progress, progressToken) => {
      progressToken.onCancellationRequested(() => fullScanCts.cancel());
      let done = 0;

      const BATCH = 10;
      for (let i = 0; i < scannable.length; i += BATCH) {
        if (fullScanCts.token.isCancellationRequested) break;
        const batch = scannable.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async file => {
            if (fullScanCts.token.isCancellationRequested) return;
            progress.report({ message: `${done + 1}/${total} — ${path.basename(file.fsPath)}`, increment: (1 / total) * 100 });
            await scanFileInternal(file.fsPath, fullScanCts.token);
            done++;
          })
        );
      }

      if (!fullScanCts.token.isCancellationRequested) {
        log(`Full scan complete — ${total} files checked.`);
        vscode.window.showInformationMessage(`WatsonSec: Scan complete — ${total} files checked.`);
      }
    }
  );

  fullScanCts.dispose();
}

async function refreshTick(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('watsonSec');
  if (!cfg.get<boolean>('enabled', true)) return;

  // Collect unique file paths that have at least one active (unresolved) finding
  const allFindings = getAllFindings();
  const filesWithFindings = [...new Set(
    allFindings.filter(f => !f.resolvedAt).map(f => f.filePath)
  )];

  if (filesWithFindings.length === 0) return;

  log(`Refresh tick — checking ${filesWithFindings.length} file(s) with active findings.`);

  for (const filePath of filesWithFindings) {
    // Skip if a save-triggered scan is already in flight for this file
    if (inFlight.has(filePath)) continue;

    // Skip if the file hasn't changed since we last scanned it
    try {
      const stat = await fs.promises.stat(filePath);
      const lastMtime = lastScannedMtime.get(filePath);
      if (lastMtime !== undefined && stat.mtimeMs === lastMtime) continue;
    } catch {
      continue; // file deleted or inaccessible
    }

    startScan(filePath);
  }
}

export function startRefreshLoop(): void {
  stopRefreshLoop();
  const intervalSecs = vscode.workspace.getConfiguration('watsonSec').get<number>('refreshInterval') ?? 60;
  if (intervalSecs <= 0) return;

  log(`Refresh loop started — interval ${intervalSecs}s.`);
  refreshTimer = setInterval(() => { void refreshTick(); }, intervalSecs * 1000);

  // Re-read interval if config changes while running
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('watsonSec.refreshInterval')) {
      startRefreshLoop();
    }
  });
}

export function stopRefreshLoop(): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    log('Refresh loop stopped.');
  }
}

export function clearResolved(): void {
  clearResolvedStore();
  notifyUpdate();
  for (const editor of vscode.window.visibleTextEditors) {
    updateDecorationsForFile(editor.document.uri.fsPath, getFileFindings(editor.document.uri.fsPath));
  }
}

export function dispose(): void {
  stopRefreshLoop();
  for (const cts of inFlight.values()) cts.cancel();
  inFlight.clear();
  lastScannedMtime.clear();
  _findingsUpdatedEmitter.dispose();
}
