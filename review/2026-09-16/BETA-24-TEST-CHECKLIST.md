# Beta 24 test checklist

Start with an authorized test tenant. Use the new local 0.24.0 package, not a previously installed app. Do not test tenant-changing response against a production administrator.

## 1. Start and identify the build

- [x] Website footer shows Beta 24; app version is 0.24.0.
- [x] App launches from the extracted ZIP. macOS package is locally ad-hoc signed, not Developer ID signed or notarized; Windows is unsigned.
- [x] No Docker service is needed. Local website: run the PowerShell commands below.
- [x] System theme follows macOS/Windows changes without losing a draft.

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm run web
```

## 2. Scope and connections

- [ ] App opens Full app triage with all 34 sources selected. Deselection is respected.
- [ ] Switch between one account and tenant-wide; tenant mailbox sources remain selectable.
- [ ] Browser offers only its 12 supported Graph sources.
- [ ] Graph and Exchange authenticate the intended tenant/operator; passkey sign-in finishes in the app as well as the browser.
- [ ] Existing certificate profile authenticates the expected application. Missing new consent produces a visible source gap; existing registrations are not silently changed.
- [ ] Azure sign-in and subscription access work when selected; denied subscriptions/sources are not reported as empty success.
- [ ] Cancellation stops workers and retains earlier evidence.

## 3. Collection acceptance

- [ ] First run a small account/window; inspect every selected source, including zero, partial and denied results.
- [ ] Exercise Graph paging, multiple mailboxes, message-trace continuation and an interrupted source.
- [ ] Compare to upstream Extractor output for the same scope/window using Help's coverage contract.
- [ ] Check email/attachment case size before a broad tenant run; current file limits are documented in Coverage.
- [ ] Tenant-wide OAuth grants remain context, not user priority findings.

## 4. Investigation and first hour

- [ ] Open a finding → inspect source → read facts and original JSON → return to the finding; draft remains.
- [ ] Write a runbook note → inspect evidence → return; note remains.
- [ ] First 60 minutes → Open response & checks selects the correct account and tenant.
- [ ] In sample mode, run checks and inspect action-log entries without live changes.
- [ ] In a dedicated test account only: connect delegated response, preserve evidence, arm, cancel once, then approve a reversible action. Verify state directly in Microsoft and compare both journals.
- [ ] Wrong tenant, different operator, changed case and expired response session block execution.
- [ ] A manually reviewed phase is clearly an analyst attestation, not execution proof.

## 5. Handover and release decision

- [ ] Export/reopen the case; IDs, raw records, global context, dispositions and log remain.
- [ ] Handover includes findings, reasons, evidence references and unresolved decisions.
- [ ] Open the same case in app and browser; results/layout are consistent.
- [ ] Repeat actual native collection on Windows. Cross-packaging is not Windows acceptance.
- [ ] Review remaining coverage/provenance gaps and live results before deployment.

## Repeat local automated checks (PowerShell)

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
node tests/desktop-connections.mjs
node tests/desktop-profiles.mjs
node tests/desktop-timeout.mjs
```
