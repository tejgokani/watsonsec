import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { FindingsStore } from "./store";
import { Orchestrator } from "./orchestrator";
import { DashboardServer } from "./dashboard/server";
import { StatusBar } from "./statusBar";
import { DiagnosticsManager } from "./diagnostics/manager";
import { exportMarkdown } from "./reports/exporter";
import { notifyIfUpdatesAvailable } from "./updater";
import { generateSbom } from "./orchestrator/adapters/syft";
import type { Finding } from "./types";

let scanDebounce: ReturnType<typeof setTimeout> | null = null;
let saveSinceLastSlowScan = 0;
let isScanning = false;
let pendingScanMode: "fast" | "full" | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  const config = vscode.workspace.getConfiguration("watsonsec");
  const port = config.get<number>("dashboardPort") ?? 7891;
  const debounceMs = config.get<number>("debounceMs") ?? 2000;
  const slowScanInterval = config.get<number>("slowScanSaveInterval") ?? 15;

  const store = new FindingsStore(context.globalStorageUri.fsPath);
  const orchestrator = new Orchestrator(store);
  const dashboard = new DashboardServer(store, port);
  const statusBar = new StatusBar();
  const diagnostics = new DiagnosticsManager();

  dashboard.start(workspaceRoot);

  // ─── Commands ──────────────────────────────────────────────────────────────

  const runFastScanCmd = vscode.commands.registerCommand("watsonsec.runScan", async () => {
    await executeScan(workspaceRoot, orchestrator, statusBar, diagnostics, store, "fast");
  });

  const runFullScanCmd = vscode.commands.registerCommand("watsonsec.runFullScan", async () => {
    await executeScan(workspaceRoot, orchestrator, statusBar, diagnostics, store, "full");
  });

  const openDashboardCmd = vscode.commands.registerCommand("watsonsec.openDashboard", () => {
    vscode.env.openExternal(vscode.Uri.parse(dashboard.url));
  });

  const exportReportCmd = vscode.commands.registerCommand("watsonsec.exportReport", async () => {
    const markdown = exportMarkdown(store);
    const reportPath = path.join(workspaceRoot, "watsonsec-report.md");
    fs.writeFileSync(reportPath, markdown, "utf8");
    const doc = await vscode.workspace.openTextDocument(reportPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage("WatsonSec: Report saved to watsonsec-report.md");
  });

  const generateSbomCmd = vscode.commands.registerCommand("watsonsec.generateSbom", async () => {
    const syftPath = config.get<string>("syftPath") ?? "syft";
    const outputPath = path.join(workspaceRoot, "watsonsec-sbom.cyclonedx.json");
    vscode.window.showInformationMessage("WatsonSec: Generating SBOM with Syft…");
    const result = await generateSbom(workspaceRoot, syftPath, outputPath);
    if (result.error) {
      vscode.window.showErrorMessage(`WatsonSec: SBOM generation failed — ${result.error}`);
    } else {
      const action = await vscode.window.showInformationMessage(
        `WatsonSec: SBOM saved (${result.packageCount} packages) → watsonsec-sbom.cyclonedx.json`,
        "Open File"
      );
      if (action === "Open File") {
        const doc = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(doc);
      }
    }
  });

  // ─── File watcher ──────────────────────────────────────────────────────────

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, "**/*"),
    false, false, true
  );

  const triggerScan = () => {
    saveSinceLastSlowScan++;
    const shouldRunSlow = saveSinceLastSlowScan >= slowScanInterval;
    if (shouldRunSlow) saveSinceLastSlowScan = 0;

    if (scanDebounce) clearTimeout(scanDebounce);
    scanDebounce = setTimeout(() => {
      executeScan(
        workspaceRoot,
        orchestrator,
        statusBar,
        diagnostics,
        store,
        shouldRunSlow ? "full" : "fast"
      );
    }, debounceMs);
  };

  watcher.onDidChange(triggerScan);
  watcher.onDidCreate(triggerScan);

  context.subscriptions.push(
    runFastScanCmd,
    runFullScanCmd,
    openDashboardCmd,
    exportReportCmd,
    generateSbomCmd,
    statusBar,
    diagnostics,
    watcher
  );

  // Initial fast scan on activation.
  executeScan(workspaceRoot, orchestrator, statusBar, diagnostics, store, "fast");

  // Check for scanner updates once, without blocking activation.
  notifyIfUpdatesAvailable().catch(() => { /* network failures are silent */ });
}

async function executeScan(
  workspaceRoot: string,
  orchestrator: Orchestrator,
  statusBar: StatusBar,
  diagnostics: DiagnosticsManager,
  store: FindingsStore,
  mode: "fast" | "full"
): Promise<void> {
  // Mutex: if a scan is already running, queue the requested mode and return.
  // "full" beats "fast" in the queue so a pending fast is upgraded if needed.
  if (isScanning) {
    pendingScanMode = (pendingScanMode === "full" || mode === "full") ? "full" : "fast";
    return;
  }
  isScanning = true;
  statusBar.setScanning();
  try {
    const result = mode === "full"
      ? await orchestrator.runFullScan(workspaceRoot)
      : await orchestrator.runFastScan(workspaceRoot);

    const active = result.findings.filter((f: Finding) => f.status !== "resolved");
    statusBar.setResults(active);
    diagnostics.update(result.findings, workspaceRoot);

    const errorTools = Object.keys(result.scan.errorsByTool);
    if (errorTools.length) {
      vscode.window.showWarningMessage(
        `WatsonSec: ${errorTools.join(", ")} could not run — check binary paths in settings`
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    statusBar.setError(msg);
    console.error("[watsonsec]", err);
  } finally {
    isScanning = false;
    if (pendingScanMode) {
      const next = pendingScanMode;
      pendingScanMode = null;
      executeScan(workspaceRoot, orchestrator, statusBar, diagnostics, store, next);
    }
  }
}

export function deactivate(): void {
  if (scanDebounce) clearTimeout(scanDebounce);
}
