// Build stamp + what's new. Bump with: python3 bump.py "change 1" "change 2"
window.TRIAGE_BUILD = 1;
window.TRIAGE_BUILD_DATE = "2026-07-22";
window.TRIAGE_CHANGELOG = [
  {
    build: 1, date: "2026-07-22", changes: [
      "First public build.",
      "Sign in with Microsoft (multi-tenant, PKCE, read-only delegated scopes).",
      "Investigate a user by UPN: sign-in analysis (unexpected countries, brute force followed by success, impossible travel, legacy authentication, risk levels), Unified Audit Log triage (inbox rules, mailbox forwarding, OAuth consents, role changes, mass downloads, mailbox searches), MFA methods, OAuth grants, Identity Protection risk data, directory audit events.",
      "Findings report with severity ranking, recommended actions, filters, dark mode.",
      "Export findings and raw evidence as JSON/CSV - everything stays in your browser.",
      "Demo mode with a simulated BEC incident - no sign-in needed.",
      "Limon-IT branding and a Help section explaining usage, the exact data pulled per Graph API, severity meanings and how to remove access."
    ]
  }
];
