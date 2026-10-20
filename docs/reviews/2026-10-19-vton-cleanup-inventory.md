# VTON remediation cleanup inventory

Date: 2026-10-19. Delivery branch: `codex/vton-review-remediation`.
Status: ten named documents removed after content/history inventory and reference checks;
branch cleanup awaits verified publication.

## Document candidates

These documents describe implemented or superseded security, inventory, catalog,
and MVP hardening work. Preserve current operating decisions in README,
`docs/MIGRATION_NOTES.md`, the active remediation design/plan, and the remediation
report before removing them. Historical review evidence remains under `docs/reviews`.

| Path | Git state | Evidence / replacement |
|---|---|---|
| `docs/plans/2026-10-13-vton-security-integrity-optimization.md` | tracked | Security/storage/session implementations retained; current remediation replaces session/Compose/dependency decisions |
| `docs/specs/2026-10-13-vton-security-integrity-optimization-design.md` | tracked | Same scope; image upload, TLS, memory-token and email queue tests remain |
| `docs/plans/2026-10-14-p0-data-concurrency-fixes.md` | tracked | Completion recorded by `e7fdacc`; current MariaDB concurrency gates supersede old execution instructions |
| `docs/specs/2026-10-14-p0-data-concurrency-fixes-design.md` | tracked | Variant inventory, payment idempotency, thread offloading and rate fallback covered by current code/tests |
| `docs/superpowers/specs/2026-10-13-vton-security-integrity-optimization-design.md` | ignored | Exact normalized-content duplicate of tracked security spec |
| `docs/superpowers/specs/2026-10-14-p0-data-concurrency-fixes-design.md` | ignored | Earlier P0 design copy, superseded by completed P0 work and current concurrency verification |
| `docs/superpowers/plans/2026-10-14-fashion-review-fixes.md` | ignored | Completed fashion remediation; retain `docs/reviews/REVIEW_fashion-review-fixes.md` and current inventory/API tests |
| `docs/superpowers/specs/2026-10-14-fashion-review-fixes-design.md` | ignored | Earlier catalog/inventory/API design; current README, migration history and tests carry implemented contracts |
| `docs/superpowers/plans/2026-10-14-mvp-hardening-plan.md` | ignored | Prior MVP implementation ends at source branch `f7ac031`; retain hardening report/decisions and current remediation plan |
| `docs/superpowers/specs/2026-10-14-mvp-hardening-design.md` | ignored | Old operations/auth decisions replaced explicitly; retain fulfillment/catalog/privacy contracts in code, tests and operating docs |

Ignored artifacts have no Git recovery guarantee. Their paths and replacement
decisions are recorded here before any removal. Only individual named files may
be deleted; no recursive docs-directory removal is authorized by this inventory.

## Retained documents

- Active `docs/superpowers/specs/2026-10-19-vton-review-remediation-design.md` and matching implementation plan.
- README, both migration-note documents, `docs/VTON_READINESS.md`, and all review/evidence reports.
- Earlier ignored plans/specs outside the explicit candidate table: not removed solely because of age.
- Original untracked `docs/VTON-review-fix-list.md` and `docs/reviews/PROMPT_fix_all_except_vton.md`: preserve their contents and untracked state.

Complete retained plan/spec inventory (all under `docs/superpowers`):

