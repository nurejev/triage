# M365 Analyzer (BETA) — MAS, in the browser

A **tenant-wide** log analyzer that lives alongside the Triage tool. Where Triage
answers *"is this one account compromised?"*, the BETA answers *"what's happening
across the whole tenant?"* — a browser port of the
[Microsoft-Analyzer-Suite](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite)
(MAS) detection rules by LETHAL-FORENSICS.

It is a static site, exactly like Triage: open `BETA/index.html`, sign in with the
same read-only delegated Graph permissions, and either **scan live** or **import**
Microsoft-Extractor-Suite output. Try it with no tenant via **Try the demo** (or
`BETA/?demo=1`).

## Two ways in (both run the same engine)

- **Live scan** — pulls the whole tenant window from Graph: sign-in logs, directory
  audits, risky users & detections, OAuth grants, users, devices, directory-role
  holders, and the Unified Audit Log (async query API).
- **Import** — drop Extractor-Suite CSV/JSON files; they're parsed in the browser and
  merged into one tenant view. This is the path for the Exchange-Online-only sources
  a browser can't reach live.

## What it covers (this build)

Core BEC set — **EntraSignInLogs, EntraAuditLogs, UAL, RiskyUsers, RiskyDetections,
OAuthPermissions** — plus the Inventory set — **Users, Devices, Admins** — and an MFA
coverage view. Findings are severity-ranked and rolled up **per account** (the MAS
"who is compromised" view); click an account to filter.

The blacklists (ASN, country, user-agent, application, and the risky
application/delegated permission lists) are MAS's own CSVs, regenerated into
`js/blacklists.js` — regenerate rather than hand-edit.

## What stays import-only / later

Message Trace, Transport Rules, Mailbox Permissions and Mailbox Audit Status are
EXO-only; analyze them by importing an Extractor-Suite export (message-trace analysis
lands in a later build). Heavy tenant-wide / 180-day UAL is better served by import
than live.

## Files

`js/analyzers.js` is the detection engine (pure functions, evidence in → findings +
per-user rollout out). `js/collect.js` is the live Graph collector, `js/import.js` the
file importer, `js/demo.js` the staged demo tenant, `js/report.js` the renderer.
Rule provenance is noted inline; severities follow MAS's colour intent (Red=High,
Orange/Yellow=Medium), with Critical reserved for high-confidence compound hits
(device-code to the auth broker, audit-log tampering, federation change, confirmed
AiTM relay).

## Status

**BETA / preview.** Detection logic is covered by a Node test suite
(`beta.engine.test.mjs`, `beta.dom.test.mjs`). Not affiliated with LETHAL-FORENSICS or
Invictus-IR.
