// ============================================================
//  Limon-IT M365 Triage - authentication configuration
//  1. Create the app registration (see create-appreg.ps1 or README)
//  2. Paste its Application (client) ID below
// ============================================================
window.TRIAGE_AUTH = {
  clientId: "00000000-0000-0000-0000-000000000000", // REPLACE
  authority: "https://login.microsoftonline.com/organizations", // multi-tenant
  graphBase: "https://graph.microsoft.com/beta", // beta = richest sign-in log fields
  graphV1: "https://graph.microsoft.com/v1.0",
  // Delegated, read-only. All require one-time admin consent per tenant.
  scopes: [
    "User.Read.All",                 // UPN search + user profile
    "AuditLog.Read.All",             // sign-in logs, directory audits
    "Directory.Read.All",            // directory objects, roles
    "Policy.Read.All",               // Conditional Access policies
    "IdentityRiskyUser.Read.All",    // Identity Protection risky users
    "IdentityRiskEvent.Read.All",    // Identity Protection detections
    "UserAuthenticationMethod.Read.All", // MFA methods
    "AuditLogsQuery.Read.All"        // Unified Audit Log (async query API)
  ],
  // Pre-formatted tenant-wide admin consent URL (ENCA-style)
  adminConsentUrl: function () {
    return "https://login.microsoftonline.com/organizations/adminconsent?client_id=" +
      this.clientId + "&redirect_uri=" + encodeURIComponent(window.location.origin + window.location.pathname);
  }
};
