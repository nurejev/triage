# Beta 26 — unified first-hour workflow

Local candidate: Beta 26 / portable 0.26.0 / shared scripts build 36. No deployment, push or live tenant actions.

## Implemented

1. Five phase tabs display the relevant checks and actions on the same screen: Confirm & preserve; Contain & record; Establish impact; Preserve & export evidence; Communicate & hand over. The separate always-visible outcome form is replaced with an on-demand decision dialog.
2. The final phase contains all five existing communication templates, completion attestations and handover export. A download is logged as a draft, never as a message sent. Actual communication must be recorded separately.
3. The case action log sits beside the phase content and receives response/check results, collection results and analyst notes. Corrections retain history. Findings, Timeline and Evidence remain separate inspection views.
4. The app mailbox card runs local Exchange acquisition and appends snapshots to the current case after tenant/account validation. Existing evidence is preserved. Rules show destinations even when ForwardTo is empty and RedirectTo is populated. The browser offers the local collector route.
5. Opening the workflow previews preserved evidence without connecting or arming response. Existing Graph connection, preservation, arming and confirmation controls remain. Engine labels distinguish browser JavaScript from local PowerShell. Shared screens retain light/dark/system themes.

## Verified locally

- 146 browser UI checks passed, including phase-specific visibility, communication drafts, notes/corrections, theme changes, evidence access and narrow layout.
- 55 native UI checks passed with an isolated synthetic PowerShell worker, including local mailbox acquisition, preserving earlier sign-ins, displaying returned rules and recording the result in the shared action log.
- Engine regression and 76 unit/collector/security tests passed against the final code.
- Screenshots inspected: communication desktop/light, dark/narrow, and native mailbox results.
- Test fixtures never contacted Microsoft and never executed tenant changes.

Logs: `test-results/beta26-browser.log`, `beta26-native.log`, `beta26-unit.log`. Screenshots: `test-results/beta26-comms.png`, `beta26-comms-dark.png`, `beta26-comms-mobile.png`, `beta26-native-mailbox.png`.

## Practical acceptance checklist

Use an authorized test account. Reading the workflow or downloading a template should not initiate authentication.

- [ ] Open the same case in the portable app and web viewer; compare the five phase screens.
- [ ] Confirm account/tenant and source gaps, export evidence, then record that preservation is complete.
- [ ] In the app, select Contain & record → Run local mailbox check. Complete Exchange authentication and verify the snapshot, source errors and rule destinations. Existing evidence and notes must remain.
- [ ] In the web viewer, confirm the mailbox card offers the local collector rather than claiming to run Exchange in JavaScript.
- [ ] Connect account checks separately; verify tenant/account. Do not arm or execute changes unless explicitly testing a response against an approved disposable account.
- [ ] Review impact and evidence phases; previous response state must survive phase navigation.
- [ ] In Communicate & hand over, download a template. Check the target/context and confirm the communication checkbox remains unchecked.
- [ ] Record an actual communication or decision, export the handover and case, then reopen it and inspect the action history.
- [ ] Verify system-theme switching and narrow-window usability on macOS and Windows.

## Limits and pending acceptance

Exchange collection is local, but mailbox changes are still the separately reviewed manual PowerShell steps shown in that card. This release does not add an automatic native Exchange write engine. A collected snapshot is not proof of cleanup; analyst attestations are not proof of API execution.

Live Microsoft passkey/session behavior and real tenant permission/response acceptance remain pending. Windows is cross-packaged on macOS; native Windows execution remains pending. macOS uses ad-hoc signing, not an Apple Developer ID or notarization. Full Extractor/Analyzer field and detection equivalence remains unverified; see Help → coverage.

## Repeat checks and packaging (PowerShell)

```powershell
Set-Location /Users/mihaimonte/REPO/triage
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm test
npm run test:browser
node tests/desktop-progress.mjs
npm run desktop:package:mac
npm run desktop:package:win
node tools/verify-packages.mjs
Get-FileHash BETA/downloads/Triage-macOS-arm64.zip -Algorithm SHA256
Get-FileHash BETA/downloads/Triage-Windows-x64.zip -Algorithm SHA256
```

Start the local web viewer without Docker:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm start
```

Open the URL printed by the server and select `/BETA/`. For the portable app, extract the new ZIP and open that copy; an already-running older app will not update itself.

## Final package verification

Both portable packages contain matching Beta 26 JavaScript, stylesheets, HTML, PowerShell and runtime files. The Mac ZIP passed extracted ad-hoc signature validation, app launch and bundled-runtime readiness. Windows packaging and source identity passed; Windows execution is still pending.

```text
b10319c5692ca7315543f19f81a378b7911847ec1c8ed63d29895ec0440c3faa  Triage-macOS-arm64.zip
69026764d2a67f29279e322ce3f1a1e2d91e51b0aae33a590d39f2b50e6e3f4d  Triage-Windows-x64.zip
```
