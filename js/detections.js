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

  // Same labels as the containment runbook's "Load authentication methods", so
  // the report and the runbook describe the account in the same words.
  const METHOD_LABELS = {
    "#microsoft.graph.phoneAuthenticationMethod": "Phone",
    "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod": "Microsoft Authenticator",
    "#microsoft.graph.fido2AuthenticationMethod": "FIDO2 / passkey",
    "#microsoft.graph.softwareOathAuthenticationMethod": "Software OATH token",
    "#microsoft.graph.temporaryAccessPassAuthenticationMethod": "Temporary Access Pass",
    "#microsoft.graph.emailAuthenticationMethod": "Email (SSPR)",
    "#microsoft.graph.windowsHelloForBusinessAuthenticationMethod": "Windows Hello for Business",
    "#microsoft.graph.passwordlessMicrosoftAuthenticatorAuthenticationMethod": "Passwordless Authenticator",
    "#microsoft.graph.platformCredentialAuthenticationMethod": "Platform credential",
    "#microsoft.graph.passwordAuthenticationMethod": "Password"
  };
  function methodLabel(m) {
    return METHOD_LABELS[m["@odata.type"]] ||
      (m["@odata.type"] || "unknown").replace("#microsoft.graph.", "").replace("AuthenticationMethod", "");
  }
  function methodLine(m) {
    const det = m.phoneNumber || m.emailAddress || m.displayName || m.deviceTag || m.model ||
      (m.lifetimeInMinutes ? "TAP, " + m.lifetimeInMinutes + " min" : "");
    const created = (m.createdDateTime || "").slice(0, 10);
    return "• " + methodLabel(m) + (det ? " — " + det : "") + (created ? " · registered " + created : "");
  }

  function analyze(ev) {
    const seen=new Set();
    const uniqueSigns=(ev.signIns||[]).filter(r=>{const key=r.id||JSON.stringify(r);if(seen.has(key))return false;seen.add(key);return true;});
    const F = [];
    function add(sev, cat, title, detail, ts, rec, src) {
      F.push({ Confidence:"Signal requires analyst review", Severity: sev, Category: cat, Title: title, Detail: detail,
               User: ev.upn, Timestamp: fmtTime(ts), _t: ts || "", Source: src || "", Recommendation: rec || "" });
    }

    // ================= sign-ins =================
    const owned = (r) => (r.userPrincipalName && String(r.userPrincipalName).toLowerCase() === String(ev.upn).toLowerCase()) || (ev.user?.id && r.userId === ev.user.id);
    const si = uniqueSigns.filter(owned).map(function (r) {
      return {
        time: r.createdDateTime, ip: r.ipAddress,
        country: (r.location && r.location.countryOrRegion) || "",
        city: (r.location && r.location.city) || "",
        err: Number.isInteger(r.status?.errorCode) ? r.status.errorCode : null,
        app: r.appDisplayName || "", client: r.clientAppUsed || "",
        ca: r.conditionalAccessStatus || "",
        risk: r.riskLevelDuringSignIn || r.riskLevelAggregated || "none",
        os: (r.deviceDetail && r.deviceDetail.operatingSystem) || ""
      };
    });
    const ok = si.filter(function (s) { return s.err === 0; });
    const bad = si.filter(function (s) { return s.err !== null && s.err !== 0; });

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
      const successFromIp = ok.filter(function (s) {
        if(s.ip !== ip) return false;
        const t=Date.parse(s.time);
        return fails.filter(f=>Date.parse(f.time)<=t && t-Date.parse(f.time)<=3600000).length >= 10;
      });
      if (successFromIp.length) {
        add("Critical", "Sign-ins", "Password attack followed by successful sign-in (IP " + ip + ")",
          fails.length + " failed sign-ins from " + ip + " followed by a SUCCESSFUL sign-in. Correlate with the user, device and session before confirming compromise.",
          successFromIp[0].time,
          "Treat as compromised: reset password, revoke sessions and refresh tokens, block the IP, review everything this account did afterwards.",
          "Entra ID sign-in logs");
      } else {
        add("Medium", "Sign-ins", "Brute force / password spray attempts (IP " + ip + ")",
          fails.length + " failed sign-ins from " + ip + ". No qualifying failure sequence followed by success within one hour.",
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
          add("Medium", "Sign-ins", "Rapid country change between sign-ins",
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
    const risky = si.filter(function (s) { return /^(low|medium|high)$/i.test(s.risk); });
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

    // ---- Severity context --------------------------------------------------
    // A bare operation name is not a severity. "Consent to application." is
    // routine tenant administration when an admin grants it, and a red flag
    // when a user grants two or more risky scopes to an unknown app. Same for
    // actor: service-side events cannot be evidence of account compromise.

    // Graph /security/auditLog records return userType as a string enum;
    // Extractor-Suite imports carry the raw numeric UAL UserType. Accept both.
    const NON_HUMAN_TYPES = ["system", "application", "serviceprincipal", "custompolicy", "systempolicy"];
    const NON_HUMAN_CODES = [4, 5, 6, 7, 8];

    // Shared by the consent severity logic below and the OAuth grants section.
    // One definition of "risky scope" for both, so a scope cannot be Critical
    // in one part of the report and unremarkable in another.
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

    function userTypeOf(r, ad) {
      const v = (r.userType !== undefined && r.userType !== null && r.userType !== "")
        ? r.userType : ad.UserType;
      return (v === undefined || v === null) ? "" : String(v);
    }
    function isNonHuman(r, ad) {
      const v = userTypeOf(r, ad);
      if (v === "") return false;
      if (/^\d+$/.test(v)) return NON_HUMAN_CODES.indexOf(parseInt(v, 10)) >= 0;
      return NON_HUMAN_TYPES.indexOf(v.toLowerCase()) >= 0;
    }
    // ConsentContext.IsAdminConsent and ConsentAction.Permissions live in
    // ModifiedProperties on Entra records and ExtendedProperties on some
    // workloads. Check both rather than assuming a shape.
    function auditProp(ad, name) {
      const bags = [ad.ModifiedProperties, ad.ExtendedProperties];
      for (let i = 0; i < bags.length; i++) {
        const bag = bags[i];
        if (!Array.isArray(bag)) continue;
        for (let j = 0; j < bag.length; j++) {
          if (bag[j] && bag[j].Name === name) {
            const v = bag[j].NewValue !== undefined ? bag[j].NewValue : bag[j].Value;
            if (v !== undefined && v !== null) return String(v);
          }
        }
      }
      return "";
    }
    function ualSeverity(op, r, ad) {
      const base = NOTABLE[op] ? NOTABLE[op][0] : "Info";
      if (isNonHuman(r, ad)) {
        return { sev: "Info", why: "non-human actor (userType " + userTypeOf(r, ad) + ")" };
      }
      if (op === "Consent to application.") {
        if (/true/i.test(auditProp(ad, "ConsentContext.IsAdminConsent"))) {
          return { sev: "Info", why: "tenant-wide admin consent - the grant lives on the service principal, review under Entra > Enterprise applications" };
        }
        const scopes = auditProp(ad, "ConsentAction.Permissions");
        const matched = [];
        let worstScope = null;
        RISKY_SCOPES.forEach(function (rs) {
          if (rs[0].test(scopes)) {
            matched.push(rs[1]);
            if (!worstScope || SEV_RANK[rs[2]] < SEV_RANK[worstScope]) worstScope = rs[2];
          }
        });
        if (matched.length) {
          return { sev: worstScope, why: "user-consented app granted " + matched.join(", ") };
        }
        if (scopes) return { sev: "Low", why: "user consent, no risky scopes requested" };
        return { sev: "Low", why: "user consent, scopes not recorded in the audit entry" };
      }
      return { sev: base, why: "" };
    }
    const SEV_NAMES = ["Critical", "High", "Medium", "Low", "Info"];

    // ---- Actor guard -------------------------------------------------------
    // Never attribute a record to this account unless the account is the ACTOR.
    // The UAL query is server-side filtered, but a filter that silently stops
    // applying returns tenant-wide data that would otherwise be rendered as
    // "this account did X". Verify per record rather than trusting the fetch.
    const subject = String(ev.upn || "").toLowerCase();
    function actorOf(r) {
      const ad = r.auditData || {};
      return String(r.userPrincipalName || ad.UserId || "").toLowerCase();
    }
    const allUal = ev.ualRecords || [];
    const foreign = allUal.filter(function (r) {
      const a = actorOf(r);
      return a && subject && a !== subject;
    });
    const ualScoped = allUal.filter(function (r) {
      const a = actorOf(r);
      return !a || !subject || a === subject;
    });

    if (foreign.length) {
      const actors = uniq(foreign.map(actorOf)).slice(0, 5);
      add("Info", "Data quality",
        "Audit records excluded: performed by other accounts",
        foreign.length + " of " + allUal.length + " audit record(s) had a different actor and were NOT " +
        "attributed to this account. Actor(s): " + actors.join(", ") +
        (uniq(foreign.map(actorOf)).length > 5 ? " and others" : "") + ".",
        "",
        "These are tenant activity, not evidence about this account. If this count is large, the audit " +
        "query is not being scoped - verify the userPrincipalNameFilters property is set on the query.",
        "Triage self-check");
    }

    ualScoped.forEach(function (r) {
      const ad = r.auditData || {};
      const op = r.operation || ad.Operation || "";
      const t = r.createdDateTime || ad.CreationTime || "";
      // clientIp is a top-level property on Graph auditLogRecord; only the
      // imported/raw shapes carry it inside auditData. Read both.
      const ip = r.clientIp || ad.ClientIP || ad.ClientIPAddress || ad.ActorIpAddress || "";
      let extra = "";
      if (Array.isArray(ad.Parameters)) {
        extra = ad.Parameters.filter(function (p) {
          return /forward|redirect|delete|name|identity|accessrights|trustee|user|query/i.test(p.Name || "");
        }).slice(0, 4).map(function (p) { return p.Name + "=" + p.Value; }).join("; ");
      }
      if (!extra && ad.ObjectId) extra = String(ad.ObjectId);

      if (op === "Set-Mailbox" && (ad.Parameters || []).some(p=>/^(ForwardingSmtpAddress|ForwardingAddress)$/i.test(p.Name || '') && !/^(null|\$null|false)?$/i.test(String(p.Value ?? '').trim()))) {
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
      if (NOTABLE[op]) {
        const s = ualSeverity(op, r, ad);
        (hits[op] = hits[op] || []).push({ t: t, ip: ip, extra: extra, sev: s.sev, why: s.why });
      }
    });
    Object.keys(hits).forEach(function (op) {
      const h = hits[op];
      const meta = NOTABLE[op];
      // The group carries the worst severity any single record earned, not the
      // operation's nominal severity - otherwise 25 admin consents read High.
      const worst = SEV_NAMES[Math.min.apply(null, h.map(function (x) { return SEV_RANK[x.sev]; }))];
      const ex = h.slice(0, 3).map(function (x) {
        return (x.t ? x.t.slice(5, 16).replace("T", " ") : "") + " " + (x.extra || "");
      }).join(" | ");
      const ips = uniq(h.map(function (x) { return x.ip; })).slice(0, 4).join(", ");
      const downgraded = h.filter(function (x) { return SEV_RANK[x.sev] > SEV_RANK[meta[0]]; });
      let note = "";
      if (downgraded.length) {
        const reasons = uniq(downgraded.map(function (x) { return x.why; })).filter(Boolean);
        note = " " + downgraded.length + " of " + h.length + " scored below the nominal severity for this " +
          "operation" + (reasons.length ? ": " + reasons.slice(0, 2).join("; ") : "") + ".";
      }
      add(worst, "Audit log", "Audit log: " + op + " (" + h.length + "x)",
        h.length + " occurrence(s). " + meta[1] +
        (ips ? " IPs: " + ips + "." : "") + note +
        " Examples: " + ex,
        h[0].t,
        worst === "Info"
          ? "No action indicated - retained for the evidence record."
          : "Review each occurrence; correlate the IPs with the sign-in findings.",
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
    // RISKY_SCOPES is defined once in the Unified Audit Log section above and
    // shared with the consent severity logic there.
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
      const methods = ev.authMethods.methods || [];
      const strong = methods.filter(function (m) {
        return /(microsoftAuthenticator|fido2|windowsHello|softwareOath|phone|temporaryAccessPass)/i.test(m["@odata.type"] || "");
      });
      // The complete list, exactly as containment's "Load authentication
      // methods" shows it - password and SSPR email included - so you see
      // everything registered on the account before heading over there.
      const listing = methods.length
        ? "All registered methods (" + methods.length + "):\n" + methods.map(methodLine).join("\n")
        : "";
      if (!strong.length) {
        add("High", "Account", "No MFA methods registered",
          "This account has no strong authentication methods registered - only a password protects it." +
          (listing ? "\n\n" + listing : ""),
          null,
          "Register MFA (preferably phishing-resistant) and require it via Conditional Access.",
          "Authentication methods");
      } else {
        add("Info", "Account", "MFA methods registered: " +
          uniq(strong.map(methodLabel)).join(", "),
          listing + "\n\nVerify the user recognizes each method - attackers add their own " +
          "authenticator after a takeover. The containment runbook can remove any of these.",
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

    // Preserve actor/target distinction for directory events affecting this account.
    for(const r of ev.directoryAudits || []) {
      const actor=r.initiatedBy?.user;
      const byUser=actor?.id === ev.user?.id && !!actor?.id || String(actor?.userPrincipalName || '').toLowerCase() === String(ev.upn).toLowerCase();
      const toUser=r.targetResources?.some(t=>(t.id && t.id === ev.user?.id) || String(t.userPrincipalName || '').toLowerCase() === String(ev.upn).toLowerCase());
      if((byUser || toUser) && /role|authentication|password|consent|credential|federation/i.test(r.activityDisplayName || ''))
        add('Medium','Directory audit',r.activityDisplayName,(byUser?'Performed by selected user. ':'')+(toUser?'Targets selected user. ':'')+'Actor: '+(actor?.userPrincipalName || 'application/unknown')+'. Result: '+(r.result || 'unknown')+'. Event: '+(r.id || 'unavailable'),r.activityDateTime,'Review the recorded actor, targets and modified properties.','Directory audit');
    }
    F.forEach(f=>{ const text=[f.Category,f.Title,f._t,f.User].join('|'); let h=2166136261; for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619); f.Id='quick-'+(h>>>0).toString(16); });

    F.sort(function (a, b) {
      const d = SEV_RANK[a.Severity] - SEV_RANK[b.Severity];
      if (d) return d;
      return (b._t || "") < (a._t || "") ? -1 : 1;
    });
    return F;
  }

  window.TriageDetections = { analyze: analyze, SEV_RANK: SEV_RANK };
})();
