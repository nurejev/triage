> **Beta 34 local candidate (2026-09-18):** Option 2 is implemented: seven steps grouped into Prepare / Investigate / Act & transfer, one case header, persistent gaps, actual supporting records before decisions, and all steps available on small screens. Completion is explicit: investigating is outstanding, response needs five reviewed outcomes, and export does not imply handover. See [the implementation report](../review/2026-09-18/BETA-34-IMPLEMENTATION.md) and [validation record](docs/VALIDATION.md).
>
> **Beta 33 local candidate (2026-09-17):** Collect states its target — a green banner at the top of the screen names the affected account in its tenant (or *Whole tenant · domain*), the window, the sources, the collection method and the signed-in analyst; it stays after the collection and on reopened cases. Web collections now record the analyst (`collectorAccount`) like the app.
>
> **Beta 32 local candidate (2026-09-17):** after the first live test — on the web the account checks on Respond connect by themselves with the Connect sign-in; the embedded runbook no longer asks to run triage again; the step rail clips long account names; the session chip shows Graph/Exchange/write state; a second collection asks before opening a new case; Help shows *What's new* per build.
>
> **Beta 31 local candidate (2026-09-17):** one workflow. The sidebar is the step rail — **Start → Connect → Scope → Collect → Review → Respond → Hand over** — every screen has one primary action, the URL names the step and the browser's Back button always works. Sign-in happens only on Connect (tenant pinned first; desktop services as rows with retained PowerShell sessions), Scope offers evidence presets, Collect opens Review by itself, findings open in a drawer, and the case saves itself. See [the user guide](docs/USER-GUIDE.md), [the handover note](../review/2026-09-17/HANDOVER-BETA-31.md) and the workflow advice in `review/2026-09-16/`.

# Triage beta 34 — no Docker

## Beta 23 — quieter analyzers, keyed saved cases, wider collection

See **What's new** in the app (build.js) for the full list. Two things change how you use it: the delegated Graph consent now asks for `RoleManagement.Read.Directory` (PIM eligibility) instead of the unused `Policy.Read.All`, so the first sign-in after upgrading shows a consent prompt; and **Save** keeps one file per case (Open saved case lists them) instead of overwriting one slot. Existing exported cases open unchanged and get the corrected analysis. Downloads are published as GitHub Release assets (`releases/latest/download/…`), not from the repository.

## Beta 22

## Customer registrations and connection timeouts

**Beta 22 adds Customer connections above the collection form.** Choose delegated passkey sign-in or an existing customer certificate profile. The creation wizard prepares a reviewed PowerShell setup folder; cloud creation happens only when you execute that script and approve its tenant/permission preview.

See [Customer connection guide and acceptance checklist](docs/CUSTOMER-CONNECTIONS.md). The reported Mac symptom—browser sign-in succeeds while the app waits—is not yet confirmed resolved. This build preserves the actual error, identifies the connection stage, and stops a connection attempt after ten minutes. Certificate mode avoids the interactive callback. No Docker or Apple Developer ID is required.


## Passkey-only administrators

For Exchange sign-in, use Microsoft's **Sign-in options → Face, fingerprint, PIN or security key**, then select the same operator account used for Graph. Triage leaves `UserPrincipalName` unset so the Exchange module can present the full account/sign-in chooser. Browser session reuse may still occur, but Triage no longer forces a username-first screen. The signed-in operator, tenant and mailbox identity are checked afterward.

