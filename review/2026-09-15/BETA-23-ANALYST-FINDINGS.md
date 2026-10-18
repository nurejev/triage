# Triage Beta 23 — analyst workflow and suite coverage review

**Reviewed:** 15 September 2026. **Decision:** hold replacement of the live workflow until the priority findings below are addressed and retested. This is a review, not a deployment approval.

**Scope:** current working tree (Beta 23 / desktop 0.23.0), production at <https://triage.limon-it.nl> (build 14), and the two requested upstream suites. No application code was changed. No real Microsoft tenant was connected or modified. See [run report](BETA-23-REVIEW-RUN.md) for evidence, commands and limits.

## Executive assessment

The flat theme and evidence coverage display are useful improvements. The central problem is the analyst journey: the app collects information, presents signals, then asks the analyst to record a decision before making the supporting facts and next action easy to reach. The analyst must repeatedly leave the finding, hunt through source records, remember a reference, and return to a form. The first-hour page then documents work performed elsewhere instead of helping perform it.

**The apps do not currently provide everything Microsoft-Extractor-Suite and Microsoft-Analyzer-Suite provide.** Shared source names and selected ported detections are not proof of equivalent acquisition, analysis or reporting. The detailed comparison below identifies definite gaps and what still needs equivalence testing.

## Findings, in priority order

### F01 · P1 — The executable first-hour workflow is not connected to Beta

**Observed in UI and confirmed in code.** Production demo lets an analyst move directly from a finding to “Contain this account”. It presents evidence preservation, an arming boundary, six response steps, fifteen blast-radius checks, evidence exports, communication templates and an action log. Some production steps are explicitly manual; this review does not claim every production check is automated.

Beta’s “First 60 minutes” presents three paragraphs per phase and an outcome form. It has no runnable containment or blast-radius controls. That leaves the actual incident response outside the workspace.

[Beta runbook renderer](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:833)

[Manual phase definitions](/Users/mihaimonte/REPO/triage/BETA/js/desk-model.js:5)

[Production runbook controller](/Users/mihaimonte/REPO/triage/js/contain.js:817)

[Beta HTML includes the containment shell](/Users/mihaimonte/REPO/triage/BETA/index.html:73), but `desk.js` has no `TriageContain.start` call or `TriageApp` adapter. Loading the script is not integrating the workflow.

**Required outcome:** a finding opens an account-scoped response workspace with relevant checks, preservation, explicit authorization for writes, execution results and linked action-log entries. Maintain separate read-only acquisition and response permissions. Desktop and browser limitations must be explicit rather than silently replacing execution with a checklist.

**Acceptance:** follow a sample malicious inbox-rule finding through preservation → relevant check → simulated approved response → verified result → handover without reconstructing the steps in another tool.

### F02 · P1 — Findings and evidence are difficult to investigate

**Observed.** The finding modal leads with review fields. It does not link to its supporting record or recommend the next investigative action. The evidence list for 66 audit events shows the same account name repeatedly, with timestamps, but hides the operation and IP until each record is opened. Opening `ual:1` displays raw JSON; the forwarding destination and rule conditions are present but require technical reading.

- [Evidence row labels](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:694) prefer `userPrincipalName` over the operation.
- [Finding rows](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:704) omit timestamps and supporting references.
- [Raw record modal](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:1233)
- [Review modal](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:1451)

**Required outcome:** show what happened, when, who/what acted, IP/application, affected object, why it matters, supporting evidence and next step. Keep raw JSON as a secondary view. Add source-specific tables and search. Evidence is now clickable; the remaining defect is usability and context, not clickability.

**Acceptance:** from an inbox-rule finding, identify its destination, conditions, actor and time and attach the correct supporting record without manually copying an index.

### F03 · P1 — “Verified” only proves that a referenced record exists

**Reproduced in the isolated sample case.** Selected “Contain & record”, chose “Verified against evidence”, entered a note explicitly saying no containment had been executed, and referenced `interactive:1`. Beta accepted the outcome and displayed the phase as verified.

[Outcome validation](/Users/mihaimonte/REPO/triage/BETA/js/desk-model.js:164) checks reference existence, not target, action, time or result. The overview counts these as verified phases. This is an analyst attestation, not execution verification; the current labels blur that distinction.

**Required outcome:** distinguish “analyst recorded” from “result verified”. Actual verification should link the action, target, execution result and appropriate follow-up evidence. Do not imply that arbitrary evidence establishes containment.

### F04 · P1 — Suite coverage is materially incomplete

