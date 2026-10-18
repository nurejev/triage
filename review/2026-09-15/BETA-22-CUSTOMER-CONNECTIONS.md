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

Still pending: Mac delegated callback/passkey reproduction; live app-certificate authentication, customer consent and Exchange cmdlet coverage; actual Keychain/DPAPI integration; live wizard execution and RBAC application; Windows runtime execution. Do not describe the live Mac timeout as resolved. The checklist and repeatable PowerShell commands are in [Customer connections](../../BETA/docs/CUSTOMER-CONNECTIONS.md).

## Packaging

Portable archive verification and hashes are recorded in the local review report after packaging. The packaged guide contains this honest validation boundary; it is not evidence of live tenant acceptance.

### Final archive verification — passed

Both local ZIPs were rebuilt after the final shared-screen changes. Byte comparisons verified current native main/preload/core/profile code, all four collector/setup scripts, shared viewer, versions and guides inside both packages. ZIP CRC checks passed. macOS strict ad-hoc signature verification passed before and after extraction; the extracted app launched and its bundled runtime readiness passed. Windows was cross-packaged and archive-verified, not executed on Windows.

SHA-256:

- macOS ARM64: `0dd5a7553589871e985c81dd7d69f450ef8410cb20db3ed0485da247a7277c6e`
- Windows x64: `96c18d48a835a5d9a1ba5e6139781017a0b566d94ccb83971d084fecb9d3891f`

Evidence: `test-results/beta22-package-mac.log`, `beta22-package-win.log`, `beta22-package-verify.log`; `BETA/downloads/SHA256SUMS.txt`.

```powershell
Set-Location /Users/mihaimonte/REPO/triage
node test-results/beta22-verify-packages.mjs
Get-FileHash -Algorithm SHA256 ./BETA/downloads/Triage-macOS-arm64.zip
Get-FileHash -Algorithm SHA256 ./BETA/downloads/Triage-Windows-x64.zip
```

The Mac app installed under Applications was not replaced and the user's active case/browser was not changed. Export the case, quit the older app, then replace it with this local Beta 22 download for live acceptance testing.
