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

## Package verification

- Rebuilt the macOS ARM64 and Windows x64 portable downloads at **0.20.0**, with Beta 20 and shared build 32.
- Both ZIPs passed CRC checks. Archived native host/preload, shared viewer, PowerShell collector, build files and guides match current source. SHA-256 sums were refreshed.
- Strict Mac signature checks passed before and after extraction. The extracted app launched and reported bundled-runtime readiness. The recurring sandbox-extension diagnostic did not prevent launch/readiness; signing remains ad-hoc.
- The local server was verified to serve Beta 20 and the new connection UI, without refreshing the user's active case. Docker was not started and no changes were pushed to GitHub.
- Live tenant SSO behavior and native Windows execution remain pending.

SHA-256:

```text
887729923a893c5b2460e411c47a0a529304fadb23dac829302afc8417af2077  Triage-macOS-arm64.zip
abbba9778366575b10619f3d8e5fd098de62eecae37901bf8baeea25f56d755a  Triage-Windows-x64.zip

```

Evidence: `test-results/beta20-package-mac.log`, `beta20-package-win.log`, `beta20-archives.log`.

[Light preview](../../test-results/beta20-connect-light.png) · [Dark preview](../../test-results/beta20-connect-dark.png) · [Narrow preview](../../test-results/beta20-connect-mobile.png) · [Validation history](../../BETA/docs/VALIDATION.md)
