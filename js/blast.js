// ======================================================================
//  Blast-radius checks - the fifteen items, runnable.
//
//  Each check knows how to answer itself: from the triage evidence already
//  in memory, from a fresh Graph query, from the Unified Audit Log, or from
//  the Exchange backend. Two of the fifteen (Power Platform) have no API
//  this tool can reach, and say so plainly rather than pretending.
//
//  Every check returns the same shape:
//    { summary, count, rows[], raw, caveat }
//  so the containment screen can render, export and log it uniformly.
//
//  Read-only, all of it. Nothing in this file changes anything.
// ======================================================================
(function () {
  const G = window.TriageGraph, A = window.TRIAGE_AUTH;

  // Caches, so running all fifteen does not re-fetch the same pages.
  let cache = {};
  function reset() { cache = {}; }

  function iso(daysBack) { return new Date(Date.now() - daysBack * 864e5).toISOString(); }
  function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  function uniq(a) { return Array.from(new Set(a.filter(Boolean))); }
  function top(a, n) { return uniq(a).slice(0, n || 6); }
  function pct(part, whole) { return whole ? Math.round(100 * part / whole) + "%" : "0%"; }

  // ---------------------------------------------------------- data loaders --
  async function signIns(c, nonInteractive) {
    const key = nonInteractive ? "si-non" : "si-int";
    if (cache[key]) return cache[key];
    if (c.demo) return (cache[key] = window.TriageDemoBlast.signIns(nonInteractive));
    // Interactive sign-ins are what /auditLogs/signIns returns by default; the
    // non-interactive and service-principal ones need the beta event filter.
    let filter = "userPrincipalName eq " + q(c.target.userPrincipalName) +
      " and createdDateTime ge " + iso(c.days);
    if (nonInteractive) filter += " and (signInEventTypes/any(t: t eq 'nonInteractiveUser'))";
    const rows = await G.gall(A.graphBase + "/auditLogs/signIns?$top=500&$filter=" +
      encodeURIComponent(filter), 12);
    return (cache[key] = rows);
  }
  async function directoryAudits(c) {
    if (cache.audits) return cache.audits;
    if (c.demo) return (cache.audits = window.TriageDemoBlast.audits());
    // Reuse what triage already pulled when it covers the same window.
    if (c.evidence && (c.evidence.directoryAudits || []).length && c.evidence.days >= c.days)
      return (cache.audits = c.evidence.directoryAudits);
    const rows = await G.gall(A.graphV1 + "/auditLogs/directoryAudits?$top=500&$filter=" +
      encodeURIComponent("activityDateTime ge " + iso(c.days) +
        " and initiatedBy/user/userPrincipalName eq " + q(c.target.userPrincipalName)), 8);
    return (cache.audits = rows);
  }
  // Unified Audit Log. Expensive (async Microsoft query, minutes), so it is
  // shared by the three checks that need it and never run implicitly.
  function ualAvailable(c) {
    return !!(c.demo || cache.ual || (c.evidence && (c.evidence.ualRecords || []).length));
  }
  function ualRecords(c) {
    if (cache.ual) return cache.ual;
    if (c.demo) return (cache.ual = window.TriageDemoBlast.ual());
    return (c.evidence && c.evidence.ualRecords) || [];
  }
  async function loadUal(c, onStatus) {
    if (c.demo) { cache.ual = window.TriageDemoBlast.ual(); return cache.ual; }
    const recs = await G.ualQuery(c.target.userPrincipalName, iso(c.days), new Date().toISOString(), onStatus);
    cache.ual = recs.map(function (r) {
      return { createdDateTime: r.createdDateTime, operation: r.operation,
        userPrincipalName: r.userPrincipalName, auditData: r.auditData || {} };
    });
    return cache.ual;
  }
  function ualOps(c, re) {
    return ualRecords(c).filter(function (r) { return re.test(r.operation || ""); });
  }
  async function mailbox(c) {
    if (cache.mb) return cache.mb;
    if (c.demo) return (cache.mb = c.mailbox || window.TriageDemoBlast.mailbox());
    if (c.mailbox) return (cache.mb = c.mailbox);
    const B = window.TriageBackend;
    if (!B || !B.available()) throw new Error("Needs the Exchange backend, or check it in Exchange Online PowerShell.");
    const [r, f] = await Promise.all([
      B.rulesList(c.target.userPrincipalName), B.forwardingGet(c.target.userPrincipalName)]);
    return (cache.mb = { rules: r.rules || [], forwarding: f });
  }

  // ------------------------------------------------------------- the checks --
  // where  : where a human would look in the portal (kept for the manual path)
  // what   : what you are looking for
  // mode   : graph | ual | exo | manual
  // evid   : index in the evidence-preservation list this check's export covers
  const CHECKS = [
    {
      n: 1, key: "signin-interactive", title: "Sign-in logs (interactive)", mode: "graph", evid: 0,
      where: "Entra > Sign-in logs > Interactive",
      what: "Atypical travel, anonymous IPs, out-of-hours sign-ins, new user agents, failures followed by one success.",
      run: async function (c) {
        const rows = await signIns(c, false);
        const ok = rows.filter(function (r) { return (r.status || {}).errorCode === 0; });
        const countries = uniq(rows.map(function (r) { return (r.location || {}).countryOrRegion; }));
        const okCountries = uniq(ok.map(function (r) { return (r.location || {}).countryOrRegion; }));
        const odd = rows.filter(function (r) {
          const h = new Date(r.createdDateTime).getUTCHours();
          return (r.status || {}).errorCode === 0 && (h < 5 || h > 20);
        });
        const legacy = ok.filter(function (r) { return /SMTP|IMAP|POP|Exchange ActiveSync|Other clients/i.test(r.clientAppUsed || ""); });
        const risky = rows.filter(function (r) { return /high|medium/i.test(r.riskLevelDuringSignIn || ""); });
        return {
          count: rows.length, raw: rows,
          alert: okCountries.length > 1 || legacy.length > 0 || risky.length > 0,
          summary: rows.length + " interactive sign-ins, " + ok.length + " successful, from " +
            okCountries.length + " country/countries",
          rows: [
            ["Successful countries", okCountries.join(", ") || "—"],
            ["All countries seen", countries.join(", ") || "—"],
            ["Distinct IPs", uniq(rows.map(r => r.ipAddress)).length + " (" + top(rows.map(r => r.ipAddress), 4).join(", ") + ")"],
            ["Successes outside 05:00-20:00 UTC", odd.length],
            ["Successful legacy-auth sign-ins", legacy.length + (legacy.length ? " — " + top(legacy.map(r => r.clientAppUsed), 3).join(", ") : "")],
            ["Flagged risky at sign-in", risky.length],
            ["Failure rate", pct(rows.length - ok.length, rows.length)]
          ]
        };
      }
    },
    {
      n: 2, key: "signin-noninteractive", title: "Sign-in logs (non-interactive / SP)", mode: "graph", evid: 0,
      where: "Entra > Sign-in logs > Non-interactive, Service principal",
      what: "Tokens used by apps the user consented to; service principal activity tied to the user.",
      run: async function (c) {
        const rows = await signIns(c, true);
        const apps = {};
        rows.forEach(function (r) { const a = r.appDisplayName || r.appId || "?"; apps[a] = (apps[a] || 0) + 1; });
        const byApp = Object.keys(apps).sort(function (a, b) { return apps[b] - apps[a]; });
        return {
          count: rows.length, raw: rows,
          alert: uniq(rows.map(function (r) { return (r.location || {}).countryOrRegion; })).length > 1,
          summary: rows.length + " non-interactive sign-ins across " + byApp.length + " application(s)",
          caveat: "Non-interactive sign-ins are where a stolen refresh token keeps working after the user stops. " +
            "An app here that the user does not recognise is the same signal as an OAuth grant.",
          rows: byApp.slice(0, 8).map(function (a) { return [a, apps[a] + " token use(s)"]; })
            .concat([["Distinct IPs", uniq(rows.map(r => r.ipAddress)).length + " (" + top(rows.map(r => r.ipAddress), 4).join(", ") + ")"]])
        };
      }
    },
    {
      n: 3, key: "risky", title: "Risky users / risky sign-ins", mode: "graph", evid: 3,
      where: "Entra ID Protection",
      what: "Risk detections in the last 30 days - including the medium ones below the auto-block threshold.",
      run: async function (c) {
        let users, dets;
        if (c.demo) { const d = window.TriageDemoBlast.risk(); users = d.users; dets = d.detections; }
        else if (c.evidence && ((c.evidence.riskyUsers || []).length || (c.evidence.riskDetections || []).length)) {
          users = c.evidence.riskyUsers || []; dets = c.evidence.riskDetections || [];
        } else {
          const uq = q(c.target.userPrincipalName);
          users = await G.gall(A.graphV1 + "/identityProtection/riskyUsers?$filter=" +
            encodeURIComponent("userPrincipalName eq " + uq), 2);
          dets = await G.gall(A.graphV1 + "/identityProtection/riskDetections?$filter=" +
            encodeURIComponent("userPrincipalName eq " + uq), 4);
        }
        const u = users[0] || {};
        return {
          count: dets.length, raw: { riskyUsers: users, riskDetections: dets },
          alert: dets.length > 0 || /high|medium/i.test(u.riskLevel || ""),
          summary: (users.length ? "Risk level " + (u.riskLevel || "none") + " (" + (u.riskState || "?") + "), " : "Not listed as risky, ") +
            dets.length + " detection(s)",
          caveat: "A clean risk score is not a clean account - Identity Protection misses compromises that " +
            "use a clean IP and a previously seen user agent. Trust the sign-in pattern over the score.",
          rows: dets.slice(0, 10).map(function (d) {
            return [(d.activityDateTime || "").slice(0, 16).replace("T", " "),
              d.riskEventType + " · " + d.riskLevel + (d.ipAddress ? " · " + d.ipAddress : "")];
          })
        };
      }
    },
    {
      n: 4, key: "inbox-rules", title: "Inbox rules", mode: "exo", evid: 4,
      where: "Exchange Online PowerShell / Outlook",
      what: "Anything created in the incident window: redirect, move to Deleted Items, mark as read, external forward.",
      run: async function (c) {
        const mb = await mailbox(c);
        const rules = mb.rules || [];
        const bad = rules.filter(function (r) {
          return (r.forwardTo || []).length || (r.redirectTo || []).length ||
            (r.forwardAsAttachment || []).length || r.deleteMessage ||
            /deleted items|rss|junk|archive|conversation history/i.test(r.moveToFolder || "") ||
            (r.markAsRead && r.stopProcessingRules) || /^[.\s_-]{1,3}$/.test(r.name || "");
        });
        return {
          count: rules.length, raw: rules,
          alert: bad.length > 0,
          summary: rules.length + " rule(s), " + bad.length + " worth a second look",
          rows: rules.map(function (r) {
            const acts = [];
            if ((r.forwardTo || []).length) acts.push("forwards to " + r.forwardTo.join(", "));
            if ((r.redirectTo || []).length) acts.push("redirects to " + r.redirectTo.join(", "));
            if (r.moveToFolder) acts.push("moves to " + r.moveToFolder);
            if (r.deleteMessage) acts.push("deletes");
            if (r.markAsRead) acts.push("marks read");
            if (r.stopProcessingRules) acts.push("stops further rules");
            return [(bad.indexOf(r) >= 0 ? "⚠ " : "") + (r.name || "(unnamed)"), acts.join("; ") || "no visible action"];
          })
        };
      }
    },
    {
      n: 5, key: "forwarding", title: "Mailbox forwarding", mode: "exo", evid: 4,
      where: "Exchange Online: Get-Mailbox",
      what: "ForwardingAddress and ForwardingSmtpAddress - the SMTP field can point externally while the other is empty.",
      run: async function (c) {
        const mb = await mailbox(c);
        const f = mb.forwarding || {};
        const on = !!(f.forwardingAddress || f.forwardingSmtpAddress);
        return {
          count: on ? 1 : 0, raw: f, alert: on,
          summary: on ? "FORWARDING ACTIVE to " + (f.forwardingSmtpAddress || f.forwardingAddress)
                      : "No mailbox-level forwarding",
          rows: [
            ["ForwardingSmtpAddress", f.forwardingSmtpAddress || "—"],
            ["ForwardingAddress", f.forwardingAddress || "—"],
            ["DeliverToMailboxAndForward", String(!!f.deliverToMailboxAndForward) +
              (f.deliverToMailboxAndForward ? " — a copy stays in the mailbox, so the user notices nothing" : "")]
          ]
        };
      }
    },
    {
      n: 6, key: "mailitems", title: "Mailbox audit - MailItemsAccessed", mode: "ual", evid: 6,
      where: "Purview Audit (Unified Audit Log)",
      what: "Bulk read patterns; message IDs accessed in tight windows. This is the exfiltration signal.",
      run: async function (c) {
        const recs = ualOps(c, /^MailItemsAccessed$/i);
        let binds = 0, syncs = 0, ids = 0;
        const ips = [];
        recs.forEach(function (r) {
          const d = r.auditData || {};
          if (/sync/i.test(d.OperationProperties ? JSON.stringify(d.OperationProperties) : "") || d.MailAccessType === "Sync") syncs++;
          else binds++;
          if (d.ClientIP) ips.push(d.ClientIP);
          ids += ((d.Folders || []).reduce(function (s, f) { return s + ((f.FolderItems || []).length); }, 0)) || 0;
        });
        return {
          count: recs.length, raw: recs,
          alert: syncs > 0 || recs.length > 20,
          summary: recs.length + " MailItemsAccessed events (" + binds + " bind, " + syncs + " sync)" +
            (ids ? ", " + ids + " message(s) touched" : ""),
          caveat: syncs ? "A sync operation means a whole folder was pulled down, not individual messages - " +
            "treat it as the entire folder being read." : "",
          rows: [["Bind (individual messages)", binds], ["Sync (whole folder)", syncs],
            ["Distinct client IPs", uniq(ips).length + (ips.length ? " — " + top(ips, 4).join(", ") : "")],
            ["First", (recs.length ? recs[recs.length - 1].createdDateTime : "—")],
            ["Last", (recs.length ? recs[0].createdDateTime : "—")]]
        };
      }
    },
    {
      n: 7, key: "spo", title: "SharePoint & OneDrive activity", mode: "ual", evid: 1,
      where: "Purview Audit: FileDownloaded, FileSyncDownloadedFull, FileAccessedExtended",
      what: "Sites the user never touched, volume downloads, sync from unusual devices.",
      run: async function (c) {
        const recs = ualOps(c, /^(FileDownloaded|FileSyncDownloadedFull|FileAccessedExtended|FileAccessed|FileCopied)$/i);
        const sites = uniq(recs.map(function (r) {
          const u = (r.auditData || {}).ObjectId || "";
          const m = /^https?:\/\/[^/]+\/[^/]+\/[^/]+/.exec(u);
          return m ? m[0] : "";
        }));
        // Busiest hour: a hundred downloads in one hour is not a person working.
        const hours = {};
        recs.forEach(function (r) { const h = (r.createdDateTime || "").slice(0, 13); hours[h] = (hours[h] || 0) + 1; });
        const peak = Object.keys(hours).sort(function (a, b) { return hours[b] - hours[a]; })[0];
        return {
          count: recs.length, raw: recs,
          alert: recs.length > 50 || (peak && hours[peak] > 25),
          summary: recs.length + " file event(s) across " + sites.length + " site/library location(s)" +
            (peak ? ", busiest hour " + peak.replace("T", " ") + ":00 with " + hours[peak] : ""),
          rows: sites.slice(0, 8).map(function (s) {
            return [s, recs.filter(function (r) { return ((r.auditData || {}).ObjectId || "").indexOf(s) === 0; }).length + " event(s)"];
          })
        };
      }
    },
    {
      n: 8, key: "teams", title: "Teams activity", mode: "ual", evid: 1,
      where: "Purview Audit: Teams activities",
      what: "Chats with external tenants, files shared in 1:1 chats, channel posts during the window.",
      run: async function (c) {
        const recs = ualOps(c, /(Teams|MessageSent|MessagesListed|ChatCreated|MemberAdded|MessageCreatedHasLink)/i);
        const ops = {};
        recs.forEach(function (r) { ops[r.operation] = (ops[r.operation] || 0) + 1; });
        return {
          count: recs.length, raw: recs,
          summary: recs.length + " Teams event(s)",
          rows: Object.keys(ops).sort(function (a, b) { return ops[b] - ops[a]; })
            .slice(0, 10).map(function (o) { return [o, ops[o]]; })
        };
      }
    },
    {
      n: 9, key: "oauth", title: "OAuth consent grants", mode: "graph", evid: 5,
      where: "Entra > Enterprise applications > User consent",
      what: "Recently consented apps; Mail.ReadWrite / Files.ReadWrite.All / offline_access is the phishing pattern.",
      run: async function (c) {
        let grants;
        if (c.demo) grants = window.TriageDemoBlast.grants();
        else if (c.grants && c.grants.length) grants = c.grants;
        else if (c.evidence && (c.evidence.oauthGrants || []).length) grants = c.evidence.oauthGrants;
        else grants = await G.gall(A.graphV1 + "/users/" +
          encodeURIComponent(c.target.id || c.target.userPrincipalName) + "/oauth2PermissionGrants", 4);
        const RISKY = ["mail.read", "mail.readwrite", "mail.send", "mailboxsettings.readwrite",
          "files.read.all", "files.readwrite.all", "sites.readwrite.all", "offline_access",
          "directory.readwrite.all", "user.readwrite.all", "application.readwrite.all"];
        const scored = grants.map(function (g) {
          const sc = (g.scope || "").trim().split(/\s+/).filter(Boolean);
          return { g: g, risky: sc.filter(function (s) { return RISKY.indexOf(s.toLowerCase()) >= 0; }) };
        });
        const hot = scored.filter(function (s) { return s.risky.length >= 2; });
        return {
          count: grants.length, raw: grants,
          alert: hot.length > 0,
          summary: grants.length + " grant(s), " + hot.length + " with two or more risky scopes",
          caveat: "Tenant-wide (admin-consented) grants do not appear in this per-user list - check Entra > " +
            "Enterprise applications for those.",
          rows: scored.map(function (s) {
            return [(s.risky.length >= 2 ? "⚠ " : "") + (s.g.appName || s.g.clientId),
              (s.g.consentType === "AllPrincipals" ? "[tenant-wide] " : "") + (s.g.scope || "")];
          })
        };
      }
    },
    {
      n: 10, key: "flows", title: "Power Automate flows", mode: "manual",
      where: "Power Platform admin centre > Environments > Flows by owner",
      what: "The most overlooked exfiltration channel. Flows that mail externally or write to SharePoint.",
      why: "The Power Platform admin API is not reachable with the delegated Graph permissions this tool holds, " +
        "and consenting to it would widen the tool's access well beyond incident response. Check it in the portal " +
        "or with the Power Platform PowerShell module.",
      ps: "Install-Module Microsoft.PowerApps.Administration.PowerShell -Scope CurrentUser\n" +
          "Add-PowerAppsAccount\n" +
          "Get-AdminFlow -CreatedBy (Get-UsersOrGroupsFromGraph -SearchString '{UPN}').ObjectId |\n" +
          "  Select-Object DisplayName, Enabled, CreatedTime, FlowName"
    },
    {
      n: 11, key: "powerapps", title: "Power Apps owned", mode: "manual",
      where: "Power Platform admin centre > Environments > Apps by owner",
      what: "Quick sweep for any account that has touched Power Platform.",
      why: "Same reason as the flows check - no Graph API, and the Power Platform scopes are too broad to justify here.",
      ps: "Get-AdminPowerApp -Owner (Get-UsersOrGroupsFromGraph -SearchString '{UPN}').ObjectId |\n" +
          "  Select-Object DisplayName, CreatedTime, AppName"
    },
    {
      n: 12, key: "groups", title: "Group membership changes", mode: "graph", evid: 1,
      where: "Entra > Audit logs > 'Member Added'",
      what: "Privileged groups, distribution lists with mailbox access, sensitive Teams.",
      run: async function (c) {
        const a = await directoryAudits(c);
        const rows = a.filter(function (r) { return /member|group|role/i.test(r.activityDisplayName || ""); });
        return {
          count: rows.length, raw: rows,
          alert: rows.length > 0,
          summary: rows.length + " group/role change(s) initiated by this account",
          caveat: "This lists changes this account MADE. Changes made TO it by someone else are not filterable " +
            "per-user in Graph - check Entra audit logs targeted on the user for those.",
          rows: rows.slice(0, 10).map(function (r) {
            return [(r.activityDateTime || "").slice(0, 16).replace("T", " "),
              r.activityDisplayName + " → " + ((r.targetResources || [])[0] || {}).displayName];
          })
        };
      }
    },
    {
      n: 13, key: "sp-creds", title: "Service principals the user could edit", mode: "graph", evid: 1,
      where: "Entra > Audit logs > service principal actions",
      what: "New credentials added to an existing service principal during the window - admin-level persistence.",
      run: async function (c) {
        const a = await directoryAudits(c);
        const rows = a.filter(function (r) {
          return /application|service principal|credential|certificate|secret/i.test(
            (r.activityDisplayName || "") + " " + (r.category || ""));
        });
        const creds = rows.filter(function (r) { return /credential|secret|certificate|key/i.test(r.activityDisplayName || ""); });
        return {
          count: rows.length, raw: rows,
          alert: creds.length > 0,
          summary: rows.length + " application/service-principal event(s), " + creds.length + " involving credentials",
          caveat: creds.length ? "Credentials added to a service principal outlive every user-level containment " +
            "step you have taken. Treat each one as a separate incident." : "",
          rows: rows.slice(0, 10).map(function (r) {
            return [(r.activityDateTime || "").slice(0, 16).replace("T", " "),
              (creds.indexOf(r) >= 0 ? "⚠ " : "") + r.activityDisplayName + " → " +
              (((r.targetResources || [])[0] || {}).displayName || "")];
          })
        };
      }
    },
    {
      n: 14, key: "new-users", title: "New user creation", mode: "graph", evid: 1,
      where: "Entra > Audit logs > 'Add user'",
      what: "If the account could create users, this is where the second account is hiding.",
      run: async function (c) {
        const a = await directoryAudits(c);
        const rows = a.filter(function (r) { return /add user|invite|create user/i.test(r.activityDisplayName || ""); });
        return {
          count: rows.length, raw: rows,
          alert: rows.length > 0,
          summary: rows.length ? "⚠ " + rows.length + " account(s) created or invited by this user" :
            "No accounts created by this user in the window",
          rows: rows.slice(0, 10).map(function (r) {
            return [(r.activityDateTime || "").slice(0, 16).replace("T", " "),
              r.activityDisplayName + " → " + (((r.targetResources || [])[0] || {}).userPrincipalName ||
                ((r.targetResources || [])[0] || {}).displayName || "")];
          })
        };
      }
    },
    {
      n: 15, key: "ca-policy", title: "Conditional Access policy edits", mode: "graph", evid: 1,
      where: "Entra > Audit logs > 'Update conditional access policy'",
      what: "If the account held Security or CA Administrator: was a policy edited or disabled?",
      run: async function (c) {
        const a = await directoryAudits(c);
        const rows = a.filter(function (r) {
          return /conditional access|named location|authentication method policy|security defaults/i
            .test(r.activityDisplayName || "");
        });
        return {
          count: rows.length, raw: rows,
          alert: rows.length > 0,
          summary: rows.length ? "⚠ " + rows.length + " Conditional Access change(s) by this account" :
            "No Conditional Access changes by this account",
          caveat: rows.length ? "Check whether an MFA-required policy was weakened or scoped away from an account - " +
            "that is the change attackers make and nobody notices." : "",
          rows: rows.slice(0, 10).map(function (r) {
            return [(r.activityDateTime || "").slice(0, 16).replace("T", " "),
              r.activityDisplayName + " → " + (((r.targetResources || [])[0] || {}).displayName || "")];
          })
        };
      }
    }
  ];

  window.TriageBlast = {
    checks: CHECKS,
    reset: reset,
    ualAvailable: ualAvailable,
    loadUal: loadUal
  };
})();
