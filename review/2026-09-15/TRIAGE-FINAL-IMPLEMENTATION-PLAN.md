# Triage — consolidated implementation plan

Prepared 15 September 2026 against the current working tree: main build 17, beta build 5. This merges the 14 September deep review with the subsequent product, layout, Docker and Azure recommendations. It is an implementation plan, not a claim that the planned features are delivered.

## Decision

Build one investigation product with two entry points:

1. **Check a user:** public browser access, existing user investigation and detailed containment runbook, with corrected evidence handling and action verification.
2. **Investigate the tenant:** broader evidence collection and analysis, using browser collection, a local Docker runner or a customer-owned Azure runner.

Investigation scope and execution location are independent choices. A tenant Graph investigation can run in the browser. A single-user case may also need the Exchange runner. Keep offline evidence import available without sign-in.

Retain the ENCA green/lemon theme and the detailed runbook. Avoid a framework migration. Reuse the existing beta evidence and collector work, progressively replacing duplicated contracts and unsafe legacy behavior.

**Implementation priority: evidence correctness and containment authority, then shared case/layout, then portable execution and Azure deployment.** This refines the previous recommendation to start with interface unification: the original review correctly places unresolved P1 defects first.

## How the two reviews align

Both recommend a browser interface, direct Graph collection, a tenant-owned Exchange execution service, explicit coverage, portable evidence and separate read/write authority. Both retain the fast user-to-runbook path and reject promises to obtain every record simply by running Docker.

The deep review adds concrete correctness and authorization defects, an Exchange Admin API preview experiment, platform/provisioning constraints and stronger acceptance gates. The later recommendations add a portable run package, guided Docker setup, Azure Automation versus container execution, shared case handoff, analysis coverage tracking and upstream portability/licence checks. All are included below.

The original review describes build 14 / beta 2. Its findings and line references are historical evidence. They must not all be treated as either currently open or already fixed. The original document remains unchanged.

## Current baseline and remaining obligations

“Implemented / recorded tests” below refers to the existing Beta 3–5 validation record, not new test execution during preparation of this plan. Current code was inspected selectively. No real Graph/Exchange tenant calls, mutations, Azure deployments or new regression runs were performed for this document.

| Original finding | Current assessment | Remaining work / phase |
|---|---|---|
| 1. Docker credential packaging | Web image now copies allowlisted assets; private paths are excluded. Local image/path checks are recorded. | Synthetic secret-marker inspection of all image layers, release/runtime pins and dependency review remain. P1/P3. |
| 2. Backend authority | New read-only collector has explicit caller and mailbox checks. Legacy containment backend still accepts broad directory roles and executes with app authority. | Harden the mutation service independently; the collector does not fix it. P1. |
| 3. Missing UAL treated as zero | Tenant manifest exists. Quick-user blast code still falls back to empty records. | Source/window prerequisites for every dependent check and export. P1. |
| 4. Pagination | Tenant collector has partial states, continuation and retry/checkpoint behavior with recorded tests. Main helper still returns an array at its cap. | Apply structured collection results to quick-user collection and blast checks. P1. |
| 5. Session teardown | Tenant cleanup and beta quick-user document replacement have recorded tests. Root quick-user state machinery is not fully refactored. | Shared cancellation/session generation and canonical action identity. P1/P2. |
| 6. Mailbox concurrency | New collector queues snapshots. Legacy mailbox UI/backend retains the separate execution path. | Bounded snapshot read for the quick runbook; concurrent analyst acceptance. P1. |
| 7. PowerShell JSON shape | New snapshot script has zero/one/many fixtures. Legacy `Out-Json` still pipelines values. | Stable legacy response envelopes and schema checks. P1. |
| 8. Wrong-user imports | Tenant importer improved. Main importer still infers one subject and has ambiguous status handling. | Tenant/subject isolation before any quick-user analysis or containment handoff. P1. |
| 9. Beta evidence export | Tenant versioned bundle and round-trip tests implemented. | Shared format and explicit migration from quick-user exports. P2. |
| 10. Overstated coverage | Tenant event-type collection, MFA and identity resolution improved. | Actor/target audits in quick checks; application grants, workload sign-ins and rule coverage catalogue. P1/P4. |
| 11. Weak detection confidence | Selected tenant rules corrected. Quick-user detector is still the older implementation. | Temporal ordering, unknown risk, cleared forwarding and benign counterexamples across both engines. P1/P4. |
| 12. Exchange imports | Unsupported formats now rejected explicitly; several parser fixes have recorded tests. | Implement dedicated supported schemas and analyzers; rejection is not coverage. P4. |
| 13. Exchange acquisition | Read-only selected-mailbox collector includes hidden rules, delegation variants and audit settings. | Bulk mailbox planning, transport/connectors and trace; keep current and historical evidence distinct. P3/P4. |
| 14. Provisioning/runtime | New local init/role scripts and synthetic Docker checks exist. | Idempotent onboarding, permission proof, rotation, supported platforms and real tenant acceptance. P1/P3/P5. |
| 15. Authority/audit/verification claims | New collector improves some controls; legacy mutation path remains separate. | Durable action intent/results, exact token validation, target scope, readback and accurate per-mode documentation. P1. |
| 16. Shared model/UI/tests | Portable tests, CI and responsive beta views exist. Quick and tenant still differ in contracts and navigation. | Shared case/services, accessible interactions, export hardening and common UX. P2. |

