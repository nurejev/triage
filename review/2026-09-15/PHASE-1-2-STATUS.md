# Phase 1 and 2 — implementation and acceptance ledger

15 September 2026. Local Beta 6 / main build 18. The implementation is available for local review; this is **not** a declaration of public-release or live-containment acceptance. The original deep review remains unchanged.

## Delivered in this candidate

Phase 1 adds explicit quick-user collection coverage/continuations, missing-UAL prerequisites, actor/target audits, stricter subject imports, corrected temporal/unknown-status detections, session cancellation, canonical response identity, explicit backend app-role/target/operation policy, durable action intent and guarded outcome states. The legacy mailbox helper resolves immutable identity and keeps zero/one/many results as arrays. Packaging uses allowlisted assets and opt-in Git updates; the updated backend runtime is pinned.

Phase 2 adds a common case envelope and legacy reader, preserved raw records with derived subject views, dispositions/notes, a same-origin one-time tenant-to-user handoff, explicit device saving/deletion, shorter runbook navigation, visible case context and keyboard finding interaction. The detailed existing runbook is retained. Imported evidence never restores response authority.

The implementation intentionally retains separate quick and tenant analysis engines, annotated with engine/build information. It does not claim identical rule coverage. Background analysis now runs in workers above 10,000 records, with cancellation and cross-engine fixture equivalence checks. A comprehensive stable rule catalogue, streaming file parsing and expanded Exchange schemas remain follow-on work. The 100 MB import boundary is enforced; it is not a performance guarantee for every file under that limit.

## Disposition of the original 16 findings

| # | Finding | Implemented / evidence | Remaining gate |
|---|---|---|---|
| 1 | Credential packaging | Static allowlist, private-path denial, pinned web image, baked-in default. Synthetic marker layer scan and HTTP smoke checks. | Companion extractor image is unchanged and outside this candidate's layer scan; review/pin it in P3 before distributing a new companion package. |
| 2 | Backend authority | `backend/policy.js`, signed app roles, analyst/mailbox/operation allowlists, protected IDs, mutation opt-in, canonical PowerShell lookup. Policy, signature and denied-request tests. | Apply reviewed migration to an actual backend registration; test effective Exchange permissions and negative scope live. |
| 3 | Missing UAL as zero | `TriageCase.sourceReady` requires complete source/window; blast checks refuse absent/short UAL. Regression covers complete-empty versus unavailable. | Live retention and license-dependent behavior. |
| 4 | Pagination | Quick structured page results, preserved error metadata, visible partial state and remaining-page continuation. Tenant continuation remains tested. | Live large-query limits, throttling and long-running UAL acceptance. Cancel retains completed sources; an in-flight quick request is not a durable job checkpoint. |
| 5 | Session teardown | Abort/generation guards, canonical case identity, modal closure and disarming across case changes, full quick exit. | Concurrent real browser sessions/analysts acceptance. |
| 6 | Mailbox concurrency | A single bounded read connection for quick-runbook mailbox inventories, serialized browser calls and bounded backend process/queue/output. Collector queue ownership tests remain passing. | The combined snapshot is sequential within one connection, not a transactional mailbox snapshot; live multi-analyst load acceptance remains. |
| 7 | PowerShell JSON | Explicit `ConvertTo-Json -InputObject`; actual helper fixtures test 0/1/2 rows and wrong identities for both helpers. | Live module response variants. |
| 8 | Wrong-user imports | Explicit subject choice, immutable-ID/UPN filtering, incompatible tenant rejection, strict status/CSV parsing, preserved original raw records. | Additional third-party schema fixtures in P4. Legacy files lacking identity cannot authorize response. |
| 9 | Evidence export | Shared schema v1, integrity validation, original raw records, source provenance, notes/dispositions and derived analysis. Round-trip and browser handoff tests. | Hashes are not signatures/authenticity; tenant raw records remain in user handoff bundles. |
| 10 | Coverage claims | Quick actor and target directory queries and findings; explicit interactive/non-interactive selection; workload-sign-in claim removed from user blast check. | Application assignments, workload sign-ins and full rule/source catalogue are P4. |
| 11 | Weak detections | Failure-before-success ordering, unknown status/risk handling, cleared forwarding correction and medium rapid-country-change signal. Positive/negative regression checks. | Broader rule calibration and documented benign baselines in P4; findings remain indicators. |
| 12 | Exchange imports | Unsupported artifacts still rejected; shared snapshot format retained. | New artifact schemas and analyzers are P4, not falsely represented as supported. |
| 13 | Exchange acquisition | Existing fixed read-only selected-mailbox collector retained. | Bulk planning, trace, connectors/transport and historical-source expansion are P3/P4. Preview Admin API remains unverified. |
| 14 | Provisioning/runtime | Legacy runtime now matches pinned collector runtime; new app script supplies explicit roles/v2 tokens and refuses credential overwrite. Parser and image-build checks. | Live provisioning/migration, idempotent reuse/rotation and native platform validation remain P3 acceptance work. |
| 15 | Authority/audit/verification | Device Graph intent before dispatch; backend flushed audit and duplicate operation reservation; enable/disable readback; other actions explicitly pending. `SECURITY.md` rewritten. | Real readback/audit failure/permissions acceptance. Local browser journal is not a tamper-resistant central archive. An explicit analyst-attested emergency preservation reason is required and journalled when preservation is not confirmed; organization-specific external approval policy remains outside the app. |
| 16 | Shared model/UI/tests | Common case services, handoff, device save, finding notes, keyboard interaction, short rail and responsive layout. 50 browser checks. | A full accessibility audit, streaming file parsing and production-scale capacity tests remain open. |

## Provenance

[ANALYZER-PROVENANCE.json](ANALYZER-PROVENANCE.json) records the local revision and file hashes. The exact upstream revision/licence of the previously copied blacklist data was not recorded in the supplied tree. Its unsupported MIT attribution has been removed; no new upstream code or lists were imported. Resolve the exact copied revision/licence before public distribution of updated derived material. Do not substitute the current upstream main-branch licence as historical proof.

## Acceptance and next steps

1. Review this local Beta 6 candidate using [the end-user walkthrough](../../BETA/docs/PHASE-1-2-GUIDE.md). Offline/demo checks and packaging tests are in [VALIDATION.md](../../BETA/docs/VALIDATION.md).
2. Complete the specifically authorized live test-tenant acceptance: Graph acquisition/continuation, backend role migration, allowed/denied Exchange reads, disposable-account response and state/audit checks. These were not run during this implementation.
3. Close the remaining P1/P2 release gates above before describing the phases as fully accepted or promoting the public site. Track streaming/large-file capacity and exact upstream provenance explicitly.
4. Proceed to the portable Docker run package and later Azure deployment phases separately. No deployment button or complete browser-only Exchange capability is claimed here.
