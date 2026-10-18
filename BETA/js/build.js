window.BETA_BUILD = 34;
window.BETA_BUILD_DATE = "2026-09-18";
window.BETA_CHANGELOG = [
  {build:34,date:"2026-09-18",title:"Evidence before decisions; completion means recorded work",items:[
    "The seven steps are grouped into Prepare, Investigate and Act & transfer. One case header keeps the target, scope, save state and response access visible. All steps expand on smaller screens; idle session details collapse.",
    "Collection gaps stay visible through Review and Respond. Ended collections with gaps show an exception, investigating findings remain outstanding, and Respond requires a reviewed outcome or documented exception for every phase.",
    "Findings link to the actual preserved records before the decision form. Supporting references attach automatically; aggregate findings page through every supporting record. Existing case IDs, raw evidence and finding IDs stay intact.",
    "Exporting a note does not record a handover. Record the next owner, channel and next action explicitly; the case retains the time and outstanding work. This sends no message and does not verify recipient acceptance.",
    "Collection scope distinguishes account evidence, tenant context and current snapshots. The existing collection gate and separate response arming remain in place."
  ]},
  {build:33,date:"2026-09-17",title:"Collect says whose evidence it is collecting",items:[
    "Collect opens with a green banner that states the target in one line — the affected account in its tenant, or Whole tenant · domain — with the window, the number of sources, the collection method and the signed-in analyst underneath. It stays on the screen after the collection ends and on reopened cases.",
    "A web collection records the analyst who ran it (collectorAccount) in the case, as the desktop app already did, so the handover and the action log name the same person.",
    "The affected account is stated from the first render of Collect on the web, before Microsoft Graph has resolved its object ID.",
    "In the desktop app a service that is busy collecting still counts as signed in: the rail's Connect line keeps the account and the top-right button reads Disconnect (disabled) instead of Sign in while the collection runs.",
    "Review's four tabs carry the same eyebrow as every other step — STEP 5 OF 7 · REVIEW · OVERVIEW / FINDINGS / TIMELINE / EVIDENCE — instead of Case workspace."
  ]},
  {build:32,date:"2026-09-17",title:"Respond reuses the sign-in; the rail fits",items:[
    "On the web the account checks on Respond connect by themselves with the Connect sign-in; the row shows Connected on arrival. The desktop app keeps one announced Microsoft window for them.",
    "The embedded runbook no longer shows its own preserve card (run triage first, export evidence): the phase-1 rows cover it. Viewing Respond no longer writes a containment entry to the case log; connecting the checks writes one.",
    "The step rail clips long account names instead of pushing past the sidebar; the Scope line counts the sources in the plan.",
    "The top-right chip reads account · tenant · Graph ✓ · Exchange ✓ · write armed/not armed. Starting a second collection with a case open asks first; the open case stays saved. Leaving the page warns only during a collection or while a change is not yet saved.",
    "Help shows What's new per build; the badge and footer take the build number from build.js."
  ]},
  {
    build: 31,
    date: "2026-09-17",
    title:
      "One workflow: Start, Connect, Scope, Collect, Review, Respond, Hand over",
    items: [
      "The sidebar is a step rail. Every screen has one primary action, the URL names the step, and the browser's Back button always returns to the previous screen; findings and records open in a drawer beside the list instead of a modal or another page.",
      "Sign-in happens only on Connect. The web pins the tenant (your organisation or a customer domain) before the Microsoft window opens; the desktop app signs each service in as a row with a waiting state and a result, and keeps the PowerShell session until you collect.",
      "Scope offers evidence presets (Quick, Standard, Everything, Custom), suggests the affected account from the tenant on the web, and hands a plan to the desktop app for mailbox evidence.",
      "Collect shows progress on one screen and opens Review by itself. The case saves itself while you work, the case bar says when, and a reload lands on the same screen of the same case.",
      "Respond embeds the first-hour runbook in five phases; account checks connect from a row that says what will open. Hand over lists what the next owner gets and what is still open, with the exports in one place.",
    ],
  },
  {
    build: 30,
    date: "2026-09-16",
    title: "Visible readiness and useful mailbox errors",
    items: [
      "Desktop readiness opens immediately with visible progress, then shows the result in the same dialog. Collection choices and the current case remain in place.",
      "Closing and reopening a running readiness check reuses it. Failures offer retry; dismissed checks do not reopen themselves.",
      "Mailbox errors distinguish delegated and application access. Graph error codes, messages and request IDs survive long SDK request headers; an unavailable mailbox remains an evidence gap.",
    ],
  },
  {
    build: 29,
    date: "2026-09-16",
    title: "Choose an evidence destination",
    items: [
      "Choose and open a dedicated evidence folder in the portable app. New collections write their raw checkpoints and final bundle there.",
      "Saving a case also writes its reviewed evidence and action log to the chosen folder; older local cases remain available.",
      "Folder preferences survive theme changes. Temporary Azure certificate files remain outside the evidence directory.",
    ],
  },
  {
    build: 28,
    date: "2026-09-16",
    title: "Connect before collecting",
    items: [
      "Optional Azure authentication now happens in the startup connection stage, alongside the existing Graph and Exchange setup; Azure reads cannot launch a later connection attempt.",
      "Graph interaction-required errors ask for explicit reconnection rather than repeatedly requesting more source data with the failed session.",
      "Email and attachment collection share mailbox-unavailable diagnostics and avoid repeating a denied or missing mailbox listing. A 404 remains an unresolved coverage gap, not a claim that the mailbox has no messages.",
    ],
  },
  {
    build: 27,
    date: "2026-09-16",
    title: "Reusable sessions and reliable scan controls",
    items: [
      "Native response requests reuse one PowerShell session. Graph tokens stay in memory rather than repeatedly opening the OS token cache. Separate service sign-ins or write consent can still be required.",
      "Stop scanning is available in the collection sidebar and blast-radius checks; completed evidence is retained.",
      "Admin and mailbox audits use Search-UnifiedAuditLog with pagination and explicit coverage limits instead of retired cmdlets.",
      "Mail collection requests Mail.Read.Shared in delegated mode and explains mailbox-access denials. Application failures include targeted diagnostic guidance without falling back to delegated access.",
    ],
  },
  {
    build: 26,
    date: "2026-09-16",
    title: "A unified first-hour workflow",
    items: [
      "Five phases combine evidence preservation, response, impact checks and communication with one case action log. Notes open on demand.",
      "Communication templates are in Communicate & hand over. Downloads are drafts and never mark communication as sent.",
      "The app runs mailbox collection locally and appends its evidence to the current case. Exchange response remains a separately reviewed manual PowerShell operation.",
      "Opening preserved evidence does not connect or arm response. Native and browser use the same phase screens.",
    ],
  },
  {
    build: 25,
    date: "2026-09-16",
    title: "One first-hour workspace and visible collection",
    items: [
      "The sidebar shows connecting, collecting or stopping status with engine and source progress while collection runs.",
      "Select all and Deselect all apply to the sources available in the current app or browser form.",
      "First 60 minutes combines phase guidance, recorded outcomes and connected account response/checks on the same page. Connecting does not arm response actions.",
    ],
  },
  {
    build: 24,
    date: "2026-09-16",
    title: "Full app collection and connected investigation",
    items: [
      "The portable app selects all 34 collection sources by default, with account and tenant scopes. Browser quick triage remains limited to 12 supported Graph sources.",
      "Help provides an explicit Extractor/Analyzer coverage contract, source matrix, permission boundaries and outstanding parity work.",
      "First-hour response connects to the shared account checks and action log. Native Graph response uses separate delegated authorization and an account-bound confirmation journal.",
      "Readable evidence facts, preserved review drafts and detailed handovers connect findings to investigation. Imported cases retain their canonical account and global OAuth context.",
      "Local regression and packaging results are documented separately from pending live Microsoft and Windows acceptance. No full upstream equivalence claim.",
    ],
  },
  {
    build: 23,
    date: "2026-09-15",
    title: "Quieter analyzers, keyed saved cases, wider collection",
    items: [
      "Analyzers stop flagging normal tenants: baseline sign-in scopes are not risky permissions, first-party Microsoft apps are not blacklisted, residential ISPs are Info, hosting/VPN ASNs and blacklisted countries are Medium, the AiTM fingerprint needs a second signal, and the 30-second rule looks at interactive sign-ins only.",
      "New signals: session-ID replay across networks, service-principal sign-ins from blacklisted space, Outlook/EWS inbox rules (OperationProperties), the full upstream UAL operation list, MailItemsAccessed client depth, UAL sign-in user agents, PIM eligibility, directory role/MFA/domain escalation audits, phone-only MFA, dormant admins from signInActivity.",
      "Collection: per-source page caps (200 for sign-ins, audits and UAL), $top on the MFA report, UAL objectIdFilters so admin actions on the account are captured, service-principal sign-ins, PIM eligibility (RoleManagement.Read.Directory replaces the unused Policy.Read.All), popup tokens verified against the case account.",
      "Case files: unknown sources and manifest overrides are rejected at import; saved cases are kept one per case instead of one slot; the logo no longer reloads the page; readiness shows in a dialog; findings show 'Analyzing…' instead of 'No signals' while analysis runs.",
      "Desktop 0.23.0: Graph and Exchange workers collect in parallel, the browser-viewer link expires after 15 minutes, new app icon, smaller bundled runtime. Legacy container beta and unused shells removed from the repository.",
    ],
  },
  {
    build: 22,
    date: "2026-09-15",
    title: "Customer certificate connections and registration wizard",
    items: [
      "Use existing customer Graph and Exchange registrations with an OS-encrypted local certificate profile.",
      "Prepare reviewed app registrations and collection-only Exchange roles through an exported setup wizard.",
      "Connection-stage progress and original errors distinguish authentication waits from account verification. Live passkey timeout acceptance remains pending.",
    ],
  },
  {
    build: 21,
    date: "2026-09-15",
    title: "Restore the full Exchange sign-in chooser",
    items: [
      "Exchange no longer receives a forced username hint, allowing Microsoft to present its full account and sign-in chooser.",
      "Connection guidance shows where to select a passkey. Tenant, operator and mailbox identity checks remain enforced after sign-in.",
      "No password, device-code fallback or authentication-policy exception is introduced. Live passkey acceptance remains to be tested.",
    ],
  },
  {
    build: 20,
    date: "2026-09-15",
    title: "Connect Microsoft 365 before collection",
    items: [
      "Graph and selected Exchange sessions connect together at the start, before long-running evidence queries.",
      "Exchange receives the signed-in operator account as its login hint. Microsoft can still require consent or MFA.",
      "Visible service status distinguishes connection setup from collection; cancellation closes all pending workers.",
    ],
  },
  {
    build: 19,
    date: "2026-09-15",
    title: "See how each check runs",
    items: [
      "Setup clearly labels PowerShell on this computer or Browser JavaScript in this browser beside the Run controls.",
      "A persistent live strip shows collection, cancellation and JavaScript analysis while navigating the case.",
      "Saved cases retain their collection method. Opening a PowerShell case in the browser shows viewer mode rather than claiming browser collection is running.",
    ],
  },
  {
    build: 18,
    date: "2026-09-15",
    title: "Separate user OAuth findings from global consent",
    items: [
      "User OAuth findings require a grant linked to the selected account. Tenant-wide consent no longer inflates user signals or priority counts.",
      "An OAuth scope summary explains user grants and tenant context. All original grants remain clickable in Evidence; tenant-wide analysis retains its OAuth rules.",
      "Reopening existing cases applies the corrected analysis while preserving evidence and prior review history. Handover counts confirmations against current findings.",
    ],
  },
  {
    build: 17,
    date: "2026-09-15",
    title: "Visible finding review validation",
    items: [
      "Missing reasons and invalid confirmation references are explained beside the fields inside the review dialog.",
      "Failed saves retain your draft and focus the first field to correct. Errors clear as fields are corrected.",
      "Unexpected modal errors remain visible above the backdrop in the shared web and portable viewer.",
    ],
  },
  {
    build: 16,
    date: "2026-09-15",
    title: "macOS first-launch note beside the download",
    items: [
      "The download page includes a manual Triage quarantine command with the correct app path and first-launch explanation.",
      "The targeted command removes only quarantine. Expand the note for the MarkText-style xattr -cr command and its broader effect.",
    ],
  },
  {
    build: 15,
    date: "2026-09-15",
    title: "Fix directory roles and MFA registration collection",
    items: [
      "Directory role assignments use a single supported expansion; readable identities resolve from the case subject or preserved inventory.",
      "Single-user MFA registration uses the dedicated report endpoint. Tenant-wide reports remain paged; denied or missing reports remain explicit gaps.",
      "Web retries replace rejected legacy query URLs. Both web and portable collectors include regression tests for these failures.",
    ],
  },
  {
    build: 14,
    date: "2026-09-15",
    title: "Shared portable and web collection screens",
    items: [
      "Portable and web checks use the same setup layout, Run button placement and live Overview.",
      "Native PowerShell checkpoints update the shared coverage panel and clickable evidence as records arrive. Detailed output is expandable.",
      "Cancellation preserves returned records. Collection updates retain analyst notes and unsaved runbook drafts.",
    ],
  },
  {
    build: 13,
    date: "2026-09-15",
    title: "Clear collection coverage and progress",
    items: [
      "Collection coverage shows completed sources against the selected plan, with progress and separate status totals.",
      "Active collection, waiting, complete, partial and failed sources have distinct icons and labels. Unstarted sources no longer appear as zero-record results.",
      "The overview keeps active and incomplete sources visible. Every source still opens its evidence and collection details, with mobile and dark theme support.",
    ],
  },
  {
    build: 12,
    date: "2026-09-15",
    title: "System theme with automatic switching",
    items: [
      "Choose System, Light or Dark in the visible Theme selector on desktop and mobile.",
      "System is the default for new users and follows live operating-system appearance changes without losing form drafts or focus.",
      "Existing light/dark choices are preserved. Browser and portable-app theme preferences are remembered across restarts.",
    ],
  },
  {
    build: 11,
    date: "2026-09-15",
    title: "Open evidence directly and collect delegated grants",
    items: [
      "Click any evidence source row to expand its records, errors and collection details in place, with keyboard and mobile support.",
      "Completed empty queries, failed collection and sources not collected have distinct explanations.",
      "Web and desktop OAuth collection use separate equality queries for user and tenant-wide grants, preserving returned evidence and paging checkpoints.",
    ],
  },
  {
    build: 10,
    date: "2026-09-15",
    title: "Quick check without scrolling",
    items: [
      "The connected username fills Account to check automatically; a manually entered target remains editable and is preserved when reconnecting.",
      "Run quick check sits beside the account field, above the evidence checklist, and directly underneath it on small screens.",
      "Starting another case defaults to the current connected account while preserving the previous case and action log when saved.",
    ],
  },
  {
    build: 9,
    date: "2026-09-15",
    title: "No Docker, repaired Mac packaging and a clear next-case flow",
    items: [
      "The website starts directly with npm run web; no Docker service or collection backend is required.",
      "Central save-and-start panel replaces the quick-triage dead end when a case is already open.",
      "Mac packaging signs the final bundle and verifies the app after ZIP extraction; Developer ID notarization is still required for trusted public downloads.",
      "Current beta tests run without legacy certificate-container fixtures.",
    ],
  },
  {
    build: 8,
    date: "2026-09-15",
    title: "Portable collection and one evidence workspace",
    items: [
      "Flat Limon-IT website with the current triage logo, quick delegated Graph checks and a shared case viewer.",
      "Portable macOS and Windows collector with bundled PowerShell and fixed delegated Graph/Exchange plans.",
      "Evidence-linked reviews, first-hour runbook, action log and portable case exports.",
      "Local fixture and browser validation; live tenant and native Windows acceptance remain pending.",
    ],
  },
  {
    build: 7,
    date: "2026-09-15",
    title: "One workspace for user and tenant investigations",
    items: [
      "Persistent shared navigation, scope switch, case controls and theme; switching stays on the same page.",
      "Consistent findings list and detail layout in both scopes.",
      "Shared first-60-minutes guidance with scope-specific steps and the detailed account response runbook retained.",
      "Tenant findings open the affected user in place, without carrying response authority.",
    ],
  },
  {
    build: 6,
    date: "2026-09-15",
    title: "Phases 1 and 2 — evidence safeguards and shared cases",
    items: [
      "Explicit quick-user source coverage, continuation, cancellation and subject-safe imports.",
      "Canonical case identity, scoped Exchange response authorization and durable action intent.",
      "Shared evidence format, tenant-to-user handoff, finding notes and explicit device saving.",
      "Shorter runbook navigation and a consistent case context across both workspaces.",
      "Background analysis for larger cases, a bounded mailbox snapshot and recorded preservation exceptions.",
      "Offline/local validation only; live tenant acceptance remains required before promotion.",
    ],
  },
  {
    build: 5,
    date: "2026-09-15",
    title: "Quick-user response, full tenant workspace and ENCA theme",
    items: [
      "Quick-user checks and the complete production containment runbook are the main beta entry, with a new sidebar layout.",
      "Full tenant triage opens in its own workspace, with the optional read-only Docker collector.",
      "ENCA Beta light/dark theme colors, including forest surfaces and lemon primary actions in dark mode.",
      "Separate end-user guides and an Azure Container Apps hosting assessment.",
    ],
  },
  {
    build: 4,
    date: "2026-09-15",
    title: "Visible collection progress and end-user walkthrough",
    items: [
      "Blue running badges, spinners and highlighted source rows distinguish active collection from completed or uncollected sources.",
      "Current-source activity message, clear cancelled/completed state, and reduced-motion support.",
      "End-user walkthrough in the app and as a downloadable guide, with administrator setup kept separately.",
    ],
  },
  {
    build: 3,
    date: "2026-09-15",
    title: "Evidence workspace and local Exchange collection",
    items: [
      "New investigation, collection and response-plan layout with keyboard and narrow-screen support.",
      "Explicit source coverage, Graph pagination checkpoints, cancellation and incomplete-source resume.",
      "Versioned evidence bundles with raw records, SHA-256 integrity checks, dispositions and response notes.",
      "Optional local Docker collector: authenticated queue, fixed read-only mailbox plan, private persistent evidence and per-source results.",
      "Safer import classification and status parsing; MFA collection and OAuth subject identity preserved.",
      "Rapid IP changes treated as a review signal; removed undisclosed event-analysis caps.",
    ],
  },
];
