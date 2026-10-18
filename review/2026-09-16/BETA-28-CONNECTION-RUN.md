# Beta 28 — connect before collection and diagnose mailbox availability

Local candidate: Beta 28 / desktop 0.28.0. Shared website scripts remain build 37. No deployment, tenant access or customer-registration changes.

## Changed

1. Graph and Exchange already connected before source reads. The remaining explicit late connection was Azure, which was initialized when its source was reached. Optional Azure initialization now runs before the Graph worker announces it is ready for collection. Available services continue if Azure fails; Azure sources report the retained setup error without calling Connect-AzAccount again.
2. Graph interaction-required, invalid-grant and 401 failures now request explicit reconnection and prevent repeated requests with the failed session. Existing in-memory Graph/Exchange sessions remain in use during their acquisition. No new token export or cross-service token sharing was introduced.
3. Email content and attachments share failures of their underlying mailbox listing. A mailbox 404/unsupported-mailbox response becomes an unavailable coverage gap with target identity and the original error. The same request is not repeated for attachments. The message does not claim the mailbox is definitely absent, unlicensed or on-premises.

## Validation

- Engine regressions and all 78 unit/collector/security tests passed.
- A synthetic Azure module proves one Azure sign-in occurs before the first source emits collection progress, and both Azure sources reuse it.
- The source fixture proves a mailbox 404 results in only one listing request across email and attachments, with both sources marked unavailable. It also proves an Azure read cannot initiate a late sign-in.
- Existing tests cover response worker reuse, cancellation and tenant/account authorization boundaries. UI behavior was unchanged; the prior Beta 27 UI results are not presented as new Beta 28 UI runs.
- No live Microsoft account, mailbox or application registration was tested. The customer's actual mailbox 404 remains unresolved until the target mailbox and connection mode are confirmed.

## Retest

1. Quit the older app and extract this new ZIP. Confirm Beta 28.
2. Select Graph and Exchange sources. Sign into the same target tenant/operator during Connecting. If Azure sources are selected, complete their startup sign-in too.
3. Confirm that collection begins after startup connections finish. Report the service and stage of any later authentication/Keychain prompt.
4. Verify the affected account has a working Exchange Online mailbox in Outlook on the web. A successful admin sign-in does not establish that the target mailbox is available to Graph.
5. If mail still returns 404, record the connection mode, affected UPN, Exchange snapshot state and complete underlying Graph error. Both mail sources should expose the same underlying availability gap rather than performing duplicate requests.

One acquisition retains its service sessions. Starting another acquisition, explicitly connecting the separate response workspace, or elevating to write permissions remains a separate authorization boundary. Silent renewal can be blocked by Microsoft policy; live prompt behavior is not claimed verified.

## Repeat locally (PowerShell)

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
npm run desktop:package:mac
npm run desktop:package:win
node tools/verify-packages.mjs
```

Sources: [Microsoft Graph mail overview](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview), [unsupported mailbox errors](https://learn.microsoft.com/en-us/troubleshoot/exchange/user-and-shared-mailboxes/rest-api-is-not-yet-supported-for-this-mailbox-error), [Azure authentication](https://learn.microsoft.com/en-us/powershell/module/az.accounts/connect-azaccount).

## Additional local-case evidence

Read-only inspection of the most recent saved acquisition (case 7c99dc5c-a10e-458c-a28e-7b0d082ba2df) confirmed delegated Graph and Exchange sessions, matching target object IDs, and a complete Exchange mailbox snapshot. The signed-in Graph operator differs from the target. The preserved FullAccess inventory has one SELF entry and no explicit matching operator UPN entry. This supports investigating delegated mail access rather than claiming that the mailbox is absent. It does not by itself prove every effective group/folder permission or the exact Graph 404 cause. No new tenant query or access grant was made.

## Packages

Both packages passed source identity checks. The Mac ZIP passed extraction, ad-hoc signature, launch and bundled-runtime readiness. Windows execution remains pending.

```text
fa4fb134bc26cc18640ecf73c4465f4dc7590b3e80c2dfc6a3d2a5041596366c  Triage-macOS-arm64.zip
dd8efba4751f33bc10e67279a257bef4faf150deb830c656182919770f7f2427  Triage-Windows-x64.zip
```