The recorded Beta 5 results are 42 browser checks, 23 behavior tests and 38 analyzer/import assertions. These are useful regression coverage, not proof of live tenant correctness or closure of every original defect. Consult [the validation record](../../BETA/docs/VALIDATION.md) for scope and limitations.

## P1 — Make the existing user workflow trustworthy

**Deliverable:** the existing quick check and complete runbook, with trustworthy source states, identity attribution and authorization. No added containment powers in this phase.

Work packages:

1. Create a disposition ledger for all 16 review findings, tying each to affected routes, code, regression evidence and remaining live checks. Capture the exact upstream revisions/licences used for copied analyzer code and lists.
2. Apply the tenant collection contract to quick-user collection and blast-radius checks: records, state, requested UTC window, observed range, pages, continuation, query ID, acquisition times and errors. Never infer completeness from a nonempty array. A completed empty source must remain distinguishable from an unavailable source.
3. Require adequate source coverage before running dependent checks. A seven-day UAL acquisition cannot answer a thirty-day check. Exporting a subset cannot mark a whole evidence category preserved. Running and partial checks cannot export as completed answers.
4. Validate imports, retain actor and target identities, require explicit subject selection for multi-user files and reject incompatible tenants. Unknown CSV status must not become success. Deduplicate using source/event identity.
5. Fix the reproduced quick-user rule errors: success must follow the failure sequence within a defined window; hidden/unknown risk is unavailable detail; forwarding removal is not creation. Collect and analyze both actor and target directory events with their relationships preserved.
6. Bind the case and each approved action to tenant ID, immutable object ID, case ID and session generation. Abort/invalidate old work on exit or context switch. Never inherit armed state when handing off a case.
7. Correct the legacy Exchange path: explicit responder authorization, operation and canonical mailbox scope, independent Exchange permissions, stable JSON arrays, bounded read snapshots, exact token validation and key rollover handling. Reuse reviewed collector components where appropriate, while keeping mutation credentials/routes separate.
8. Record durable action intent and outcome, including failed requests and target identity. Show accepted, verification pending, verified or failed accurately. Use state readback where meaningful; a revocation response cannot prove that every existing session has ceased working. Define and log any approved emergency evidence-preservation exception.
9. Close packaging verification gaps: planted synthetic secret markers must be absent from every distributable image layer and HTTP path. Do not expose evidence or audit files through the static web root.

