# Triage beta 31 — collection and case guide

## Beta 31 — one workflow, sign-in only on Connect

The website and the desktop app share one procedure: **Start → Connect → Scope → Collect → Review → Respond → Hand over**. The sidebar is the step rail, the URL names the step (`#/connect`, `#/case/<id>/review/findings`), the browser's Back button returns to the previous screen, and the case saves itself. The end-user side is described in [the user guide](USER-GUIDE.md); this guide covers what the collectors do underneath.

**Connect happens before Scope.** On the website the tenant is pinned before the Microsoft window opens: *My organisation* uses the `/organizations` authority, *Customer tenant · by domain* resolves the domain through Microsoft's public OpenID configuration (`https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration`) and passes that tenant as the request authority, so a partner account is issued a token for the customer. In the desktop app each service is a row with its own PowerShell worker: `collect.ps1` signs in with a **connection plan** (tenant scope, no subject, every source the service may serve — this is where the read scopes are requested, mail content only when ticked), writes `<mode>-context.json`, reports `connected` and waits. Collect rewrites `plan.json` with the affected account, window and chosen sources and releases the worker with the `collect` line; the worker reads the plan again (`Read-Plan`, tenant must not change), resolves the affected account, and only then queries. A signed-in worker that is not released within thirty minutes is stopped and its row asks for a new sign-in; the ten-minute sign-in watchdog is unchanged.

IPC: `triage:connect {caseId, service, tenantId, connection, mail}` returns `{caseId, account, authentication}` when the row is ready; `triage:cancel-connect {service}`; `triage:sessions` describes the retained sessions (the renderer restores the rows from it after a reload); `triage:collect(plan)` requires the plan's case and tenant to match the connection. The plan may carry `tenantName` (the domain shown on the case).

## Customer registrations and connection timeouts

**Beta 22 adds Customer connections above the collection form.** Choose delegated passkey sign-in or an existing customer certificate profile. The creation wizard prepares a reviewed PowerShell setup folder; cloud creation happens only when you execute that script and approve its tenant/permission preview.

See [Customer connection guide and acceptance checklist](CUSTOMER-CONNECTIONS.md). The reported Mac symptom—browser sign-in succeeds while the app waits—is not yet confirmed resolved. This build preserves the actual error, identifies the connection stage, and stops a connection attempt after ten minutes. Certificate mode avoids the interactive callback. No Docker or Apple Developer ID is required.


## Passkey-only administrators

For Exchange sign-in, use Microsoft's **Sign-in options → Face, fingerprint, PIN or security key**, then select the same operator account used for Graph. Triage leaves `UserPrincipalName` unset so the Exchange module can present the full account/sign-in chooser. Browser session reuse may still occur, but Triage no longer forces a username-first screen. The signed-in operator, tenant and mailbox identity are checked afterward.