This is a compatibility adjustment for the reported missing passkey option, not proof that a particular browser/passkey combination works. The option is presented by Microsoft and the browser, not Triage. See [Microsoft's passkey sign-in guide](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-sign-in-passkey) and [supported browsers/platforms](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-fido2-compatibility). Delegated sign-in still has no password/device-code fallback or policy exception. Separately, an explicitly selected customer registration can authenticate with its certificate.

## Connect Microsoft 365 at the start

The portable app connects **Microsoft Graph** and **Exchange Online** when their sources are selected, before starting the evidence queries. Connection cards show **Waiting**, **Connecting**, **Ready**, collection and session completion. Only the services required by the plan are opened.

Exchange opens the full Microsoft account/sign-in chooser. Select the **same operator account** as Graph; Triage verifies it after authentication. The browser may reuse its Microsoft sign-in session; Microsoft can still require consent, MFA or another confirmation. Graph and Exchange use separate tokens and PowerShell sessions, so this is one guided connection flow, not a guarantee of one prompt or access to every M365 portal. No new app registration is required for delegated mode. Optional app + certificate mode requires customer registrations and consent.

Each worker keeps its session open during setup and continues collection without reconnecting. A failed service remains an explicit evidence gap while available services can collect. Cancel stops every waiting/running worker. Triage records connection results in the action log; tokens are not passed between workers or included in case files. PowerShell sessions end after the collection attempt; Microsoft browser sign-in cookies may remain.

Both connected tenants must match the plan. In delegated mode, Exchange must match the Graph operator and mailbox identity. In certificate mode, each service must match its configured application ID and tenant; the mailbox identity must still match. Direct access to the target tenant is supported; partner/GDAP routing is not implemented. This does not add Teams, SharePoint or other PowerShell connectors.

Microsoft references: [per-resource tokens and single sign-on](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/resources-and-scopes), [Exchange username hint](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/connect-exchangeonline?view=exchange-ps#-userprincipalname).

## How this check runs

A method card beside the collection controls identifies **PowerShell · runs on this computer** in the portable app and **Browser JavaScript · runs in this browser** for a web check.

While a check is active, a status strip stays visible across case screens and as you scroll. It names the collection method and current source, explains cancellation, then switches to **Analyzing evidence with JavaScript** when the shared analyzer runs. Native analysis stays in the app; browser analysis stays in the browser. When finished, it says **App viewer** or **Browser viewer · no checks running**.

New cases retain their collection method through save/export, reopening and browser handoff, and include it in the handover. The current viewer does not change that recorded method. Older cases without this metadata say **Collection method was not recorded**. Imported metadata describes the case; it is not independent proof of which program acquired it.

## OAuth findings follow the selected account

In a one-account case, OAuth findings require **per-user consent linked to that account**. Tenant-wide (`AllPrincipals`) grants are retained as shared tenant context and do not increase that account's OAuth finding count or priority signals. Grants for other accounts, application permissions and records whose user relationship cannot be verified also remain evidence rather than user OAuth findings. Familiar application names are not automatically trusted: a matching user grant still receives the same permission checks.

The **OAuth permissions · this account** summary shows the relationship counts and opens the original evidence. Evidence rows label tenant-wide consent and retain their original references. A tenant-wide review continues to analyze all collected grants. A global permission alone does not establish app use by the selected account; actual sign-in and audit signals retain their existing checks.

Existing exported cases receive the corrected analysis when reopened. Export your current case before refreshing the website or replacing the portable app, then open that file in Beta 22. No new collection is needed to re-analyze preserved grants. Prior review records remain in the action log; handover confirmation totals count the findings in the current analysis.

The original site's user collector uses the [Microsoft user-grants endpoint](https://learn.microsoft.com/en-us/graph/api/user-list-oauth2permissiongrants?view=graph-rest-1.0), which excludes organization-wide consent. The beta intentionally preserves that broader context, while [consentType and principalId](https://learn.microsoft.com/en-us/graph/api/resources/oauth2permissiongrant?view=graph-rest-1.0) determine whether a grant belongs in this account's findings.

## Reviewing a finding

Every review needs a reason. **Confirmed** also needs an existing evidence reference copied from a supporting record in **Evidence**. If Save review cannot continue, the dialog explains the missing or invalid fields and focuses the first correction. Your draft remains in place, and errors clear as you edit. A successful save closes the dialog and records one event in the action log. This behavior is shared by the web and portable viewers.

## macOS first-launch note

For a trusted Triage download blocked by macOS quarantine, move the extracted **Triage.app** to **Applications**, then run in Terminal or PowerShell:

```powershell
xattr -dr com.apple.quarantine "/Applications/Triage.app"
open "/Applications/Triage.app"
```

This removes only the app's download-quarantine flag. If the app is elsewhere, use its actual path. For example, an app still in Downloads can use `/Users/yourname/Downloads/Triage.app`.

The [MarkText-style command](https://github.com/marktext/marktext/releases) also removes quarantine, but clears **all extended attributes** from the app:

```powershell
xattr -cr "/Applications/Triage.app"
```

These commands do not repair damaged files or provide Developer ID signing/notarization. [Apple's Privacy & Security → Open Anyway](https://support.apple.com/en-us/102445) is another option when available. Triage does not run either command automatically.

## Directory roles and MFA registration — Beta 15

The web and portable collectors correct two rejected queries:

- Directory role assignments expand **roleDefinition** only. The returned principal ID is retained; the shared viewer resolves readable account details from preserved user/application inventory or the canonical case subject. If identity inventory is unavailable, the original principal ID remains visible. Raw assignment records are not rewritten to add display fields.
- A one-account MFA check requests **userRegistrationDetails/{userId}** and stores the single report as one evidence record. Tenant-wide MFA registration remains a paged list. A denied, missing or mismatched report stays an explicit coverage gap; it does not establish that MFA is absent.
- Retrying incomplete web collection replaces the rejected older query URL. Portable collection should be rerun using the updated app. Existing exported case files keep the errors and evidence captured at their original acquisition.

The existing site's quick MFA check reads authentication methods; this beta tile reads the registration report. These are distinct evidence sources. This fix corrects the report request; it does not add an authentication-methods inventory or change tenant consent.

Microsoft references: [role assignment query options](https://learn.microsoft.com/en-us/graph/api/rbacapplication-list-roleassignments?view=graph-rest-1.0), [single-role expansion](https://learn.microsoft.com/en-us/graph/api/unifiedroleassignment-get?view=graph-rest-1.0), [single-user registration report](https://learn.microsoft.com/en-us/graph/api/userregistrationdetails-get?view=graph-rest-1.0).

The website runs directly as a static site. The portable macOS/Windows app runs collection locally and includes its own case viewer. Neither needs Docker or a server-side collection backend.

## One workflow

The desktop app and the website walk the same seven steps. **Connect** signs in — the website pins the tenant (your organisation or a customer domain) before the Microsoft window opens; the desktop app signs Microsoft Graph and, optionally, Exchange Online in as rows and keeps those PowerShell sessions until you collect. **Scope** chooses one account or the whole tenant, the window and an evidence preset (Quick, Standard, Everything, Custom); the website suggests accounts from the tenant, and a plan saved there opens in the desktop app through *Triage → Open collection plan…*.

Starting a collection opens **Collect** immediately. Its selected-source progress, status icons, record counts and clickable evidence use the same components during and after collection. In the portable app, counts and original records come from the current collection attempt's saved PowerShell checkpoints. **Collection details** beneath the dashboard expands the raw output; the browser shows source activity there.

You can open a source on Collect and inspect the records that have already arrived while collection continues; Review, Respond and Hand over unlock when it ends. Stopping keeps returned records and marks unfinished sources accordingly. Analysis runs when collection ends and Review opens by itself.

## Collection coverage

The overview shows how many selected sources have completed, a progress bar and separate totals for collecting, waiting, failed and partial results. The source currently running has a blue highlight; completed sources have a green check. Status text and icons communicate the meaning alongside color.

Sources that have not started show **Waiting** during a live run. Sources outside the plan show **Not selected**. A completed empty query shows **0 records**; unstarted sources do not show a misleading zero. Saved unfinished requests show **Interrupted** until collection is resumed. The overview prioritizes active and incomplete sources; **All sources** opens the full list and original records/errors remain clickable.

## Appearance

Use **Theme** in the top bar to choose **System**, **Light** or **Dark**. System is the default for new users and follows macOS, Windows or browser appearance automatically, including changes while Triage is open. An existing Light or Dark choice stays selected until you choose System. Switching appearance preserves unsaved notes, account fields and focus.

The browser remembers the choice for this website; the portable app remembers it across app restarts. Each viewer keeps its own preference. The selector is also available on small screens.

## Open the website locally

From the repository folder:

```powershell
npm run web
```

Then open [http://localhost:8080/BETA/](http://localhost:8080/BETA/). Keep that terminal running; Ctrl+C stops the local website. Node 24 or later is required for this development server. The deployed website can use ordinary static hosting. The downloaded desktop app does not require Node to be installed.

The server only exposes website assets and built portable downloads. It does not serve case files, runtime folders, credentials or backend endpoints. Existing Microsoft authentication still uses the registered site-root reply URL.

## Start a collection

On Scope, type the affected account (the website suggests matches from the tenant as you type) or choose a tenant-wide review, pick the window and a preset, and press **Start collection** beside the field; on small screens it appears directly underneath. The sign-in from Connect is reused; nothing opens a browser window. Collect shows every selected source with its status and count, records can be inspected as they arrive, **Stop collecting** keeps what was returned, and Review opens by itself when collection ends. A reload lands on the same case and screen; the case saves itself while you work, and the case bar says when.

## Inspect evidence

Click anywhere on a source row in **Evidence** to expand its records directly below it. Click a record to inspect its original content and reference. Source details include the collection query, status, errors and timestamps. Empty completed queries and sources that failed or were not collected are explained separately. The same viewer is included in desktop 0.22.0.

OAuth collection now uses two separate equality queries for user-specific and tenant-wide grants. Returned records and the current query/page are retained if collection stops. The web viewer can resume an incomplete live collection; desktop resume remains unimplemented.

## Start another investigation

With a case open, **New case** in the case bar shows a central **Start a new investigation** panel. **Save & start new case** keeps the current case (it is already saved on this device) and returns to Connect or Scope. Saved cases are listed under **Open a case** on Start. The desktop app uses the same flow.

## Start the desktop app from this checkout

```powershell
npm run desktop:start
```

This uses the Electron dependency and the bundled runtime prepared during development. It does not start a web container. For the built local macOS app:

```powershell
open './desktop/out/Triage-darwin-arm64/Triage.app'
```

## Build portable apps

```powershell
npm ci
npm run desktop:runtime
npm run desktop:package:mac
npm run desktop:package:win
```

Build prerequisites are Node 24, Python 3.9 or later, and macOS for the Mac signing/archive commands. Outputs are `BETA/downloads/Triage-macOS-arm64.zip` and `BETA/downloads/Triage-Windows-x64.zip`.

The Mac builder applies a valid **ad-hoc development signature** after all app contents are assembled. It verifies the signature, extracts the ZIP into a new folder, rechecks the extracted signature and launches the extracted app's readiness check before replacing the download. Do not modify an app after it has been signed.

An ad-hoc signature does not identify an Apple-approved publisher. The Mac build is **not Developer ID signed or notarized**. Browser-downloaded copies may still require Apple's normal approval under System Settings → Privacy & Security → Open Anyway. No Developer ID signing identity is available in the current build environment. Trusted public distribution requires a Developer ID Application certificate and Apple notarization. Windows builds remain unsigned and require native Windows acceptance.

The beta 8 “damaged app” problem was a broken bundle signature, not a missing runtime. A previous command-line launch was insufficient validation. The beta 9 build verifies the actual extracted archive as well.

## Validate without Docker

```powershell
npm test
npx playwright install chromium
npm run test:browser
```

Current beta tests run directly with Node and the controlled PowerShell fixtures. Legacy certificate-container tests are separated under `npm run test:legacy:containers`; they are not part of the current beta's default validation or runtime.

See [the collector guide](docs/COLLECTOR.md) and [validation record](docs/VALIDATION.md). The shared viewer includes findings, raw evidence, timeline, the first-hour runbook, action history and case import/export. Team upload and live-tenant acceptance remain outstanding.
