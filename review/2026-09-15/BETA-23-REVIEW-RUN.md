# Triage Beta 23 — review run report

**Date:** 15 September 2026, Europe/Amsterdam.  
**Purpose:** independent analyst walkthrough, source review, validation and upstream coverage comparison.  
**Companion:** [findings and coverage matrices](BETA-23-ANALYST-FINDINGS.md).

## Scope and environment

| Item | Reviewed state |
|---|---|
| Workspace | `/Users/mihaimonte/REPO/triage` |
| Git HEAD | `8fb921c5c8f5bdb208143ee27a3b5194a8ed315f` plus the user's substantial uncommitted changes |
| Source versions | Beta 23; desktop/package 0.23.0 |
| Production | <https://triage.limon-it.nl>, footer build 14, 2026-08-28 |
| Local preview | Temporary isolated origin `http://127.0.0.1:63587/BETA/` |
| Platform | Darwin arm64; Node v24.17.0 |
| Manual UI | Agent-created in-app browser tabs; sample/demo data only |
| Automated browser | Playwright with installed Microsoft Edge channel |
| Native integration | Electron with isolated profile and fake PowerShell collection fixtures |
| Upstream MES | `47565f7842784cd3667ff630e3dccb49fa3408ed` |
| Upstream MAS | `2937dc8c77bfba2911ead45eef5702c48d95365e` |

The user's existing localhost tabs and real cases were not used for mutations. The preview used a separate origin. The only case edits were fictional review notes in the isolated sample case. Production was explored in its explicitly labelled demo mode. No production containment was armed or executed.

## Result summary

| Check | Result | Meaning |
|---|---|---|
| Existing analyzer engine assertions | PASS: 52 assertions | Fixtures passed; not full MAS equivalence |
| Existing Node test suite | PASS: 71 tests, zero failures/skips | Offline model, collector fixtures, security and server checks |
| Browser end-to-end suite | FAIL at navigation selector | Ambiguous `[data-page=home]`; later checks did not complete |
| Native connection suite | INCOMPLETE/FAIL after 13 successful checks | Missing Exchange-start marker during early-cancellation test |
| Production demo walkthrough | Completed through report and containment screen | Existing workflow and available controls inspected; no live effects |
| Beta sample walkthrough | Completed through findings, evidence and first-hour form | Reproduced evidence-reading friction, weak verification and draft loss |
| Source stability | PASS: all 124 snapshotted files unchanged | Review did not alter source/test/config files |
| Downloaded package version check | FAIL versus source version | Both existing downloadable ZIPs embed Beta 22 |
| Real tenant acquisition and passkeys | NOT RUN | Historical macOS timeout not diagnosed or declared fixed here |
| Windows application launch | NOT RUN | Windows ZIP contents inspected only |
| Upstream runtime equivalence | NOT RUN | Public code/reference comparison only |
| Deployment | NOT PERFORMED | No version bump, package rebuild, commit, push or release |

An initial sandboxed `npm test` run failed, including localhost `EPERM` errors. It was rerun with the required local execution access and passed. The initial infrastructure failure is not reported as a product defect.

## Manual analyst walkthrough

### R01 — Existing live workflow

1. Open production in a new background tab; select **Try the demo** and dismiss the release notice.
2. Open read-only triage; search for `jan.devries`; select the demo account and start triage.
3. Inspect results: 15 findings, including 5 critical and 7 high; 27 sign-ins and 135 audit events.
4. Expand the inbox-rule forwarding finding. Observe an inline explanation with IP, rule parameters, source and recommended action.
5. Select **Contain this account**. Observe the target carried forward, preservation controls, explicit arming, six response steps, fifteen blast-radius checks, evidence/communication templates and an action log.

**Result:** the existing UI connects investigation with response. This does not prove every production action works in a real tenant. No response action was executed.

### R02 — Beta investigation and evidence

1. Open the isolated preview; select **Explore sample case**.
2. Observe a tenant-wide fixture: 37 findings, 27 priority signals, 167 evidence records, 10 of 13 sources complete.
3. Open the domain-federation finding. The modal exposes a description and review form but no supporting-record link or response shortcut.
4. Open **Evidence → Unified Audit Log**. Sixty-six records are available; the first page contains forty rows labelled primarily by the same account and timestamp.
5. Open `ual:1`. The raw JSON contains the malicious rule operation, IP, forwarding destination and conditions, but no readable fact summary or attach-to-review action.

**Result:** evidence is clickable, but finding-to-record navigation and readability remain poor (F02). The tenant-wide Beta fixture differs from the user-scoped production fixture; their finding counts are not a detection-quality comparison.

### R03 — First-hour workflow and verification

1. Open **First 60 minutes → Contain & record**.
2. Observe instruction text and an outcome form, without executable response/check controls.
3. Select **Verified against evidence**; enter: “Review-only reproduction: no containment was executed. This note references an unrelated existing sign-in.”
4. Set evidence reference to `interactive:1` and add the outcome.
5. Observe **Contain & record verified**, with the same note stating no containment occurred.

**Result:** F01 and F03 reproduced. This was a local sample-case attestation, not an actual containment operation.

### R04 — Draft continuity

1. Enter “Review draft: preserve this note while I inspect evidence.” in the first-hour outcome text box.
2. Navigate to **Evidence**.
3. Return to **First 60 minutes**.
4. Observe an empty outcome text box and no warning before navigation.

