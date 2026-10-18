# Beta 27 — collection failures, sessions and cancellation

Local candidate: Beta 27 / desktop 0.27.0 / shared scripts build 37. No deployment, no tenant actions and no customer registration modifications.

## Confirmed causes and changes

1. Native response started a new PowerShell worker and Graph connection per request. It now keeps one worker/session for successive requests, checks the bound case/tenant/account, and closes it on disconnect, stop, expiry or app exit. Write scope elevation and native action confirmation remain separate.
2. Graph used CurrentUser token caching. Collection and response now use Process scope to avoid repeated Graph OS-cache access. This specifically addresses the Graph cache path behind the reported macOS Keychain prompts; live Microsoft/macOS confirmation remains pending. Other modules or certificate access may still prompt.
3. Search-AdminAuditLog and Search-MailboxAuditLog were still in the collector and registration-role setup. They are replaced with Search-UnifiedAuditLog. Daily record-type slices page with ReturnLargeSet and deduplicate IDs. Repeated pages/errors preserve partial evidence; the 50,000-record slice ceiling is explicit. Mailbox filtering matches the mailbox owner rather than only the actor. Historic aliases and other unqueried record types are not implied covered.
4. Delegated mail requested Mail.Read, which does not grant another user's mailbox access. It now requests Mail.Read.Shared. A 403 is classified as unavailable with guidance about existing delegation or an approved application permission/scope. No permissions are granted automatically.
5. Stop scanning is available in the sidebar while connecting/collecting, including away from Overview. Blast-radius scans have Stop scanning too. Completed evidence remains; incomplete/late results are not declared complete, and no later queued check starts after cancellation. Stopping a local poll does not cancel an already-submitted Microsoft audit job.
6. Application connection failures now retain the original error and identify likely client-ID/tenant, certificate, authorization or resource-resolution checks. The exact reported customer application error has not been supplied, so that root cause is still unconfirmed.

## Validation

- 148 browser checks passed, including preventing queued blast checks after stop.
- 58 native UI checks passed using isolated synthetic workers, including sidebar stop away from Overview and two response requests sharing one worker PID.
- Engine tests and unit/collector tests verify one Graph connection for three commands, Process-scope use, tenant/operator/consent guards, Unified Audit paging and owner matching, repeated-page partial results and mail-access-denial handling. All 77 unit/collector checks passed.
- No real Microsoft authentication, mailbox reads, response writes or app-registration changes were performed.

## Retest on an authorized tenant

1. Extract the new portable ZIP and launch that copy. An already running older copy does not update automatically.
2. Run a small delegated collection first. Expect service-level sign-in when required, not one login per Graph command. Record which service triggers any remaining Keychain/browser prompt.
3. Run the fifteen checks, then Stop scanning during a read. Verify later checks do not start and completed results remain available.
4. Check Admin audit and Mailbox audit: collection details should say Search-UnifiedAuditLog, with returned records or an explicit access/coverage gap.
5. For email content, use an account with existing target-mailbox delegation, or a correctly consented/scoped application. Otherwise an unavailable-access result is expected.
6. Retest the customer registration and capture the complete error (without tokens, private keys or passwords), its service, and whether it occurs while connecting or reading a source. Application failures are not yet confirmed resolved.

## Local commands (PowerShell)

```powershell
Set-Location /Users/mihaimonte/REPO/triage
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm test
npm run test:browser
node tests/desktop-progress.mjs
npm run desktop:package:mac
npm run desktop:package:win
node tools/verify-packages.mjs
```

Reference documentation: [Microsoft Graph authentication](https://learn.microsoft.com/en-us/powershell/microsoftgraph/authentication-commands), [shared/delegated mail access](https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders), [Search-UnifiedAuditLog](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/search-unifiedauditlog), [Exchange audit properties](https://learn.microsoft.com/en-us/purview/audit-log-exchange-properties).

Windows execution and live Mac passkey/Keychain acceptance remain pending. macOS is ad-hoc signed, not notarized. Full Extractor/Analyzer equivalence is not claimed.

## Packages

Both packages match Beta 27 / 0.27.0 JavaScript, CSS, HTML, PowerShell and runtime files. Mac ZIP extraction, ad-hoc signature, launch and bundled-runtime readiness passed. Windows source identity passed; Windows execution remains pending.

```text
04344ec202e6719c055874a73d64e5d423aaf02f147be7eb5c218e2406dacee2  Triage-macOS-arm64.zip
8f181cacf669d5dc687f6bfd46f5d1f8c8abbde3cbe5e0a3d0f8257396c6b829  Triage-Windows-x64.zip
```

Logs: `test-results/beta27-browser.log`, `beta27-native.log`, `beta27-unit.log`, `beta27-package-mac.log`, `beta27-package-win.log`.
