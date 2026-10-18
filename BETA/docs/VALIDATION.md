# Beta 34 — guided case workspace

Date: 2026-09-18. Beta 34; desktop source 0.34.0. Local candidate; no deployment or new application packages produced.

Completion meanings and supporting-record references were corrected before applying Option 2. The seven routes are grouped into Prepare / Investigate / Act & transfer. Review requires resolved decisions, response exceptions stay visible, and exporting a note does not imply handover. The handover record names the next owner, channel and next action. Collection remains read-only; response retains separate authorization and arming.

## Passed locally

- 52 analyzer/import assertions and **89 unit/PowerShell tests**, including exact source-reference mapping, aggregate evidence, copied/enriched records, raw preservation, case round-trip and honest completion.
- **186 browser checks**, including all supporting records, drafts, record inspection, outstanding investigations, exceptions, explicit handover versus export and reopening. Layout checked at 320, 390, 768 and 1024 pixels; light/dark screenshots inspected.
- **67 native desktop workflow checks** with synthetic collectors, including service connections, saved evidence, cancellation, tenant mismatch rejection, mailbox read controls, reviews and analysis status. No tenant contacted.
- Sample comparison: all 37 findings retain their IDs, severity, detection results, statistics and rollups; evidence metadata is additive.
- JavaScript syntax and tracked-file whitespace checks.

The final unit run used the bundled PowerShell 7.6.2 through `PWSH`. A separate host-selected runtime run failed at startup with CultureNotFoundException; that log is retained. Local checks do not prove live tenant behavior.

## Known limit and acceptance still open

Changing the evidence folder after Connect does not relocate that connection's existing raw-checkpoint directory. Reviewed saves use the new destination. Reconnect before collecting when raw checkpoints need the new folder. This pre-existing behavior is documented separately from the workflow changes.

Live Graph/Exchange/Azure behavior, Mac passkey/callback acceptance, actual Keychain/DPAPI integration, controlled response acceptance and Windows execution remain pending. No packaging, signing, publishing or production deployment was performed in this change.

Report and screenshots: [Beta 34 implementation](../../review/2026-09-18/BETA-34-IMPLEMENTATION.md). Logs: `test-results/beta34-unit.log`, `beta34-browser.log`, `beta34-native.log`.

## Reproduce from the repository on this Mac

```bash
PWSH="$PWD/desktop/runtime/darwin-arm64/powershell/pwsh" TMPDIR="$PWD/test-results/tmp" npm test
PLAYWRIGHT_BROWSERS_PATH="$PWD/test-results/browsers" TMPDIR="$PWD/test-results/tmp" npm run test:browser
PLAYWRIGHT_BROWSERS_PATH="$PWD/test-results/browsers" PWSH="$PWD/desktop/runtime/darwin-arm64/powershell/pwsh" TMPDIR="$PWD/test-results/tmp" node tests/desktop-progress.mjs
```

Run the PowerShell and native suites separately. These commands assume the repository-local browser and runtime used for this validation are present.

---

## Historical validation

# Beta 24 — local test candidate

Date: 2026-09-16. Beta 24; shared build 35; desktop 0.24.0.

Full portable collection has 34 selectable source families, selected by default, with account and tenant scopes. The browser retains 12 supported Graph sources. Help includes the source-by-source [coverage contract](COVERAGE.md), explicit parity backlog and operating limits.

The first-hour workspace is connected to account response and the common action log. Native Graph response uses a separate delegated identity, target validation, per-write confirmation and durable intent journal. Read-only collection profiles are not reused for response writes. Evidence facts, draft retention and detailed handovers improve the investigation path; saved user cases retain their canonical identity and global grant context.

The implementation uses synthetic tests, not a completed live tenant acceptance. Final local results and package hashes are recorded in `review/2026-09-16/BETA-24-IMPLEMENTATION-RUN.md`. The current checklist is `review/2026-09-16/BETA-24-TEST-CHECKLIST.md`.

## Still required before promotion

Mac passkey/callback reproduction, live Graph/Exchange/Azure collection, existing-registration consent, actual Keychain/DPAPI integration, native Windows execution and controlled response acceptance. Full upstream field/rule equivalence and exact provenance of existing copied analyzer tables remain open. Large tenant mail cases can exceed the 100 MB per-file / 250 MB bundle limits. No production deployment was performed.

