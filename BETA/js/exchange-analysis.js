(function () {
  "use strict";
  function analyze(ev) {
    const findings = [];
    const references = window.BETA_Evidence.referenceIndex(ev);
    for (const snapshot of ev.exchangeSnapshots || []) {
      const source = (k) =>
        snapshot.sources.find((s) => s.key === k)?.records || [];
      const add = (severity, title, detail) =>
        findings.push({
          Severity: severity,
          Analyzer: "ExchangeSnapshot",
          Title: title,
          Detail: detail,
          User: snapshot.upn,
          Timestamp: snapshot.capturedAt,
          _t: snapshot.capturedAt,
          Source: "exchange",
          Confidence: "Observed configuration; intent needs review",
          Mitre: "T1098",
          References: references([snapshot]),
          EvidenceWindow: ev.window ? { ...ev.window } : null,
        });
      for (const mb of source("mailbox")) {
        const forward = mb.ForwardingSmtpAddress || mb.ForwardingAddress;
        if (forward)
          add(
            "High",
            "Mailbox forwarding is configured",
            "Destination: " +
              JSON.stringify(forward) +
              ". Confirm that this is approved; configuration alone does not establish compromise.",
          );
        if (mb.AuditEnabled === false)
          add(
            "Medium",
            "Mailbox audit configuration needs review",
            "AuditEnabled is false. Verify organization-level auditing and effective audit coverage before drawing a conclusion.",
          );
      }
      for (const rule of source("rules")) {
        const targets = [
          ...(rule.ForwardTo || []),
          ...(rule.ForwardAsAttachmentTo || []),
          ...(rule.RedirectTo || []),
        ];
        if (rule.Enabled !== false && targets.length)
          add(
            "High",
            "Inbox rule forwards or redirects mail: " + rule.Name,
            JSON.stringify({
              identity: rule.Identity,
              targets,
              description: rule.Description,
            }),
          );
        else if (
          rule.Enabled !== false &&
          (rule.DeleteMessage || rule.MarkAsRead)
        )
          add(
            "Medium",
            "Inbox rule hides or deletes messages: " + rule.Name,
            JSON.stringify({
              identity: rule.Identity,
              description: rule.Description,
              deleteMessage: rule.DeleteMessage,
              markAsRead: rule.MarkAsRead,
            }),
          );
      }
      for (const r of source("auditBypass"))
        if (r.AuditBypassEnabled === true)
          add(
            "High",
            "Mailbox audit bypass is enabled",
            "Review the effective audit bypass for " + String(r.Identity),
          );
      // Folder permissions: Default/Anonymous with anything beyond None (calendar free/busy excepted)
      // exposes the mailbox to the whole organisation; named delegates on mail folders are listed.
      const folderRows = source("folderPermissions").filter((r) => r && !r.Error);
      const rightsOf = (r) => (Array.isArray(r.AccessRights) ? r.AccessRights : [r.AccessRights]).filter(Boolean).map(String);
      const userOf = (r) => String(r.User?.DisplayName ?? r.User?.UserPrincipalName ?? r.User ?? "");
      const open = folderRows.filter((r) => /^(Default|Anonymous)$/i.test(userOf(r)) && rightsOf(r).some((x) => !/^(None|AvailabilityOnly|LimitedDetails)$/i.test(x)));
      if (open.length)
        add(
          "Medium",
          "Mailbox folders readable by Default/Anonymous: " + open.length,
          JSON.stringify(open.map((r) => ({ folder: r.FolderPath, user: userOf(r), rights: rightsOf(r) }))),
        );
      const delegates = folderRows.filter((r) => !/^(Default|Anonymous)$/i.test(userOf(r)) && !/Calendar|Agenda|Kalender/i.test(String(r.FolderType || r.FolderPath)) && rightsOf(r).some((x) => /Owner|Editor|Author|Reviewer|Read/i.test(x)));
      if (delegates.length)
        add(
          "Info",
          "Folder-level delegates on mail folders: " + delegates.length,
          JSON.stringify(delegates.map((r) => ({ folder: r.FolderPath, user: userOf(r), rights: rightsOf(r) }))),
        );
      const unreadable = source("folderPermissions").filter((r) => r && r.Error).length;
      if (unreadable) add("Info", "Folder permissions not readable for " + unreadable + " folder(s)", "System folders that refuse Get-MailboxFolderPermission; listed with their error in the snapshot.");
      const perms = [
        ["fullAccess", "FullAccess", "User"],
        ["sendAs", "SendAs", "Trustee"],
        ["sendOnBehalf", "SendOnBehalf", "delegate"],
      ];
      for (const [key, label, user] of perms) {
        const rows = source(key).filter(
          (r) =>
            !r.Deny &&
            !r.IsInherited &&
            !/NT AUTHORITY\\SELF/i.test(String(r[user])),
        );
        if (rows.length)
          add(
            "Info",
            label + " delegation: " + rows.length + " assignment(s)",
            JSON.stringify(rows),
          );
      }
    }
    return findings;
  }
  window.BETA_ExchangeAnalysis = { analyze };
})();
