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
window.TRIAGE_BUILD = 2;
window.TRIAGE_BUILD_DATE = "2026-07-23";
window.TRIAGE_CHANGELOG = [
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