## Local commands (PowerShell)

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
npm run web
```

---

## Historical validation (earlier candidates)

# Beta 22 — customer registrations and Mac connection diagnostics

Date: 2026-09-15. Shared build 34; desktop 0.22.0. Local test candidate.

## Outcome

The native collector now supports optional existing customer Graph/Exchange registrations with a shared PFX, secure local profile storage, ID-only import and a two-step creation wizard that exports a reviewed PowerShell setup folder. Delegated passkey sign-in remains available. The fixed collector validates tenant/application identity; certificate mode avoids the interactive browser callback. The setup wizard does not itself execute cloud provisioning.

The user confirms Microsoft sign-in succeeds in the browser while the Mac app keeps waiting. The installed app was verified as 0.21.0; saved local cases were older and did not contain this failure. No active Triage auth listener was available for inspection. The exact live cause remains unconfirmed: callback completion versus the first account-verification request. Beta 22 now reports those stages, preserves SDK errors, refreshes waiting status every 20 seconds, and stops a connecting worker after ten minutes. Other connected services can continue. A terminated worker no longer loses its error because its exit code is null.

## Implementation and boundaries

- Customer profiles use Electron safeStorage (no plaintext/basic_text fallback). The PFX/password are encrypted on disk; the renderer receives metadata after saving and secrets enter workers over stdin. Credentials never enter case files or plans. Local certificate validity, tenant and selected-service configuration are checked before collection. One shared PFX per profile is supported; distinct service certificates require separate profiles/runs.
- macOS rejects .NET EphemeralKeySet. Certificate import now uses DefaultKeySet with OS-managed temporary keys on macOS and EphemeralKeySet elsewhere, without PersistKeySet. Certificates are disposed after use.
- Graph application identity is verified through Get-MgContext; Exchange must report matching TenantID, AppId and CertificateAuthentication. Subject identity verification and the upfront service-connection gate remain in place. App identities/authentication mode are recorded per service in the action log.
- The wizard grants Graph collection read permissions plus Exchange.ManageAsApp when selected. Bootstrap delegated write scopes are confined to setup. It generates separate reviewed Exchange RBAC configuration for the seven read commands, across all tenant mailboxes. It does not assign broad Entra administrator roles or modify existing apps.
- Setup logs created object IDs and refuses blind reruns after partial creation. No cloud cleanup is automated. Creation/consent occur only when the operator executes the generated script and explicitly approves the displayed tenant. The existing customer scripts were reference material only and were not executed.
- This release stays local, requires no Docker, and retains the personal/Limon-IT distribution approach without Developer ID/notarization. No Git commit, push or deployment occurred.

## Validation

Passed with synthetic data and temporary credentials:

- Full analyzer/import fixture suite and **78 unit/native PowerShell tests**.
- **136 browser UI checks**; **48 native collection/evidence UI checks**.
- **17 native service connection checks**: setup gate, identity, source preservation, cancellation and Exchange-only plans.
- **13 customer-profile/wizard UI checks**: preview/export, ID-only import, real PFX validation, wrong-password recovery, metadata-only bridge, saved-profile selection and removal. OS encryption is mocked in this isolated host test.
- **6 native watchdog assertions** with a shortened timeout only in the isolated test copy: stage updates, bounded failure, preserved error, surviving Graph evidence, no unapproved collection release, worker stopped.
- Real PowerShell certificate/app-only worker tests use mocked Graph/Exchange modules. Full registration creation/consent and generated Exchange RBAC preview tested with mocked Graph and local certificates; no cloud calls. Encryption store contracts tested with a test encryption adapter, not the actual customer Keychain/DPAPI store.
- Native screenshots were reviewed for registration permission preview and certificate setup; narrow layout checks pass. JavaScript syntax, PowerShell parsing and whitespace checks pass.

Evidence: `test-results/beta22-unit.log`, `beta22-browser.log`, `beta22-progress.log`, `beta22-connections.log`, `beta22-profiles-ui.log`, `beta22-timeout.log`; profile/wizard screenshots use `beta22-*.png`. Older regression screenshot filenames may retain the earlier test prefix.

## Required live acceptance

Still pending: Mac delegated callback/passkey reproduction; live app-certificate authentication, customer consent and Exchange cmdlet coverage; actual Keychain/DPAPI integration; live wizard execution and RBAC application; Windows runtime execution. Do not describe the live Mac timeout as resolved. The checklist and repeatable PowerShell commands are in [Customer connections](CUSTOMER-CONNECTIONS.md).

## Packaging

Portable archive verification and hashes are recorded in the local review report after packaging. The packaged guide contains this honest validation boundary; it is not evidence of live tenant acceptance.


---

# Beta 21 — full Exchange sign-in chooser for passkey users

Date: 2026-09-15. Shared build 33; desktop 0.21.0. Local compatibility candidate.

## Report and evidence

The user reported that their passkey-only administrator accounts had no passkey option on the browser sign-in screen opened for Exchange. Beta 20 supplied `UserPrincipalName` to Exchange to prefill the Graph operator account.

The bundled ExchangeOnlineManagement 3.10.0 documentation (`Microsoft.Exchange.Management.AdminApiProvider.xml`, token-provider flow description) confirms that supplying `UserPrincipalName` opens the browser with that account populated; leaving it unset opens account selection/UPN entry. This makes the hint a plausible cause of the changed entry screen. It does not establish that the hint suppressed passkeys in this user's specific browser. Browser and passkey-provider details were requested; live sign-in has not been reproduced.

Microsoft documents the [passkey sign-in chooser](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-sign-in-passkey) and [browser/platform compatibility](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-fido2-compatibility). [Connect-ExchangeOnline](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/connect-exchangeonline?view=exchange-ps#-userprincipalname) documents the username-prefill behavior.

## Change

- Exchange no longer receives `UserPrincipalName`. The module can present its full account/sign-in chooser, while the browser may still reuse an existing Microsoft session.
- Setup and live connection guidance direct passkey users to **Sign-in options → Face, fingerprint, PIN or security key** and the same operator account as Graph.
- Tenant, operator and mailbox identity validation remains enforced after sign-in. The upfront two-service connection gate, evidence collection and cancellation behavior remain intact.
- This does not introduce passwords, credential parameters, device-code fallback, certificate/app-only authentication or changes to tenant authentication policies. It does not assert that the actual authentication used a passkey; Entra remains responsible for enforcing that requirement.

## Verification

- **17 model/native-script checks passed**, including the actual PowerShell collector invoked with offline mock modules. The Exchange invocation omits UserPrincipalName, Credential, Device and AccessToken; a changed operator and a foreign tenant still fail.
- **17 native connection UI checks passed** with the actual Electron host/preload and bundled PowerShell using synthetic evidence. Upfront readiness, deferred collection, operator display, preserved runbook drafts, Exchange failure, cancellation of both workers, Exchange-only plans and narrow layout remain covered.
- JavaScript syntax and Git whitespace checks passed. The connection guidance was visually reviewed in the native screenshots.
- Full browser, analyzer and broader native-progress suites were not rerun for this narrow authentication-argument/guidance adjustment. Beta 20's results remain below.
- No live tenant was authenticated and the user's active case/browser was not changed. The missing-passkey symptom is not yet confirmed resolved.

Evidence: `test-results/beta21-unit.log`, `beta21-connections.log`, `beta21-connect-light.png`, `beta21-connect-dark.png`, `beta21-connect-mobile.png`.

## Live acceptance checklist

1. Export the current case before replacing the portable app. Confirm **Beta 21**.
2. Run a plan containing Graph and Exchange sources. Sign in to Graph with the operator's passkey.
3. At Exchange, choose **Sign-in options → Face, fingerprint, PIN or security key**, then use the passkey for that same operator. Record the browser and passkey provider/type.
4. Confirm Exchange reaches **Ready**, then collection starts. Verify the connected tenant/account and inspect source errors independently of authentication success.
5. If the passkey option is still absent, retain the passkey-only policy and capture the Microsoft screen/error for diagnosis. This adjustment is not a reason to enable passwords or relax Conditional Access.

## Distribution

Both portable targets are local builds; nothing has been pushed to GitHub. Docker is not required. Native Windows and live passkey acceptance remain pending.

For Limon-IT distribution, Apple Developer ID signing and notarization are intentionally not required. The macOS app retains its ad-hoc signature and documented first-launch instructions; Developer ID signing is not an outstanding deliverable.

Repeat checks/builds from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
node --test tests/desktop.test.cjs
node tests/desktop-connections.mjs
npm run desktop:package:mac
npm run desktop:package:win
node test-results/beta21-verify-packages.mjs
```

---

# Beta 20 — connect required Microsoft 365 services upfront

Date: 2026-09-15. Shared build 32; desktop 0.20.0. Local development candidate.

## Result

The portable collector previously finished all Graph sources, including a potentially long audit query, before launching Exchange sign-in. It now authenticates the selected Graph and Exchange services together at the start. Each isolated PowerShell worker validates its tenant/operator/subject, reports readiness, and waits for the host to release collection. Target identity resolution remains part of setup; evidence-source queries wait for the connection phase to finish.

Exchange receives the Graph operator's username as a login hint, never the affected account. A different Exchange operator or tenant is rejected. Each service still uses its own supported Microsoft client/token. Browser sign-in reuse depends on Microsoft, consent and tenant policy: this does not guarantee one prompt or sign into every M365 portal. The user selected the option requiring no new app registration.

The shared execution strip distinguishes **Connecting** from collection and shows each required service, its operator and its status. Connection outcomes are recorded in the live action log. Ready workers retain their sessions, so they do not reconnect when collection begins. Service failures remain coverage gaps and available services continue. Cancellation stops all waiting/running workers; unrelated/unselected services are not connected.

