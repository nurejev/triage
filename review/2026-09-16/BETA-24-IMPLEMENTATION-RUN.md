# Beta 24 implementation and validation run

Date: 2026-09-16. Local Beta 24 / desktop 0.24.0 / shared build 35.

## Result

Implemented the proposed sequence as a local test candidate. Portable collection now defaults to all 34 available sources, individually selectable, in account or tenant scope. Web quick triage remains restricted to its 12 Graph source types. Help contains the explicit app/web coverage contract. No commit, push, production deployment, customer registration execution or live Microsoft mutation was performed.

This is broader collection, not certified full Extractor/Analyzer Suite equivalence. The remaining contract is recorded in `BETA/docs/COVERAGE.md` and surfaced in Help.

## Findings disposition

| Prior item | Change | Remaining acceptance |
|---|---|---|
| F01 first-hour workflow disconnected | Runbook opens shared account response/checks; result events enter case log. Native Graph response uses separate delegated identity, bound target, explicit write confirmation and durable intent. | Real Microsoft read/write acceptance; Exchange changes still use existing separate backend/manual commands. |
| F02 difficult investigation | Findings open supporting source; records show human-readable facts before raw JSON; response shortcut and timestamps added. | Exact automatic per-finding record linkage and broader source-specific presentation remain improvements. |
| F03 misleading verification | Manual phase status says analyst reviewed; execution result is separately logged. | Analyst evidence relevance still requires judgment. An existing reference is not independent proof of containment. |
| F04 incomplete suite coverage | Added 21 source families, full Graph pagination, tenant mailbox collection, Azure runtime and extended permission preview. | Field/rule equivalence, full upstream reporting/enrichment, MIME/session extraction and scalable large-case storage remain open. |
| F05 old application downloads | Rebuilt local 0.24.0 archives from Beta 24; final hashes below. | Published GitHub assets remain unchanged until a reviewed release; Windows execution is untested. |
| F06 lost drafts | Runbook, action note and finding review drafts retained within the open case/session. | Drafts are not crash recovery or persistent autosave. |
| F07 counts-only handover | Export includes individual findings, dispositions, reasons, references and unresolved items. | Structured assignment/owner workflow remains limited. |
| F08 inaccurate claims | Help coverage matrix, current checklist, explicit local/live validation boundaries and parity backlog. | Live acceptance and pre-existing analyzer provenance audit still open. |

## Bugs found during implementation validation

- Canonical subject view lost a saved account ID when user inventory was absent. Fixed fallback to the case subject.
- Imported user cases need event filtering without discarding the grant inventory used for attribution. Raw tenant evidence is retained; normalized user events remain scoped; OAuth analysis independently filters user grants.
- Shared response styles inherited full-width checkbox inputs and minimum workspace height. Fixed the layout and inspected the resulting screenshot.
- Response result events were initially rejected by the case action-type allowlist. Added the explicit event type and retained its state.
- Updated outdated fixture selectors for duplicate Home controls and the existing PIM eligibility query. Tests retain behavioral assertions rather than weakening expected product behavior.

## Local validation

| Check | Result | Boundary |
|---|---|---|
| Analyzer engine fixture suite | Passed | Synthetic evidence |
| Unit / PowerShell suite | 76 passed, 0 failed, 0 skipped | Includes extended paging/context/partial-source fixtures and response tenant/operator/consent-owner mocks |
| Browser UI | 139 passed | Isolated Edge, synthetic cases; includes Help and opening first-hour response |
| Native collection UI | 49 passed | Isolated Electron profile, mocked acquisition |
| Native connection gates | 17 passed | Synthetic Graph/Exchange workers |
| Customer profile / setup UI | 13 passed | Temporary certificate fixtures, no cloud provisioning |
| Native watchdog | 6 passed | Shortened timeout in isolated fixture only |
| PowerShell parser and JS syntax | Passed | Does not establish service/API success |
| Az.Accounts 5.3.3 module import | Passed | Local PowerShell 7.6.2, no Azure connection |
| Visual review | Passed for response and coverage screen | Screenshots under test-results/beta24-*; response layout corrected after inspection |
| macOS packaging | Ad-hoc signature, extraction and launch/runtime smoke checks | Not Developer ID signed or notarized; no passkey acceptance |
| Windows packaging | Cross-built unsigned x64 archive | No native Windows execution |

Logs: `test-results/beta24-unit.log`, `beta24-browser.log`, `beta24-native.log`, `beta24-connections.log`, `beta24-profiles.log`, `beta24-timeout.log`, `beta24-package-mac.log`, `beta24-package-win.log`.

## Repeat and accept

Start with [the test checklist](BETA-24-TEST-CHECKLIST.md). Live Mac callback/passkey success remains unproven, even though local app startup and mocked timeout behavior pass. New source permissions need actual admin consent and service access. Existing registrations are never silently expanded. Azure access is separate. Large tenant email cases can exceed current memory/file limits.

The public site and GitHub release assets were not changed. Deployment decision: **hold production promotion pending live acceptance and coverage/provenance review**. Docker is optional legacy infrastructure, not a prerequisite for this app or local web viewer.

## Package identity

Final archives and SHA-256 hashes are recorded below after packaging. Downloads are local test candidates, not updated public release assets.

```text
136fe81235a40c5acee383e16b4549834cac0d6b99cb232bfa65afbd8d616949  Triage-macOS-arm64.zip
1e793b1d390608a6636324480dead9b0be37a93a3e907e7bd2f4dc7510e2fb87  Triage-Windows-x64.zip
```

Both ZIPs were checked for embedded Beta 24/0.24.0 identity and matching JavaScript/PowerShell source. `node tools/verify-packages.mjs` verifies the unpacked build outputs. The Mac ZIP passed actual extracted-app launch and bundled runtime readiness; Windows remains cross-packaging only.
