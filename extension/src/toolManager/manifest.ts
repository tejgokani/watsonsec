import type { ProjectFingerprint } from "../types";

export type ArchiveFormat = "tar.gz" | "zip" | "bare";

export type PlatformKey = string; // "${process.platform}-${arch}"

export interface PlatformAsset {
  name: string;
  format: ArchiveFormat;
}

export interface ToolManifest {
  key: string;         // matches ScannerAdapter.name
  displayName: string;
  version: string;
  repo: string;        // "owner/repo" on GitHub
  settingKey: string;  // VS Code config key (e.g. "semgrepPath")
  approximateMb: number;
  description: string;
  whyNeeded: (fp: ProjectFingerprint) => string;
  platforms: Partial<Record<PlatformKey, PlatformAsset>>;
  binaryInArchive: string;
  checksumAsset?: string; // filename of checksums file in the release
  pipPackage?: string;    // if set: install via pip, no binary download
}

export const LARGE_MB_THRESHOLD = 50;

export function releaseBaseUrl(m: ToolManifest): string {
  const tag = m.key === "codeql"
    ? `codeql-bundle-v${m.version}`
    : `v${m.version}`;
  return `https://github.com/${m.repo}/releases/download/${tag}`;
}

export function platformKey(): PlatformKey {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${process.platform}-${arch}`;
}

// Asset names verified against GitHub Releases API (June 2026).
// Before bumping a version, re-verify via:
//   curl -s https://api.github.com/repos/<owner>/<repo>/releases/latest | python3 -c "import sys,json; [print(a['name']) for a in json.load(sys.stdin)['assets']]"
export const TOOL_MANIFESTS: ToolManifest[] = [
  {
    // Semgrep publishes no standalone macOS/Windows binaries — pip only.
    key: "semgrep",
    displayName: "Semgrep",
    version: "1.127.0",
    repo: "semgrep/semgrep",
    settingKey: "semgrepPath",
    approximateMb: 40,
    description: "Static analysis across 30+ languages — WatsonSec's primary SAST engine",
    whyNeeded: () => "Semgrep is the core SAST scanner — without it WatsonSec has no pattern-based analysis",
    binaryInArchive: "semgrep",
    platforms: {},
    pipPackage: "semgrep==1.127.0",
  },
  {
    key: "gitleaks",
    displayName: "Gitleaks",
    version: "8.30.1",
    repo: "gitleaks/gitleaks",
    settingKey: "gitleaksPath",
    approximateMb: 12,
    description: "Detects hardcoded secrets and credentials in source and git history",
    whyNeeded: () => "Gitleaks scans every file for accidentally committed secrets",
    binaryInArchive: "gitleaks",
    checksumAsset: "gitleaks_8.30.1_checksums.txt",
    platforms: {
      "darwin-arm64": { name: "gitleaks_8.30.1_darwin_arm64.tar.gz",  format: "tar.gz" },
      "darwin-x64":   { name: "gitleaks_8.30.1_darwin_x64.tar.gz",    format: "tar.gz" },
      "linux-x64":    { name: "gitleaks_8.30.1_linux_x64.tar.gz",     format: "tar.gz" },
      "linux-arm64":  { name: "gitleaks_8.30.1_linux_arm64.tar.gz",   format: "tar.gz" },
      "win32-x64":    { name: "gitleaks_8.30.1_windows_x64.zip",      format: "zip"    },
    },
  },
  {
    key: "trufflehog",
    displayName: "TruffleHog",
    version: "3.95.6",
    repo: "trufflesecurity/trufflehog",
    settingKey: "trufflehogPath",
    approximateMb: 25,
    description: "Deep secret scanning with 700+ credential detectors and entropy analysis",
    whyNeeded: () => "TruffleHog catches secrets Gitleaks misses — OAuth tokens, cloud credentials",
    binaryInArchive: "trufflehog",
    checksumAsset: "trufflehog_3.95.6_checksums.txt",
    platforms: {
      "darwin-arm64": { name: "trufflehog_3.95.6_darwin_arm64.tar.gz",  format: "tar.gz" },
      "darwin-x64":   { name: "trufflehog_3.95.6_darwin_amd64.tar.gz",  format: "tar.gz" },
      "linux-x64":    { name: "trufflehog_3.95.6_linux_amd64.tar.gz",   format: "tar.gz" },
      "linux-arm64":  { name: "trufflehog_3.95.6_linux_arm64.tar.gz",   format: "tar.gz" },
      "win32-x64":    { name: "trufflehog_3.95.6_windows_amd64.tar.gz", format: "tar.gz" },
    },
  },
  {
    // OSV-Scanner asset names contain no version — just platform+arch.
    key: "osv-scanner",
    displayName: "OSV-Scanner",
    version: "2.4.0",
    repo: "google/osv-scanner",
    settingKey: "osvScannerPath",
    approximateMb: 15,
    description: "Scans lockfiles against Google's Open Source Vulnerability database",
    whyNeeded: (fp) =>
      `Your repo has lockfiles — OSV-Scanner checks ${fp.lockfilePaths.slice(0, 2).join(", ")} for known CVEs`,
    binaryInArchive: "osv-scanner",
    checksumAsset: "osv-scanner_SHA256SUMS",
    platforms: {
      "darwin-arm64": { name: "osv-scanner_darwin_arm64",      format: "bare" },
      "darwin-x64":   { name: "osv-scanner_darwin_amd64",      format: "bare" },
      "linux-x64":    { name: "osv-scanner_linux_amd64",       format: "bare" },
      "linux-arm64":  { name: "osv-scanner_linux_arm64",       format: "bare" },
      "win32-x64":    { name: "osv-scanner_windows_amd64.exe", format: "bare" },
    },
  },
  {
    key: "grype",
    displayName: "Grype",
    version: "0.114.0",
    repo: "anchore/grype",
    settingKey: "grypeePath",
    approximateMb: 30,
    description: "Container and filesystem CVE scanner against Anchore's vulnerability database",
    whyNeeded: (fp) =>
      `Your lockfiles qualify for Grype's CVE analysis — ${fp.lockfilePaths.slice(0, 2).join(", ")}`,
    binaryInArchive: "grype",
    checksumAsset: "grype_0.114.0_checksums.txt",
    platforms: {
      "darwin-arm64": { name: "grype_0.114.0_darwin_arm64.tar.gz",  format: "tar.gz" },
      "darwin-x64":   { name: "grype_0.114.0_darwin_amd64.tar.gz",  format: "tar.gz" },
      "linux-x64":    { name: "grype_0.114.0_linux_amd64.tar.gz",   format: "tar.gz" },
      "linux-arm64":  { name: "grype_0.114.0_linux_arm64.tar.gz",   format: "tar.gz" },
      "win32-x64":    { name: "grype_0.114.0_windows_amd64.zip",    format: "zip"    },
    },
  },
  {
    // Trivy uses "macOS-ARM64" / "macOS-64bit" naming (not darwin).
    key: "trivy",
    displayName: "Trivy",
    version: "0.71.2",
    repo: "aquasecurity/trivy",
    settingKey: "trivyPath",
    approximateMb: 50,
    description: "All-in-one scanner: vulnerabilities, misconfigs, and secrets in one pass",
    whyNeeded: () => "Trivy runs vuln + secret + misconfig checks in a single pass on any repo",
    binaryInArchive: "trivy",
    checksumAsset: "trivy_0.71.2_checksums.txt",
    platforms: {
      "darwin-arm64": { name: "trivy_0.71.2_macOS-ARM64.tar.gz",   format: "tar.gz" },
      "darwin-x64":   { name: "trivy_0.71.2_macOS-64bit.tar.gz",   format: "tar.gz" },
      "linux-x64":    { name: "trivy_0.71.2_Linux-64bit.tar.gz",   format: "tar.gz" },
      "linux-arm64":  { name: "trivy_0.71.2_Linux-ARM64.tar.gz",   format: "tar.gz" },
      "win32-x64":    { name: "trivy_0.71.2_windows-64bit.zip",    format: "zip"    },
    },
  },
  {
    key: "gosec",
    displayName: "gosec",
    version: "2.27.1",
    repo: "securego/gosec",
    settingKey: "gosecPath",
    approximateMb: 8,
    description: "Go-specific security scanner — unsafe packages, weak crypto, shell injection",
    whyNeeded: () => "Your repo has .go files — gosec catches Go-specific vulnerabilities",
    binaryInArchive: "gosec",
    checksumAsset: "gosec_2.27.1_checksums.txt",
    platforms: {
      "darwin-arm64": { name: "gosec_2.27.1_darwin_arm64.tar.gz",  format: "tar.gz" },
      "darwin-x64":   { name: "gosec_2.27.1_darwin_amd64.tar.gz",  format: "tar.gz" },
      "linux-x64":    { name: "gosec_2.27.1_linux_amd64.tar.gz",   format: "tar.gz" },
      "linux-arm64":  { name: "gosec_2.27.1_linux_arm64.tar.gz",   format: "tar.gz" },
      "win32-x64":    { name: "gosec_2.27.1_windows_amd64.zip",    format: "zip"    },
    },
  },
  {
    key: "syft",
    displayName: "Syft",
    version: "1.45.1",
    repo: "anchore/syft",
    settingKey: "syftPath",
    approximateMb: 45,
    description: "Generates Software Bill of Materials (SBOM) for supply-chain compliance",
    whyNeeded: () => "Syft catalogs every package for compliance and supply-chain visibility",
    binaryInArchive: "syft",
    checksumAsset: "syft_1.45.1_checksums.txt",
    platforms: {
      "darwin-arm64": { name: "syft_1.45.1_darwin_arm64.tar.gz",  format: "tar.gz" },
      "darwin-x64":   { name: "syft_1.45.1_darwin_amd64.tar.gz",  format: "tar.gz" },
      "linux-x64":    { name: "syft_1.45.1_linux_amd64.tar.gz",   format: "tar.gz" },
      "linux-arm64":  { name: "syft_1.45.1_linux_arm64.tar.gz",   format: "tar.gz" },
      "win32-x64":    { name: "syft_1.45.1_windows_amd64.zip",    format: "zip"    },
    },
  },
  {
    key: "codeql",
    displayName: "CodeQL",
    version: "2.17.6",
    repo: "github/codeql-action",
    settingKey: "codeqlPath",
    approximateMb: 900,
    description: "Deep dataflow + taint-tracking — catches injection, SSRF, deserialization",
    whyNeeded: (fp) => {
      const langs: string[] = [];
      if (fp.hasJavaScript) langs.push("JS/TS");
      if (fp.hasPython) langs.push("Python");
      if (fp.hasGo) langs.push("Go");
      return `Your ${langs.join("/")} codebase qualifies for CodeQL taint tracking — finds flaws pattern-matching misses`;
    },
    binaryInArchive: "codeql/codeql",
    platforms: {
      "darwin-arm64": { name: "codeql-bundle-osx64.tar.gz",   format: "tar.gz" },
      "darwin-x64":   { name: "codeql-bundle-osx64.tar.gz",   format: "tar.gz" },
      "linux-x64":    { name: "codeql-bundle-linux64.tar.gz", format: "tar.gz" },
      "linux-arm64":  { name: "codeql-bundle-linux64.tar.gz", format: "tar.gz" },
      "win32-x64":    { name: "codeql-bundle-win64.zip",      format: "zip"    },
    },
  },
  {
    key: "bandit",
    displayName: "Bandit",
    version: "1.7.9",
    repo: "PyCQA/bandit",
    settingKey: "banditPath",
    approximateMb: 5,
    description: "Python security linter — SQL injection, eval, subprocess, weak crypto",
    whyNeeded: () => "Your repo has .py files — Bandit catches Python-specific security issues",
    binaryInArchive: "bandit",
    platforms: {},
    pipPackage: "bandit==1.7.9",
  },
  {
    key: "checkov",
    displayName: "Checkov",
    version: "3.2.0",
    repo: "bridgecrewio/checkov",
    settingKey: "checkovPath",
    approximateMb: 50,
    description: "IaC scanner — Terraform, Dockerfile, and Kubernetes misconfigurations",
    whyNeeded: (fp) => {
      const what: string[] = [];
      if (fp.hasTerraform) what.push("Terraform configs");
      if (fp.hasDockerfile) what.push("Dockerfiles");
      if (fp.hasK8sManifests) what.push("Kubernetes manifests");
      return `Your ${what.join(", ")} — Checkov finds misconfigurations before they hit production`;
    },
    binaryInArchive: "checkov",
    platforms: {},
    pipPackage: "checkov==3.2.0",
  },
];

export function getManifest(key: string): ToolManifest | undefined {
  return TOOL_MANIFESTS.find((m) => m.key === key);
}
