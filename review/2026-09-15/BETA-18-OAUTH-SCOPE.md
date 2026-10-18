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

## Package verification

- Rebuilt macOS ARM64 and Windows x64 portable downloads at **0.18.0** with Beta 18 / shared build 30.
- Both archives passed CRC checks. The archived OAuth analyzer, evidence model, shared viewer, handover model, native host, collection scripts, version files and guides match current source.
- Strict Mac signature verification passed before and after extraction. The extracted app launched and reported bundled-runtime readiness. The recurring sandbox-extension diagnostic did not prevent successful launch/readiness.
- The local website was verified to serve Beta 18 and the corrected scope logic. The user's active case was not refreshed. No Docker was started and nothing was pushed to GitHub.
- Windows was cross-built; native Windows execution remains pending. Mac signing remains ad-hoc, without Developer ID signing/notarization.

SHA-256:

```text
03de841da620d4d03695d73f98a430c9202853e38d834fd2c4f94c15ca2c0d71  Triage-macOS-arm64.zip
420506db384f624df31984ec1675c7afb832ea710a890428931e56743d43b08c  Triage-Windows-x64.zip
```

Evidence: `test-results/beta18-package-mac.log`, `beta18-package-win.log`, `beta18-archives.log`.

[Web preview](../../test-results/beta18-oauth-findings.png) · [Portable preview](../../test-results/beta18-native-oauth-findings.png) · [Validation history](../../BETA/docs/VALIDATION.md)
