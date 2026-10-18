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
window.TRIAGE_BUILD = 38;
window.TRIAGE_BUILD_DATE = "2026-09-17";
window.TRIAGE_CHANGELOG = [
  {
    build: 38, date: "2026-09-17", title: "Runbook can live inside the beta",
    items: [
      { kind: "improved", tool: "Containment", text: "The first-hour runbook can be embedded in the beta's Respond step without its own header (opts.embedded). No visible change on this site; cache-busters refreshed so browsers fetch the updated contain.js." },
    ],
  },
  {
    build: 37, date: "2026-09-16", title: "Stop scanning and reuse response sessions",
    items: [
      { kind: "fixed", tool: "Response", text: "Stop queued blast-radius checks and discard late results while retaining completed evidence." },
    ],
  },
  {
    build: 36, date: "2026-09-16", title: "Unified first-hour workspace support",
    items: [
      { kind: "improved", tool: "Response", text: "Phase workspace adapter retains existing response safeguards and distinguishes offline evidence from connected checks." },
      { kind: "fixed", tool: "Communication", text: "Downloading a communication template records a draft without marking communication complete." },
    ],
  },
  {
    build: 35, date: "2026-09-16", title: "Shared response case context",
    items: [
      { kind: "fixed", tool: "Response", text: "Retain canonical account identity in subject views and expose response log events to the Beta workspace." },
    ],
  },
  {
    build: 34, date: "2026-09-15", title: "Customer certificate connections",
    items: [
      { kind: "new", tool: "Portable collector", text: "Existing customer certificate profiles and a reviewed app-registration setup wizard." },
      { kind: "improved", tool: "Connections", text: "Preserve connection errors and identify authentication versus account-verification waits." },
    ],
  },
  {
    build: 33, date: "2026-09-15", title: "Restore full Exchange sign-in chooser",
    items: [
      { kind: "fixed", tool: "Triage desktop", text: "Leave Exchange username unset so the full Microsoft sign-in chooser remains available for passkey users; verify the operator after sign-in." },
    ],
  },
  {
    build: 32, date: "2026-09-15", title: "Connect Microsoft 365 before collection",
    items: [
      { kind: "improved", tool: "Triage desktop", text: "Connect required Graph and Exchange sessions at the start and reuse the operator account for Exchange." },
    ],
  },
  {
    build: 31, date: "2026-09-15", title: "Show the active collection and analysis engine",
    items: [
      { kind: "improved", tool: "Execution", text: "Clearly label PowerShell collection, browser JavaScript checks and local JavaScript analysis; retain the collection method with saved cases." },
    ],
  },
  {
    build: 30, date: "2026-09-15", title: "Keep global OAuth consent out of user findings",
    items: [
      { kind: "fixed", tool: "OAuth", text: "Only grants linked to the selected account contribute user OAuth findings; tenant-wide consent remains available as evidence and in tenant reviews." },
    ],
  },
  {
    build: 29, date: "2026-09-15", title: "Visible finding review validation",
    items: [
      { kind: "fixed", tool: "Reviews", text: "Show missing reasons and invalid evidence references inside the shared review dialog, preserve drafts, and keep modal errors visible." },
    ],
  },
  {
    build: 28, date: "2026-09-15", title: "macOS download first-launch note",
    items: [
      { kind: "improved", tool: "Downloads", text: "Added per-app quarantine guidance and the Triage xattr command beside the portable download." },
    ],
  },
  {
    build: 27, date: "2026-09-15", title: "Fix directory roles and MFA registration collection",
    items: [
      { kind: "fixed", tool: "Collection", text: "Directory roles use one supported expansion; single-user MFA registration uses its dedicated endpoint in web and portable checks." },
    ],
  },
  {
    build: 26, date: "2026-09-15", title: "Shared portable and web collection screens",
    items: [
      { kind: "improved", tool: "Collector", text: "Portable collection now opens the shared live overview with clickable evidence, source progress and expandable collection output." },
    ],
  },
  {
    build: 25, date: "2026-09-15", title: "Clear collection coverage and progress",
    items: [
      { kind: "improved", tool: "Evidence", text: "Show selected-source progress, distinct collection states and readable record counts. Keep active and incomplete sources visible." },
    ],
  },
  {
    build: 24, date: "2026-09-15", title: "System theme and automatic switching",
    items: [
      { kind: "new", tool: "Theme", text: "Choose System, Light or Dark. System follows operating-system appearance changes while preserving form drafts." },
    ],
  },
  {
    build: 23, date: "2026-09-15", title: "Clickable evidence and OAuth collection",
    items: [
      { kind: "fixed", tool: "Evidence", text: "Open source records directly from the complete row, including source errors and empty-state explanations." },
      { kind: "fixed", tool: "OAuth collection", text: "Collect user and tenant-wide delegated grants with separate equality queries and retained paging checkpoints." },
    ],
  },
  {
    build: 22, date: "2026-09-15", title: "Quick check account and run action",
    items: [
      { kind: "improved", tool: "Quick web check", text: "Autofill the connected username and place Run quick check beside it, preserving manually entered targets." },
    ],
  },
  {
    build: 21, date: "2026-09-15", title: "Beta 9 local launch and case workflow corrections",
    items: [
      { kind: "fixed", tool: "Beta", text: "Serve locally without Docker, repair Mac signing and make the next-case action prominent." },
    ],
  },
  {
    build: 20, date: "2026-09-15", title: "Triage beta 8 shared evidence support",
    items: [
      { kind: "improved", tool: "Evidence", text: "Normalize native role-assignment snapshots while retaining the original source records." },
    ],
  },
  {
    build: 19, date: "2026-09-15", title: "Beta 7 — one investigation workspace",
    items: [
      { kind: "improved", tool: "Beta workspace", text: "Consistent user and tenant navigation, findings layout and shared first-60-minutes guidance." },
    ],
  },
  {
    build: 18, date: "2026-09-15", title: "Phase 1 and 2: case integrity and shared investigation workspace",
    items: [
      { kind: "fixed", tool: "Evidence", text: "Explicit coverage, strict subject imports and session-bound response identity." },
      { kind: "improved", tool: "Containment", text: "Scoped Exchange authorization, durable intent records and honest verification states." },
      { kind: "new", tool: "Beta workspace", text: "Shared cases, tenant-to-user handoff, device-save controls and shorter navigation." },
    ],
  },
  {
    build: 17, date: "2026-09-15", title: "Quick-user response in the new beta layout",
    items: [
      { kind: "new", tool: "Beta", text: "Quick-user checks and the full containment runbook now use the new sidebar layout; full tenant triage has its own workspace." },
      { kind: "improved", tool: "Beta", text: "Matched ENCA Beta theme colors and added separate user guides plus an Azure hosting assessment." },
    ],
  },
  {
    build: 16, date: "2026-09-15", title: "Beta collection progress and user guide",
    items: [
      { kind: "improved", tool: "Beta", text: "Active collection has a distinct spinner, highlighted row and current-source message." },
      { kind: "new", tool: "Beta", text: "End-user walkthrough for collecting, reviewing and saving cases, with a downloadable guide." },
    ],
  },
  {
    build: 15, date: "2026-09-15", title: "Beta evidence workspace and safer Docker packaging",
    items: [
      { kind: "new", tool: "Beta", text: "Investigation workspace, resumable evidence collection, verified bundles and optional read-only Exchange collector. Open /BETA/ for the preview." },
      { kind: "fixed", tool: "Docker", text: "Only approved site assets enter the web image; credentials, audit data and review files are excluded." },
    ],
  },
  {
    build: 14, date: "2026-08-28", title: "Audit findings are scoped to the account again",
    items: [
      { kind: "fixed", tool: "User triage", text: "The Unified Audit Log query sent userPrincipalNames instead of userPrincipalNameFilters. Graph ignores unknown properties rather than rejecting them, so the query ran unfiltered and returned the whole tenant's audit log for the window - every record then rendered as a finding against whichever account you searched. An account with no sign-ins and no activity of its own could show thousands of audit events and a row of High findings that belonged to an admin." },
      { kind: "new", tool: "User triage", text: "Audit records whose actor is not the account under investigation are excluded from the findings and reported once, by name, as a data-quality note. If the query ever stops being scoped again the tool says so instead of inventing an incident." },
      { kind: "improved", tool: "User triage", text: "Consent findings are scored on what was actually consented to. Tenant-wide admin consent drops to Info with a pointer to Entra > Enterprise applications; a user-consented app is rated on the scopes it received, so consent phishing still surfaces as Critical. Service, application and service-principal actors can no longer raise a High on their own." },
      { kind: "fixed", tool: "User triage", text: "Client IP is read from the top-level clientIp on Graph audit records, not only from inside auditData, so audit findings stop reporting an empty IP list." },
    ],
  },
  {
    build: 13, date: "2026-08-20", title: "Help: what Docker is for",
    items: [
      { kind: "new", tool: "Help", text: "Clear explainer of the three optional Docker containers - the nginx web host with strict CSP, the Exchange containment backend, and the preloaded PowerShell companion - and exactly when each is needed. Docker is never required for triage." },
    ],
  },
  {
    build: 12, date: "2026-08-20", title: "Triage gets its own mark, and an obvious way out of the demo",
    items: [
      { kind: "new", tool: "Branding", text: "Triage now wears its own product mark - the magnifier with a pulse trace through the lens, the same artwork already used on limon-it.nl - instead of the generic Limon-IT lemon. Favicon, header and login card all updated, light and dark." },
      { kind: "improved", tool: "Sign in", text: "The login screen moves onto the same card TUNO and ENCA use: the mark on a single surface panel, one blurb, full-width buttons. The demo button, the consent, help, security and import links and the trust badges are all still there." },
      { kind: "new", tool: "Demo mode", text: "An obvious way back out of the demo. The demo banner gets a Leave demo & sign in button, the header button relabels itself to Exit demo while you are in the simulated tenant, and a DEMO pill sits in the header on every screen - not just the mode chooser - so you can never lose track of which tenant you are looking at." },
      { kind: "fixed", tool: "Demo mode", text: "Leaving the demo now strips ?demo=1 from the URL, so a refresh no longer drops you straight back into the simulated tenant as if the exit button had not worked." },
    ],
  },
  {
    build: 11, date: "2026-08-11", title: "Tabs that keep their place, and the full MFA list in the report",
    items: [
      { kind: "new", tool: "Navigation", text: "ENCA-style tool tabs under the header: Triage, Containment, Full extraction and Import each open as a tab with a home button, a + menu and close buttons - switching tabs resumes the tool exactly where it was, so a running scan keeps running instead of starting at the beginning again." },
      { kind: "improved", tool: "Navigation", text: "A scan that finishes while you are on another tab no longer yanks you over - the Triage tab quietly resumes at the finished report. Per-screen scroll memory restores where you were on each screen." },
      { kind: "improved", tool: "Search", text: "Starting a new scan while one is still running asks first, instead of silently discarding the running one." },
      { kind: "improved", tool: "Report", text: "The MFA finding now lists every registered authentication method with the same labels and detail as containment's Load authentication methods - password and SSPR email included, with device names, phone numbers and registration dates - so you see the whole picture before heading over to containment." },
    ],
  },
  {
    build: 10, date: "2026-07-28", title: "Communication templates, and evidence that says where it came from",
    items: [
      { kind: "improved", tool: "Home", text: "A Home button in the top bar next to Full extraction. The logo was always a home link, but nothing said so - and mid-incident nobody goes hunting for an affordance." },
      { kind: "new", tool: "Containment", text: "Every communication step downloads as a markdown template prefilled with what the session knows: the call script for the user (with what not to say), the manager brief, the one-paragraph CISO status, the DPO note with a personal-data exposure table filled in from the checks, the leadership brief, and a communication log. Download all templates takes the lot." },
      { kind: "fixed", tool: "Containment", text: "Evidence items now say which check produces them, and the four directory-audit checks no longer tick 'Unified Audit Log search' - the Entra audit log is a different source, and claiming otherwise put a false statement in the evidence record." },
      { kind: "new", tool: "Containment", text: "Directory audit export is its own evidence item; inbox rules and forwarding are one item covering both; each item is labelled either 'from check N' or 'collect by hand'." },
      { kind: "fixed", tool: "Search", text: "Typing a full UPN without clicking the suggestion now selects that account properly, so the display name and object id carry through - the call script addresses the person by name instead of [name]." },
    ],
  },
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
