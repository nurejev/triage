> **Retired with beta 31.** This guide describes screens that no longer exist (the quick web check, the collection form, the separate runbook page). The current flow is documented in [the user guide](../USER-GUIDE.md). Kept for reference only.

# Triage beta — administrator setup and Docker walkthrough

For day-to-day investigation, use the [end-user walkthrough](USER-GUIDE.md). This guide covers the technical setup and operation of the beta and its optional collector.

Built 15 September 2026. Start with the demo, then configure a test tenant. This beta is **read-only**: it collects evidence and records your response plan. It does not disable users, revoke sessions or modify mailbox settings.

## 1. Open the beta without Exchange

From PowerShell in your checkout, with Docker Desktop running:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
docker compose -f docker-compose.beta.yml up -d --build web
Start-Process 'http://localhost:8080/BETA/tenant.html?demo=1'
```

The beta is served at **http://localhost:8080/BETA/tenant.html**. It uses the code built from your checkout; it does not replace it with a download of the main branch. Only localhost is exposed. If port 8080 is already occupied, stop the other local Triage web instance before starting this one.

Choose **Collect Graph evidence** in the demo. Then:

1. In **Investigate**, choose an account, severity or search term.
2. Select a finding to see context, confidence and related source records. These records are supporting context, not a promise that every displayed record triggered the rule.
3. Add a disposition and an analyst note. Switch to **Timeline** for chronological findings.
4. In **Collect evidence**, inspect the partial non-interactive sign-in source. **Resume incomplete** demonstrates the continuation workflow.
5. In **Response plan**, record your incident owner, actions and verification notes. These notes do not execute commands.
6. **Save evidence bundle**, then open that JSON file using **Choose files**. The original records, source states and notes are preserved, and the integrity check runs before analysis.

All demo records are illustrative. Demo mode sends no Graph or worker requests.

## 2. Collect Microsoft Graph evidence

Exit the demo and sign in. The existing SPA application is `8f1b5185-e782-4dc3-8aee-92ba4616c8d0`; its registered SPA redirect must include `http://localhost:8080/`. The beta popup reuses that root redirect, not `/BETA/`. If you deploy another SPA registration, update `BETA/js/authConfig.js` and supply that SPA ID when configuring the collector.

