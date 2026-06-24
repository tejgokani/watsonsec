/**
 * Syft SBOM adapter.
 *
 * Syft generates a Software Bill of Materials (SBOM), not vulnerability
 * findings. It runs as a separate command (watsonsec.generateSbom), never
 * in the scan pipeline. Output is written to watsonsec-sbom.cyclonedx.json
 * in the workspace root.
 *
 * The SBOM can be fed to Grype for deeper vulnerability analysis:
 *   grype sbom:watsonsec-sbom.cyclonedx.json --output sarif
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Pinned version documented in orchestrator/TOOL_REGISTRY.md
export const SYFT_PINNED_VERSION = "1.4.1";

const SYFT_TIMEOUT_MS = 60_000; // SBOM generation can be slow on large repos

export interface SbomResult {
  outputPath: string;
  packageCount: number;
  error?: string;
}

export async function generateSbom(
  workspaceRoot: string,
  binaryPath: string,
  outputPath: string
): Promise<SbomResult> {
  try {
    // dir: source to scan.
    // -o cyclonedx-json: CycloneDX JSON format (most widely supported).
    // --file: write directly to disk (avoids large stdout buffer).
    await execFileAsync(
      binaryPath,
      [
        `dir:${workspaceRoot}`,
        "-o", `cyclonedx-json=${outputPath}`,
        "--quiet",
      ],
      { timeout: SYFT_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 }
    );

    // Count packages from the output file.
    const { readFileSync } = await import("fs");
    const raw = readFileSync(outputPath, "utf8");
    const sbom = JSON.parse(raw) as { components?: unknown[] };
    const packageCount = sbom.components?.length ?? 0;

    return { outputPath, packageCount };
  } catch (err: unknown) {
    return {
      outputPath,
      packageCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