**Result:** F06 reproduced. Connection-transition draft preservation is a different behavior and passed in the native fixture run.

### R05 — Visual assessment

Inspected the first-hour screen in the system-selected dark theme. The layout gives roughly equal prominence to general instructions and a record-outcome form; the prominent action is “Add to action log”, not an investigation or response action. This supports the workflow finding. No formal contrast/accessibility audit or full mobile review was performed.

## Automated runs and exact rerun commands

PowerShell commands for a local rerun from the same workspace:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
Remove-Item Env:PLAYWRIGHT_CHANNEL
node tests/desktop-connections.mjs
```

The Edge channel requires Edge to be installed. Tests use fixtures; do not interpret passing them as successful Microsoft tenant authentication. This review did not edit tests to make them pass.

### Unit/engine run

Command executed: `npm test`.

```text
52 analyzer fixture assertions: all passed
Node tests: 71
pass: 71
fail: 0
cancelled: 0
skipped: 0
todo: 0
Beta tests complete (no Docker required).
```

Temporary full log: `/tmp/triage-review-unit-final.log`.

### Browser run

Command executed: `PLAYWRIGHT_CHANNEL=msedge npm run test:browser`.

```text
locator.click: strict mode violation
locator('[data-page=home]') resolved to 2 elements:
  button.brand, aria-label="Triage home"
  sidebar button "Start"
BETA/desk.dom.test.mjs:442:49
exit code 1
```

This is a test-selector failure following the brand-navigation change. Later assertions cannot be counted as passed. Existing test-generated files under `test-results/` may have been refreshed before the failure; no app source changed.

Temporary full log: `/tmp/triage-review-browser.log`.

### Native connection run

Command executed: `node tests/desktop-connections.mjs`.

Successful assertions before the failure covered execution-route display, operator/target separation, connection gating, narrow-window cards, preservation during connection transitions, retained workers, log ordering, Graph fallback after Exchange failure, and early cancellation state/Graph-worker termination.

```text
ok 13 cancellation stops the graph worker
ENOENT: exchange-started.json
at tests/desktop-connections.mjs:200:10
exit code 1
```

The test reads an Exchange worker start marker after early cancellation without first proving it exists. The current sequential connection setup can be cancelled before Exchange starts. This failure needs test/behavior review; it is not evidence that a nonexistent Exchange worker leaked. Subsequent native assertions, including later scenarios, were not reached.

Temporary full log: `/tmp/triage-review-native.log`.

## Package inspection

Read ZIP contents with Python `zipfile`; did not extract or execute the application.

| Archive | Embedded file | Value |
|---|---|---|
| `BETA/downloads/Triage-macOS-arm64.zip` | `Triage.app/Contents/Resources/site/BETA/js/build.js` | `window.BETA_BUILD = 22` |
| `BETA/downloads/Triage-Windows-x64.zip` | `resources/site/BETA/js/build.js` | `window.BETA_BUILD = 22` |

This establishes a UI/source-version mismatch. Signing, quarantine behavior, runtime pruning and real connection success were not validated by reading the ZIP.

## Source and upstream review

Re-read the current app controller/model, evidence catalog, browser collection, PowerShell collection, analysis dispatch/rules, Exchange snapshot analysis, import classification, package/download paths, relevant tests, HTML script wiring, CI configuration and existing handover notes. The review was focused on the analyst journey and coverage; it is not a statement that every line of every repository file was audited.

Upstream references were fetched into `/tmp/triage-upstream-review` without executing them: MES manifest/README plus 29 scripts, and MAS README plus 16 analyzer scripts. Collection source/field/route comparisons and targeted analyzer/report sections underpin the companion matrices. Missing collectors and output types are confirmed; identical behavior of the overlapping rules is explicitly unproven.

- [Pinned Extractor Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite/tree/47565f7842784cd3667ff630e3dccb49fa3408ed)
- [Pinned Analyzer Suite](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite/tree/2937dc8c77bfba2911ead45eef5702c48d95365e)

## What still needs testing before deployment

1. Fix the browser and native test failures, then obtain complete runs against the intended release source.
2. Resolve the missing Respond integration and repeat the investigation-to-handover scenario in browser and portable modes.
3. Test actual macOS passkey sign-in, callback completion, Graph/Exchange readiness and cancellation in an authorized test tenant. Include both delegated and customer-registration modes.
4. Build and test the exact Mac/Windows ZIPs intended for release, including version/checksum agreement and unsigned-app instructions.
5. Compare records, fields, queries and outputs against the pinned upstream tools in the same tenant/time window. Test missing access, retention gaps, pagination, retry and cancellation.
6. Confirm a different analyst can use the exported handover without reconstructing the raw data.

## Review boundaries

Only the two review documents were deliberately added to the repository. Existing test scripts generated their usual supporting artifacts. A before/after SHA-256 comparison of 124 pre-existing source/test/config/document files found **zero changes**. Temporary preview, test profiles and upstream reference downloads were used for this run. Docker was not used.

No app implementation, deployment, packaging, publishing, customer registration creation, Microsoft permission grant or tenant mutation was performed. Tomorrow's deployment remains a decision after fixes and validation, not an automatic action scheduled by this report.