| Relative path | Retention reason |
|---|---|
| `plans/2026-10-10-safe-mvp-remediation-errata.md` | Preserve command corrections with its baseline plan |
| `plans/2026-10-10-safe-mvp-remediation-implementation.md` | Baseline fulfillment/order contracts exceed this remediation; completion not audited exhaustively |
| `specs/2026-10-10-safe-mvp-remediation-amendment.md` | Canonical single order-creation decision |
| `specs/2026-10-10-safe-mvp-remediation-design.md` | Baseline lifecycle/fulfillment design referenced by amendment |
| `plans/2026-10-11-evidence-first-cleanup-review.md` | Wider cleanup scope, no exhaustive completion proof in this task |
| `specs/2026-10-11-evidence-first-cleanup-review-design.md` | Preserve corresponding cleanup decisions |
| `plans/2026-10-11-mvp-solid-backend-refactor.md` | Wider architectural refactor outside the current 15 findings |
| `specs/2026-10-11-mvp-solid-backend-architecture-design.md` | Canonical feature-boundary rationale |
| `plans/2026-10-12-be-fe-flow-repair.md` | Related branch remains attached to an active worktree |
| `specs/2026-10-12-be-fe-flow-repair-design.md` | Preserve active flow-repair scope and future pilot requirements |
| `plans/2026-10-12-truelook-security-integrity-optimization.md` | Earlier five-phase refactor differs from the later security plan; not a proven duplicate |
| `specs/2026-10-12-truelook-security-integrity-optimization-design.md` | Preserve rebranding/architecture decisions outside this remediation |
| `plans/2026-10-13-fashion-catalog-variant-system.md` | Expand/contract roadmap contains requirements beyond this task |
| `specs/2026-10-13-fashion-catalog-variant-system-design.md` | Preserve canonical variant inventory/migration rationale |
| `plans/2026-10-19-vton-review-remediation.md` | Current approved execution record |
| `specs/2026-10-19-vton-review-remediation-design.md` | Current approved design |

The four tracked older documents are all in the deletion table; there are no
additional retained files in `docs/plans` or `docs/specs`.

Document cleanup result: deleted the four tracked files and six ignored files in
the candidate table, individually after validating each absolute path under
`D:\fastapi-founder\docs`. Preserved all 16 retained plan/spec files and both
original untracked documents. Updated the historical MVP report to point to the
current report/inventory; remaining old paths are historical provenance or this
deletion inventory, not live Markdown links.

## Branch candidates

Public GitHub metadata audit confirmed default branch `main`, no open PR heads,
and `protected=false` for each candidate. This is preliminary; re-fetch refs and
repeat metadata/ancestry checks immediately before deletion.

| Candidate | Preliminary tip | Rule |
|---|---|---|
| `feature/fashion-catalog` | `ce6e909` | Delete local/remote only when current tip is an ancestor of the verified published branch |
| `feature/vton-security-integrity-optimization` | `5c6823d` | Same rule |
| `fix/fashion-review-fixes` | `fae43e4` | Same rule |

Keep `main`, `local-history`, `fix/mvp-hardening`, the current branch, and
`be-fe-flow-repair` in its active worktree. Keep any candidate with unique commits,
protection, active PR work, or unverifiable state. Remote deletion must use the
verified-tip lease; local deletion uses `git branch -d`, never `-D`.

## Verified publication and branch cleanup (2026-10-20)

Published recovery anchor: `dc7df68f33382a34375938ca40f47b77587ba670` on
[`codex/vton-review-remediation`](https://github.com/ngthais0607/VTON-shopping-online/tree/codex/vton-review-remediation).
Fresh GitHub audit confirmed default `main`, no open PR heads/bases and no
protection for the three candidates. Each local/remote tip was an ancestor of
the published anchor; remote deletions used exact expected-tip leases and local
deletions used `git branch -d`.

| Branch | Preserved tip in published history | Actual result |
|---|---|---|
| `feature/fashion-catalog` | `ce6e9097d4aa378c5cbd920b8b3217264fd0d035` | deleted remote and local |
| `feature/vton-security-integrity-optimization` | `5c6823db6ea3a5017f7b3a1b3b984b89f3d96d8c` | deleted remote and local |
| `fix/fashion-review-fixes` | `fae43e441a24d799da9487c1b999156d76dc9fad` | deleted remote and local |

Independent `git ls-remote --heads origin` confirmed only `main`,
`fix/mvp-hardening` and the delivery branch remain remotely. Local `main`,
`fix/mvp-hardening`, `local-history`, delivery branch and `be-fe-flow-repair`
remain. The flow-repair worktree remains at `44b433a`; unique local history
was preserved. No merge or PR was created. Both original untracked user documents
remain outside commits. The ten document deletions and sixteen retained plans/specs
are detailed above/in the linked inventory.