Primary areas: `js/graph.js`, `js/app.js`, `js/blast.js`, `js/import.js`, `js/detections.js`, `js/contain.js`, `backend/server.js`, `backend/exo.ps1`, `create-backend-appreg.ps1`, `SECURITY.md`, shared Docker files and `tests/`.

**Acceptance gate:** original relevant reproductions become regression tests; missing/truncated/wrong-user evidence cannot produce a clean or completed result; denied callers and out-of-scope targets cannot execute operations; zero/one/many mailbox responses work; session switches cannot execute stale actions. Live containment promotion additionally requires a disposable test tenant with authorized test identities and verified readback/audit behavior.

## P2 — Unify the case and improve both layouts

**Depends on:** the P1 evidence and identity contracts. Visual components can be designed earlier, but should not bypass those contracts.

Use one versioned case envelope containing tenant, subjects, sources, acquisition runs, raw evidence, stable rule/evidence references, findings, dispositions, notes and action history. Keep original evidence immutable; store derived analysis separately with rule versions. Hashes detect changes, not authenticity. Imported action history is historical information and never grants execution authority.

Provide explicit readers for existing quick and tenant exports. Preserve unknown or missing provenance as unverified; do not manufacture a complete manifest for older exports. Both entry points must open and save the common format.

The entry page offers two short cards with one main action each. Place setup in an environment panel rather than among everyday investigation controls. Use the same logo treatment, header, sidebar, theme tokens and persistent tenant/case/subject context.

Quick-user journey: **Select user → Check evidence → Assess findings → Contain if needed → Investigate further → Handover**. Keep the full runbook, but use a short step rail and expandable detail. Every action shows its access requirement and expected impact. Separate reader and responder access; arming requests only the relevant elevation.

Tenant journey: **Scope → Evidence sources → Execution location → Readiness → Collect → Investigate → Export/handover**. Select mailboxes by searchable identity; keep immutable IDs underneath. Keep advanced IDs and deployment settings in administrator views.

Show an active collection summary, current source, elapsed time, last update, counts and retry/poll status. Use distinct queued/running/partial/complete/unavailable/failed/cancelled/not-selected states, icons/text and reduced-motion support. Show a percentage only when its denominator is known. Permit examination of collected evidence while work continues.

Add “Investigate this user” from tenant findings. Carry case identity and relevant evidence into the runbook, clearly distinguishing actor, target and affected account. Reauthenticate/revalidate before changes. Keep tenant response notes labelled as notes.

Add a unified save/open flow and an explicit choice to retain a local case; do not silently persist sensitive evidence. Use streaming/background analysis for larger files, visible size limits and export/worker alternatives when browser capacity is exceeded. Neutralize spreadsheet formula prefixes in CSV exports.

**Acceptance gate:** legacy and new exports round-trip without losing provenance; tenant-to-user handoff preserves identity without armed state; keyboard/focus behavior and 320/390/736/1280-pixel layouts pass; every result links to evidence and visible coverage; all existing runbook sections remain available.

## P3 — Deliver the portable Docker run package

**Depends on:** P1 authorization and P2 case format. This is the first complete external-runner release.

Define a versioned, validated job manifest: tenant/case/object IDs, source IDs, UTC interval, scope, runner requirements and resource bounds. Pair it with a common output manifest containing raw files, source results, errors, checkpoints, tool/rule versions and hashes. No secrets in the downloadable package.

Package approved scripts, pinned image digests/module versions, configuration templates, permission descriptions, readiness checks and instructions. Routine user setup should pull a released image; source builds remain a developer option. Disable automatic moving-branch code updates for reproducible evidence runs. Record the actual version used.

The guided setup checks Docker, platform and storage; creates or reuses the app registration after administrator review; creates local certificate material; verifies consent, analyst assignment, mailbox scope and effective Exchange commands. Reruns must not duplicate applications or overwrite credentials. Add rotation and cleanup that preserves evidence unless explicitly selected for deletion.

