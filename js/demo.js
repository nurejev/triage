// Demo mode - a simulated tenant with a staged BEC incident. No network calls.
(function () {
  const DOM = "contoso-demo.com";
  const USERS = ["jan.devries", "maria.popescu", "finance", "admin.piet", "sales.kim",
    "hr.eva", "it.support", "dirk.jansen"].map(function (n) {
      return { userPrincipalName: n + "@" + DOM, displayName: n.split(".").map(function (p) {
        return p.charAt(0).toUpperCase() + p.slice(1); }).join(" "), id: "demo-" + n };
    });
  const V = "jan.devries@" + DOM;

  function signIn(upn, t, ip, country, city, err, client, risk) {
    return {
      userPrincipalName: upn, createdDateTime: t, ipAddress: ip,
      appDisplayName: "Office 365 Exchange Online", clientAppUsed: client || "Browser",
      conditionalAccessStatus: "notApplied",
      riskLevelDuringSignIn: risk || "none",
      status: { errorCode: err || 0 },
      location: { city: city, countryOrRegion: country },
      deviceDetail: { operatingSystem: "Windows 11" }
    };
  }

  function evidenceFor(upn) {
    const ev = { upn: upn, days: 30, demo: true, skipped: [], user: {
      userPrincipalName: upn, displayName: upn.split("@")[0], accountEnabled: true,
      createdDateTime: "2021-03-01T09:00:00Z",
      lastPasswordChangeDateTime: upn === "finance@" + DOM ? "2022-01-10T09:00:00Z" : "2026-05-01T09:00:00Z"
    }, signIns: [], ualRecords: [], oauthGrants: [], riskyUsers: [], riskDetections: [],
      authMethods: { loaded: true, methods: [{ "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod" }] },
      directoryAudits: [] };

    // normal traffic
    for (let d = 10; d < 20; d++) {
      ev.signIns.push(signIn(upn, "2026-07-" + String(d).padStart(2, "0") + "T09:15:00Z",
        "84.83.10.25", "Netherlands", "Utrecht"));
    }
    if (upn !== V) return ev;

    // the incident
    ev.authMethods = { loaded: true, methods: [] };
    for (let i = 0; i < 14; i++) {
      ev.signIns.push(signIn(V, "2026-07-15T03:" + String(i).padStart(2, "0") + ":00Z",
        "154.16.10.88", "Nigeria", "Lagos", 50126));
    }
    ev.signIns.push(signIn(V, "2026-07-15T03:15:00Z", "154.16.10.88", "Nigeria", "Lagos", 0, "Browser", "high"));
    ev.signIns.push(signIn(V, "2026-07-15T03:40:00Z", "154.16.10.88", "Nigeria", "Lagos", 0, "Authenticated SMTP"));
    ev.signIns.push(signIn(V, "2026-07-15T03:55:00Z", "84.83.10.25", "Netherlands", "Utrecht"));

    function ual(t, op, ad) {
      ev.ualRecords.push({ createdDateTime: t, operation: op, userPrincipalName: V,
        auditData: Object.assign({ Operation: op, CreationTime: t, ClientIP: "154.16.10.88" }, ad) });
    }
    ual("2026-07-15T03:22:00Z", "New-InboxRule", { Parameters: [
      { Name: "Name", Value: "." }, { Name: "ForwardTo", Value: "collector-inbox@gmail-mail.top" },
      { Name: "StopProcessingRules", Value: "True" }] });
    ual("2026-07-15T03:24:00Z", "UpdateInboxRules", { Parameters: [{ Name: "Name", Value: ".." }] });
    ual("2026-07-15T03:30:00Z", "Set-Mailbox", { Parameters: [
      { Name: "Identity", Value: "jan.devries" },
      { Name: "ForwardingSmtpAddress", Value: "smtp:collector-inbox@gmail-mail.top" }] });
    ual("2026-07-15T03:45:00Z", "Consent to application.", { ObjectId: "eM Reader Pro" });
    ual("2026-07-16T02:10:00Z", "SearchQueryInitiatedExchange", { Parameters: [
      { Name: "Query", Value: "IBAN OR invoice OR payment" }] });
    for (let i = 0; i < 130; i++) {
      ual("2026-07-16T02:" + String(i % 60).padStart(2, "0") + ":00Z", "FileDownloaded",
        { ObjectId: "https://contoso-demo.sharepoint.com/finance/doc" + i + ".xlsx" });
    }
    ev.oauthGrants.push({
      appName: "eM Reader Pro", clientId: "6b1f0d11-2222-4a4a-9c9c-aaaa00000001",
      consentType: "Principal", scope: "Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite offline_access",
      createdDateTime: "2026-07-15T03:45:00Z"
    });
    ev.riskyUsers.push({ riskLevel: "high", riskState: "atRisk",
      riskLastUpdatedDateTime: "2026-07-15T03:16:00Z" });
    ev.riskDetections.push(
      { riskEventType: "unfamiliarFeatures", riskLevel: "medium", activityDateTime: "2026-07-15T03:15:00Z" },
      { riskEventType: "anonymizedIPAddress", riskLevel: "high", activityDateTime: "2026-07-15T03:16:00Z" });
    return ev;
  }

  window.TriageDemo = {
    users: USERS,
    search: function (q) {
      q = q.toLowerCase();
      return USERS.filter(function (u) {
        return u.userPrincipalName.toLowerCase().indexOf(q) >= 0 ||
               u.displayName.toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
    },
    evidenceFor: evidenceFor
  };
})();