**Confirmed by source comparison; no tenant-side equivalence run was performed.** See the matrices below. Important gaps include application permissions, managed-identity collection, message trace, transport rules, Azure activity and broader configuration/security inventories. The importer also explicitly rejects several upstream Exchange exports.

**Required outcome:** define and display a versioned coverage contract for each mode, including unsupported sources, required access, collection limits and analysis support. The completeness percentage must describe selected supported queries, not imply complete forensic coverage.

### F05 · P1 — The downloadable applications still contain Beta 22

**Verified inside both ZIPs without running them.** The source is Beta 23, but both `BETA/downloads/Triage-macOS-arm64.zip` and `Triage-Windows-x64.zip` contain `BETA/js/build.js` declaring build **22**. Download buttons point to these files at [desk.js:1402](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:1402).

**Impact:** testing a freshly downloaded app does not test the current source changes. This can explain differences between web and portable experiences without requiring an authentication diagnosis.

**Acceptance:** before release, produce and validate fresh packages, inspect embedded versions, publish matching checksums, and test those exact artifacts. No packages were rebuilt during this review.

### F06 · P2 — Inspecting evidence discards an unfinished runbook note

**Reproduced.** Type a note in “What happened? Who owns the next step?”, navigate to Evidence to obtain a reference, then return to First 60 minutes. The note is blank; no draft warning appeared. This is precisely the navigation the form asks the analyst to perform.

[Runbook form rendering](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:833) creates empty fields. Existing connection-transition draft preservation does not solve page-navigation draft loss.

**Acceptance:** drafts survive navigation and modal transitions; cancelling a draft is explicit. Prefer an evidence picker within the current task.

### F07 · P2 — Handover exports counts rather than the investigation

**Code-inspected.** [Handover generation](/Users/mihaimonte/REPO/triage/BETA/js/desk-model.js:256) exports counts, coverage, phase notes and the action log. It does not include the actual finding list, key supporting facts, structured ownership/open tasks, or a clear current containment assessment. Production provides a printable report and findings CSV; those equivalents are not presented by Beta’s findings view.

**Required outcome:** a readable case brief: affected account/tenant, incident window, key findings and confidence, actions/results, impact, evidence gaps, outstanding work with owner, and evidence references. Provide a technical appendix and machine-readable bundle alongside it.

**Acceptance:** another analyst can understand what happened and take the next action using the handover without opening the application or reconstructing the entire raw bundle.

### F08 · P1 for release readiness — Handover claims and validation exceed current evidence

The existing [Beta 23 handover](/Users/mihaimonte/REPO/triage/review/2026-09-15/HANDOVER-BETA-23.md) claims a numbered sidebar, source/response links in findings and an integrated Respond page. These are absent from the current `desk.js` and observed Beta screen. This discrepancy existed before this review; the source hashes remained unchanged during the review.

Current results: engine assertions pass; **71 Node tests pass**. The browser suite fails at [desk.dom.test.mjs:442](/Users/mihaimonte/REPO/triage/BETA/desk.dom.test.mjs:442), because `[data-page=home]` matches both the brand and Start buttons. The native connection suite reports 13 successful checks, then fails at [desktop-connections.mjs:200](/Users/mihaimonte/REPO/triage/tests/desktop-connections.mjs:200), trying to read an Exchange worker marker that does not exist after early cancellation. That failure alone does not establish a product cancellation bug; the test assumes the worker already started.

**Acceptance:** reconcile documentation with shipped code, repair the tests, obtain complete end-to-end results, then test the packaged apps on macOS and Windows with authorized test-tenant access. Historical passkey/timeouts remain unverified in this review.

## Coverage contract: Extractor Suite versus Triage

