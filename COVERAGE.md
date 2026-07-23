# Coverage — Limon-IT M365 Triage vs. Microsoft-Extractor-Suite

M365 Triage (triage.limon-it.nl) is inspired by the open-source
[Microsoft-Extractor-Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite)
by Invictus Incident Response, but the two tools do different jobs:

|  | **M365 Triage (this tool)** | **Microsoft-Extractor-Suite** |
|---|---|---|
| Purpose | Fast first-look: *is this account compromised?* | Full forensic acquisition of a tenant |
| Runs | In the browser, zero install | PowerShell (EXO + Graph modules) |
| Scope | One user at a time, 7/30/90 days | Whole tenant, up to 180+ days |
| Access | One admin consent, read-only delegated Graph | Admin PowerShell sessions per module |
| Output | Interactive findings report + CSV/JSON export | Raw CSV/JSON evidence archives |
| Analysis | Built-in detections + recommended actions | Collection only (analysis is up to you) |

**Rule of thumb:** Triage answers the 15-minute question. If it confirms a real
incident, do a full acquisition with the Extractor Suite (and keep the Triage
evidence JSON as your first snapshot).

## What is included, per Extractor Suite function

### Covered in the browser

| Extractor Suite | In M365 Triage | How |
|---|---|---|
| `Get-UAL` / `Get-UALGraph` (Unified Audit Log) | ✅ Yes (per user, selected window) | Graph async audit query (`/security/auditLog/queries`), analyzed for inbox rules, mailbox forwarding, OAuth consents, role changes, mailbox searches, mass downloads, hard deletes |
| `Get-GraphEntraSignInLogs` (sign-in logs) | ✅ Yes (per user) | `/auditLogs/signIns` — unexpected countries, brute force → success, impossible travel, legacy auth, CA outcome, risk level |
| `Get-GraphEntraAuditLogs` (directory audits) | ✅ Yes (per user) | `/auditLogs/directoryAudits` filtered on the account as initiator |
| `Get-RiskyUsers` | ✅ Yes (per user) | `/identityProtection/riskyUsers` (needs Entra ID P2) |
| `Get-RiskyDetections` | ✅ Yes (per user) | `/identityProtection/riskDetections` (needs Entra ID P2) |
| `Get-MFA` (MFA status) | ✅ Yes (per user) | `/users/{id}/authentication/methods` — flags accounts with no strong method; reminds you to verify each registered method |
| `Get-OAuthPermissionsGraph` | ✅ Yes (per user) | `/users/{id}/oauth2PermissionGrants` + service-principal resolution, scored against risky scopes (mail read/send, mailbox settings, directory write, app management) |
| `Get-Users` (account info) | ✅ Yes (per user) | `/users/{upn}` — state, created, password age |

### Partially covered — the signal, not the inventory

| Extractor Suite | In M365 Triage | Notes |
|---|---|---|
| `Get-MailboxRules` (inbox rules, all mailboxes) | ⚠️ Via audit log | Live rule enumeration across mailboxes needs Exchange Online PowerShell. Triage instead detects `New-InboxRule` / `Set-InboxRule` / `UpdateInboxRules` events (incl. forwarding parameters) in the UAL — the *creation* of the malicious rule, which is usually the better forensic signal |
| `Get-TransportRules` | ⚠️ Via audit log | Same: `New-TransportRule` / `Set-TransportRule` events are detected; the current rule inventory needs EXO PowerShell |
| `Get-MailItemsAccessed` | ⚠️ Via audit log | MailItemsAccessed records appear in the UAL window we pull; the Suite's dedicated deep-dive (sessions, sync types, full 180 days) is richer |
| `Get-MailboxDelegatedPermissions` | ⚠️ Via audit log | `Add-MailboxPermission` / `Add-RecipientPermission` grant *events* are detected; the current delegation inventory needs EXO PowerShell |
| `Get-AdminUsers` / Roles | ⚠️ Via audit log | "Add member to role" events are detected; the full role-holder inventory is not enumerated (planned for a tenant-wide screen) |
| `Get-ConditionalAccessPolicies` | ⚠️ Indirect | Each sign-in's CA outcome is analyzed; the policy inventory itself is not pulled yet (scope already consented — planned for a tenant-wide screen) |

### Not included — and why

| Extractor Suite | Why it's left out |
|---|---|
| `Get-Email` / `Get-Attachment` (message content acquisition) | Deliberate: Triage never reads mail content — keeps consent read-metadata-only and the privacy story clean. Use the Suite for content preservation |
| `Get-MessageTraceLog` | Exchange Online-only API, not reachable from a browser |
| `Get-MailboxAuditLog`, `Get-AdminAuditLog` | EXO-only; largely superseded by the UAL, which Triage does pull |
| `Get-MailboxAuditStatus` | EXO-only inventory |
| `Get-AzureActivityLogs`, `Get-DirectoryActivityLogs` (Azure Resource Manager) | Azure-subscription forensics, outside M365 account-triage scope |
| `Get-Devices`, `Get-Groups`, `Get-ProductLicenses`, `Get-SecurityAlerts`, `Get-SecureScore` | Tenant-inventory functions — candidates for a future tenant-wide health screen, not needed for the per-user question |
| Evidence collection / SOF-ELK output | Triage exports findings + raw evidence as CSV/JSON per user; bulk SIEM-format export stays Suite territory |

## Run a full extraction, then read it here

The tool ships an in-app **Full extraction** guide (top-bar button) that walks
through installing and running the Extractor Suite locally in PowerShell — the
exact `Install-Module`, `Connect-M365` / `Connect-MgGraph` and collection
commands, plus where each source is written under `Output\`.

You do **not** have to leave the browser to read the result. The **View the
output here** importer (start page, or the extraction guide) ingests Suite
output and renders the same severity-ranked findings report — parsed entirely
in the tab, nothing uploaded, no sign-in required.

| Import source | Suite function | Format read |
|---|---|---|
| Unified Audit Log | `Get-UAL` | CSV or JSON (wrapper columns with embedded `AuditData`, or `-AuditDataOnly` objects) |
| Entra sign-in logs | `Get-GraphEntraSignInLogs` | JSON (native Graph shape; flattened CSV is best-effort) |
| OAuth grants | `Get-OAuthPermissionsGraph` | CSV or JSON (best-effort scope/app mapping) |
| Triage evidence | *exported by this tool* | Evidence JSON (full round-trip) |

Drop several files at once to combine them (e.g. UAL + sign-in logs for one
user); unrecognized files are listed and skipped rather than failing the load.
This lets an analyst collect with the full Suite and still get Triage's built-in
detections and recommended actions over the raw evidence.

## Escalation path

1. **Triage** (browser, minutes): confirm or dismiss the suspicion, export the evidence JSON.
2. **Full acquisition** (PowerShell, hours): Microsoft-Extractor-Suite across the tenant and full retention window — message traces, mailbox audit, message content, all mailboxes' current rules and delegations. Follow the in-app **Full extraction** guide.
3. **Read it back** (browser, minutes): import the Suite's UAL / sign-in / OAuth output into Triage to run the same detections over the deeper evidence.
4. **Deep analysis**: your DFIR workflow — Limon-IT can assist with incident response.

*Microsoft-Extractor-Suite is © Invictus Incident Response, GPL-2.0. M365 Triage
shares no code with it — it consumes the same Microsoft APIs from the browser and
credits the Suite as its inspiration.*