Start the local web/API/runner on one origin. Keep evidence outside the web root. Provide status, cancellation, ownership checks, bounded concurrency, recoverable job metadata and restart checkpoints. A UI mailbox allowlist must not be represented as proof of Exchange-side scope; test both independently.

Allow one user, selected mailboxes or an explicitly selected tenant scope. Resolve and review the mailbox population before bulk work. Continue returning useful partial results when individual mailboxes fail.

User flow: **Download package → Complete administrator setup → Start local Triage → Run → Review in local app → Export/open in the public app**. Do not depend on public-site-to-localhost pairing for this first release. A normal web page cannot install or launch Docker by itself.

**Acceptance gate:** setup rerun, fresh install, restart/resume, disk/audit failure, unauthorized access, expired certificate and cancellation are tested. Same evidence contract is produced by browser and Docker. Validate real Exchange reads in a test tenant. Publish only tested architectures; document emulation when used rather than promising native ARM64 support.

## P4 — Expand collection and analysis with explicit coverage

**Depends on:** P2 contracts and P3 for Exchange jobs. Graph-only additions can progress once P2 is stable.

Prioritize application permission assignments and workload sign-ins; then bulk mailbox snapshots, tenant transport rules/connectors and partitioned message trace. Keep message content, eDiscovery, Power Platform and Azure subscription evidence as separate opt-in packs with their own permission and retention requirements. Add archive/SIEM import or collection paths for evidence that no longer exists in the live service.

For every source, implement collection, a versioned import adapter, normalized schema, raw evidence retention, analysis and fixtures. Publish a capability catalogue distinguishing supported collection, import-only, analysis subset, preview and unsupported. Collecting an inventory is not full analyzer coverage.

Create a rule catalogue with stable IDs, upstream revision/provenance, required fields, supported versions, confidence, benign counterexamples and test evidence. Separate collection completeness from analysis completeness; never hide analysis limits behind display pagination. Allow reviewed local baselines/exceptions, recording their version in results.

Treat Microsoft Extractor Suite and Microsoft Analyzer Suite as separate components. Verify exact output versions before claiming compatibility. The inspected upstream analyzers include Windows-specific checks and desktop dialogs: create headless adapters/ports and compare fixture results rather than assuming they run unchanged on Linux or Automation. Keep original upstream reports as optional artifacts; normalize evidence for the app instead of trying to recover evidence from formatted reports.

Resolve the current upstream GPL-3.0 licence versus README/local MIT attribution mismatch against the exact copied revision before refreshing or distributing derived material. An older revision's licence must be established from its own evidence, not inferred from today's main branch.

Run a separate, feature-flagged Exchange Admin API experiment: supported read endpoints only, tenant availability, OAuth/PKCE suitability, CORS/preflight, CSP, RBAC, paging and documented property contracts. Retain the worker fallback. Its preview status and limited operations make it an optional improvement, not a release dependency or a replacement for all Exchange cmdlets.

**Acceptance gate:** each added source has real sample fixtures, explicit completeness behavior and positive/negative permission tests. Each claimed analysis has supporting rules/tests. No “full coverage” label unless the actual requested and obtainable sources justify it.

## P5 — Add customer-owned Azure deployment

**Depends on:** portable job/output contracts and operational acceptance from P3. Azure work need not wait for every optional P4 evidence pack.

Offer one guided Azure setup with two supported execution profiles:

- **Azure Automation:** bounded, partitioned PowerShell collection jobs. Use documented Exchange managed-identity authentication where applicable, with explicit role grants. Stream artifacts/checkpoints to durable storage. Do not use the cloud sandbox as the universal large-file analyzer.
- **Azure Container Apps Jobs:** larger acquisitions or headless container analysis using the tested portable runner. Supply a separate authenticated web/API service because jobs have no ingress. Revalidate supported Exchange authentication; use protected certificate access when required rather than assuming direct managed-identity support.