Reference: [MES at 47565f7](https://github.com/invictus-ir/Microsoft-Extractor-Suite/tree/47565f7842784cd3667ff630e3dccb49fa3408ed). Its manifest and 29 collection scripts were downloaded for read-only inspection. The table compares capabilities, not execution speed or tenant retention guarantees.

**Legend:** Partial = a related path exists but full field/scope/output parity is not established. Missing = no dedicated collection path in the current Beta catalog/collector. “Both” means browser and portable source code, not successful tenant validation.

| MES capability                                  | Triage browser                  | Triage portable                                | Review result                                                                                              |
| ----------------------------------------------- | ------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Interactive/non-interactive user sign-ins       | Present                         | Present                                        | Partial: page caps and scope matter; raw fields need fixture comparison                                    |
| Service-principal sign-ins                      | Tenant mode only                | Tenant mode only                               | Partial: mixed into the non-interactive source; user cases do not pivot to related applications            |
| Managed-identity sign-ins                       | Missing explicit query          | Missing explicit query                         | Comments mention managed identities, but queries select only `servicePrincipal` and user event types       |
| Entra directory audit                           | Present                         | Present                                        | Partial: user filters and volume limits; compare actor/target coverage                                     |
| Unified Audit Log                               | Graph audit query               | Graph audit query                              | Partial: no equivalent Exchange search route exposed; query completion and retention are separate concerns |
| Dedicated admin/mailbox audit collection        | No dedicated path               | No dedicated path                              | Some events may be in UAL; not equivalent to dedicated extraction modes                                    |
| Inbox rules                                     | No live collection              | Single-mailbox snapshot, hidden rules included | Partial: selected fields rather than full source representation                                            |
| Mailbox permissions/audit configuration         | No live collection              | Single-mailbox snapshot                        | Partial: useful delegates, bypass and folder data; not tenant-wide mailbox acquisition                     |
| Transport rules                                 | Missing                         | Missing                                        | No dedicated data source or analyzer                                                                       |
| Message trace                                   | Missing                         | Missing                                        | Cannot establish delivery/routing/external recipients from this dataset                                    |
| Email and attachment acquisition                | Missing                         | Missing                                        | No mail-content or attachment preservation workflow                                                        |
| MailItemsAccessed session/message-ID extraction | UAL signals only                | UAL signals only                               | No equivalent session/message extraction workflow                                                          |
| OAuth delegated grants                          | Present                         | Present                                        | Partial; per-user relevance filtering is helpful                                                           |
| OAuth application permissions                   | Missing                         | Missing                                        | Collector reads `oauth2PermissionGrants`, not application role assignments                                 |
| Application inventory/ownership/credentials     | ID/name lookup                  | ID/name lookup                                 | Selected `id,appId,displayName` is not a full application inventory                                        |
| Users / risky users / risk detections           | Present                         | Present                                        | Partial: user inventory selects a small field set; compare exact schemas                                   |
| MFA status                                      | Registration report             | Registration report                            | Partial: report is not a full authentication-method inventory                                              |
| Devices                                         | Present                         | Present                                        | Partial: browser selects limited fields; portable tenant query differs                                     |
| Admin roles / PIM                               | Active and eligible assignments | Active and eligible assignments                | Partial: not a complete role-activity or PIM schedule/history report                                       |
| Conditional Access / security defaults          | Missing inventory               | Missing inventory                              | An audit event about a policy does not preserve current policy configuration                               |
| Groups / members / dynamic rules                | Missing inventory               | Missing inventory                              | Audit detections do not replace current membership acquisition                                             |
| Licenses and compatibility                      | Missing                         | Missing                                        | No equivalent license/retention capability inventory                                                       |
| Azure activity / directory activity             | Missing                         | Missing                                        | No Azure subscription collection route                                                                     |
| Security alerts / Secure Score                  | Missing                         | Missing                                        | No dedicated source in the case contract                                                                   |
| Configurable full-evidence/triage orchestration | Fixed supported selections      | Fixed supported selections                     | Smaller scope than MES; cannot claim “collect everything”                                                  |

Local implementation anchors: [catalog](/Users/mihaimonte/REPO/triage/BETA/js/evidence.js:4), [browser queries](/Users/mihaimonte/REPO/triage/BETA/js/collect.js:58), [portable queries](/Users/mihaimonte/REPO/triage/desktop/collector/collect.ps1:103), [mailbox snapshot](/Users/mihaimonte/REPO/triage/desktop/collector/collect.ps1:192).

### Concrete completeness differences

- Browser volume sources use a **200-page** cap; other browser sources generally use 50. Portable `Read-Pages` uses **100 pages total**, including combined queries. See [browser cap](/Users/mihaimonte/REPO/triage/BETA/js/collect.js:100) and [portable cap](/Users/mihaimonte/REPO/triage/desktop/collector/collect.ps1:53). Both can report partial results; neither cap proves a complete extraction.
- The portable folder inventory throws above 200 folders. That must remain an explicit gap with an alternative collection path.
- Browser resumability and portable continuation behavior are not equivalent. Portable preserves continuation metadata but instructs the analyst to narrow the time window at its cap.
- UAL user queries supply both UPN and object-ID filters. Their actual inclusion/exclusion behavior needs a known-record tenant comparison; no completeness claim is justified from fixture tests alone.
- “Complete” means a supported API query finished, not that all incident-relevant Microsoft data has been acquired. Retention, licensing, permissions, current-state versus historical evidence, and unsupported sources must remain visible.
- [Importer classification](/Users/mihaimonte/REPO/triage/BETA/js/import.js:110) explicitly rejects mailbox-permission, transport-rule, message-trace and mailbox-audit filenames. Importing MES output is therefore not a full workaround for missing collectors.

## Coverage contract: Analyzer Suite versus Triage

Reference: [MAS at 2937dc8](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite/tree/2937dc8c77bfba2911ead45eef5702c48d95365e). Reviewed the analyzer inventory and targeted source sections. **This is not a rule-by-rule equivalence certification.** No upstream PowerShell analyzer was executed.

| Upstream analyzer  | Triage equivalent                       | Status                                                             |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------ |
| EntraSignInLogs    | `anSignIns`                             | Selected detections; rule/enrichment/report parity unproven        |
| ServicePrincipal   | Branch inside `anSignIns`               | Limited network-oriented signals; no equivalent dedicated report   |
| EntraAuditLogs     | `anAudits` / device-registration checks | Selected detections; parity unproven                               |
| UAL                | `anUal`                                 | Selected operation/pattern detections; full output parity unproven |
| UALGraph           | Same normalized UAL engine              | Shared input handling; not independently certified                 |
| RiskyDetections    | `anRiskyDetections`                     | Selected mappings and signals                                      |
| RiskyUsers         | `anRiskyUsers`                          | Selected current-risk signals                                      |
| OAuthPermissions   | `anOauth`                               | Delegated grant focus; missing collected application permissions   |
| Users              | `anUsers`                               | Limited inventory/statistics and signals                           |
| Devices            | `anDevices`                             | Selected inventory signals                                         |
| Admins             | `anAdmins`                              | Selected role/PIM signals                                          |
| MFA                | `anMfa`                                 | Selected registration/weak-method signals                          |
| MailboxAuditStatus | Exchange snapshot checks                | Partial, different source schema and report                        |
| MailboxPermissions | Exchange delegation checks              | Partial, different source schema and report                        |
| MTL                | None                                    | Missing                                                            |
| TransportRules     | None                                    | Missing                                                            |

[Analyzer dispatch](/Users/mihaimonte/REPO/triage/BETA/js/analyzers.js:96) and [Exchange checks](/Users/mihaimonte/REPO/triage/BETA/js/exchange-analysis.js:3) establish which engines run. The upstream [message-trace analyzer](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite/blob/2937dc8c77bfba2911ead45eef5702c48d95365e/MTL-Analyzer.ps1), [transport-rule analyzer](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite/blob/2937dc8c77bfba2911ead45eef5702c48d95365e/TransportRules-Analyzer.ps1) and [service-principal analyzer](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite/blob/2937dc8c77bfba2911ead45eef5702c48d95365e/ServicePrincipal-Analyzer.ps1) also produce structured tables/statistics and spreadsheet outputs. A short signal list is not an equivalent analyst output.

### What “same information” should mean before we claim it

1. Pin upstream versions and enumerate every requested source, scope and required field.
2. Define each source as acquired directly, imported with full fidelity, or unavailable with an explicit reason. Distinguish current snapshots from historical logs.
3. Run both collectors against the same authorized test tenant and exact UTC window; compare stable IDs, record counts, nested fields and gaps. Include pagination, errors and cancellation.
4. Run benign and malicious fixtures through both analysis paths; document supported rules, deliberate differences, suppressions and expected evidence links.
5. Verify readable outputs and exports preserve the required facts. Re-run the matrix on the actual Mac and Windows packages.

Do not rate all tenant-wide grants as findings against the selected user merely to increase coverage. Preserve them as tenant context and establish relevance separately. Full collection and careful attribution are both required.

## Proposed order for tomorrow

1. Reconcile the actual source, handover claims and package versions; agree the release candidate.
2. Restore the connected investigation → evidence → response → action-log flow (F01–F03), preserving controlled response authorization.
3. Make evidence readable, keep drafts and produce a usable handover (F02, F06, F07).
4. Turn the suite matrices into an explicit implementation backlog and equivalence checklist (F04). Prioritize missing incident-critical data, then broader tenant/Azure coverage.
5. Complete browser/native regression tests and real Mac/Windows connection tests using the final packages (F05, F08). Decide deployment only after reviewing those results.

## Improvements to retain

Clickable evidence and explicit source gaps; user-specific OAuth findings separated from tenant context; system theme; visible execution route; same shared case viewer foundation; case export and local storage; revised analyzer fixtures. These are useful foundations, but do not close the workflow and coverage gaps above.
