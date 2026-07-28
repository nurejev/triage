// Staged data for the blast-radius checks in demo mode. No network calls.
// Mirrors the same BEC story as js/demo.js: token theft from Lagos, a hiding
// inbox rule, an OAuth grant, and a bulk SharePoint download.
(function () {
  const V = "jan.devries@contoso-demo.com";
  const IP = "154.16.10.88";

  function si(t, ip, country, city, err, client, app) {
    return { userPrincipalName: V, createdDateTime: t, ipAddress: ip,
      appDisplayName: app || "Office 365 Exchange Online", clientAppUsed: client || "Browser",
      status: { errorCode: err || 0 }, location: { city: city, countryOrRegion: country },
      riskLevelDuringSignIn: err ? "none" : (ip === IP ? "high" : "none"),
      deviceDetail: { operatingSystem: "Windows 11" } };
  }
  function ual(t, op, ad) {
    return { createdDateTime: t, operation: op, userPrincipalName: V,
      auditData: Object.assign({ Operation: op, CreationTime: t, ClientIP: IP }, ad) };
  }
  function audit(t, activity, target, category) {
    return { activityDateTime: t, activityDisplayName: activity, category: category || "UserManagement",
      initiatedBy: { user: { userPrincipalName: V } },
      targetResources: [{ displayName: target, userPrincipalName: /@/.test(target) ? target : undefined }] };
  }

  let cachedNon = null;
  window.TriageDemoBlast = {
    signIns: function (nonInteractive) {
      if (!nonInteractive) {
        const out = [];
        for (let d = 10; d < 20; d++) out.push(si("2026-07-" + String(d).padStart(2, "0") + "T09:15:00Z", "84.83.10.25", "Netherlands", "Utrecht"));
        for (let i = 0; i < 14; i++) out.push(si("2026-07-15T03:" + String(i).padStart(2, "0") + ":00Z", IP, "Nigeria", "Lagos", 50126));
        out.push(si("2026-07-15T03:15:00Z", IP, "Nigeria", "Lagos"));
        out.push(si("2026-07-15T03:40:00Z", IP, "Nigeria", "Lagos", 0, "Authenticated SMTP"));
        out.push(si("2026-07-15T03:55:00Z", "84.83.10.25", "Netherlands", "Utrecht"));
        return out.sort(function (a, b) { return b.createdDateTime.localeCompare(a.createdDateTime); });
      }
      if (cachedNon) return cachedNon;
      const out = [];
      // The stolen refresh token quietly renewing itself for days after.
      for (let d = 15; d < 20; d++) {
        for (let h = 0; h < 6; h++) {
          out.push(si("2026-07-" + d + "T" + String(h * 4).padStart(2, "0") + ":07:00Z", IP,
            "Nigeria", "Lagos", 0, "Mobile Apps and Desktop clients", "eM Reader Pro"));
        }
      }
      out.push(si("2026-07-16T02:05:00Z", IP, "Nigeria", "Lagos", 0, "Browser", "Microsoft SharePoint Online"));
      return (cachedNon = out);
    },
    risk: function () {
      return {
        users: [{ riskLevel: "high", riskState: "atRisk", riskLastUpdatedDateTime: "2026-07-15T03:16:00Z" }],
        detections: [
          { riskEventType: "unfamiliarFeatures", riskLevel: "medium", activityDateTime: "2026-07-15T03:15:00Z", ipAddress: IP },
          { riskEventType: "anonymizedIPAddress", riskLevel: "high", activityDateTime: "2026-07-15T03:16:00Z", ipAddress: IP },
          { riskEventType: "unlikelyTravel", riskLevel: "medium", activityDateTime: "2026-07-15T03:55:00Z", ipAddress: "84.83.10.25" }
        ]
      };
    },
    ual: function () {
      const out = [];
      // Bulk mailbox read - the exfiltration signal.
      for (let i = 0; i < 46; i++) {
        out.push(ual("2026-07-16T01:" + String(i % 60).padStart(2, "0") + ":00Z", "MailItemsAccessed",
          { MailAccessType: i < 6 ? "Sync" : "Bind",
            Folders: [{ Path: "\\Inbox", FolderItems: [{ InternetMessageId: "<m" + i + ">" }] }] }));
      }
      for (let i = 0; i < 130; i++) {
        out.push(ual("2026-07-16T02:" + String(i % 60).padStart(2, "0") + ":00Z", "FileDownloaded",
          { ObjectId: "https://contoso-demo.sharepoint.com/sites/finance/Shared Documents/doc" + i + ".xlsx" }));
      }
      for (let i = 0; i < 9; i++) {
        out.push(ual("2026-07-16T03:" + String(i * 5).padStart(2, "0") + ":00Z", "FileSyncDownloadedFull",
          { ObjectId: "https://contoso-demo-my.sharepoint.com/personal/jan_devries/Documents/hr" + i + ".docx" }));
      }
      out.push(ual("2026-07-15T04:10:00Z", "MessageSent", { ChatThreadId: "19:meeting" }));
      out.push(ual("2026-07-15T04:12:00Z", "MessagesListed", { ChatThreadId: "19:meeting" }));
      out.push(ual("2026-07-15T04:20:00Z", "TeamsSessionStarted", {}));
      return out.sort(function (a, b) { return b.createdDateTime.localeCompare(a.createdDateTime); });
    },
    audits: function () {
      return [
        audit("2026-07-15T03:50:00Z", "Add member to group", "Finance Approvers", "GroupManagement"),
        audit("2026-07-15T03:52:00Z", "Consent to application", "eM Reader Pro", "ApplicationManagement"),
        audit("2026-07-15T03:53:00Z", "Add service principal credentials", "Contoso Reporting Connector", "ApplicationManagement"),
        audit("2026-07-15T05:02:00Z", "Update user", "jan.devries@contoso-demo.com", "UserManagement")
      ];
    },
    grants: function () {
      return [
        { id: "grant-1", clientId: "6b1f0d11-2222-4a4a-9c9c-aaaa00000001", appName: "eM Reader Pro",
          consentType: "Principal", scope: "Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite offline_access" },
        { id: "grant-2", clientId: "0000000c-0000-0000-c000-000000000000", appName: "Microsoft App Access Panel",
          consentType: "AllPrincipals", scope: "User.Read" }
      ];
    },
    mailbox: function () {
      return { rules: [], forwarding: {} };   // the containment screen supplies the real staged mailbox
    }
  };
})();