Sources: [Microsoft resource-specific token rules](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/resources-and-scopes), [Exchange connection and username hint](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/connect-exchangeonline?view=exchange-ps#-userprincipalname), [Graph PowerShell authentication](https://learn.microsoft.com/en-us/powershell/module/microsoft.graph.authentication/connect-mggraph?view=graph-powershell-1.0). The Microsoft Graph skill was used for the documentation workflow; no live Graph calls were made.

## Verification

- **38 analyzer/import assertions and 72 unit/script tests passed.** Two new tests run the actual PowerShell collector with offline mock modules to check the host release gate and Exchange operator hints, including wrong-operator and wrong-tenant rejection.
- **136 browser checks passed** for the shared viewer, analysis, OAuth scope, evidence, review validation, themes and saved-case behavior.
- **48 existing native UI checks passed** using the actual Electron host/preload and bundled PowerShell with synthetic checkpoints.
- **17 new connection UI checks passed**: Graph waits during Exchange sign-in; both service connections precede source results; the operator is displayed; runbook drafts survive transitions; denied Exchange access preserves Graph collection; cancel stops both workers; an Exchange-only plan never starts Graph; narrow layout and renderer exceptions are checked.
- An initial native regression found the rejected identity context needed a visible error notification. The host now sends that error while preserving explicit source gaps. The first connection UI test used the action-log field name for a runbook draft; the harness selector was corrected. Initial and passing logs are retained.
- Light, dark and narrow connection screenshots were inspected. Syntax and Git whitespace checks passed. Tests used fictional evidence, without tenant authentication or changes to the user's active case.

Evidence: `test-results/beta20-tests.log`, `beta20-browser-final.log`, `beta20-native-progress.log`, `beta20-native-progress-final.log`, `beta20-connections.log`, `beta20-connections-final.log`, and `beta20-connect-*.png`.

## Test checklist

1. Export the active case before replacing the portable app. Open **Beta 20** and select Graph evidence plus the mailbox snapshot.
2. Run a quick check. Confirm **Connect Microsoft 365 with PowerShell** and separate Graph/Exchange connection cards appear before source collection.
3. Sign in with the authorized operator account. Exchange should receive that same username. Complete any additional Microsoft consent/MFA prompt now. Record the actual number of prompts; do not assume tenant policy permits silent reuse.
4. Confirm evidence collection begins after connection setup. There should be no planned late Exchange sign-in after the Graph audit query. A token expiry or policy challenge may still require Microsoft interaction.
5. Check Action log for both connection results before source-result events. Inspect the evidence coverage and any source errors independently of connection readiness.
6. In a separate test case, cancel while Exchange connection is pending. Both waiting sessions should stop and uncollected sources should be marked cancelled.
7. Select Graph sources only, then mailbox only in another case. Each plan should connect only its required service. Repeat the visual check in Light, Dark and System appearance.

## Limits

Live tenant authentication, prompt reduction, Conditional Access/MFA behavior and native Windows execution remain pending acceptance. These offline tests do not prove SSO succeeds in a tenant. No new app registration, app-only access, credentials, permissions or tokens were configured. The website retains its existing SPA registration. Direct target-tenant access is supported; cross-tenant partner/GDAP routing and extra M365 service connectors remain unimplemented.

This build is local and has not been pushed to GitHub or publicly deployed. Docker is not required. Mac signing remains ad-hoc, without Developer ID signing/notarization. Desktop resume, team upload and executable first-hour response controls remain outstanding.

Repeat checks and package builds from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
node tests/desktop-connections.mjs
npm run desktop:package:mac
npm run desktop:package:win
node test-results/beta20-verify-packages.mjs
```

---

# Beta 19 — visible collection and analysis method

Date: 2026-09-15. Shared build 31; desktop 0.19.0. Local development candidate.

## Changes

- The shared collection form names the execution method near the account and Run controls: **PowerShell** on this computer in the portable app, or **Browser JavaScript** in the web client.
- A sticky, accessible status strip identifies active collection, cancellation and JavaScript analysis across case screens. When finished, it explicitly identifies the current viewer and says **no checks running**. Icons, labels and theme-aware colors provide the distinction together.
- Native collection uses the existing bundled PowerShell runtime. Both viewers use the existing JavaScript analysis worker. This change labels that behavior; it does not alter collection permissions or query scope.
- New cases record their collection method in the case metadata, collection-start action log and handover. Save/export and the native-to-browser handoff preserve it. Legacy cases without metadata report **not recorded**, and the current viewer never supplies a guessed historical collection method.

## Verification

- **136 browser checks passed**, including Browser JavaScript setup/live collection, navigation, saved-case method, explicit JavaScript analysis and legacy-case handling. Existing coverage, OAuth-scope, evidence, review-validation, export and theme checks also passed.
- **48 native UI checks passed** using the real Electron host/preload, isolated profile and bundled PowerShell with synthetic collection fixtures. Checks cover PowerShell setup/live progress, authoritative case metadata, browser handoff, JavaScript analysis and legacy imports.
- **15 model/native-script tests passed**. Syntax and Git whitespace checks passed. This UI/metadata update did not rerun the full analyzer/import suite or broader desktop readiness test; earlier results remain below.
- The analysis-status helper briefly gates the real analysis worker to observe the pending phase, then releases it into the actual analyzer without replacing its result.
- Browser/native setup, collection and analysis screenshots were visually inspected. Tests use fictional evidence; no Microsoft tenant was contacted and the user's active case was not changed.

Evidence: `test-results/beta19-browser.log`, `beta19-native-progress.log`, `beta19-unit.log`, `beta19-web-execution.png`, `beta19-native-running.png`, `beta19-native-analysis.png`.

## Quick acceptance checklist

1. Export the active case before refreshing the website or replacing the portable app. Confirm **BETA 19** after reopening.
2. In **Quick web check**, verify **Collection method: Browser JavaScript** below the account and Run controls. Start a check and verify the top strip says it runs in this browser.
3. In the portable app, verify **Collection method: PowerShell**. Start a check and verify **Collecting with PowerShell · Runs on this computer**. Open Evidence or the runbook while collecting; the strip should remain visible.
4. When collection ends, verify the status changes to **Analyzing evidence with JavaScript**, then **App viewer** or **Browser viewer · no checks running**. Analysis may be brief with small cases.
5. Save a portable case and open it in the browser viewer. Verify it still records **PowerShell** as the collection method while clearly identifying the current browser viewer.
6. Open a case exported before this change. Verify its collection method is **not recorded**, rather than inferred from the current viewer.
7. Repeat the visual checks in Light, Dark and System themes and a narrow window. Confirm the account, Run button and status text remain readable.

## Limits and location

The website and portable builds are local; this change has not been pushed to GitHub or publicly deployed. Neither requires Docker. Native Windows execution and live-tenant acceptance remain pending. Mac signing remains ad-hoc, without Developer ID signing or notarization. Desktop resume, team upload and migration of executable first-hour response controls remain outstanding.

Repeat checks/builds from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
node --test tests/desktop.test.cjs
npm run desktop:package:mac
npm run desktop:package:win
node test-results/beta19-verify-packages.mjs
```

---

# Beta 18 — user OAuth findings and tenant-wide context

Date: 2026-09-15. Shared build 30; desktop 0.18.0. Local development candidate.

## Problem and resulting behavior

The original user collector calls `/users/{id}/oauth2PermissionGrants`, which returns grants specifically for that user. The beta collects both user and tenant-wide grants for context, but its OAuth analyzer treated all returned grants as findings in a one-account case. This inflated the user's finding list and priority count.

The shared analyzer now evaluates only per-user grants linked to the selected account when case scope is user. Object IDs take precedence over conflicting names. Explicit exported principal UPNs can match when a grant has no principal ID; unresolved relationships, missing consent types, other-account grants, tenant-wide consent and application permissions stay outside user OAuth findings. There is no application-name allowlist. Existing sign-in and audit analyzers retain their behavior.

Tenant-wide analysis still evaluates all collected grants. Raw records, coverage, record references and collection queries remain intact. The Overview, Findings and OAuth Evidence summary explain relationship counts; original tenant-wide grants remain clickable. Reopening existing cases applies this correction without recollection. Prior reviews remain in the action log, and handover confirmation totals use current findings.

References: [Microsoft user-grants endpoint](https://learn.microsoft.com/en-us/graph/api/user-list-oauth2permissiongrants?view=graph-rest-1.0), [OAuth grant consent and principal fields](https://learn.microsoft.com/en-us/graph/api/resources/oauth2permissiongrant?view=graph-rest-1.0). The installed Microsoft Graph skill was used to verify the resource fields; no live Graph requests were made.

## Verification

- **38 analyzer/import assertions and 70 unit/script tests passed**, including seven new tests for user/global/other/unknown attribution, familiar application names, ID precedence, imported UPNs, unresolved identity, tenant detection, raw-evidence preservation and historical-review retention.
- **128 browser checks passed** through the real analysis worker. Mixed evidence produces one user finding, global-only evidence produces zero user OAuth findings, and tenant scope retains all five fixture grants. Counts, clickable originals, export/reopen and mobile layout are checked.
- **40 native UI checks passed** using the actual host/preload in an isolated profile, bundled PowerShell synthetic checkpoints, the shared analysis worker and the native case-save path. Native and web use the same scope acceptance helper. Native file-export dialog interaction was not exercised by this helper.
- Initial UI runs asserted before the background analyzer completed; the helper now observes completion of the real worker without replacing its result. A native attempt to wait for a browser download event timed out because Electron uses a native save path/dialog. Native preservation/reopen checks now use the app's local Save function. Initial and final logs are retained.
- Light/dark/mobile and native screenshots were visually reviewed. JavaScript syntax and Git whitespace checks passed.
- Tests used fictional evidence and did not contact a Microsoft tenant or change the user's open case. The broader native readiness smoke was not rerun; archive launch/readiness checks are recorded after packaging.

Evidence: `test-results/beta18-tests.log`, `beta18-browser.log`, `beta18-browser-retry.log`, `beta18-native-progress.log`, `beta18-native-progress-retry.log`, `beta18-native-progress-final.log`, and `beta18-oauth-*` / `beta18-native-oauth-*` screenshots and exported fixtures.

## Quick acceptance checklist

1. Export the active case, refresh the local site or use the updated portable app, and confirm **BETA 18**.
2. Reopen the existing user case. Global OAuth grants should no longer dominate Findings or Priority signals. The scope summary shows grants linked to the account and shared context.
3. Select **Inspect OAuth evidence**. Open a tenant-wide grant and confirm its original record and reference remain available.
4. Test a case containing a user-specific risky grant. It must still appear as a finding for that account, including when the application has a familiar name.
5. Open a tenant-wide case to confirm global OAuth analysis remains available. Review prior decisions in Action log; the new analysis does not erase history.

## Limits and location

Native Windows execution and real-tenant acceptance remain pending. Mac packages use an ad-hoc signature, without Developer ID signing or notarization. Desktop resume, team upload and migration of executable first-hour response controls remain outstanding. No Docker is needed. This build is local and has not been pushed to GitHub or publicly deployed.

Repeat checks/builds from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Beta 17 — visible finding review validation

Date: 2026-09-15. Shared build 29; desktop 0.17.0. Local development candidate.

## Changes

The screenshot was reproduced as an empty confirmed review: Save rejected the missing evidence reference, but its notification was outside the modal dialog and appeared behind the backdrop. The existing browser test checked notification text without checking its position inside the dialog.

- Missing reasons and invalid confirmation references now appear beside their fields inside the shared review dialog. A summary states that the review was not saved, the first invalid field receives focus, and the draft remains intact.
- Validation clears as the fields or decision are corrected. Reopening a saved review restores the saved values without old errors. Every decision still requires a reason; confirmation still requires an existing evidence record.
- Unexpected errors raised while a dialog is open appear within that dialog. The generic sign-in example was replaced with a source-neutral evidence-reference placeholder. References remain manually selected; they are not automatically linked or semantically verified against the finding.

## Verification

- **116 browser checks passed**, including empty/invalid references, required reasons, correction, changing decisions, preserved drafts, reopening, generic modal errors and exactly one action-log entry for a successful review after invalid attempts.
- **15 model/native-script regression tests passed**, including existing evidence-reference enforcement and case/action-log preservation.
- **28 native UI checks passed** with the actual host/preload in an isolated profile, bundled PowerShell and synthetic checkpoint evidence. Four review checks verify the same visible field errors, correction, successful save and single action-log entry in the portable viewer.
- An initial native test run stopped at the existing Overview navigation assertion before reaching review checks. A rerun with navigation diagnostics passed all 28 checks without changing application code. The initial failure was not reproduced; both logs are retained.
- Light, dark, narrow-screen and native dialog screenshots were visually reviewed. JavaScript syntax and Git whitespace checks passed. Tests did not contact a Microsoft tenant or modify the user's active case.
- The full analyzer/collection suite and broader native readiness smoke were not rerun for this UI-only change. Earlier results remain below. Final package/source/archive verification is recorded after packaging in `review/2026-09-15/BETA-17-REVIEW-VALIDATION.md`.

Evidence: `test-results/beta17-browser.log`, `beta17-unit.log`, `beta17-native-progress.log`, `beta17-native-progress-retry.log`, `beta17-review-before.png`, `beta17-review-errors.png`, `beta17-review-errors-dark.png`, `beta17-review-errors-mobile.png`, `beta17-native-review-errors.png`.

## Limits

Native Windows execution and live-tenant acceptance remain pending. Mac downloads use an ad-hoc development signature; Developer ID signing and notarization remain outstanding. Existing collection/resume/team-upload/first-hour-control limitations remain unchanged. No Docker is required. These changes are local and have not been pushed or publicly deployed.

Reproduce from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
node --test tests/desktop.test.cjs
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Beta 16 — macOS download first-launch note

Date: 2026-09-15. Shared build 28; desktop 0.16.0. Local development candidate.

## Change and verification

- The portable download page includes a macOS first-launch note directly below the download buttons. It provides the targeted quarantine-removal command for `/Applications/Triage.app`, followed by the command to open the app.
- An expandable section includes the requested MarkText-style `xattr -cr` variant and explains that it clears all extended attributes. The note explains path changes and that these commands do not repair damaged files or add notarization. It also links to Apple's Open Anyway instructions.
- The collector guide and README carry the same instructions. These are manual instructions; Triage does not execute them.
- The installed `/usr/bin/xattr -h` confirms `-d` removes the named attribute, `-c` clears all attributes and `-r` applies recursively. The [MarkText release notes](https://github.com/marktext/marktext/releases) document their corresponding app-specific command; [Apple's guide](https://support.apple.com/en-us/102445) documents first-launch approval.
- Browser verification passed for note placement, exact command text, the expanded alternative, readable light/dark/mobile layouts and absence of runtime errors. Screenshots were visually reviewed. JavaScript syntax and Git whitespace checks passed.
- No quarantine attributes or macOS security settings were changed, and no tenant was contacted. This is a text/layout update; the collection regression suite was not rerun. The previous Beta 15 results remain recorded below.

Evidence: `test-results/beta16-download-note.log`, `beta16-download-note.png`, `beta16-download-note-dark.png`, `beta16-download-note-mobile.png`. Final package and archive checks are recorded in `review/2026-09-15/BETA-16-DOWNLOAD-NOTE.md` after packaging.

## Limits

The note can help when download quarantine is the cause of the block. It does not establish successful launch of every browser-downloaded copy. Native Windows acceptance, Developer ID signing and Apple notarization remain pending. Existing collection/resume/team-upload/first-hour-control limitations remain as documented in Beta 15. No Docker runtime is required.

Rebuild from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Beta 15 — fix directory-role and MFA registration queries

Date: 2026-09-15. Shared build 27; desktop 0.15.0. Local development candidate.

## Changes and verified behavior

- Role assignments use one supported relationship expansion (`roleDefinition`) instead of the rejected `principal,roleDefinition`. The shared evidence model resolves account identity from preserved inventory or the canonical subject, retaining unmodified raw assignment records and IDs.
- Single-user MFA registration uses the dedicated report GET and wraps its response as one evidence record. Tenant-wide reports remain paged. Permission denial, missing reports, cancellation and wrong-user responses stay explicit gaps.
- Web resume uses the corrected query rather than replaying a legacy rejected continuation URL. Valid pagination checkpoints remain resumable and preserve earlier records.
- **38 analyzer/import assertions and 63 unit/script tests passed**. The ten new tests reproduce the two original query errors and cover both scopes, original evidence, identity normalization, denied/missing reports, wrong-user rejection, cancellation and role pagination/resume. Actual PowerShell collector fixtures exercise the new requests and saved checkpoints.
- **105 browser checks passed**, including five new checks that complete both sources through the actual quick-check UI and inspect their corrected queries, role names and MFA registration records.
- **24 native collection UI checks passed** using the actual host/preload, bundled PowerShell and synthetic checkpoints in an isolated profile. The shared viewer, record counts, cancellation, drafts and case reconciliation remain covered.
- Native runtime smoke results and final package checks are recorded in `review/2026-09-15/BETA-15-DIRECTORY-MFA.md` after completion.

Evidence: `test-results/beta15-targeted.log`, `beta15-tests.log`, `beta15-browser.log`, `beta15-native-progress.log`, `beta15-directory-fixed.png` and `beta15-mfa-fixed.png`.

## Scope and limits

The existing site's quick MFA check reads authentication methods. The beta tile is a registration report; this change fixes its request and does not replace it with the methods inventory. Microsoft permissions and report availability still apply. No live tenant was contacted by these tests. Native Windows execution remains pending. Mac packages use an ad-hoc development signature; Developer ID signing and notarization remain outstanding. No Docker is needed.

Desktop resume, team upload and migration of the original executable first-hour response controls remain outstanding. Old case files retain their original acquisition outcomes; test the fix with a new collection, or resume the affected sources while an eligible live web case remains open.

Microsoft references: [role-assignment list options](https://learn.microsoft.com/en-us/graph/api/rbacapplication-list-roleassignments?view=graph-rest-1.0), [role-definition expansion](https://learn.microsoft.com/en-us/graph/api/unifiedroleassignment-get?view=graph-rest-1.0), [single-user registration GET](https://learn.microsoft.com/en-us/graph/api/userregistrationdetails-get?view=graph-rest-1.0).

Reproduce from PowerShell with the local website running:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:BETA_BASE_URL = 'http://localhost:8080'
npm run test:browser
node tests/desktop-progress.mjs
node tests/desktop-smoke.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Beta 14 — shared portable and web collection screens

Date: 2026-09-15. Shared build 26; desktop 0.14.0. Local development candidate.

## Changes and verified behavior

- Web and portable collection use the same quick-check setup layout, with Run beside Account to check. Native collection additionally requires the target tenant ID and offers mailbox sources.
- Both open the shared Overview immediately: selected-source progress, meaningful status icons/colors, actual record counts and clickable evidence. Analysis is explicitly pending until acquisition ends.
- Native progress reads the current attempt's atomic PowerShell checkpoints and validates its tenant context before sending evidence to the viewer. Source names are restricted to the selected plan; progress is correlated to the active case. Console counts cannot create evidence records.
- Collection details is collapsed beneath the dashboard. It contains escaped PowerShell output in native mode and source activity in web mode. The view preserves expansion state during updates.
- Source completion is recorded once per result. Cancellation retains checkpoints. Analyst notes are merged into the final case, and background updates and completion preserve unsaved runbook text and the current page.
- **100 browser checks passed** for the shared viewer, web collection, evidence navigation, quick-check flow, light/dark/system appearance and responsive layouts.
- **38 analyzer/import assertions and 53 unit/script tests passed**, including selected-source/tenant checkpoint validation, evidence count integrity, existing Graph and Exchange fixtures, and container-free server behavior.
- **24 native collection UI checks passed** using an isolated Electron profile, the real native host/preload, bundled PowerShell and synthetic checkpoint files. They cover live inspection, honest counts, pending analysis, cancellation, foreign-context rejection, stale progress, analyst-note retention, unsaved drafts, responsive layout and matching web/native source rows for the same case. This fixture does not authenticate or contact Microsoft.
- **Native macOS smoke checks passed** with the real bundled collection runtime: module readiness, command/concurrency/cancel guards, shared analysis, private browser handoff, saved case/action-log restoration and System/manual theme persistence.

Evidence: `test-results/beta14-browser.log`, `beta14-tests.log`, `beta14-native-progress.log`, `beta14-native-smoke.log`, plus native setup, live progress, light/dark/narrow-window and matching native/web result screenshots. Final download verification is recorded separately in `review/2026-09-15/BETA-14-CONSISTENCY.md` after packaging.

## Limits

Live-tenant acceptance and Windows native execution remain pending. Mac downloads use an ad-hoc development signature, without Developer ID signing or Apple notarization. Desktop resume, team upload and migration of the original executable first-hour response controls remain outstanding. The first-hour screen records manual outcomes. Historical certificate-container fixtures remain outside default validation. These app and website changes require no Docker.

Reproduce from PowerShell with the local website running:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:BETA_BASE_URL = 'http://localhost:8080'
npm run test:browser
node tests/desktop-progress.mjs
node tests/desktop-smoke.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Beta 13 — clear collection coverage and progress

Date: 2026-09-15. Shared build 25; desktop 0.13.0. Local development candidate.

## Changes and verified behavior

- The overview coverage panel shows completed sources against the selected collection plan, a progress bar and separate status totals. When a plan is unavailable, the full catalog is used. Unselected sources remain visible through All sources and are counted separately.
- Collecting has a blue highlighted row and motion-aware indicator; waiting is neutral grey; complete has a green check; partial/interrupted/cancelled are amber; failed/unavailable are red. Text and icons accompany color. The overview prioritizes active and incomplete sources among its seven visible rows.
- Completed sources show their actual record counts, including a true zero for a completed empty query. Waiting and unselected sources do not imply a zero-record result. Saved running requests are presented as Interrupted without modifying the original evidence manifest.
- Original source records, errors and collection metadata remain clickable in place. The running source and selected-scope progress update during real collection callbacks.
- **99 browser checks passed**, including a paused synthetic collection matching the screenshot's 83-record scenario, selected-source totals, queue/active/completed states, failure and partial outcomes, saved interrupted requests, original-error navigation, light/dark/mobile layouts and reduced motion.
- **38 analyzer/import assertions and 52 unit/script checks passed**, with no failures or skips. These existing checks ran after the behavioral changes; a subsequent CSS refinement made waiting states neutral grey and kept the mobile All sources action on one line.
- **Native macOS smoke checks passed** for runtime readiness, collection guards, shared analysis, private browser handoff, saved case/action-log restoration and theme persistence. The final CSS refinement is included in packaging, whose extracted-app launch check is separate.
- Running and finished coverage screenshots were visually reviewed in light/dark/mobile views. JavaScript syntax and Git whitespace checks passed.

Evidence: `test-results/beta13-browser.log`, `beta13-tests.log`, `beta13-native-smoke.log`, `beta13-coverage-running.png`, `beta13-coverage-dark.png`, `beta13-coverage-mobile.png`, and `beta13-coverage-results.png`. Final archive verification is recorded in `review/2026-09-15/BETA-13-COVERAGE.md` after packaging.

## Limits

No live tenant was contacted. The native app uses its existing collector progress screen during acquisition; the redesigned coverage panel is shared by its case viewer and the web viewer. Windows native execution, live-tenant acceptance, Developer ID signing and Apple notarization remain outstanding. Mac archives are ad-hoc signed for development. Historical certificate-container fixtures remain excluded. Desktop resume, team upload and migration of the original executable first-hour response controls remain outstanding.

Reproduce from PowerShell with the local website running:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:BETA_BASE_URL = 'http://localhost:8080'
npm run test:browser
node tests/desktop-smoke.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Beta 12 — System theme with automatic switching

Date: 2026-09-15. Shared build 24; desktop 0.12.0. Local development candidate.

## Changes and verified behavior

- Theme selector offers **System / Light / Dark** in the top bar on desktop and mobile. New users default to System; existing saved light/dark preferences are retained.
- System follows live operating-system appearance changes. The theme applies before the stylesheet loads, and updates do not rebuild the workspace or discard unsaved form text, focus or selection. Browser controls and the logo follow the resolved theme.
- The browser remembers the choice for the website. The portable app stores a validated appearance preference separately from the case, and restores it across viewer reloads and full app restarts, including a changed local server port. Each viewer keeps its own choice.
- **84 browser checks passed**, including both automatic transitions, manual overrides, persistence, unsaved runbook text/focus/selection, evidence navigation, quick-check flow, and layouts from 320 to 1440 pixels.
- **38 analyzer/import assertions and 52 unit/script tests passed**, with no failures or skips. These existing regression checks ran after the functional theme changes; release stamping then changed the version from 0.11.0 to 0.12.0.
- **Native macOS checks passed**: actual Electron appearance changes in both directions with Playwright's forced-light override removed; invalid preference rejection; theme persistence across viewer reload and full app restart; bundled runtime readiness; command/concurrency/cancel guards; analysis; private browser handoff; saved case/action-log restoration. The test restores prior preferences and the saved case in its cleanup.
- Desktop light/dark and mobile screenshots were inspected. Source syntax and Git whitespace checks passed.

Evidence: `test-results/beta12-browser.log`, `beta12-tests.log`, `beta12-native-smoke.log`, `beta12-home.png`, `beta12-dark.png`, and `beta12-mobile.png`. Final packaging and archive checks are recorded separately in `review/2026-09-15/BETA-12-THEME.md` after the downloads are built.

## Limits

No live tenant was contacted. Windows native execution, live-tenant acceptance, Developer ID signing and Apple notarization remain outstanding. Mac archives use an ad-hoc development signature. Historical certificate-container fixtures remain excluded from default validation. Desktop resume, team upload and migration of the original executable first-hour response controls remain outstanding; the redesigned runbook still records manual outcomes.

Reproduce from PowerShell with the local website running:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:BETA_BASE_URL = 'http://localhost:8080'
npm run test:browser
node tests/desktop-smoke.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Beta 11 — clickable evidence and OAuth collection

Date: 2026-09-15. Shared build 23; desktop 0.11.0. Local development candidate.

## Changes and verified behavior

- Entire evidence rows are clickable and keyboard operable. Records expand immediately below the selected source and are brought into view. Individual records open the existing original-record inspector. Collection errors, query details and empty/uncollected states remain accessible. Singular record counts are corrected.
- User-scoped OAuth collection now sends separate equality queries for the user's grants and tenant-wide grants. Web and native collection preserve earlier records when a later query fails. The web checkpoint includes the query index so resume continues the unfinished query; a failed legacy OR filter is replaced on resume.
- **72 browser checks passed**, including the screenshot's one-record/error scenario, source-name/count clicks, keyboard collapse, record inspection and narrow-screen layouts.
- **38 analyzer/import assertions and 52 unit/script tests passed**. New tests cover both OAuth query scopes, continuation after interruption, the failed legacy filter, tenant inventory, and the actual native PowerShell script using synthetic Graph responses.
- **Native macOS smoke checks passed**: bundled runtime/module readiness, command/concurrency/cancel guards, shared analysis, private browser handoff, and saved case/action-log restoration after a full restart.
- Desktop and mobile evidence screenshots were visually inspected. Source syntax and Git whitespace checks passed.

Evidence: `test-results/beta11-tests.log`, `beta11-browser.log`, `beta11-native-smoke.log`, `beta11-evidence-detail.png`, and `beta11-evidence-mobile.png`. The package builder verifies the completed Mac signature, extracts the ZIP and launches that extracted application before replacing the download; package output is in `beta11-package-mac.log` and `beta11-package-win.log`.

## Limits

No live tenant was contacted. Graph behavior is checked against controlled responses and [Microsoft's documented equality-filter support](https://learn.microsoft.com/en-us/graph/api/oauth2permissiongrant-list?view=graph-rest-1.0). Windows native execution, live-tenant acceptance, Developer ID signing and Apple notarization remain outstanding. The five historical certificate-container fixtures are excluded from default validation. Desktop resume and team upload remain unimplemented.

**The original executable first-hour response controls have not been migrated into the redesigned runbook.** This release fixes evidence navigation and the observed OAuth query error; the runbook still records manual outcomes.

Reproduce from PowerShell with the local website running:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:BETA_BASE_URL = 'http://localhost:8080'
npm run test:browser
node tests/desktop-smoke.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

---

# Web beta 10 — account autofill and adjacent quick-check action

Date: 2026-09-15. Shared build 22. Local web update; portable downloads remain desktop 0.9.0 / beta 9.

The connected username now fills the quick-check account field automatically. Manually entered targets survive reconnecting and rerendering. A fresh case defaults to the current connected account. Run quick check is beside the input above the source checklist, and directly underneath it on small screens.

- **57 browser checks passed**, including sign-in autofill, preserved manual targets, disconnect clearing an automatic default, fresh-case defaulting, collection initiated before sign-in, tenant scope, and account-filtered requests. The desktop run action was verified visible without scrolling at 1280×800. The adjacent mobile layout fits 320/390 pixels.
- **38 analyzer/import assertions and 47 unit/script tests passed**, with zero failures or skips. Historical certificate-container fixtures remain excluded from the default command.
- Desktop and mobile quick-check screenshots were visually inspected. Source syntax and Git whitespace checks passed.

Evidence: `test-results/beta10-browser.log`, `beta10-tests.log`, `beta10-quick.png` and `beta10-quick-mobile.png`. Authentication and Graph responses use controlled fixtures. No live tenant was contacted. Native packaging and Windows execution were not repeated for this web-only change; the beta 9 signing and acceptance limits below still apply.

Reproduce from PowerShell with the local website running:

```powershell
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:BETA_BASE_URL = 'http://localhost:8080'
npm run test:browser
```

---

# Beta 9 — container-free launch, repaired Mac signature and next-case flow

Date: 2026-09-15. Local development candidate. This section supersedes the beta 8 launch and Docker guidance below.

## Corrections to beta 8

- The local beta Docker service was stopped. `npm run web` now serves the static website directly at the same localhost address. Default beta tests no longer invoke Docker; five legacy certificate-container fixtures remain separate and are not claimed as run in this release.
- `codesign --verify --deep --strict` reproduced the invalid beta 8 application signature. The earlier command-line launch was not proof that a downloaded app would open. The new build signs the completed Mac bundle and verifies/launches it again after extracting the actual ZIP. No files may be modified after signing.
- An existing case now produces a prominent central new-case panel, with a save-and-start path that retains the evidence/action log and opens a fresh form. The old collection-error dead end has been removed.

## Validation evidence

Passed in this workspace:

- **38 analyzer/import assertions and 47 unit/script tests** (`test-results/beta9-tests.log`). Static-server checks cover site assets/CSP, private-path denial, foreign hosts and writes. The five historical certificate-container fixtures are excluded from the default command and were not repeated.
- **47 browser checks** (`beta9-browser.log`), including the central action, saved evidence/action history, a blank next-account form, explicit discard, and narrow-screen layout. The central new-case screenshot was visually inspected.
- **Native macOS smoke checks** (`beta9-native-smoke.log`): launch and actual bundled module imports; arbitrary/concurrent collection rejection; cancellation before authentication; shared analysis and private browser handoff; case and action history retained across a full app restart.

The Mac packaging command requires strict signature verification both before and after extracting the actual ZIP, then launches that extracted application and checks bundled-runtime readiness before replacing the download. Its output is recorded in `beta9-package-mac.log`.

## Mac signing status and remaining acceptance

The repaired app carries a valid **ad-hoc development signature**. It is not Developer ID signed and is not notarized. No usable Developer ID signing identity was found on this Mac. Apple may still block a browser-downloaded development app pending the user's normal approval. Trusted public distribution requires the publisher's Developer ID certificate and notarization. No Gatekeeper setting or quarantine protection is disabled by this build.

Live Graph/Exchange tenant acceptance, native Windows acceptance and trusted public distribution remain outstanding. Team upload remains unimplemented. The runbook records manual decisions; it does not execute containment.

---

# Previous build history (superseded where noted above)

# Beta 8 — replacement workspace and portable collector

Date: 2026-09-15. Main shared-evidence build: 20. Status: local development candidate; public promotion has not been performed.

## Passed in this workspace

- **38 analyzer/import assertions:** existing rule and import behavior retained.
- **50 unit and script-fixture tests:** 41 existing checks plus 9 new desktop/case tests. Covers source-state preservation, case integrity, wrong-tenant rejection, command-plan validation, zero/one/many result arrays, interrupted pagination, missing permissions and independent Exchange command failures.
- **40 browser checks:** new entry and logo, real sample analysis, findings filters and review, evidence references, runbook corrections, action history, raw-record inspection, case export/save/reopen, text-injection handling, light/dark themes, and layouts at 320/390/768/1024 pixels. A controlled Graph fixture verifies account-filtered requests. These are not live Microsoft Graph tests.
- **Native macOS launch:** Electron app starts with the shared viewer. Node is unavailable in the renderer; a narrow native bridge is exposed. Arbitrary command plans and concurrent collections are rejected; cancellation during preparation stops before authentication. The actual packaged macOS app also launched and passed its bundled-runtime readiness check.
- **Bundled runtime:** PowerShell 7.6.2 and the exact Graph/Exchange modules import successfully in separate processes. Module loading uses the bundled paths.
- **Native case saving:** the saved case file is independent of the temporary local URL; restoration after a full app restart preserves case identity and action history.
- **Local browser handoff:** private loopback URL returns the integrity-checked case; unscoped case URLs and private server paths are denied. The complete private browser page loads and analyzes the case without offering OAuth sign-in on the random loopback port.
- **Portable archives:** macOS Apple silicon and Windows x64 builds contain the viewer, PowerShell and pinned modules. Both use the existing triage logo. Builds are unsigned development artifacts.
- **Local web container:** rebuilt and started using `docker-compose.beta.yml`; the desktop archive folder is mounted read-only for local downloads.
- **Visual review:** start, overview, first-hour runbook, dark theme and mobile layout inspected from rendered screenshots.

## Not yet validated / outside this release

1. Live Graph sign-in, tenant consent, account-role combinations, retention boundaries, audit-query completion, throttling and interruption against a test tenant.
2. Live delegated Exchange authentication, tenant/mailbox identity checks, RBAC variations and actual mailbox results.
3. Windows native execution and clean-machine acceptance; the Windows package is cross-built on macOS. macOS distribution through Gatekeeper/notarization is not certified by a local launch.
4. Developer signing, notarization, SmartScreen/reputation acceptance, external distribution and public deployment.
5. Team upload and server-side case access are not implemented. The shared viewer works with local case import/export and the desktop loopback viewer.
6. Partner/GDAP routing, non-global Microsoft clouds, message trace, content/eDiscovery, transport configuration, application-permission grants and endpoint forensics are outside this collection plan.
7. Desktop resume is not implemented. Checkpoints and unfinished query/continuation IDs are retained; rerun a narrower window or follow up separately.

The first-hour runbook records analyst outcomes; it does not execute containment or prove that an analyst's chosen reference supports a conclusion. The case hash is an integrity check, not an authenticated audit ledger. Existing detailed analyzer provenance/license verification remains in the repository review record and has not been expanded into a full upstream audit here.

## Reproduction and evidence

Run `npm test` and `npm run test:browser`. This Mac used `PLAYWRIGHT_CHANNEL=msedge` for browser checks. The native smoke test is `node tests/desktop-smoke.mjs` after preparing the runtime and running browser tests (which generate its sample case). Portable builds use the commands in [the beta README](../README.md).

Local evidence is retained in `test-results/beta8-tests.log`, `beta8-browser.log`, `beta8-desktop-tests.log`, `beta8-native-smoke.log`, `beta8-package-mac.log`, `beta8-package-win.log`, `beta8-docker.log`, the exported test case and rendered screenshots. These are generated local test artifacts, excluded from Git. The old beta backup is `test-results/beta7-before-redesign.tar.gz`.

---

# Earlier beta validation history

# Triage — validation record

## Beta 7 / main build 19 — 15 September 2026

**Local implementation candidate, not publicly promoted or live-tenant accepted.** This layout update keeps both investigation engines in one page with a persistent header, scope selector, navigation and case controls. Tenant content is embedded from the same origin; Docker permits same-origin frames only. The detailed account runbook remains available, and both scopes share First 60 minutes and Walkthrough.

| Check                            | Result                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analyzer/import assertions       | 38 passed                                                                                                                                                                                             |
| Evidence/response behavior tests | 41 passed, 0 failed or skipped; includes isolated PowerShell fixtures                                                                                                                                 |
| Browser checks                   | 64 passed: 25 tenant engine + 39 quick/shared workspace                                                                                                                                               |
| Shared workspace coverage        | Same-page switching, retained user case, common header/navigation, tenant stage synchronization, shared walkthrough/runbook, in-place subject handoff without authority and disarming on scope change |
| Responsive checks                | Existing 320–1280 quick layouts; shared runbook in both scopes at 320/390; Docker tenant findings at 320/390/1280                                                                                     |
| Actual Docker browser smoke      | Passed: BETA 7, same-origin frame headers, previous tenant URL redirect, embedded demo collection, common navigation/runbook/walkthrough and scope switch; no page errors                             |
| Static checks                    | New scripts parse, generated beta entry refreshed, git diff whitespace check passed                                                                                                                   |
| Visual review                    | Desktop user and tenant findings plus shared runbook screenshots inspected                                                                                                                            |

Browser tests block external traffic and use demo/fixture data. No live Graph/Exchange access, containment changes, Azure deployment or public publication was performed. Prior Beta 6 live-tenant acceptance and provenance gates remain open. This update did not repeat the three-image secret scan or add a vulnerability audit.

Outputs: `test-results/beta7-unit.log`, `beta7-browser.log` (25 tenant + initial 37 shared checks), `beta7-quick.log` (final 39 quick/shared checks), `beta7-local.log`, `beta7-docker.log`; screenshots `unified-user.png`, `unified-tenant.png`, `unified-runbook.png`. Rebuilt local web at `http://localhost:8080/BETA/`.

[End-user walkthrough and repeatable commands](BETA-7-GUIDE.md). Run the additional local server check with `node tools/verify-beta7.mjs` after rebuilding the web container.

---

## Beta 6 / main build 18 — 15 September 2026

**Status: local implementation candidate; not promoted and not live-tenant accepted.** This section supersedes the capability/status statements in the historical Beta 3–5 records below.

| Check                              | Result                      | Scope                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Analyzer/import fixture assertions | 38 passed                   | Existing tenant signal and importer regression coverage                                                                                                                                                                                                                                                |
| Behavior tests                     | 41 passed, 0 failed/skipped | Evidence integrity/round-trip, collection paging, signed callers, queues, scope policy, canonical case identity, source-window prerequisites, wrong-user/status/temporal checks, duplicate mutation admission, Graph journal failure and account-substitution denial                                   |
| Actual PowerShell helpers          | Included in the 41 tests    | Both collector and legacy response helpers: zero/one/two array results and canonical identity rejection, executed in isolated Linux Docker with synthetic certificates and mocked cmdlets                                                                                                              |
| Browser checks                     | 50 passed                   | 25 tenant + 25 quick; includes retained runbook, demo confirmations, notes, device case round-trip, same-origin user handoff without authority, both background analysis engines/cancellation, preservation-exception cancellation and durable intent, responsive 320/390/736/1280 layouts and cleanup |
| Image packaging                    | 3 images passed             | Web, response backend and collector built from disposable synthetic contexts. Saved archive members/layers inspected with sequential gzip decompression and a compressed positive control; no planted private marker found. Uncompressed archive member counts: 34 / 19 / 16                           |
| Local HTTP smoke                   | Passed                      | Beta 6 entry, tenant page, shared services and walkthrough return 200; seven private-path checks return 403/404                                                                                                                                                                                        |
| Response-container smoke           | Passed                      | Isolated network-disabled container with synthetic configuration: mutations disabled, only enabled reads advertised, unauthenticated mutation returns 401                                                                                                                                              |
| PowerShell syntax                  | Passed                      | New-registration script and legacy mailbox helper parsed in the pinned runtime, without executing provisioning                                                                                                                                                                                         |
| Static checks                      | Passed                      | Changed JavaScript checks, beta page generation and `git diff --check`                                                                                                                                                                                                                                 |

The last metadata-only quick-collection adjustment was additionally checked with all 15 quick-safety tests passing. Local web rebuilt and verified at `http://localhost:8080/BETA/`. Main build 18 is shared code; no commit, push or public deployment was performed.

Commands and end-user instructions: [Beta 6 walkthrough](PHASE-1-2-GUIDE.md). Full original-review mapping and open gates: [Phase 1/2 ledger](../../review/2026-09-15/PHASE-1-2-STATUS.md) in the repository. Machine outputs are in local `test-results/beta6-unit.log`, `beta6-browser.log`, `beta6-image.log`, `beta6-smoke.json`, and `image-secret-results.json`; screenshots are in `test-results/`.

**Not performed / not accepted:** real Graph/UAL acquisition, real Exchange authentication/reads, migration or assignment of app roles in the test tenant, actual containment writes/readback, multi-analyst tenant load, Azure deployment, full accessibility audit and large-file performance. Browser containment tests are demo simulations; external Graph calls are blocked. The standalone PowerShell companion image was not rebuilt/scanned in this phase. No vulnerability-database freshness claim is made from the offline npm audit.

The exact upstream revision/licence for the previously copied blacklist data remains unresolved and is recorded with local hashes in `review/2026-09-15/ANALYZER-PROVENANCE.json`. Streaming file parsing and production-scale browser capacity testing remain open; background analysis and the analyst-attested emergency-preservation workflow are implemented. These gaps must not be hidden by calling both phases fully release-accepted.

---

## Historical validation records

The following entries describe their named builds at the time; statements such as separate export formats or older backend authorization are historical and superseded by the Beta 6 section above.

## Beta 5 update — 15 September 2026

Main build 17 records the new beta entry points. `/BETA/` now presents the production quick-user collector and full containment runbook in the new ENCA-colored layout. The tenant workspace moved to `/BETA/tenant.html`; it remains read-only. The production HTML is the source for the generated beta quick-user page, and its collector, detectors, runbook, blast-radius and export modules are reused.

- **42 browser checks passed:** 25 tenant-workspace checks and 17 quick-user checks. The quick-user checks cover both landing options, retained production element IDs, registered root redirect, retained write scopes, account selection, report-to-runbook context, all seven response cards, blast-radius/evidence/communication content, arming, cancelled and confirmed demo actions, action-log and handover export, session exit and mobile layout.
- **23 evidence/collector behavior tests and 38 analyzer/import assertions passed** again. No tests were skipped.
- ENCA Beta's current `css/app.css` was read from the GitHub connector; the light/dark palette, green surfaces, 16px cards and dark-mode lemon primary actions were applied. Desktop light/dark, runbook and mobile-guide screenshots were inspected. A mobile checklist overflow was found and fixed.
- JavaScript syntax, generator syntax and `git diff --check` passed. The new pages and guides are included in the web image allowlist. Tenant routes retain the same browser collector API and evidence contract.

All containment actions exercised in this change were **demo simulations**, with external API calls blocked by the browser harness. No tenant writes, real Graph collection, real Exchange connection or Azure deployment was performed. The Azure Container Apps option is a researched design document, not a working deployment button.

This is a presentation/routing integration of the production quick-user tool, not a claim that every production-only finding from the original deep review has been remediated. In particular, the older Exchange containment backend is separate from the new read-only collector. Existing main-tool data-coverage and backend authorization limitations still need their own remediation and live acceptance checks before wider rollout. The beta quick-user exit now replaces the document to clear the old in-memory account and armed runbook; root production exit behavior was not rewritten.

The tenant and quick-user workspaces use different evidence/report formats today. Their guides identify the correct export for each; automatic cross-workspace case conversion has not been implemented.

## Beta 4 update — 15 September 2026

Main build 16 records this beta update. Active Graph collection now has a blue source row, spinning badge and prominent current-source message. Completed, failed and uncollected sources have separate visual cues. Motion is disabled when reduced motion is preferred. The in-app Walkthrough and downloadable `USER-GUIDE.md` cover daily investigation; administrator setup is separately linked.

- **25 browser checks passed**, including the existing evidence and worker handoff checks plus active-source styling, current-source text, reduced motion, narrow-screen layout, cancellation/completion cleanup, the user walkthrough and its download.
- **38 analyzer/import assertions passed** again for the beta 4 demo and evidence fixtures.
- The browser run uses synthetic Graph and worker responses. Light/dark desktop, narrow-screen collection and the user walkthrough screenshots were visually inspected.
- JavaScript syntax and `git diff --check` passed. The collector and tenant permissions are unchanged in this update; Docker/Exchange acceptance remains as recorded below.

The original beta 3 validation is retained below as the record for the underlying evidence and collector implementation. Its checks are not presented as newly repeated tenant tests.

## Beta 3 implementation validation

Validated locally on 15 September 2026 against the working-tree implementation. Main build 15 records the beta and shared Docker-packaging change. The public site has not been published from this working tree.

## Result

The offline investigation workflow and local Docker topology passed the checks below. **A real Microsoft tenant was not connected.** Live Graph consent, Exchange application authentication, effective Exchange roles and real mailbox results remain acceptance work for a test tenant.

| Area                                                           | Result                                             | Evidence and limits                                                                                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing analyzer/import fixtures                              | 38 assertions passed                               | `BETA/beta.engine.test.mjs`; illustrative records                                                                                                                      |
| Evidence, Graph, authentication, queue and PowerShell behavior | 23 tests passed; zero skipped                      | `tests/*.test.cjs`; Microsoft responses and Exchange cmdlets are fixtures                                                                                              |
| Browser workflow                                               | 17 checks passed                                   | Demo, notes, raw bundle export/reimport, equivalent findings, session cleanup, cancellation, mocked worker-to-case handoff and saved jobs                              |
| Responsive layout                                              | All four views fit 320, 390, 736, 1024 and 1280 px | Browser checks plus visual inspection of desktop and narrow-screen screenshots; light/dark themes exercised                                                            |
| Docker components                                              | 7 smoke checks passed                              | Synthetic local certificate; unprivileged worker, private key loading, storage, denied anonymous collection, absent mutation route, web CSP and excluded private paths |
| Complete Docker Compose profile                                | 3 smoke checks passed                              | Isolated project: actual credential-init dependency, web-to-worker proxy, public configuration, denied anonymous collection and worker runtime settings after restart  |
| Syntax and diff checks                                         | Passed                                             | 17 beta/collector JavaScript files, 9 repository PowerShell files, `git diff --check`                                                                                  |

Local environment: macOS on Apple Silicon, Node 24.17.0, Docker 29.7.2 and Playwright using Microsoft Edge. The Exchange image was built and exercised as Linux amd64 through Docker Desktop emulation: PowerShell 7.5.0 with ExchangeOnlineManagement 3.9.2. Native macOS cannot use the worker's ephemeral PFX-import mode, so the PowerShell fixture tests ran in that Linux image.

The pinned PowerShell image reports 7.5.0; it is not a claim of the latest security patch. Refresh the runtime pins, review dependency advisories and repeat validation before shared or production use. The 7.5 release line reaches end of support in November 2026. [Microsoft support lifecycle](https://learn.microsoft.com/en-us/powershell/scripting/install/powershell-support-lifecycle).

## Behaviors covered

- Evidence bundles retain raw records, source states, exact collection context, dispositions and response notes. Reimport reproduces findings. Changed evidence fails its SHA-256 check; this is an integrity check, not proof of authenticity.
- Source gaps remain visible. Page caps/errors/cancellation retain earlier records and checkpoints. Untrusted continuation URLs receive no Graph token. Successful collection does not bypass retention or licensing limits.
- CSV/JSONL parsing rejects malformed or ambiguous inputs, preserves failed sign-ins and identities, and refuses incompatible tenant merges. Generic Exchange inventory CSVs are not mistaken for OAuth grants.
- OAuth grants resolve users and application IDs without rewriting raw grants. MFA false/unknown values remain distinct. Cleared forwarding is not classified as newly configured forwarding. Rapid IP changes are a review signal; analysis is no longer silently capped at the former event counts.
- Signed collector requests require the expected tenant, issuer, audience, SPA client, scope, assigned app role and analyst allowlist. Unknown-key rollover and denied callers are tested. Job access is isolated by tenant and owner; mailbox scope, idempotency, bounded queuing, audit failure and cancellation are exercised.
- The actual snapshot script is invoked with fixture cmdlets for zero, one and multiple records. It requests hidden rules and rejects a mailbox that resolves to a different Entra object ID. Failed sources cannot be presented as a complete snapshot.
- Container tests create synthetic credentials in temporary directories and delete their own test containers and volumes. The normal local beta web container is left available for review. No real collector credential has been configured by these tests.

The image check inspected the resulting web asset inventory and denied HTTP paths. It did not perform a separate image-layer archive scan with planted secret markers or a dependency-vulnerability audit.

## Reproduce the checks

Use PowerShell from the checkout with Docker Desktop running. These commands build local images and use synthetic fixtures; they do not connect to a tenant:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm ci
docker build --platform linux/amd64 -f backend/collector/Dockerfile -t triage-beta-collector:local .
docker compose -f docker-compose.beta.yml up -d --build web
npm test
npx playwright install chromium
npm run test:browser
node tests/docker-smoke.cjs
node tests/compose-smoke.cjs
```

Node 24 or later and PowerShell 7 are needed. On Linux/Windows, the PowerShell fixture tests use `pwsh` directly. The component smoke test expects the local web beta on port 8080. The Compose test uses an isolated project and an automatically allocated localhost port.

Generated browser screenshots and JSON reports are in the ignored `test-results` directory. CI runs the offline engine/behavior and browser suites; the local Docker smoke scripts are not presently part of CI. The newly added GitHub workflows have not run on GitHub in this session.

## Test-tenant acceptance still required

Follow [the walkthrough](WALKTHROUGH.md) using one allowed analyst and one non-production mailbox first.

1. **Graph sign-in:** verify the registered root redirect, consent and reader roles. Collect each licensed source; confirm real denied/unlicensed sources show the appropriate status. Check a large source's resume and a real UAL query's completion.
2. **Collector authorization:** assign the dedicated app role and analyst allowlist. Verify a permitted analyst can authorize, while an unassigned analyst and a mailbox outside the allowlist are denied.
3. **Exchange roles:** run the role setup with `-WhatIf`, inspect the planned custom roles, apply them and review the resulting command entries. The provisioning script has been parsed, but its Exchange tenant operations have not been exercised. Do not assume the local health check proves effective Exchange access.
4. **Known mailbox:** compare the seven snapshot sources with a trusted administrative read. Include a known hidden rule and each relevant delegation type. Confirm mailbox identity, source counts, timestamps and per-source errors. Check folder-permission behavior against real folder names and permissions.
5. **Persistence:** save a bundle, restart the worker, reopen the saved job as its owner and verify other analysts cannot retrieve it. Cancel an acquisition and verify its final state. Export before testing deletion.
6. **Policy compatibility:** validate Conditional Access, certificate acceptance, module behavior under emulation and actual job duration. Establish credential rotation and evidence retention for the intended environment.

## Implementation boundary

This build implements the redesigned beta, evidence correctness improvements and a separate read-only Exchange collector. Shared web Docker packaging was tightened. It does not migrate the older production containment backend or repair every production-only finding in the original review.

Live containment, message trace, transport/connectors, application-permission assignments, service-principal sign-ins, content/eDiscovery, shared cases and hosted-service deployment remain outside this beta build. The collector does not mean that every Exchange data surface is collected.