This is a compatibility adjustment for the reported missing passkey option, not proof that a particular browser/passkey combination works. The option is presented by Microsoft and the browser, not Triage. See [Microsoft's passkey sign-in guide](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-sign-in-passkey) and [supported browsers/platforms](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-fido2-compatibility). Delegated sign-in still has no password/device-code fallback or policy exception. Separately, an explicitly selected customer registration can authenticate with its certificate.

## Connect Microsoft 365 on the Connect step

The portable app signs **Microsoft Graph** and, optionally, **Exchange Online** in on the Connect step, one row at a time, before any scope is chosen. Rows show **Not connected**, **Waiting for you**, **Ready**, **Collecting** and the session end. Only the services you sign in to are opened; Scope offers mailbox sources only when Exchange Online is signed in.

Exchange opens the full Microsoft account/sign-in chooser. Select the **same operator account** as Graph; Triage verifies it after authentication. The browser may reuse its Microsoft sign-in session; Microsoft can still require consent, MFA or another confirmation. Graph and Exchange use separate tokens and PowerShell sessions, so this is one guided connection flow, not a guarantee of one prompt or access to every M365 portal. No new app registration is required for delegated mode. Optional app + certificate mode requires customer registrations and consent.

Each worker keeps its session open until Collect releases it and then continues without reconnecting. A failed or cancelled sign-in stops its worker; the other row can still collect. Stop collecting stops every released worker. Triage records connection results in the action log; tokens are not passed between workers or included in case files. PowerShell sessions end after the collection attempt; Microsoft browser sign-in cookies may remain.

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

## Shared collection screens

Both clients open the same **Collect** step when a collection starts: selected-source progress, live record counts, records that can be inspected as they arrive, and separate waiting, collecting, complete, partial and failed states. Native collection reads the current attempt's saved checkpoints after validating the tenant context. Expand **Collection details** below the coverage panel for PowerShell output or browser source activity. Source errors remain available directly in **Evidence**.

Scope uses the same **Account to check** field with **Start collection** beside it in both clients; the sign-in happened on Connect, so starting never opens a browser window. Review, Respond and Hand over are locked while collection runs and Review opens by itself when it ends; signals are analyzed at that moment.

## Collection coverage

Collect and the Review overview show how many selected sources have completed, a progress bar and separate totals for collecting, waiting, failed and partial results. The source currently running has a blue highlight; completed sources have a green check. Status text and icons communicate the meaning alongside color.

Sources that have not started show **Waiting** during a live run. Sources outside the plan show **Not selected**. A completed empty query shows **0 records**; unstarted sources do not show a misleading zero. Saved unfinished requests show **Interrupted** until collection is resumed. The overview prioritizes active and incomplete sources; **All sources** opens the full list and original records/errors remain clickable.

## Appearance

Use **Theme** in the top bar to choose **System**, **Light** or **Dark**. System is the default for new users and follows macOS, Windows or browser appearance automatically, including changes while Triage is open. An existing Light or Dark choice stays selected until you choose System. Switching appearance preserves unsaved notes, account fields and focus.

The browser remembers the choice for this website; the portable app remembers it across app restarts. Each viewer keeps its own preference. The selector is also available on small screens.

## Local website — no Docker

Run `npm run web` in the repository and open `http://localhost:8080/BETA/`. This is a static website server. The portable app has its own local viewer and performs collection on the operator's computer. No web container or remote collection service is required.

When a case is already open, **New case** presents a central **Save & start new case** action. The current case is already saved on this device; the action returns to Connect or Scope for the next investigation.

## 1. Choose where to collect

**The website** runs read-only Microsoft Graph collection in the browser. Sign in on Connect, choose one affected account or tenant scope on Scope, pick a preset or the sources and start. **Account to check** suggests matching accounts from the tenant as you type. **Start collection** is beside the field, or directly underneath it on small screens. One-account collection resolves the account in the connected tenant before querying it. Application identity inventory and tenant-wide OAuth consent are shared context and can include other applications.

**The desktop app** runs locally on macOS Apple silicon or Windows x64. Unzip the complete archive and open Triage. Keep the executable/app and its packaged resources together. No service or installer is used. PowerShell and the collection modules are included.

The collector has an integrated viewer. After collection, use **Open this case in local browser** if preferred. This starts a loopback-only viewer using a random private URL; keep the app running. Exported JSON cases can also be opened on the triage website. Importing a file does not upload it.

In **Evidence**, click a source name, count, status or any part of its row to expand its records. Click a record to inspect the original content. **Collection details** exposes the query and timestamps; failed and empty sources explain why no records are available. Source rows also work with keyboard Enter/Space.

User-scoped OAuth collection reads user-specific and tenant-wide consent with separate equality filters, then combines the returned records. Both web and desktop retain the active query index and page cursor after interruption. Web resume continues the unfinished query and keeps earlier grants. [Microsoft's supported OAuth grant filtering](https://learn.microsoft.com/en-us/graph/api/oauth2permissiongrant-list?view=graph-rest-1.0).

## 2. Use delegated access

### Web

The browser uses the existing Triage SPA registration in `BETA/js/authConfig.js`. Its registered reply URL must match the site root. Authentication requires internet access and an authorized Microsoft account; Microsoft handles the sign-in and MFA. For localhost, use the registered port/origin; arbitrary preview ports cannot be assumed registered.

The requested delegated permissions are `User.Read.All`, `AuditLog.Read.All`, `Directory.Read.All`, `RoleManagement.Read.Directory`, `IdentityRiskyUser.Read.All`, `IdentityRiskEvent.Read.All`, `UserAuthenticationMethod.Read.All`, and `AuditLogsQuery.Read.All`.

Admin consent alone is insufficient. The signed-in user's roles, tenant licensing, API support and retention must also permit each read. Forbidden or incomplete sources remain visible. No beta response-write scopes are requested.

### Desktop

Enter the target **tenant ID**, affected account (for user scope), window and selected sources. Graph uses Microsoft's Graph PowerShell public client with delegated scopes and `ContextScope Process`. Exchange uses `Connect-ExchangeOnline` with browser authentication and WAM disabled. It omits the username hint to preserve the full sign-in chooser and verifies the Graph operator account after authentication. Both required connections are prepared upfront and held until collection starts; Microsoft may still request separate consent or MFA. No app certificate, client secret or application permission is needed by this collector.

The session's actual tenant must match the target. User collection resolves the account's object ID. Exchange checks its connected tenant and mailbox identity; when Graph resolved an object ID, Exchange must match it. Each module is loaded from its exact bundled path in a separate PowerShell process to avoid depending on modules installed on the operator's computer.

This beta supports direct delegated access to the selected tenant. Cross-tenant partner/GDAP connection routing is not implemented. Use an appropriately authorized account in the target tenant. Microsoft cloud endpoints are currently the commercial/global cloud only.

A saved collection plan carries its case ID, scope and exact UTC window. It contains no earlier case evidence or review history; use a full evidence case export when handing over an existing investigation. Import a plan from the desktop Triage menu. A changed target starts a new case identity.

## 3. Evidence coverage

| Source                                                       | Web   | Desktop | Scope / limits                                                     |
| ------------------------------------------------------------ | ----- | ------- | ------------------------------------------------------------------ |
| Interactive and background sign-ins                          | Yes   | Yes     | Account or tenant; available history only                          |
| Directory audit changes                                      | Yes   | Yes     | Account target/initiator or tenant                                 |
| Risky users and risk detections                              | Yes   | Yes     | Current risk and available events; licensing/roles apply           |
| Users, devices, MFA registration and active role assignments | Yes   | Yes     | Current-state snapshots                                            |
| Delegated OAuth grants and application identities            | Yes   | Yes     | Includes shared tenant grant/application context                   |
| Unified Audit Log                                            | Graph | Graph   | Asynchronous audit query; permissions, latency and retention apply |
| Mailbox settings, forwarding and audit settings              | —     | Yes     | One mailbox; current-state snapshot                                |
| Hidden inbox rules, full access, Send As, Send on behalf     | —     | Yes     | Separate command results                                           |
| Audit bypass and folder permissions                          | —     | Yes     | Folder inventory capped at 200; an excess is a visible gap         |

Message trace, message content, eDiscovery, transport rules/connectors, application-permission grants, endpoint forensics and Security & Compliance PowerShell are outside this plan. This build is not a complete port of every Extractor Suite command or Analyzer Suite rule.

Web pagination checkpoints can resume incomplete sources within the same live case. Desktop Graph collection checkpoints every page, limits each source to 100 pages and records unfinished continuation links. Audit queries wait for up to ten minutes; a pending query ID is retained. Desktop collection does not yet resume an existing attempt; rerun a narrower window or follow up using the retained query/continuation. Cancelled runs retain completed checkpoints, with unfinished sources marked cancelled/partial.

“Complete” means the query/command finished. It does not certify all requested historical events existed or were retained. “Imported” means the collection completeness of a raw export could not be established. Empty and unavailable are different states.

## 4. Review the case

1. Start with the Review **Overview** and the evidence gaps; when the analysis ran on a partial set, Review says so.
2. Open **Findings** to inspect automated signals. Use the search and severity filters; a finding opens in a drawer beside the list with its supporting source, and original records open in the same drawer under **Evidence**.
3. Record your finding disposition. A confirmed finding requires an existing evidence reference (for example `interactive:1`) and a reason. The analyst remains responsible for checking that the reference supports the decision.
4. Use **Timeline** to correlate dated records; undated inventory remains in Evidence.

The engines retain existing MAS-derived attribution and heuristic limitations. They do not establish intent or compromise automatically. SHA-256 detects a changed case file; it is not a signature, author authentication or chain-of-custody certification.

## 5. Use the first-hour runbook

| Minutes | Phase                     | Expected record                                                |
| ------- | ------------------------- | -------------------------------------------------------------- |
| 00–12   | Confirm and preserve      | Signal, identity, owner, source gaps, initial evidence         |
| 12–24   | Contain and record        | Authorized response, actual outcome, verification or exception |
| 24–36   | Establish impact          | Timeline, persistence, related identities and data access      |
| 36–48   | Preserve & export evidence | Coverage, reviewed findings, retained case and remaining gaps  |
| 48–60   | Communicate and hand over | Established facts, uncertainties, owner and next update        |

The timings guide work; they do not make slow collection finish within an hour. Response actions are performed through the organization's authorized Microsoft tools. Record a verified outcome only after inspecting verification evidence. Add corrections as new entries; the previous entry remains in the action log. The application does not send notifications or a handover to another person.

## 6. Save, reopen and hand over

**Export case** produces a `limon.triage.evidence` JSON bundle containing raw records, coverage, metadata, reviews and the action log. The same bundle opens on web or desktop and is checked for file integrity before use.

**Save on this device** stores the open case in browser storage on the website, or in a local saved-case file in the native app, replacing the previously saved case in that viewer. The native saved case is independent of the temporary loopback port and survives an app restart. **Open saved case** restores it. The guide dialog includes a control to remove the saved case. Export important evidence; browser storage may be cleared by the browser or operating system.

Desktop collection also writes an independent case folder for every attempt under the application's user-data folder (`cases/<case-id>/<attempt-id>/`). It contains the collection plan, source checkpoints, validated identity context and the final case. Use your organization's approved encrypted device and evidence retention process. Removing the saved case does not delete the separate desktop acquisition folders. The temporary local-browser view uses case export rather than device saving.

**Export handover** produces a Markdown summary. **Export CSV** produces the action log. Team upload is not configured. Transfer exported case files using your approved evidence-sharing channel, then open them in the web viewer.

## macOS first launch

The local app can be opened with `open './desktop/out/Triage-darwin-arm64/Triage.app'` from the repository. The old beta 8 download had an invalid bundle signature and should be replaced with the newly built archive. A valid local development signature is distinct from Apple approval of a downloaded app. Follow [Apple's normal approval flow](https://support.apple.com/en-us/102445) if macOS blocks the development download; the first-launch note above explains the optional, manual per-app quarantine step. Triage does not change Gatekeeper settings or run that step automatically.

## 7. Build details and validation

Pinned runtime: PowerShell 7.6.2; Microsoft.Graph.Authentication 2.37.0; ExchangeOnlineManagement 3.10.0; PowerShellGet 2.2.5; PackageManagement 1.4.8.1. Packaging: Electron 44.3.0. Official distribution URLs and SHA-256 values are recorded in `desktop/runtime-lock.json`; the builder rejects mismatches. Package hashes for modules pin the downloaded artifacts; they are not independent publisher signatures.

The macOS ZIP is ad-hoc signed for development. Its extracted app must pass strict signature verification and launch/readiness checks before the builder replaces the download. This fixes the broken beta 8 bundle signature, but does not provide Developer ID trust or Apple notarization. Downloaded copies may need Apple's normal Open Anyway approval. For trusted public downloads, a Developer ID Application certificate and notarization are still required; no such identity is available in this build environment. Windows remains unsigned. No claim of native Windows acceptance or live-tenant success is made by the local fixture tests. See [the validation record](VALIDATION.md) for the completed checks and remaining acceptance work.

References: [Microsoft Graph authentication](https://learn.microsoft.com/en-us/powershell/microsoftgraph/authentication-commands), [Exchange delegated connection](https://learn.microsoft.com/en-us/powershell/exchange/connect-to-exchange-online-powershell), [Microsoft-Extractor-Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite), [Microsoft-Analyzer-Suite](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite). Existing detailed analyzer provenance remains in the repository review directory.

## Beta 27: sessions, stopping and mailbox access

- Graph collection uses one process-scoped session per acquisition. It does not use Graph's persistent OS token cache. Native response checks reuse one running PowerShell process; they do not start a login for every command. An idle response session closes after 15 minutes. A new acquisition, service, expired session or write-consent request may still need Microsoft authentication.
- Stop collecting is in the sidebar and on Collect throughout collection. It kills waiting/running collection workers and preserves completed checkpoints. Blast radius has its own Stop scanning button; it cancels the running read session and prevents queued checks. A stopped check is incomplete; reconnect explicitly to continue. Already-submitted Microsoft audit jobs can continue server-side.
- Mail.Read.Shared is requested for delegated mail collection. Reading another mailbox still requires existing mailbox delegation; admin roles alone do not grant mail access. Application mode requires consented Mail.Read plus any applicable Exchange application access/RBAC scope. Triage never grants mailbox access automatically.
- Admin and mailbox audit sources now query Search-UnifiedAuditLog. Mailbox matching uses MailboxOwnerUPN so a delegate's activity on the affected mailbox can be included. Daily/type searches reaching 50,000 records remain partial; shorten the requested window. User matching uses the current UPN/object ID and does not expand historical aliases.
- App-registration errors now identify the service and offer checks for tenant/client-ID mismatch, certificate authentication and permission/resource access. These diagnostics do not prove a customer's registration is correctly configured.

Microsoft references: [process-scoped Graph authentication](https://learn.microsoft.com/en-us/powershell/microsoftgraph/authentication-commands), [delegated mailbox access](https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders), [unified audit paging](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/search-unifiedauditlog).

## Beta 28: startup connections and mailbox 404s

Graph and Exchange already connect before releasing collection. Optional Azure now also connects during that startup stage. Azure evidence reads reuse that connection and cannot call Connect-AzAccount. Failed Azure setup remains an explicit coverage gap and does not launch later sign-in attempts. A Graph interaction-required/401 failure prevents further Graph source requests with that failed session and asks for explicit reconnection.

Email content and attachments depend on the same mailbox listing. A missing/unsupported/inaccessible mailbox response is retained and reused for both sources, avoiding the second identical failed request. Both remain unavailable, not complete or empty. The diagnostic preserves the original response and target identity; it does not infer that the account is unlicensed or prove the mailbox is absent. Confirm the affected mailbox works in Outlook on the web and check delegated/application access scope.

These startup guarantees concern one acquisition run. Explicitly starting a new run, connecting the separate response workspace, or requesting new write permissions may require authentication. Live Microsoft SDK reauthentication and macOS Keychain behavior still require acceptance testing.
