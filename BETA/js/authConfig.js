// ============================================================
//  Limon-IT M365 Triage BETA (MAS-web) - authentication config
//  Reuses the Triage app registration's read-only delegated scopes,
//  plus the directory/device reads the tenant-wide analyzers need.
// ============================================================
window.TRIAGE_AUTH = {
  clientId: "8f1b5185-e782-4dc3-8aee-92ba4616c8d0",
  authority: "https://login.microsoftonline.com/organizations",
  graphBase: "https://graph.microsoft.com/beta",   // richest sign-in fields
  graphV1: "https://graph.microsoft.com/v1.0",
  // Delegated, read-only. One-time admin consent per tenant. The BETA never writes.
  scopes: [
    "User.Read.All",
    "AuditLog.Read.All",
    "Directory.Read.All",
    "Policy.Read.All",
    "IdentityRiskyUser.Read.All",
    "IdentityRiskEvent.Read.All",
    "UserAuthenticationMethod.Read.All",
    "AuditLogsQuery.Read.All"
  ],
  containScopes: [],   // BETA is analysis-only; no write path
  // Optional: pin the MSAL reply URL if a deployment registers its own. Left
  // unset, sign-in reuses the site ROOT redirect URI (see js/graph.js), which
  // is what the app registration already has.
  redirectUri: null,
  adminConsentUrl: function () {
    // Consent must also reply to a registered URI - use the site root, not /BETA/.
    return "https://login.microsoftonline.com/organizations/adminconsent?client_id=" +
      this.clientId + "&redirect_uri=" + encodeURIComponent(this.redirectUri || (window.location.origin + "/"));
  }
};
