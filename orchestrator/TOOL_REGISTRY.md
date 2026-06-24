# TOOL_REGISTRY.md — WatsonSec Scanner Registry

Every scanner adapter in this project must have an entry here before it is
merged. See `AGENTS.md` §"Adding a new scanner adapter" for the full checklist.

## Phase 1 — Fast adapters (run on every debounced save)

| Tool | Version pinned | License | Runs on |
|---|---|---|---|
| Semgrep CE | 1.72.0 | LGPL-2.1 | Any repo |
| Gitleaks | 8.18.4 | MIT | Any repo |
| TruffleHog | 3.78.0 | AGPL-3.0 ⚠️ | Any repo (see licensing note) |
| OSV-Scanner | 1.8.1 | Apache-2.0 | Repos with lockfiles |
| Grype | 0.78.0 | Apache-2.0 | Repos with lockfiles |
| Trivy | 0.52.2 | Apache-2.0 | Any repo (vuln + secret + misconfig in one pass) |
| Bandit | 1.7.9 | Apache-2.0 | Python repos (hasPython fingerprint) |
| gosec | 2.20.0 | Apache-2.0 | Go repos (hasGo fingerprint) |
| Checkov | 3.2.0 | Apache-2.0 | Repos with Terraform, Dockerfile, or k8s manifests |

## Phase 2 — Slow adapters (run on explicit command or every N saves)

| Tool | Version pinned | License | Cadence |
|---|---|---|---|
| CodeQL | 2.17.6 | Mixed (engine proprietary, queries open MIT/Apache-2.0) | Slow: creates/analyzes database; can take minutes |

## Phase 4 — SBOM generation (not a findings scanner)

| Tool | Version pinned | License | Command |
|---|---|---|---|
| Syft | 1.4.1 | Apache-2.0 | `watsonsec.generateSbom` — writes CycloneDX JSON to workspace root |

## Deferred

| Tool | License | Notes |
|---|---|---|
| SonarQube CE | LGPL-3.0 | Requires a running SonarQube server — evaluate for CI companion mode |
| MobSF | GPL-3.0 | Mobile-only, out of scope for in-extension use |

## Licensing notes

- Apache-2.0, MIT, LGPL: safe to invoke as subprocesses regardless of watsonsec's own license.
- **AGPL-3.0 (TruffleHog):** Safe as an unmodified invoked subprocess. Risk only arises if
  watsonsec modifies-and-redistributes TruffleHog source. Do NOT rehost a modified TruffleHog binary.
  The network-use clause of AGPL does NOT apply when simply shelling out to a published binary.
- CodeQL engine is proprietary (GitHub). The query packs are MIT/Apache-2.0. Invoking `codeql`
  as a subprocess is permitted under GitHub's CodeQL terms for non-commercial and open-source use.

## Version update policy

Pin a specific version in this table. Never silently auto-upgrade — rule
changes can shift what gets flagged and must be visible in the changelog.
When bumping a version:
1. Update the version string in this table
2. Update the `pinnedVersion` constant in `extension/src/orchestrator/adapters/<tool>.ts`
3. Update the `PINNED_VERSIONS` map in `extension/src/updater/index.ts`
4. Add a changelog entry describing what changed in that tool version's rules

The self-update checker in `extension/src/updater/index.ts` queries GitHub
Releases APIs and will notify the user when a newer version is available,
without automatically upgrading.
