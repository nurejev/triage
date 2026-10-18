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

## Package verification

- Rebuilt local macOS ARM64 and Windows x64 downloads at **0.21.0**, Beta 21/shared build 33.
- Both archives passed CRC checks; archived native host, PowerShell collector, shared UI, versions and guides match current source.
- The extracted Mac app passed strict ad-hoc signature verification, launch and bundled-runtime readiness. The recurring sandbox-extension diagnostic did not prevent launch. Developer ID signing/notarization is intentionally outside the distribution requirements.
- The local server serves Beta 21 and passkey guidance. No live user case was refreshed, no tenant was contacted, no Docker was started and nothing was pushed to GitHub.
- Live passkey acceptance and native Windows execution remain unverified. This release does not claim that the reported Microsoft-screen symptom is resolved.

SHA-256:

```text
e6ac1e03564fb79a34aa85089d5997356e9f9c70b6eb9b2a3650981aff191766  Triage-macOS-arm64.zip
ce0344ef51cac72df622b8909e302d8d202e9ff30b1fa48be76929432855981a  Triage-Windows-x64.zip

```

Evidence: `test-results/beta21-package-mac.log`, `beta21-package-win.log`, `beta21-archives.log`.

[Connection preview](../../test-results/beta21-connect-light.png) · [Validation history](../../BETA/docs/VALIDATION.md)
