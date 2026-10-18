# Beta 34 — guided case workspace

Date: 2026-09-18. Implemented in the repository only. Beta/web and desktop source version: 34 / 0.34.0.

The approved sequence is complete: correct completion meanings and evidence references, then apply Option 2. The seven existing routes, collection gate and separate response authorization remain in place.

## 1. Completion now describes recorded work

| Step | Completion rule |
|---|---|
| Collect | All selected sources complete. An ended run with missing, failed or partial sources shows an amber exception. Unknown original source selection remains explicit. |
| Review | Every current finding has a confirmed or benign decision with a reason. Confirmation needs an existing evidence reference. Investigating stays outstanding. No findings does not automatically complete Review. |
| Respond | Every phase has an analyst review with a reference or a documented exception. Pending/in-progress stays outstanding; exceptions remain amber. These records do not prove an action executed. |
| Hand over | An explicit next owner, channel/ticket, and next-action record. Exporting files alone never completes this step. The record includes time and outstanding work; it neither sends a message nor verifies recipient acceptance. |

The handover report and action-log export carry the same distinctions. Counts exclude decisions for findings that are no longer present.

## 2. Evidence comes before the decision

Findings now name their preserved source records. Single events, paired sign-ins, aggregate account/day findings, OAuth context and Exchange snapshots use their actual inputs. References are resolved through raw identity or exact complete values, including enriched records copied into a worker; they are not guessed from account names, timestamps or titles.

The drawer displays the attached source record before the review form. The first supporting reference attaches automatically. Aggregate findings offer every record through an expandable, paginated list, with original JSON available. Decision drafts survive opening records and navigation. A missing link is stated explicitly. References are local to the preserved case; this is not a new globally addressable evidence identifier.

A before/after comparison of all 37 sample findings preserved IDs, detection results, severity, statistics and user rollups. Only evidence-reference metadata was added. Raw evidence remains unchanged, and references survive case export/reopening.

## 3. Option 2 is applied

- **Prepare / Investigate / Act & transfer** group the seven steps.
- One case header emphasizes tenant, account or tenant-wide scope, requested duration, save state and response arming.
- Idle engine/session detail collapses; running collection and analysis stay visible.
- Evidence gaps persist on every Review tab and Respond.
- Source descriptions distinguish account evidence, tenant context and snapshots; the collection summary follows the selected plan.
- The evidence/decision drawer prioritizes Save review, with response planning secondary.
- Small screens expose all steps through an accessible expander, with statuses, disabled reasons and Escape handling.
- Returning from Connect refreshes the retained mailbox panel's Exchange readiness.

## Validation

- **Passed:** 52 analyzer/import fixture assertions and 89 unit/PowerShell tests, including eight new evidence/completion cases. Final verification used the repository-bundled PowerShell 7.6.2. A separate run using the host-selected PowerShell failed at runtime startup (CultureNotFoundException); its failure log is retained as `test-results/beta34-unit-concurrent-failure.log`.
- **Passed:** 186 browser checks, including evidence pagination, original-record inspection, decision drafts, outstanding/investigating counts, phase exceptions, zero-finding cases, export versus explicit handover, and case reopening.
- **Passed:** 67 isolated native desktop workflow checks, using synthetic PowerShell collectors. This includes checkpoint preservation, cancellation, foreign-tenant refusal, original records, reviews, saved cases, mailbox collection after reconnecting, OAuth scope and analysis status.
- **Visual review:** light/dark desktop and narrow-screen views inspected. Responsive checks cover 320, 390, 768 and 1024 pixels.
- **Passed:** JavaScript syntax checks and tracked-file whitespace check.
- **Not performed:** live Graph/Exchange/Azure access, tenant changes, Windows runtime acceptance, packaging/signing, publishing or deployment.

Logs are in `test-results/beta34-unit.log`, `beta34-browser.log` and `beta34-native.log`. Existing regression screenshots retain their earlier filename prefixes; the new workflow screenshots use `beta34-workflow-*`.

## Screenshots of the implementation

- [Light desktop](implementation/beta34-review-light.png)
- [Dark desktop](implementation/beta34-review-dark.png)
- [Small screen](implementation/beta34-mobile.png)
- [Recorded handover](implementation/beta34-handover.png)

## Existing limitation discovered during verification

Changing the evidence folder **after connecting** leaves that connection's raw checkpoints in its original folder. Reviewed case saves use the newly selected folder. Reconnect before collecting if raw checkpoints must use the new destination. This behavior predates the redesign and was not changed here. The native regression now distinguishes the established connection path from the reviewed-save destination rather than assuming both move together.

## Main implementation locations

- `BETA/js/desk-model.js`: review, phase and handover meanings; exports.
- `BETA/js/evidence.js`, `analyzers.js`, `exchange-analysis.js`: source-record references.
- `BETA/js/desk.js`, `BETA/css/desk.css`, `BETA/index.html`: grouped workflow, case header, gaps, drawer, handover and responsive navigation.
- `tests/workflow-evidence.test.cjs`, `tests/workflow-ui.mjs`: new regression coverage.
- `BETA/docs/USER-GUIDE.md`, `BETA/docs/VALIDATION.md`, build/changelog and package versions: current guidance and validation.

The original review HTML and the earlier comparison mockup are preserved. Other pre-existing repository changes were not reverted or committed.
