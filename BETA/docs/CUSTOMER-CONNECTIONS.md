# Beta 22 — customer connections and testing

Everything in this update is local source and local portable downloads. No Git commit, push, deployment, cloud registration or customer-script execution was performed. Docker is not needed. Apple Developer ID signing/notarization is not required for this personal/Limon-IT distribution; retain the existing first-launch quarantine instructions.

## 1. Update and start

Export your open case and quit Triage. Extract the new **Triage-macOS-arm64.zip**, replace your current app, and launch it. The sidebar must say **BETA 22**. Windows uses **Triage-Windows-x64.zip**. Source and downloads are in this repository; they are not automatically published to GitHub.

Open **Connect → Customer connections** in the desktop app (the link above the Authentication choice).

## 2. Existing customer registration

1. Choose **Use existing registration**.
2. Enter customer name, tenant ID and Graph/Exchange application IDs. Fields correspond to `DisplayName`, `TenantId`, `GraphAppId`, `ExchangeAppId`, `Organization` in Connect-Customer. At least one application is required.
3. For Exchange, supply the original `customer.onmicrosoft.com` organization domain.
4. Choose the PFX containing its private key and enter its password. **Validate certificate & save** checks import, private key and validity dates. It does not certify tenant consent or Exchange roles.
5. Select the customer in **Authentication** on Connect. The tenant comes from the profile. Press **Sign in** on the Graph row (and the Exchange row when mailbox sources are needed): the services authenticate with the certificate and no browser opens. Then choose the affected account and the sources on Scope and press **Start collection**.

**Import registration IDs** accepts the wizard's single `profile.json`, or one customer's JSON object with the fields above. It deliberately ignores password/certificate-path fields. It does not import an entire multi-customer `Customers.json` automatically.

A profile supports one shared PFX for Graph and Exchange, matching the reference script's default arrangement. If a customer's service apps have different certificates, create separate profiles and run their relevant sources separately. Combining those service certificates into one profile is not implemented in this version.

Profiles contain an encrypted copy of the certificate and password protected through Electron's operating-system storage (Keychain on macOS, DPAPI on Windows). No plaintext fallback is used. The renderer receives metadata only after saving. A worker receives its credential over stdin, not command arguments or case files. macOS uses OS-managed temporary certificate keys because .NET does not support `EphemeralKeySet` there; disposal releases them. Protect the original PFX independently. Removing a local profile removes its encrypted credential record, not its cloud registrations or original PFX.

The worker verifies tenant and application ID before accepting evidence. Source permission failures remain explicit gaps. Existing overprivileged apps are not reduced or modified by Triage; the fixed collector only runs its defined evidence queries. Customer profiles are available only in the native app. The web viewer never receives their credentials.

## 3. Creation wizard

1. Choose **Create registrations**, enter the customer details and choose whether to include Exchange.
2. Review the displayed permissions, then **Save setup folder**. This creates settings, the setup script and a README with an exact PowerShell command. It makes no cloud changes.
3. Review those files. Run the generated command in PowerShell using the bundled runtime. Microsoft handles delegated/passkey authentication. The script verifies the tenant and requires you to type its ID before provisioning.
4. Choose a unique PFX password of at least 16 characters and retain it in your password manager. The script creates new single-tenant apps, service principals, a one-year certificate and application consent. It writes `profile.json`, `customer.pfx`, `customer.cer` and `registration-state.json`.
5. If Exchange was selected, review and run the generated **Exchange-RBAC.ps1**, with the same `-ModuleRoot` argument as the first command. An Exchange role administrator must approve the displayed target. It creates roles containing only the seven collector read commands and a role group for this application. Scope is all mailboxes in the tenant. It assigns no Entra administrator role.
6. Import `profile.json` through **Use existing registration**, select `customer.pfx` and enter its password. Test collection permissions before operational use.

The wizard's Graph application permissions are `User.Read.All`, `AuditLog.Read.All`, `Directory.Read.All`, `RoleManagement.Read.Directory`, `IdentityRiskyUser.Read.All`, `IdentityRiskEvent.Read.All`, and `AuditLogsQuery.Read.All`. These cover the collector's Graph sources; they are not narrowed automatically for each run. Exchange requests `Exchange.ManageAsApp`, with command access supplied by the separate Exchange role setup.

Setup bootstrap delegated scopes are `Application.ReadWrite.All` and `AppRoleAssignment.ReadWrite.All`. They belong to the setup session, not the collector applications. Granting Graph application consent needs an appropriately authorized administrator, such as Privileged Role Administrator. Existing applications are never modified. A partial failure retains object IDs in `registration-state.json` and refuses a blind rerun; inspect/reuse the existing objects rather than creating duplicates. No automatic destructive cleanup is provided. Review and rotate the one-year certificate before expiry.

Microsoft references: [Graph certificate authentication](https://learn.microsoft.com/en-us/powershell/microsoftgraph/authentication-commands), [Exchange app-only authentication and RBAC](https://learn.microsoft.com/en-us/powershell/exchange/app-only-auth-powershell-v2), [application consent permissions](https://learn.microsoft.com/en-us/graph/api/serviceprincipal-post-approleassignments).

## 4. Mac sign-in succeeds but collection waits

Beta 22 shows the last stage: **Loading connection module**, **Waiting for Microsoft browser sign-in and callback**, or **Verifying tenant and affected account**. Waiting status refreshes every 20 seconds; after ten minutes the affected worker is stopped, while any available service can continue. Microsoft may return its own timeout sooner. The actual error is preserved in the failed source and action log; expand **Evidence** for details.

The user's live delegated timeout has **not been reproduced or confirmed fixed**. Successful browser sign-in alone does not prove the callback or subsequent Graph/Exchange request completed. Record the final stage and error, browser name, passkey provider, and whether the browser displays a final “authentication complete” page. Do not share callback URLs containing authorization codes. Certificate mode uses application identity and does not need this interactive callback. No password or device-code fallback is introduced.

## 5. Acceptance checklist

- [ ] Mac launches and shows Beta 22; Windows launch tested separately.
- [ ] Delegated mode still offers the Microsoft passkey flow. Record whether Graph and Exchange both become Ready.
- [ ] If either stalls after browser success, capture the stage and full source error. Check Entra sign-in logs for that attempt.
- [ ] Existing profile saves with a valid PFX; wrong password/expired PFX fail visibly.
- [ ] Selecting a profile fills the intended tenant. A different tenant or application identity fails closed.
- [ ] Certificate mode connects without browser prompts and logs `App <application ID>` for each service.
- [ ] Graph and Exchange return known test records. Missing permissions remain gaps, not green empty results.
- [ ] Exported case, plan and web viewer contain no PFX/password; reopening the case preserves evidence and action log.
- [ ] Wizard preview matches intended collection permissions before any execution.
- [ ] In a test tenant, run registration setup, inspect app permissions and certificate expiry, then run the reviewed Exchange role setup.
- [ ] Import the generated profile and collect the same test account successfully.
- [ ] Cancel during connection setup: waiting workers exit and available evidence remains preserved.

Live tenant provisioning, actual tenant RBAC coverage, passkey acceptance, real OS credential-store integration and Windows execution remain environment-dependent acceptance steps. Offline script/UI checks use synthetic data, temporary certificates and mocked services/encryption.

## Repeatable local validation commands (PowerShell)

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-connections.mjs
node tests/desktop-progress.mjs
node tests/desktop-profiles.mjs
node tests/desktop-timeout.mjs
npm run desktop:package:mac
npm run desktop:package:win
```

The wizard writes exact customer-specific setup commands into its README. Those provisioning commands are intentionally not run by the tests or by the collector.
