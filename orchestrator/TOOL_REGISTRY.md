# TOOL_REGISTRY.md — WatsonSec Scanner Registry

Every scanner adapter in this project must have an entry here before it is
merged. See `AGENTS.md` §"Adding a new scanner adapter" for the full checklist.

## Registered tools

| Tool | Version pinned | License | Runs on | Trigger |
|---|---|---|---|---|
| Semgrep CE | 1.72.0 | LGPL-2.1 | Any repo | file save (fast, debounced) |
| Gitleaks | 8.18.4 | MIT | Any repo | file save (fast, debounced) |
| OSV-Scanner | 1.8.1 | Apache-2.0 | Repos with lockfiles | file save (fast, debounced) |

## Pending (Phase 2)

| Tool | License | Blocker |
|---|---|---|
| Trivy | Apache-2.0 | Phase 2 |
| Checkov | Apache-2.0 | Phase 2, needs IaC fingerprint |
| CodeQL | Mixed (engine proprietary, queries open) | Phase 2, slow cadence |
| Bandit | Apache-2.0 | Phase 2, Python-only |
| gosec | Apache-2.0 | Phase 2, Go-only |
| Grype | Apache-2.0 | Phase 2 |
| Syft | Apache-2.0 | Phase 2 (SBOM) |
| TruffleHog | AGPL-3.0 | Phase 2; AGPL noted — only invoke as unmodified subprocess |

## Licensing notes

- Apache-2.0, MIT, LGPL: safe to invoke as subprocesses regardless of watsonsec's own license.
- AGPL-3.0 (TruffleHog): safe as an unmodified invoked subprocess. Risk only arises if
  watsonsec modifies-and-redistributes TruffleHog source. Do NOT rehost a modified TruffleHog binary.
- GPL-3.0 (MobSF): out of scope for in-extension use; not in registry.

## Version update policy

Pin a specific version in this table. Never silently auto-upgrade — rule
changes can shift what gets flagged and must be visible in the changelog.
When bumping a version, update both this table and the adapter's pinned
constant in `src/orchestrator/adapters/<tool>.ts`.
