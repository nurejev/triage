# Coverage contract — app versus web · Beta 26

The in-app version is under **Help · coverage**. App collection and automated analysis are separate promises.

| Contract | Portable macOS / Windows app | Browser quick triage |
|---|---|---|
| Execution | Bundled PowerShell: Microsoft Graph, Exchange Online, Azure | JavaScript: Microsoft Graph |
| Default | All 34 implemented sources selected; individually deselectable | Quick subset of 12 browser-supported Graph sources |
| Scope | One account or tenant-wide; tenant context remains labelled | One account or tenant-wide within browser source limits |
| Evidence review | Shared findings, timeline, source records, first-hour response, action log | Same screens, including imported app evidence |
| Authentication | Delegated or existing customer app/certificate; optional exported registration wizard | Delegated browser connection |
| Response | Separate delegated Graph response, per-account confirmation and intent journal | Separately armed Graph response; imported evidence grants no authority |

## App additions

Mailbox snapshots include hidden rules, forwarding, full access, send-as, send-on-behalf, audit/bypass configuration and folder permissions. Added sources include transport rules, message trace, admin/mailbox audit searches, application registrations and permissions, authentication methods, Conditional Access/security defaults, groups and members, licenses, PIM schedules, security alerts, Secure Score, email content/attachments, managed-identity sign-ins and Azure activity.

User events and mailbox data follow the selected account. Policies, application permissions, groups, alerts, tenant licenses and Azure activity remain tenant context. Tenant context must not become evidence of that user's compromise merely because it was collected in the same case.

## Explicit limits and remaining parity work

1. These are Triage acquisition routes, not an execution of the upstream Extractor Suite. Field-for-field and live-result equivalence has not been established.
2. MAS-derived JavaScript rules cover selected sign-in, audit, risk, OAuth, user/device/role/MFA and mailbox scenarios. Additional collected sources currently provide evidence for analyst review; full upstream analyzer, enrichment, spreadsheet and statistical report parity remains open.
3. Email collection uses the received-time window. Attachments preserve API-returned payloads; complete MIME export, reference/item-attachment resolution and dedicated MailItemsAccessed session/message-ID reports remain open.
4. Portable Graph follows pagination. Browser volume sources cap at 200 pages; most other browser sources cap at 50. Service result limits, retention, licenses and permissions can still leave gaps. Message trace covers at most the supported 90-day service window.
5. Current configuration snapshots are not historical proof. Tenant mailbox coverage depends on effective Exchange RBAC, including any application access restrictions.
6. Cases are currently held in memory. Individual imports are limited to 100 MB and combined imports/native saved bundles to 250 MB. Tenant-wide email/attachment collection can exceed these limits. Deselect content sources or use narrower windows for this candidate; streaming large-case storage remains release work.
7. Azure requires its own authentication and RBAC. It connects when Azure collection begins. Graph/Exchange connection reuse is subject to Microsoft policy; one prompt for every service cannot be guaranteed.
8. Native response currently bridges Graph account actions. Exchange changes retain the separate existing backend/manual PowerShell path; the read-only collection certificate never authorizes response.

## Reference baselines

- [Microsoft-Extractor-Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite/tree/47565f7842784cd3667ff630e3dccb49fa3408ed)
- [Microsoft-Analyzer-Suite](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite/tree/2937dc8c77bfba2911ead45eef5702c48d95365e)

These are comparison baselines, not an assertion that the pre-existing copied analyzer tables came from these exact commits. The prior provenance audit remains unresolved. No public promotion is approved by this document.

## Equivalence acceptance

Run upstream and Triage against the same authorized test tenant, account scope and UTC window. Compare source IDs/counts, nested fields, paging, empty versus denied results, application/user grant attribution and expected findings. Retain both outputs and explain every difference. A matching source name or successful HTTP request is insufficient.

## First-hour workflow (Beta 26)

The five phases contain preservation, response, impact checks, evidence review and communication templates in one case workspace. Notes and actual check outcomes feed the shared action log. Downloading a communication template creates a draft; it does not send a message or complete communication.

The app mailbox card runs the local Exchange collector and appends its snapshot to the open case. The web card directs the analyst to the local collector. Mailbox changes remain manual reviewed PowerShell steps; Graph response retains separate delegated connection, arming and target-bound confirmation. Browsing an imported case does not connect to Microsoft or arm actions.
