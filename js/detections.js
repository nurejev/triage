// Detection rules - the analysis engine. Pure functions: evidence in, findings out.
(function () {
  const SEV_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

  function fmtTime(t) {
    if (!t) return "";
    const d = new Date(t);
    if (isNaN(d)) return "";
    return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
  function uniq(arr) { return Array.from(new Set(arr.filter(Boolean))); }

  function analyze(ev) {
    const F = [];
    function add(sev, cat, title, detail, ts, rec, src) {
      F.push({ Severity: sev, Category: cat, Title: title, Detail: detail,
               User: ev.upn, Timestamp: fmtTime(ts), _t: ts || "", Source: src || "", Recommendation: rec || "" });
    }

    // ================= sign-ins =================
    const si = (ev.signIns || []).map(function (r) {
      return {
        time: r.createdDateTime, ip: r.ipAddress,
        country: (r.location && r.location.countryOrRegion) || "",
        city: (r.location && r.location.city) || "",
        err: (r.status && r.status.errorCode) || 0,
        app: r.appDisplayName || "", client: r.clientAppUsed || "",
        ca: r.conditionalAccessStatus || "",
        risk: r.riskLevelDuringSignIn || r.riskLevelAggregated || "none",
        os: (r.deviceDetail && r.deviceDetail.operatingSystem) || ""
      };
    });
    const ok = si.filter(function (s) { return s.err === 0; });
    const bad = si.filter(function (s) { return s.err !== 0; });

    // baseline: user's most common sign-in country
    const cc = {};
    ok.forEach(function (s) { if (s.country) cc[s.country] = (cc[s.country] || 0) + 1; });
    const home = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a]; })[0] || null;

    if (home) {
      const foreign = {};
      ok.forEach(function (s) {
        if (s.country && s.country !== home) (foreign[s.country] = foreign[s.country] || []).push(s);
      });
      Object.keys(foreign).forEach(function (c) {
        const g = foreign[c];
        add("High", "Sign-ins", "Successful sign-in from unexpected country: " + c,
          g.length + " successful sign-in(s) from " + c + " (usual country: " + home + "). IPs: " +
          uniq(g.map(function (s) { return s.ip; })).slice(0, 5).join(", ") +
          ". Apps: " + uniq(g.map(function (s) { return s.app; })).slice(0, 3).join(", ") + ".",
          g[0].time,
          "Verify with the user. If not recognized: reset password, revoke sessions, review mailbox rules and MFA methods.",
          "Entra ID sign-in logs");
      });
    }

    // brute force / spray -> success per IP
    const failByIp = {};
    bad.forEach(function (s) { if (s.ip) (failByIp[s.ip] = failByIp[s.ip] || []).push(s); });
    Object.keys(failByIp).forEach(function (ip) {
      const fails = failByIp[ip];
      if (fails.length < 10) return;
      const successFromIp = ok.filter(function (s) { return s.ip === ip; });
      if (successFromIp.length) {
        add("Critical", "Sign-ins", "Password attack followed by successful sign-in (IP " + ip + ")",
          fails.length + " failed sign-ins from " + ip + " followed by a SUCCESSFUL sign-in. Strong indicator of account compromise.",
          successFromIp[0].time,
          "Treat as compromised: reset password, revoke sessions and refresh tokens, block the IP, review everything this account did afterwards.",
          "Entra ID sign-in logs");
      } else {
        add("Medium", "Sign-ins", "Brute force / password spray attempts (IP " + ip + ")",
          fails.length + " failed sign-ins from " + ip + ". No success from this IP in the period.",
          fails[0].time,
          "Confirm smart lockout / CA protections. Consider blocking the IP.",
          "Entra ID sign-in logs");
      }
    });

    // legacy auth
    const legacy = ok.filter(function (s) {
      return s.client && !/^(Browser|Mobile Apps and Desktop clients)/i.test(s.client);
    });
    if (legacy.length) {
      add("High", "Sign-ins", "Successful legacy authentication sign-in",
        legacy.length + " sign-in(s) using legacy protocols (" + uniq(legacy.map(function (s) { return s.client; })).join(", ") +
        "). Legacy auth bypasses MFA and is a common BEC entry point.",
        legacy[0].time,
        "Block legacy authentication with Conditional Access; investigate whether these sign-ins were attacker activity.",
        "Entra ID sign-in logs");
    }

    // impossible travel
    const seq = ok.filter(function (s) { return s.country && s.time; })
      .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      if (a.country !== b.country) {
        const dh = (new Date(b.time) - new Date(a.time)) / 36e5;
        if (dh >= 0 && dh <= 2) {
          add("High", "Sign-ins", "Impossible travel between sign-ins",
            "Signed in from " + a.country + " and then " + b.country + " within " + dh.toFixed(1) +
            " hours (IPs " + a.ip + " → " + b.ip + ").",
            b.time,
            "Verify whether one location is a VPN/proxy. If not explainable, treat the account as compromised.",
            "Entra ID sign-in logs");
          break;
        }
      }
    }

    // risky sign-ins
    const risky = si.filter(function (s) { return s.risk && s.risk !== "none"; });
    if (risky.length) {
      const worst = risky.some(function (s) { return /high/i.test(s.risk); }) ? "High" : "Medium";
      add(worst, "Sign-ins", "Sign-ins flagged as risky by Identity Protection",
        risky.length + " sign-in(s) with risk level(s): " + uniq(risky.map(function (s) { return s.risk; })).join(", ") + ".",
        risky[0].time,
        "Review the detections; confirm or dismiss risk in Entra ID Protection after investigation.",
        "Entra ID sign-in logs");
    }

    // ================= Unified Audit Log =================
    const NOTABLE = {
      "New-InboxRule": ["High", "An inbox rule was created."],
      "Set-InboxRule": ["High", "An inbox rule was modified."],
      "UpdateInboxRules": ["High", "Inbox rules updated via an Outlook client - the operation attackers trigger when adding hiding rules."],
      "Remove-InboxRule": ["Medium", "An inbox rule was removed (possibly attacker cleanup)."],
      "Add-MailboxPermission": ["High", "A mailbox permission (e.g. FullAccess) was granted."],
      "Add-RecipientPermission": ["High", "SendAs permission was granted."],
      "Add member to role.": ["High", "A user was added to an admin role."],
      "Consent to application.": ["High", "OAuth consent was granted to an application."],
      "Add service principal credentials.": ["High", "Credentials added to a service principal - a persistence technique."],
      "Disable Strong Authentication.": ["Critical", "MFA was disabled for a user."],
      "New-TransportRule": ["High", "A tenant-wide transport rule was created."],
      "Set-TransportRule": ["High", "A tenant-wide transport rule was modified."],
      "SearchQueryInitiatedExchange": ["Low", "Mailbox search performed - attackers search for \"invoice\", \"payment\", \"IBAN\"."],
      "New-ComplianceSearch": ["Medium", "A compliance/eDiscovery search was created."],
      "AnonymousLinkCreated": ["Medium", "An anonymous sharing link was created in SharePoint/OneDrive."],
      "HardDelete": ["Low", "Items hard-deleted from the mailbox."]
    };
    const hits = {};
    const downloads = [];
    (ev.ualRecords || []).forEach(function (r) {
      const ad = r.auditData || {};
      const op = r.operation || ad.Operation || "";
      const t = r.createdDateTime || ad.CreationTime || "";
      const ip = ad.ClientIP || ad.ClientIPAddress || ad.ActorIpAddress || "";
      let extra = "";
      if (Array.isArray(ad.Parameters)) {
        extra = ad.Parameters.filter(function (p) {
          return /forward|redirect|delete|name|identity|accessrights|trustee|user|query/i.test(p.Name || "");
        }).slice(0, 4).map(function (p) { return p.Name + "=" + p.Value; }).join("; ");
      }
      if (!extra && ad.ObjectId) extra = String(ad.ObjectId);

      if (op === "Set-Mailbox" && /forward/i.test(extra)) {
        add("Critical", "Audit log", "Mailbox-level forwarding configured (Set-Mailbox)",
          "Set-Mailbox from IP " + ip + " with parameters: " + extra,
          t,
          "Mailbox-level forwarding survives inbox-rule cleanup. Remove ForwardingSmtpAddress and investigate the actor.",
          "Unified Audit Log");
        return;
      }
      if (op === "New-InboxRule" || op === "Set-InboxRule") {
        if (/forward|redirect/i.test(extra)) {
          add("Critical", "Audit log", "Inbox rule with forwarding created (" + op + ")",
            op + " from IP " + ip + ": " + extra,
            t,
            "Classic BEC persistence. Remove the rule, reset the account, check what mail left the tenant.",
            "Unified Audit Log");
          return;
        }
      }
      if (/^(FileDownloaded|FileSyncDownloadedFull)$/.test(op)) { downloads.push(t); return; }
      if (NOTABLE[op]) (hits[op] = hits[op] || []).push({ t: t, ip: ip, extra: extra });
    });
    Object.keys(hits).forEach(function (op) {
      const h = hits[op];
      const meta = NOTABLE[op];
      const ex = h.slice(0, 3).map(function (x) {
        return (x.t ? x.t.slice(5, 16).replace("T", " ") : "") + " " + (x.extra || "");
      }).join(" | ");
      add(meta[0], "Audit log", "Audit log: " + op + " (" + h.length + "x)",
        h.length + " occurrence(s). " + meta[1] + " IPs: " + uniq(h.map(function (x) { return x.ip; })).slice(0, 4).join(", ") +
        ". Examples: " + ex,
        h[0].t,
        "Review each occurrence; correlate the IPs with the sign-in findings.",
        "Unified Audit Log");
    });
    // mass downloads per hour
    const byHour = {};
    downloads.forEach(function (t) {
      if (!t) return;
      const h = t.slice(0, 13);
      byHour[h] = (byHour[h] || 0) + 1;
    });
    Object.keys(byHour).forEach(function (h) {
      if (byHour[h] >= 100) {
        add("High", "Audit log", "Mass file download detected",
          byHour[h] + " files downloaded within one hour (" + h.replace("T", " ") + ":00). Possible data exfiltration.",
          h + ":00:00Z",
          "Review which files were taken and from where (IP / user agent in the raw events).",
          "Unified Audit Log");
      }
    });

    // ================= OAuth grants =================
    const RISKY_SCOPES = [
      [/full_access_as_app|EWS\.AccessAsUser/i, "full mailbox access via EWS", "Critical"],
      [/Mail\.ReadWrite|Mail\.Send/i, "read/write or send mail", "Critical"],
      [/Mail\.Read(?!Write)|Mail\.ReadBasic/i, "read mail", "High"],
      [/MailboxSettings\.ReadWrite/i, "modify mailbox settings (rules!)", "High"],
      [/Directory\.ReadWrite\.All|RoleManagement\.ReadWrite/i, "write to the directory", "Critical"],
      [/AppRoleAssignment\.ReadWrite\.All|Application\.ReadWrite\.All/i, "manage app permissions (privilege escalation)", "Critical"],
      [/Files\.ReadWrite\.All|Sites\.ReadWrite\.All|Sites\.FullControl/i, "full file access", "High"],
      [/User\.ReadWrite\.All/i, "modify all user accounts", "High"]
    ];
    (ev.oauthGrants || []).forEach(function (g) {
      const scope = g.scope || "";
      const matched = [];
      let worst = null;
      RISKY_SCOPES.forEach(function (rs) {
        if (rs[0].test(scope)) {
          matched.push(rs[1]);
          if (!worst || SEV_RANK[rs[2]] < SEV_RANK[worst]) worst = rs[2];
        }
      });
      if (!matched.length) return;
      add(worst, "OAuth apps", "App '" + (g.appName || g.clientId) + "' holds risky permissions",
        "Application '" + (g.appName || "?") + "' granted " + (g.consentType === "AllPrincipals" ? "tenant-wide" : "for this user") +
        ": can " + matched.join(", ") + ". Raw scope: " + scope,
        g.createdDateTime,
        "Verify this app is known and sanctioned. Malicious OAuth apps survive password resets - if unknown, revoke the grant and disable the service principal.",
        "OAuth permission grants");
    });

    // ================= MFA =================
    if (ev.authMethods && ev.authMethods.loaded) {
      const strong = (ev.authMethods.methods || []).filter(function (m) {
        return /(microsoftAuthenticator|fido2|windowsHello|softwareOath|phone|temporaryAccessPass)/i.test(m["@odata.type"] || "");
      });
      if (!strong.length) {
        add("High", "Account", "No MFA methods registered",
          "This account has no strong authentication methods registered - only a password protects it.",
          null,
          "Register MFA (preferably phishing-resistant) and require it via Conditional Access.",
          "Authentication methods");
      } else {
        add("Info", "Account", "MFA methods registered: " +
          uniq(strong.map(function (m) { return (m["@odata.type"] || "").replace("#microsoft.graph.", "").replace("AuthenticationMethod", ""); })).join(", "),
          "Verify the user recognizes each method - attackers add their own authenticator after a takeover.",
          null,
          "Ask the user to confirm every registered method and device.",
          "Authentication methods");
      }
    }

    // ================= Identity Protection =================
    (ev.riskyUsers || []).forEach(function (r) {
      if (/dismissed|remediated/i.test(r.riskState || "")) return;
      const sev = /high/i.test(r.riskLevel || "") ? "Critical" : (/low/i.test(r.riskLevel || "") ? "Low" : "Medium");
      add(sev, "Identity Protection", "Risky user: " + (r.riskLevel || "?") + " (" + (r.riskState || "?") + ")",
        "Entra ID Protection marks this account as risk level '" + r.riskLevel + "', state '" + r.riskState + "'.",
        r.riskLastUpdatedDateTime,
        "Investigate the underlying detections; reset credentials and confirm-compromised or dismiss as appropriate.",
        "Identity Protection");
    });
    if ((ev.riskDetections || []).length) {
      const d = ev.riskDetections;
      const sev = d.some(function (x) { return /high/i.test(x.riskLevel || ""); }) ? "High" : "Medium";
      add(sev, "Identity Protection", "Risk detections (" + d.length + ")",
        uniq(d.map(function (x) { return x.riskEventType; })).join(", ") +
        " (levels: " + uniq(d.map(function (x) { return x.riskLevel; })).join(", ") + ")",
        d[0].activityDateTime,
        "Correlate with the sign-in findings; unfamiliar-sign-in and anonymous-IP detections often accompany real compromise.",
        "Identity Protection");
    }

    // ================= profile =================
    const u = ev.user || {};
    if (u.lastPasswordChangeDateTime) {
      const age = (Date.now() - new Date(u.lastPasswordChangeDateTime)) / 864e5;
      if (age > 730) {
        add("Low", "Account", "Password older than 2 years",
          "Last password change: " + u.lastPasswordChangeDateTime.slice(0, 10) + ".",
          null,
          "Old, possibly-reused passwords raise credential-stuffing risk where MFA is absent.",
          "User profile");
      }
    }
    if (u.accountEnabled === false) {
      add("Info", "Account", "Account is disabled",
        "The account is currently disabled in Entra ID.", null, "", "User profile");
    }

    F.sort(function (a, b) {
      const d = SEV_RANK[a.Severity] - SEV_RANK[b.Severity];
      if (d) return d;
      return (b._t || "") < (a._t || "") ? -1 : 1;
    });
    return F;
  }

  window.TriageDetections = { analyze: analyze, SEV_RANK: SEV_RANK };
})();
