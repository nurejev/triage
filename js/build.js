// ======================================================================
// Build stamp + changelog - the source of truth for both the "What's new"
// overlay shown after sign-in and the full What's new page (ENCA-style).
//
// HOUSEKEEPING: whenever something is added or changed, add a NEW release
// object here for that build, in the same commit as the code, and keep
// TRIAGE_BUILD in sync (bump.ps1 / bump.py do both).
//
// One release object per build, holding ONLY what changed in that build.
// kind:  "new"      - a capability that did not exist
//        "improved" - something existing got better
//        "fixed"    - something was wrong and now is not
// Newest release first.
// ======================================================================
window.TRIAGE_BUILD = 9;
window.TRIAGE_BUILD_DATE = "2026-07-28";
window.TRIAGE_CHANGELOG = [
  {
    build: 9, date: "2026-07-28", title: "The fifteen blast-radius checks now run themselves",
    items: [
      { kind: "new", tool: "Containment", text: "Blast radius is no longer a checklist you tick by hand: thirteen of the fifteen checks answer themselves from Graph, the Unified Audit Log or the Exchange backend, and summarise what they found - successful countries, non-interactive token reuse, bind vs sync mailbox reads, busiest download hour, credentials added to a service principal." },
      { kind: "new", tool: "Containment", text: "Run all checks sweeps the lot in one go and logs which ones it flagged; each result exports as JSON, and Export all evidence produces one bundle covering all fifteen." },
      { kind: "new", tool: "Containment", text: "Exporting a check ticks the evidence item it satisfies, so the evidence list reflects what you actually preserved rather than what you remembered to tick." },
      { kind: "new", tool: "Containment", text: "Checks that cannot be automated say why and hand you the PowerShell instead - the two Power Platform ones, because the admin API is not reachable with the permissions this tool holds." },
      { kind: "improved", tool: "Containment", text: "Findings worth acting on are highlighted by the check itself rather than guessed from its wording, and the handover report now carries what each check found, its caveats, and which ones are FLAGGED." },
      { kind: "improved", tool: "Containment", text: "A 7/30/90-day window selector for the sweep, defaulting to the window your triage used. The Unified Audit Log is never queried implicitly - it takes minutes, so you ask for it." },
    ],
  },
  {
    build: 8, date: "2026-07-28", title: "Inbox rules, forwarding and delegates - from the browser",
    items: [
      { kind: "new", tool: "Containment", text: "The mailbox step is now live: inbox rules, mailbox forwarding and delegates load inline, suspicious rules are flagged, and you can disable or delete a rule, clear forwarding and remove a delegate with a button - no PowerShell." },
      { kind: "new", tool: "Containment", text: "Export mailbox evidence JSON captures every rule with its exact conditions before you remediate - the copy legal asks for two days later." },
      { kind: "new", tool: "Deploy", text: "Optional Exchange containment backend (docker compose --profile backend up -d). It holds the only standing credential in the whole tool: a certificate, app-only, seven mailbox operations, caller's directory roles re-checked with Microsoft on every request, append-only audit log." },
      { kind: "new", tool: "Docs", text: "SECURITY.md explains the whole trust model in plain language: what each part can touch, where credentials live, and what an attacker would actually have to do." },
      { kind: "improved", tool: "Containment", text: "The arm card says in one line whether an Exchange backend is connected, connected to the wrong tenant, or absent - so you never guess mid-incident. Without a backend the step falls back to prefilled PowerShell exactly as before." },
    ],
  },
  {
    build: 7, date: "2026-07-28", title: "Run everything from GitHub in Docker",
    items: [
      { kind: "new", tool: "Deploy", text: "One-command self-hosting: docker run ghcr.io/nurejev/triage pulls the latest build from GitHub on start and serves it on localhost:8080 - sign-in, consent, triage and containment all work as on the hosted site." },
      { kind: "new", tool: "Full extraction", text: "Companion container ghcr.io/nurejev/triage-pwsh with ExchangeOnlineManagement, Microsoft.Graph and the Microsoft-Extractor-Suite preinstalled. Device-code sign-in, cheat sheet on start, /evidence volume for the output." },
      { kind: "improved", tool: "Containment", text: "The inbox-rules step points at the PowerShell container for machines without Exchange Online PowerShell." },
      { kind: "improved", tool: "Security", text: "The Docker image serves with a strict Content-Security-Policy: the browser only allows connections to graph.microsoft.com and login.microsoftonline.com." },
    ],
  },
  {
    build: 6, date: "2026-07-27", title: "Containment - the first 60 minutes",
    items: [
      { kind: "new", tool: "Home", text: "After sign-in you now choose what you need: Triage (read-only investigation) or Containment (the response runbook). Both run off the same user search." },
      { kind: "new", tool: "Containment", text: "First-60-minutes runbook executed live against your tenant, in the order that does not leak: revoke sessions, disable the account, reset the password, strip attacker-added authentication methods, clear inbox rules and forwarding, revoke OAuth consent grants. Every action is confirmed before it runs." },
      { kind: "new", tool: "Containment", text: "Write permissions are requested only when you press Arm containment - never at sign-in, so a tenant that only wants triage never consents to them." },
      { kind: "new", tool: "Containment", text: "Authentication methods and OAuth grants load inline with per-item Remove/Revoke buttons, risky-scope highlighting and a tenant-wide-consent warning." },
      { kind: "new", tool: "Containment", text: "The fifteen blast-radius checks, the evidence-preservation list and the communication pattern as working checklists." },
      { kind: "new", tool: "Containment", text: "Timestamped action log of everything executed and ticked, exportable as CSV or as a Markdown handover report for the ticket." },
      { kind: "improved", tool: "Report", text: "\"Contain this account\" hands the investigated user - and its findings - straight to the runbook, which marks the steps your triage flagged." },
      { kind: "improved", tool: "Demo", text: "Demo mode walks the whole containment runbook against the staged BEC account with simulated results - no permissions, nothing changed." },
    ],
  },
  {
    build: 5, date: "2026-07-23", title: "Full extraction guide + output import",
    items: [
      { kind: "new", tool: "Full extraction", text: "Step-by-step guide to run the Microsoft-Extractor-Suite locally in PowerShell, with the exact install, connect and collection commands." },
      { kind: "new", tool: "Import", text: "Load Extractor-Suite output (Unified Audit Log CSV/JSON, Entra sign-in JSON, OAuth grants) or a saved Triage Evidence JSON and read it as a findings report - parsed entirely in your browser." },
      { kind: "improved", tool: "Sign in", text: "A hard refresh now returns to the login screen instead of silently restoring the session." },
      { kind: "new", tool: "Demo", text: "Deep link /?demo=1 opens the simulated tenant directly, so the demo can be shared on its own." },
    ],
  },
  {
    build: 4, date: "2026-07-23", title: "24-hour scan",
    items: [
      { kind: "new", tool: "User triage", text: "Look-back window of 24 hours for a fast check during an active incident, next to 7/30/90 days." },
    ],
  },
  {
    build: 3, date: "2026-07-23", title: "Coverage documented",
    items: [
      { kind: "new", tool: "Docs", text: "COVERAGE.md maps every Extractor Suite function to what Triage covers, partially covers via the audit log, or deliberately leaves out." },
    ],
  },
  {
    build: 2, date: "2026-07-23", title: "Sign in with Microsoft enabled",
    items: [
      { kind: "new", tool: "Sign in", text: "App registration configured - sign in with Microsoft now works." },
      { kind: "improved", tool: "What's new", text: "ENCA-style changelog with New/Improved/Fixed tags and a post-sign-in overlay showing what changed since your last visit." },
    ],
  },
  {
    build: 1, date: "2026-07-22", title: "First public build",
    items: [
      { kind: "new", tool: "Sign in", text: "Sign in with Microsoft - multi-tenant, PKCE, read-only delegated scopes. One-time admin consent per tenant via the link on the start page." },
      { kind: "new", tool: "User triage", text: "Investigate a user by UPN: sign-in analysis (unexpected countries, brute force followed by success, impossible travel, legacy authentication, risk levels), Unified Audit Log triage (inbox rules, mailbox forwarding, OAuth consents, role changes, mass downloads, mailbox searches), MFA methods, OAuth grants, Identity Protection risk data and directory audit events." },
      { kind: "new", tool: "Report", text: "Findings ranked by severity with recommended actions, filters, account profile, dark mode, and print/PDF. Findings and raw evidence export as CSV/JSON - everything stays in your browser." },
      { kind: "new", tool: "Demo", text: "Demo mode with a simulated BEC incident - no sign-in needed." },
      { kind: "new", tool: "Help", text: "Help page explaining usage, the exact data pulled per Graph API, severity meanings and how to remove access." },
    ],
  },
];
// The newest build that has changelog copy - what the overlay compares against.
window.TRIAGE_CHANGELOG_LATEST = window.TRIAGE_CHANGELOG.length ? window.TRIAGE_CHANGELOG[0].build : 0;
