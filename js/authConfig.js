// ============================================================
//  Limon-IT M365 Triage - authentication configuration
//  1. Create the app registration (see create-appreg.ps1 or README)
//  2. Paste its Application (client) ID below
// ============================================================
window.TRIAGE_AUTH = {
  clientId: "8f1b5185-e782-4dc3-8aee-92ba4616c8d0", // REPLACE
  authority: "https://login.microsoftonline.com/organizations", // multi-tenant
  graphBase: "https://graph.microsoft.com/beta", // beta = richest sign-in log fields
  graphV1: "https://graph.microsoft.com/v1.0",
  // Delegated, read-only. All require one-time admin consent per tenant.
  // These are the ONLY scopes requested at sign-in - triage never asks for write.
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
  // ---- Containment (WRITE) ----------------------------------------------
  // Requested only when the analyst explicitly arms the containment screen,
  // never at sign-in. A tenant that only wants triage never consents to these.
  containScopes: [
    "User.RevokeSessions.All",           // revoke refresh tokens
    "User.ReadWrite.All",                // disable account, reset password
    "User-PasswordProfile.ReadWrite.All",// password reset in tenants that split this out
    "UserAuthenticationMethod.ReadWrite.All", // remove attacker-added MFA methods
    "DelegatedPermissionGrant.ReadWrite.All"  // revoke OAuth consent grants
  ],
  // Pre-formatted tenant-wide admin consent URL (ENCA-style).
  // Consent is granted for whatever the app registration requests; the
  // containment scopes are marked optional there so a read-only deployment
  // stays possible.
  adminConsentUrl: function () {
    return "https://login.microsoftonline.com/organizations/adminconsent?client_id=" +
      this.clientId + "&redirect_uri=" + encodeURIComponent(window.location.origin + window.location.pathname);
  }
};