An administrator must consent to the delegated scopes in `BETA/js/authConfig.js`. The analyst also needs the appropriate directory/security reader roles and licenses for each source. Consent alone does not override those requirements. Current scopes include `AuditLog.Read.All`, `Directory.Read.All`, the Identity Protection read scopes and `AuditLogsQuery.Read.All`. MFA registration uses `AuditLog.Read.All`. Active directory-role assignments use the directory role-assignment endpoint; eligible PIM assignments and indirect group expansion are not a full privilege inventory in this build. [Graph role assignments](https://learn.microsoft.com/en-us/graph/api/rbacapplication-list-roleassignments?view=graph-rest-1.0).

Choose a UTC lookback and whether to include the Unified Audit Log, then collect. Keep the tab open. Each request has an upper time boundary fixed when the case starts. Current inventory and risk state are snapshots at acquisition, not historical state for every day in that window. Application identity inventory resolves delegated OAuth grants to app IDs and names; it does not collect application permission assignments.

| Status | Meaning | What to do |
|---|---|---|
| Complete | This API source finished its returned pages | Interpret the records within permissions, retention and stated scope |
| Partial | More pages exist, a query is still running, or a later request failed | Resume incomplete; review the retained records and error |
| Unavailable | Microsoft denied access to that source | Check delegated permissions, analyst role and license |
| Failed | Collection did not succeed | Read the error, correct the cause and resume |
| Cancelled | Collection was interrupted | Retained records are available; resume the checkpoint |
| Not collected | Source was not requested or never started | Collect it if needed; do not read this as zero events |
| Imported | File records were parsed, but original collection completeness is unverified | Check the export's scope and provenance |

Each pass collects at most 25 pages per source. The next link and original window remain in the case. **Resume incomplete** continues those pages and checks the existing audit query instead of creating a new one. Graph retries throttled/temporary reads with a bounded wait. A saved bundle retains checkpoints as evidence, but reopening it is offline analysis: imported continuation URLs are not automatically executed against your live account.

A 90-day selector does not create 90 days of retained logs. Separate archive/SIEM imports may be necessary. Service-principal sign-ins, application permission assignments and mailbox content are not collected by this build.

## 3. Understand the Docker components

```text
Browser on your Mac
  ├── Microsoft Graph: delegated, read-only requests
  └── localhost:8080/api: token for YOUR collector application
          ↓
       Web container (nginx)
          ↓ private Docker network
       Collector container
          ├── verifies tenant, SPA client, scope, assigned role and analyst ID
          ├── checks the mailbox object-ID allowlist
          ├── queues a fixed mailbox snapshot
          └── one Exchange PowerShell session per job
                  ↓
              Exchange Online

Private Docker volumes
  beta-credentials: PFX + password, mounted read-only into collector
  beta-evidence: saved job evidence + audit.jsonl
```

The browser never starts Docker, receives the certificate or submits arbitrary commands. Start the stack once; use the browser afterwards. The collector has no published port, Docker socket or host command endpoint. The web container receives only the public collector app ID.

The one-time `credential-init` container copies your private local files into a private volume with the ownership required by the unprivileged collector. It has no network and stops after the copy. This avoids making private keys world-readable on native Linux. The long-running worker is read-only apart from its evidence volume and temporary working directories.

The Exchange image uses a digest-pinned Ubuntu 24.04 / PowerShell 7.5 image with ExchangeOnlineManagement **3.9.2**. Microsoft documents this module range with PowerShell 7.4 or later on Ubuntu 24.04. The compose file requests `linux/amd64`, so an Apple Silicon Mac runs this worker through Docker's emulation; the web image can run natively. This is not a claim of a native ARM64 Exchange image. [Microsoft platform support](https://learn.microsoft.com/en-us/powershell/exchange/exchange-online-powershell-v2?view=exchange-ps).

## 4. Set up the collector application once

This section needs a tenant administrator. The local setup command creates files only; the subsequent Entra and Exchange steps grant the collector permission to read the configured mailboxes.

### A. Register the collector in Entra

1. Create a **single-tenant** app registration named **Triage Beta Collector**. It does not need a redirect URI.
2. Note its **Application (client) ID** and your **Directory (tenant) ID**.
3. In **Enterprise applications**, find this app and note its **Object ID**. This is different from the app registration's object ID and is the one needed by Exchange.
4. Get the **user object IDs** of each allowed analyst and test mailbox from Entra Users. Begin with one analyst and one test mailbox.

Run this locally. The prompts accept actual IDs, so there are no placeholder values to accidentally execute:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
$tenantId = Read-Host 'Directory tenant ID'
$organization = Read-Host 'Tenant domain, for example contoso.onmicrosoft.com'
$collectorAppId = Read-Host 'Collector application client ID'
$analystId = Read-Host 'Allowed analyst user object ID'
$mailboxId = Read-Host 'Allowed test mailbox user object ID'
./Initialize-BetaCollector.ps1 -TenantId $tenantId -Organization $organization -CollectorAppId $collectorAppId -AllowedAnalystIds $analystId -AllowedMailboxIds $mailboxId
```

This creates `beta-runtime/collector.env`, `compose.env`, `manifest-fragment.json`, a public `collector.cer` and private `secrets/backend.pfx` + `secrets/password`. The directory is ignored by Git and Docker build contexts. The certificate expires in six months. Do not run the older `create-backend-appreg.ps1` for this beta collector: it provisions the separate production containment API.

### B. Configure the collector app

Open `beta-runtime/manifest-fragment.json`. For the **new collector app only**, merge its fields into the app's Entra manifest, retaining Entra's existing application/object IDs and other required fields. It defines:

- Application ID URI `api://<collector client ID>`.
- Version 2 access tokens.
- An admin-consented delegated API scope **Collect.Exchange**.
- User app role **Triage.Collector**.
- The configured SPA as a preauthorized client for that scope.
- Exchange **application** permission **Exchange.ManageAsApp**.

Then:

1. Upload **only `collector.cer`** under Certificates & secrets → Certificates. Keep the PFX and password local.
2. Grant tenant admin consent for **Exchange.ManageAsApp**.
3. In the collector Enterprise application, set **Assignment required = Yes**.
4. Assign the allowed analyst directly to the **Triage Collector** app role under Users and groups. Group assignment can have additional license/nesting constraints; use a direct test user first.
5. Verify the SPA is preauthorized for **Collect.Exchange**. Preauthorization reduces consent prompts; the server independently enforces the token's SPA client ID.

The collector requires both the signed app role and the locally configured analyst object-ID allowlist. Removing an Entra role assignment may not invalidate an already issued access token immediately; remove the analyst from the local allowlist and recreate the collector when immediate API access removal is required. Merely holding Global Administrator or Security Administrator does not grant access to this API. The collector app needs no Graph application permission and performs no on-behalf-of Graph role lookup.

### C. Give the application only the required Exchange commands

Use an administrator account that can manage Exchange roles. In PowerShell:

```powershell
Install-Module ExchangeOnlineManagement -RequiredVersion 3.9.2 -Scope CurrentUser
Import-Module ExchangeOnlineManagement -RequiredVersion 3.9.2
Connect-ExchangeOnline -Organization $organization
$enterpriseAppObjectId = Read-Host 'Object ID from the collector Enterprise application'
./Configure-BetaExchangeRoles.ps1 -CollectorAppId $collectorAppId -EnterpriseAppObjectId $enterpriseAppObjectId -WhatIf
./Configure-BetaExchangeRoles.ps1 -CollectorAppId $collectorAppId -EnterpriseAppObjectId $enterpriseAppObjectId
Disconnect-ExchangeOnline -Confirm:$false
```

The script discovers built-in parent roles for the seven required `Get-*` cmdlets, creates child roles containing only those commands, creates a dedicated role group and adds the Exchange service principal. It stops if existing custom roles/groups differ from the expected set. Review the printed role entries. Do not assign Exchange Administrator or Global Administrator to the application as a shortcut.

Exchange cmdlet read scopes may remain organization-wide. The API's mandatory mailbox-ID allowlist is a separate enforced restriction; it is not a claim that Exchange itself scopes every read to that list. Compromise of the worker credential must be evaluated against its effective Exchange RBAC. [Microsoft's custom-role-group app-only procedure](https://learn.microsoft.com/en-us/powershell/exchange/app-only-auth-powershell-v2?view=exchange-ps).

### D. Start the complete local beta

```powershell
docker compose --env-file beta-runtime/compose.env -f docker-compose.beta.yml --profile collector up -d --build
docker compose --env-file beta-runtime/compose.env -f docker-compose.beta.yml --profile collector ps
Start-Process 'http://localhost:8080/BETA/tenant.html'
```

The initial image build downloads the pinned runtime and Exchange module and can take several minutes. A stopped `credential-init` container with exit code zero is expected.

## 5. Collect a mailbox from the browser

1. Sign in to the same tenant served by the collector.
2. Collect Graph evidence, or start a new live case.
3. In **Collect evidence**, choose **Check worker & authorize**. Allow the popup for your collector API.
4. Enter an allowed mailbox's Entra **user object ID**. Graph inventory provides suggestions when available.
5. Choose **Collect mailbox snapshot**. The queue reports progress for each source. Additional analysts/jobs wait for the single worker slot instead of causing concurrent connection failures.
6. The worker resolves the mailbox using `Get-EXOMailbox -ExternalDirectoryObjectId` and checks its `ExternalDirectoryObjectId` against your requested ID. It reads hidden inbox rules, forwarding/audit properties, FullAccess, SendAs, SendOnBehalf, audit bypass and folder permissions.
7. When finished, the snapshot opens in the case. Review the worker source errors as well as the findings. A single denied subsource makes the snapshot **partial**.
8. Save an evidence bundle. It includes the snapshot, its commands, timestamps, runtime versions and source states.

Folder permissions are limited to mailboxes with at most 200 folders. Larger inventories are explicitly failed rather than silently represented as complete. A job is limited to 10 minutes and 32 MB of output. There are at most 10 active/queued requests and 200 stored jobs; export and delete completed jobs when necessary.

**Cancel snapshot** stops a queued/running acquisition. Closing the tab, signing out or starting another case stops browser polling but does **not** promise that a server job was cancelled. Reauthorize the worker and use **Refresh saved jobs** to reopen or cancel it. Jobs are visible only to their creating analyst in that tenant. This build does not offer shared cases.

The worker health check validates local credential readability and storage access. “Ready” is not proof of successful Exchange authentication, certificate validity in Entra or effective RBAC. The first completed snapshot is the integration check.

## 6. Stop, restart, retain and delete

Stop the containers while preserving both volumes:

```powershell
docker compose --env-file beta-runtime/compose.env -f docker-compose.beta.yml --profile collector down
```

Restart with the same `up -d` command. Completed jobs remain available. A job interrupted by a worker restart is marked partial; start a fresh snapshot because mailbox configuration is current state, not a historical resumable stream.

Use **Delete saved job** only after exporting anything that must be retained. That deletes the worker's job artifact; the audit log retains a deletion event. Files you downloaded are not deleted. The volume is local storage, not encrypted evidence storage or a tamper-proof audit service. Use your disk encryption, access controls and incident retention policy.

Do not use `down --volumes` for routine shutdown: it destroys the saved evidence and copied credential volumes. Do not share a Docker image built by the old broad-copy packaging from a credentialed checkout.

To change allowed analysts/mailboxes, edit the corresponding comma-separated object-ID lists in `beta-runtime/collector.env`, update app-role assignments if needed, and recreate the collector:

```powershell
docker compose --env-file beta-runtime/compose.env -f docker-compose.beta.yml --profile collector up -d --force-recreate collector
```

For certificate rotation: stop the collector, preserve your evidence volume, securely archive the old `beta-runtime` directory, rerun local initialization with the same app IDs and allowlists, upload the new public certificate, and keep the existing scope/role IDs in Entra (do not blindly replace them with a regenerated manifest fragment). Recreate `credential-init` and collector. Test a snapshot before removing the old certificate from Entra and securely disposing of archived secrets.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Docker daemon unavailable | Start Docker Desktop and wait until its engine is ready |
| Port 8080 busy | Stop the existing local site using that port |
| No collector configured | Use the complete startup command with `--env-file beta-runtime/compose.env`; rebuild/recreate web |
| Worker tenant/app mismatch | Sign into the collector's tenant; check the SPA and collector IDs |
| Missing collector role/scope | Direct app-role assignment, preauthorization, v2 token setting; sign out and back in |
| Analyst/mailbox outside scope | Use Entra object IDs, not email addresses or application object IDs |
| Credential files unreadable | Check credential-init exit status; do not make private keys world-readable |
| Worker ready but Exchange job fails | Certificate uploaded, unexpired PFX, Exchange consent, service principal and read-only role entries |
| A source is partial/failed | Read the per-source job status; do not interpret it as no suspicious data |
| Saved bundle rejected | Unsupported version or modified evidence. Preserve the original and investigate the difference |

Local diagnostic commands (do not paste full logs into public tickets):

```powershell
docker compose --env-file beta-runtime/compose.env -f docker-compose.beta.yml --profile collector logs --tail 80 collector
Invoke-RestMethod 'http://localhost:8080/api/health'
```

## Scope of this build

Implemented: revised beta workspace, explicit Graph coverage/checkpoints/cancellation, safer supported imports, evidence integrity and round-trip, notes/dispositions, and the optional read-only mailbox worker.

Not implemented: live containment, full message trace, transport/connectors, application-permission inventory, service-principal sign-ins, content/eDiscovery, Exchange Admin API preview, automatic archive ingestion, shared analyst cases and hosted-service deployment. The production containment backend is a separate older service and is not used by `docker-compose.beta.yml`.

See `VALIDATION.md` for what was actually tested and what still needs your test tenant. No tenant permissions were changed during development.