Use an authenticated case/job API, durable status, bounded work dispatch and customer-owned evidence storage. Scope analysts to their permitted cases/targets. Do not embed Automation webhook secrets, application secrets or storage credentials in the SPA. Closing the browser must not cancel an external job; reopening should reconnect to its recorded status.

Build a versioned deployment template and deployment button with resource-group/region selection, cost-bearing resource summary, identities, permissions guide, runtime dependencies, storage retention/deletion, logging and outputs. Infrastructure deployment and Entra/Exchange consent are separate steps. Supply an administrator bootstrap for the latter; detect partial setup and support safe reruns.

The completion screen must show readiness for each source, not just “Azure deployment succeeded.” Include a harmless test collection, return URL and an exportable non-secret setup report. Define upgrade, rollback, credential rotation and uninstall behavior, keeping evidence deletion explicit.

**Acceptance gate:** deploy into a fresh test resource group; complete authorized tenant setup; submit from the app; close/reopen the browser; recover progress/results; verify denied users, scope, restart, timeout, partial results, storage and cleanup. Compare equivalent Docker/Azure runs against the same fixture contract. No deployment button is labelled ready before this end-to-end path passes.

## P6 — Release in stages with end-user walkthroughs

The first release candidate is the corrected quick-user workflow. The second is local full triage with the guided Docker package. Azure follows as its own accepted release, not a prerequisite for the public quick check.

For each stage, preserve the public stable route until acceptance and deliberate promotion. Record changes and validation with passed, failed, skipped and environment-dependent results. Pin released dependencies, gate image publishing on applicable tests, and retain rollback artifacts.

Deliver three separate walkthroughs: everyday quick-user investigation/containment; full-triage investigation and result interpretation; administrator Docker/Azure setup and removal. Demonstrate incomplete sources, failed setup and verification pending as well as the happy path. All screenshots must identify demo data.

## Immediate next implementation milestone

Start **P1: trustworthy quick-user evidence and containment**. First implement the shared source-result contract in quick collection/blast checks, strict multi-user imports and session-bound identity, with the reproduced defects as regression fixtures. Address the legacy mutation backend before promoting its use in the new layout. Then deliver P2 case handoff and navigation against the corrected contracts.

Do not start with another visual redesign, wholesale upstream script packaging or a deployment button. Existing working beta improvements should be retained and integrated, not rebuilt.

## Sources and current validation boundaries

- [Original deep review](../2026-09-14/TRIAGE-DEEP-REVIEW.md): historical finding IDs and reproductions.
- [Beta validation](../../BETA/docs/VALIDATION.md): previously recorded offline/browser/Docker evidence and outstanding live checks.
- [Current Azure design](../../BETA/docs/AZURE-OPTION.md): earlier Container Apps proposal; this plan adds the Automation execution profile and durable job requirements.
- [Exchange Admin API overview](https://learn.microsoft.com/en-us/exchange/reference/admin-api-overview) and [authentication](https://learn.microsoft.com/en-us/exchange/reference/admin-api-authentication): rechecked 15 September; preview, limited availability and scoped functionality. Direct browser feasibility remains untested.
- [Azure Automation quotas](https://learn.microsoft.com/en-us/azure/automation/automation-subscription-limits-faq): rechecked 15 September; cloud sandbox limits include 400 MB memory, 1 GB disk and three-hour runtime. Partition/stream jobs and recheck quotas when implementing.
- [Exchange managed identity](https://learn.microsoft.com/en-us/powershell/exchange/connect-exo-powershell-managed-identity?view=exchange-ps), [Container Apps Jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs) and [Automation webhook security](https://learn.microsoft.com/en-us/azure/automation/automation-webhooks): researched during the preceding recommendation; revalidate during P5.
- [Analyzer licence](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite/blob/main/LICENSE): rechecked 15 September; current file is GPL-3.0. Exact local provenance remains an open task.

This consolidation edits documentation only. It does not remediate the listed defects, grant permissions, change the product build, publish a site, run tenant actions or create cloud resources.
