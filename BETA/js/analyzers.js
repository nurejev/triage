// BETA analyzer engine - MAS detection rules ported to JS.
// Pure functions: normalized evidence in, findings + stats + per-user rollup out.
// Rule provenance: LETHAL-FORENSICS/Microsoft-Analyzer-Suite (MIT). Each rule
// keeps MAS's severity intent: Red=High, Orange/Yellow=Medium, benign highlight
// =Info; Critical is reserved for compound/high-confidence hits (device-code to
// the auth broker, audit-log tampering, federation change, confirmed AiTM).
(function () {
  const BL = window.BETA_BL || { ASN: {}, COUNTRY: {}, USERAGENT: [], APP: {}, APP_PERM: {}, DEL_PERM: {}, MOVE_FOLDER: [], OPERATION: {}, ASN_WHITE: [] };
  const SEV_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

  // ---- helpers ----
  function fmtTime(t) { if (!t) return ""; const d = new Date(t); return isNaN(d) ? "" : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; }
  function day(t) { return String(t || "").slice(0, 10); }
  function uniq(a) { return Array.from(new Set(a.filter(Boolean))); }
  function lc(s) { return String(s == null ? "" : s).toLowerCase(); }
  function count(arr, keyFn) { const m = {}; arr.forEach(function (x) { const k = keyFn(x); if (k) m[k] = (m[k] || 0) + 1; }); return m; }
  function top(m, n) { return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, n || 10).map(function (k) { return { k: k, n: m[k] }; }); }
  function topStr(m, n) { return top(m, n).map(function (e) { return e.k + " (" + e.n + ")"; }).join(", "); }
  function asnNum(v) { return String(v == null ? "" : v).replace(/^AS/i, "").trim(); }
  function get(r, p, d) { try { const v = p.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, r); return v == null ? d : v; } catch (e) { return d; } }

  function blAsn(v) { const n = asnNum(v); return n && BL.ASN[n] ? { asn: n, org: BL.ASN[n] } : null; }
  function blCountry(cc) { const k = String(cc || "").toUpperCase(); return cc && BL.COUNTRY[k] ? BL.COUNTRY[k] : null; }
  function blUa(ua) { if (!ua) return null; for (let i = 0; i < BL.USERAGENT.length; i++) if (ua.indexOf(BL.USERAGENT[i].s) !== -1) return BL.USERAGENT[i]; return null; }
  function blApp(appId) { return appId ? BL.APP[lc(appId)] || null : null; }
  function asnWhitelisted(v) { const n = asnNum(v); return BL.ASN_WHITE.indexOf(n) !== -1; }

  const APPID = {
    OFFICE_HOME: "4765445b-32c6-49b0-83e6-1d93765276ca",
    OFFICE365: "72782ba9-4490-4f03-8d82-562370ea3566",
    EXO: "00000002-0000-0ff1-ce00-000000000000",
    AUTH_BROKER: "29d9ed98-a469-4536-ade2-f981bc1d605e",
    DRS: "01cb2876-7ebd-4aa4-9cc9-d28bd4d359a9",
    INTUNE_PORTAL: "9ba1a5c7-f17a-4de9-a1f1-6178c8d51223",
    VSCODE: "aebc6443-996d-45c2-90f0-388ff96faa56",
    GRAPH: "00000003-0000-0000-c000-000000000000"
  };
  const MS_TENANTS = ["72f988bf-86f1-41af-91ab-2d7cd011db47", "f8cdef31-a31e-4b4a-93e4-5f571e91255a"];
  // MAS EntraSignInLogs Stats\ErrorCode red list + meanings.
  const BAD_ERRORS = {
    50034: "user does not exist in tenant (account enumeration)",
    50053: "account locked / sign-in from IP with malicious activity",
    50126: "invalid username or password (password spraying)",
    90094: "admin consent required",
    90095: "admin consent required, request sent to admin",
    500121: "authentication failed during strong-auth request (MFA fatigue / prompt bombing)",
    530032: "user blocked due to risk on home tenant",
    50199: "user confirmation required (CMSI interrupt)"
  };
  // Volumetric UAL thresholds (records/day) - MAS LETHAL-040..059.
  const VOL = {
    MoveToDeletedItems: 50, SoftDelete: 50, HardDelete: 50, SendAs: 10, Update: 20,
    SharingInvitationCreated: 10, AddedToSecureLink: 50, SecureLinkUpdated: 5,
    SharingSet: 10, FileDownloaded: 50
  };
  // UAL suspicious operations -> [severity, MITRE, note]. Drawn from MAS
  // Suspicious-Operations rules + Operation blacklist.
  const UAL_OPS = {
    "New-InboxRule": ["High", "T1564.008", "inbox rule created"],
    "Set-InboxRule": ["High", "T1564.008", "inbox rule modified"],
    "Enable-InboxRule": ["Medium", "T1564.008", "inbox rule enabled"],
    "Disable-InboxRule": ["Medium", "T1564.008", "inbox rule disabled"],
    "Remove-InboxRule": ["Medium", "T1564.008", "inbox rule removed"],
    "UpdateInboxRules": ["High", "T1564.008", "inbox rules updated (EWS)"],
    "New-TransportRule": ["High", "T1114.003", "transport rule created"],
    "Set-TransportRule": ["High", "T1114.003", "transport rule modified"],
    "Set-Mailbox": ["High", "T1114.003", "mailbox settings changed (possible forwarding)"],
    "Set-MailboxJunkEmailConfiguration": ["High", "T1114", "junk/safe-sender config changed (outbound spam)"],
    "Add-MailboxPermission": ["High", "T1098.002", "mailbox permission added"],
    "Add-RecipientPermission": ["High", "T1098.002", "SendAs permission added"],
    "Add-MailboxFolderPermission": ["Medium", "T1098.002", "folder permission added"],
    "Set-MailboxFolderPermission": ["Medium", "T1098.002", "folder permission changed"],
    "New-InboundConnector": ["High", "T1114", "inbound connector created"],
    "Set-InboundConnector": ["High", "T1114", "inbound connector changed"],
    "Add service principal.": ["High", "T1550.001", "service principal added"],
    "Add delegated permission grant.": ["High", "T1528", "delegated permission granted"],
    "Add app role assignment grant to user.": ["High", "T1528", "app role granted to user"],
    "Consent to application.": ["High", "T1528", "consent to application"],
    "New-UnifiedAuditLogRetentionPolicy": ["High", "T1070", "audit-log retention policy created (anti-forensics)"],
    "Set-UnifiedAuditLogRetentionPolicy": ["High", "T1070", "audit-log retention policy changed (anti-forensics)"],
    "Remove-UnifiedAuditLogRetentionPolicy": ["High", "T1070", "audit-log retention policy removed (anti-forensics)"],
    "SearchStarted": ["Medium", "T1114", "eDiscovery/content search started"],
    "SearchExportDownloaded": ["High", "T1114", "eDiscovery export downloaded"],
    "ViewedSearchExported": ["Medium", "T1114", "eDiscovery export viewed"]
  };

  // ================================================================ engine --
  function analyze(ev) {
    ev = ev || {};
    const F = [], S = {};
    function add(sev, analyzer, title, detail, user, ts, mitre) {
      F.push({ Severity: sev, Analyzer: analyzer, Title: title, Detail: detail || "",
        User: user || "", Timestamp: fmtTime(ts), _t: ts || "", Mitre: mitre || "", Source: analyzer });
    }
    anSignIns(ev, add, S);
    anAudits(ev, add, S);
    anUal(ev, add, S);
    anRiskyDetections(ev, add, S);
    anRiskyUsers(ev, add, S);
    anOauth(ev, add, S);
    anUsers(ev, add, S);
    anDevices(ev, add, S);
    anAdmins(ev, add, S);
    anMfa(ev, add, S);
    F.sort(function (a, b) { return (SEV_RANK[a.Severity] - SEV_RANK[b.Severity]) || String(b._t).localeCompare(String(a._t)); });
    return { findings: F, stats: S, users: rollup(F) };
  }

  function rollup(F) {
    const m = {};
    F.forEach(function (f) {
      if (!f.User) return;
      const u = m[f.User] || (m[f.User] = { user: f.User, Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0, total: 0, analyzers: {} });
      u[f.Severity]++; u.total++; u.analyzers[f.Analyzer] = 1;
    });
    return Object.keys(m).map(function (k) { const u = m[k]; u.analyzers = Object.keys(u.analyzers); return u; })
      .sort(function (a, b) { return (b.Critical - a.Critical) || (b.High - a.High) || (b.Medium - a.Medium) || (b.total - a.total); });
  }

  // ========================================================== sign-in logs --
  function anSignIns(ev, add, S) {
    const si = ev.signIns || [];
    if (!si.length) return;
    const A = "EntraSignInLogs";
    const norm = si.map(function (r) {
      return {
        upn: r.userPrincipalName || "", uid: r.userId || "", t: r.createdDateTime,
        ip: r.ipAddress || "", err: +get(r, "status.errorCode", 0) || 0,
        appId: lc(r.appId), app: r.appDisplayName || "", client: r.clientAppUsed || "", ua: r.userAgent || "",
        proto: r.authenticationProtocol || "", xfer: r.originalTransferMethod || "",
        xTenant: r.crossTenantAccessType || "", resId: lc(r.resourceId),
        devId: get(r, "deviceDetail.deviceId", ""), os: get(r, "deviceDetail.operatingSystem", ""),
        browser: get(r, "deviceDetail.browser", ""), compliant: get(r, "deviceDetail.isCompliant", null),
        cc: get(r, "location.countryOrRegion", ""), city: get(r, "location.city", ""),
        asn: asnNum(r.autonomousSystemNumber != null ? r.autonomousSystemNumber : (r.ASN || r.asn || "")),
        risk: r.riskLevelDuringSignIn || "none", riskState: r.riskState || "", riskAgg: r.riskLevelAggregated || "none",
        tokenType: r.incomingTokenType || "", userType: lc(r.userType), tokenProt: r.signInTokenProtectionStatus || "",
        caStatus: r.conditionalAccessStatus || "", caPolicies: r.appliedConditionalAccessPolicies || [],
        interactive: r.isInteractive
      };
    });
    const ok = norm.filter(function (s) { return s.err === 0; });
    const fail = norm.filter(function (s) { return s.err !== 0; });

    S.signinCountries = top(count(ok, function (s) { return s.cc; }), 12);
    S.signinApps = top(count(ok, function (s) { return s.app; }), 12);
    S.signinErrors = top(count(fail, function (s) { return String(s.err); }), 12);

    // Brute force: >=1000 failures per calendar day
    const perDay = count(fail, function (s) { return day(s.t); });
    Object.keys(perDay).forEach(function (d) {
      if (perDay[d] >= 1000) add("High", A, "Possible brute-force: " + perDay[d] + " failed sign-ins on " + d,
        uniq(fail.filter(function (s) { return day(s.t) === d; }).map(function (s) { return s.upn; })).length + " distinct account(s) targeted.", "", d, "T1110");
    });
    // Suspicious error codes, aggregated per code
    Object.keys(BAD_ERRORS).forEach(function (code) {
      const hits = fail.filter(function (s) { return s.err === +code; });
      if (!hits.length) return;
      const byUser = count(hits, function (s) { return s.upn; });
      const sev = (+code === 50126 && hits.length >= 20) || +code === 530032 || +code === 50053 ? "High" : "Medium";
      add(sev, A, "Sign-in error " + code + " ×" + hits.length + " — " + BAD_ERRORS[code],
        "Affected: " + topStr(byUser, 8), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", hits[0].t, "T1110");
    });
    // Legacy auth: Authenticated SMTP
    const smtp = norm.filter(function (s) { return s.client === "Authenticated SMTP"; });
    if (smtp.length) {
      const okSmtp = smtp.filter(function (s) { return s.err === 0; }).length;
      add(okSmtp ? "High" : "Medium", A, "Authenticated SMTP (legacy auth): " + smtp.length + " sign-in(s), " + okSmtp + " successful",
        "Legacy auth bypasses MFA. Users: " + uniq(smtp.map(function (s) { return s.upn; })).slice(0, 8).join(", "),
        uniq(smtp.map(function (s) { return s.upn; })).length === 1 ? smtp[0].upn : "", smtp[0].t, "T1078.004");
    }
    // ROPC
    norm.filter(function (s) { return s.proto === "ropc" || /^(BAV2ROPC|AConsumerV2ROPC)$/.test(s.ua); }).slice(0, 20).forEach(function (s) {
      add("High", A, "ROPC flow (single-factor, non-interactive)", "Resource Owner Password Credentials: password used directly, MFA impossible. " + (s.ua || s.proto) + ", IP " + s.ip + " (" + s.cc + ").", s.upn, s.t, "T1078.004");
    });
    // Device code
    norm.filter(function (s) { return s.proto === "deviceCode" || s.xfer === "deviceCodeFlow"; }).slice(0, 20).forEach(function (s) {
      const broker = s.appId === APPID.AUTH_BROKER, drs = s.resId === APPID.DRS;
      add(broker || drs ? "Critical" : "High", A,
        "Device-code authentication" + (broker ? " to Microsoft Authentication Broker (PRT phishing)" : drs ? " → Device Registration Service" : ""),
        "Device-code phishing yields a token with no password prompt. App: " + s.app + ", IP " + s.ip + " (" + s.cc + ").", s.upn, s.t, "T1528");
    });
    // AiTM: OfficeHome + no device + interrupt/success codes
    const aitm = norm.filter(function (s) { return s.appId === APPID.OFFICE_HOME && !s.devId && [0, 50074, 50140, 53000].indexOf(s.err) !== -1; });
    if (aitm.length) {
      const byUser = count(aitm, function (s) { return s.upn; });
      add("High", A, "Possible AiTM phishing pattern: OfficeHome sign-ins with no device identity (" + aitm.length + ")",
        "OfficeHome + empty DeviceId + error 0/50074/50140/53000 is the evilginx/Tycoon fingerprint. Users: " + topStr(byUser, 8) +
        ". Countries: " + uniq(aitm.map(function (s) { return s.cc; })).join(", "), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", aitm[0].t, "T1557");
    }
    // AiTM 30-second pair rule (Find-AiTMSuspiciousUserLogin)
    const byUserOk = {};
    ok.forEach(function (s) { if (s.upn) (byUserOk[s.upn] = byUserOk[s.upn] || []).push(s); });
    Object.keys(byUserOk).forEach(function (u) {
      const list = byUserOk[u].slice().sort(function (a, b) { return String(a.t).localeCompare(String(b.t)); });
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i];
        if (!a.ip || !b.ip) continue;
        const dt = (new Date(b.t) - new Date(a.t)) / 1000;
        if (dt >= 0 && dt <= 30 && (a.ip !== b.ip || (a.asn && b.asn && a.asn !== b.asn))) {
          add("Critical", A, "Two successful sign-ins from different IPs within 30 seconds",
            a.ip + " (" + a.cc + (a.asn ? ", AS" + a.asn : "") + ") then " + b.ip + " (" + b.cc + (b.asn ? ", AS" + b.asn : "") + ") " + Math.round(dt) + "s apart — the session-relay shape of AiTM proxies.", u, b.t, "T1557");
          break;
        }
      }
    });
    // Very risky authentication (P2)
    norm.filter(function (s) { return s.risk === "high" && s.riskState === "atRisk" && /medium|high/.test(s.riskAgg); }).slice(0, 10).forEach(function (s) {
      add("High", A, "Very risky authentication (high risk, atRisk)", "IP " + s.ip + " (" + s.cc + "), app " + s.app + ".", s.upn, s.t);
    });
    // PRT token replay (ROADtx)
    norm.filter(function (s) { return s.appId === APPID.AUTH_BROKER && s.userType === "member" && s.tokenProt === "unbound" && s.devId && s.tokenType === "primaryRefreshToken"; }).slice(0, 10).forEach(function (s) {
      add("High", A, "Unusual PRT usage on registered device (token replay)", "Authentication Broker + unbound primary refresh token: the shape of ROADtx PRT abuse. Device " + s.devId + ", IP " + s.ip + ".", s.upn, s.t, "T1098.005");
    });
    // VSCode OAuth phishing
    norm.filter(function (s) { return s.appId === APPID.VSCODE && s.resId === APPID.GRAPH && s.err === 0 && s.userType === "member"; }).slice(0, 10).forEach(function (s) {
      add("Medium", A, "Visual Studio Code client obtained a Graph token", "The public VSCode client is abused for OAuth phishing (token grab without app consent). IP " + s.ip + " (" + s.cc + ").", s.upn, s.t, "T1528");
    });
    // Cross-tenant B2B
    const b2b = norm.filter(function (s) { return s.xTenant === "b2bCollaboration" && s.err === 0; });
    if (b2b.length) add("Medium", A, "B2B cross-tenant sign-ins: " + b2b.length, "Cross-tenant sync/B2B is a lateral-movement path. Users: " + uniq(b2b.map(function (s) { return s.upn; })).slice(0, 8).join(", "), "", b2b[0].t);
    // Compliance bypass via Intune Company Portal
    norm.filter(function (s) {
      return s.appId === APPID.INTUNE_PORTAL && (s.err === 0 || s.err === 50199) && s.compliant === false &&
        (s.caPolicies || []).some(function (p) { const g = (p.enforcedGrantControls || []).join(","); return (/RequireCompliantDevice/.test(g) && p.result === "failure") || (/Block/.test(g) && p.result === "notApplied"); });
    }).slice(0, 10).forEach(function (s) {
      add("High", A, "Possible device-compliance bypass via Intune Company Portal", "Non-compliant device, CA compliance control failed or not applied. IP " + s.ip + ".", s.upn, s.t, "T1548");
    });
    // Offensive-tool browser
    norm.filter(function (s) { return /Python Requests/i.test(s.browser) || /python-requests|PostmanRuntime|python\//i.test(s.ua); }).slice(0, 10).forEach(function (s) {
      add("High", A, "Scripting/HTTP-client user agent in sign-in", (s.browser || s.ua) + " — automated tooling, not a browser. IP " + s.ip + ".", s.upn, s.t);
    });
    // Blacklists (successful sign-ins only), grouped
    norm.forEach(function (s) { s._bl = { asn: blAsn(s.asn), cc: blCountry(s.cc), ua: blUa(s.ua), app: blApp(s.appId) }; });
    blGroup(norm, "asn", "ASN", function (s) { return "AS" + s._bl.asn.asn + " " + s._bl.asn.org; }, add, A);
    blGroup(norm, "cc", "country", function (s) { return s._bl.cc; }, add, A);
    blGroup(norm, "ua", "user agent", function (s) { return s.ua; }, add, A);
    blGroup(norm, "app", "application", function (s) { return s._bl.app.name; }, add, A);
  }
  function blGroup(norm, kind, label, fmt, add, A) {
    const hits = norm.filter(function (s) { return s._bl[kind] && s.err === 0; });
    if (!hits.length) return;
    const byKey = {};
    hits.forEach(function (s) { const k = fmt(s); (byKey[k] = byKey[k] || []).push(s); });
    Object.keys(byKey).forEach(function (k) {
      const g = byKey[k], users = uniq(g.map(function (s) { return s.upn; }));
      const sev = (kind === "app" || kind === "ua") ? (g[0]._bl[kind].sev || "High") : "High";
      add(sev, A, "Blacklisted " + label + ": " + k + " (" + g.length + " successful sign-in" + (g.length === 1 ? "" : "s") + ")",
        "Users: " + users.slice(0, 8).join(", ") + (users.length > 8 ? " +" + (users.length - 8) + " more" : ""), users.length === 1 ? users[0] : "", g[0].t);
    });
  }

  // ====================================================== directory audits --
  function anAudits(ev, add, S) {
    const da = ev.directoryAudits || [];
    if (!da.length) return;
    const A = "EntraAuditLogs";
    const norm = da.map(function (r) {
      return {
        act: r.activityDisplayName || r.Activity || "", cat: r.category || "", svc: r.loggedByService || "",
        status: get(r, "result", r.Status || ""), reason: r.resultReason || r.StatusReason || "",
        by: get(r, "initiatedBy.user.userPrincipalName", "") || get(r, "initiatedBy.app.displayName", ""),
        t: r.activityDateTime || r.ActivityDateTime, targets: r.targetResources || []
      };
    });
    S.auditActivities = top(count(norm, function (r) { return r.act; }), 15);

    function flag(pred, sev, title, mitre) {
      const hits = norm.filter(pred);
      hits.slice(0, 12).forEach(function (r) {
        add(sev, A, title, "Activity '" + r.act + "'" + (r.by ? " by " + r.by : "") + (r.status ? " (" + r.status + ")" : "") + ".", r.by, r.t, mitre);
      });
    }
    flag(function (r) { return /Authentication Methods/i.test(r.svc) && /registered security info/i.test(r.act) && /Authenticator App|Mobile Phone SMS/i.test(r.reason); }, "High", "MFA method registered (possible attacker persistence)", "T1098");
    flag(function (r) { return r.act === "Add application"; }, "High", "New application registered", "T1098.001");
    flag(function (r) { return r.act === "Add service principal"; }, "High", "Service principal added", "T1550.001");
    flag(function (r) { return r.act === "Add delegated permission grant"; }, "High", "Delegated permission grant added", "T1528");
    flag(function (r) { return r.act === "Add app role assignment grant to user"; }, "High", "App role assignment granted to user", "T1528");
    flag(function (r) { return /Consent to application/i.test(r.act); }, "High", "Consent to application", "T1528");
    flag(function (r) { return /Certificates and secrets management/i.test(r.act); }, "High", "App credential (cert/secret) added", "T1550.001");
    flag(function (r) { return /Set domain authentication|Set federation settings/i.test(r.act) && /success/i.test(r.status); }, "Critical", "Domain federation changed (possible AADFS / Golden SAML persistence)", "T1484.002");
    flag(function (r) { return /Reset user password|Change user password/i.test(r.act); }, "Medium", "Password reset/change", "T1098");
    flag(function (r) { return /Update StsRefreshTokenValidFrom/i.test(r.act); }, "Medium", "Refresh-token validity timestamp updated (session revocation or evasion)", "T1098");
    // Suspicious cloud device registration: Add device + registered users/owner within 1 min, same correlationId
    anDeviceReg(da, add, A);
  }
  function anDeviceReg(da, add, A) {
    const byCorr = {};
    da.forEach(function (r) {
      const cid = r.correlationId; if (!cid) return;
      (byCorr[cid] = byCorr[cid] || []).push(r);
    });
    Object.keys(byCorr).forEach(function (cid) {
      const g = byCorr[cid];
      const addDev = g.find(function (r) { return /Add device/i.test(r.activityDisplayName || ""); });
      const users = g.find(function (r) { return /Add registered users to device/i.test(r.activityDisplayName || ""); });
      const owner = g.find(function (r) { return /Add registered owner to device/i.test(r.activityDisplayName || ""); });
      if (addDev && users && owner) {
        const ts = g.map(function (r) { return +new Date(r.activityDateTime || 0); }).filter(Boolean);
        if (ts.length && (Math.max.apply(null, ts) - Math.min.apply(null, ts)) <= 60000) {
          add("High", A, "Suspicious cloud device registration (ROADtools pattern)", "Add device + registered users + registered owner within 60s on one correlation id — automated device join for persistence.", get(addDev, "initiatedBy.user.userPrincipalName", ""), addDev.activityDateTime, "T1098.005");
        }
      }
    });
  }

  // =============================================================== UAL --
  function anUal(ev, add, S) {
    const ual = ev.ualRecords || [];
    if (!ual.length) return;
    const A = "UAL";
    const norm = ual.map(function (r) {
      const ad = r.auditData || r.AuditData || r;
      return {
        op: r.operation || r.Operations || ad.Operation || "", rt: r.recordType || ad.RecordType || "",
        upn: r.userPrincipalName || r.UserIds || ad.UserId || "", t: r.createdDateTime || ad.CreationTime || r.CreationDate,
        ip: ad.ClientIP || ad.ClientIPAddress || "", ad: ad
      };
    });
    S.ualOps = top(count(norm, function (r) { return r.op; }), 15);

    // Suspicious operations
    Object.keys(UAL_OPS).forEach(function (op) {
      const meta = UAL_OPS[op];
      const hits = norm.filter(function (r) { return r.op === op; });
      if (!hits.length) return;
      const byUser = count(hits, function (r) { return r.upn; });
      add(meta[0], A, op + " ×" + hits.length + " — " + meta[2], "Users: " + topStr(byUser, 8), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", hits[0].t, meta[1]);
    });
    // Disable Unified Audit Logging
    norm.filter(function (r) {
      if (r.op !== "Set-AdminAuditLogConfig") return false;
      const params = get(r.ad, "Parameters", []) || [];
      return params.some(function (p) { return /UnifiedAuditLogIngestionEnabled/i.test(p.Name) && /false/i.test(p.Value); });
    }).forEach(function (r) { add("Critical", A, "Unified Audit Logging disabled (anti-forensics)", "Set-AdminAuditLogConfig set UnifiedAuditLogIngestionEnabled=False.", r.upn, r.t, "T1562.008"); });
    // Forwarding via Set-Mailbox
    norm.filter(function (r) { return r.op === "Set-Mailbox"; }).forEach(function (r) {
      const params = get(r.ad, "Parameters", []) || [];
      const fwd = params.filter(function (p) { return /ForwardingAddress|ForwardingSmtpAddress|DeliverToMailboxAndForward/i.test(p.Name) && p.Value && p.Value !== "False"; });
      if (fwd.length) add("High", A, "Mailbox forwarding configured", fwd.map(function (p) { return p.Name + " = " + p.Value; }).join("; "), r.upn, r.t, "T1114.003");
    });
    // Inbox rule content highlights (hide/forward)
    norm.filter(function (r) { return /InboxRule|UpdateInboxRules/i.test(r.op); }).forEach(function (r) {
      const params = get(r.ad, "Parameters", []) || [];
      const byName = {}; params.forEach(function (p) { byName[p.Name] = p.Value; });
      const bad = [];
      if (/^true$/i.test(byName.MarkAsRead || "")) bad.push("marks as read");
      if (/^true$/i.test(byName.DeleteMessage || "")) bad.push("deletes message");
      if (/^true$/i.test(byName.StopProcessingRules || "")) bad.push("stops processing rules");
      if (byName.MoveToFolder && BL.MOVE_FOLDER.indexOf(byName.MoveToFolder) !== -1) bad.push("moves to '" + byName.MoveToFolder + "'");
      if (byName.ForwardTo || byName.ForwardAsAttachmentTo || byName.RedirectTo) bad.push("forwards/redirects externally");
      const nm = byName.Name || "";
      if (/^[^a-zA-Z\d\s:]/.test(nm) || /^[a-zA-Z0-9]{1,5}$/.test(nm)) bad.push("stealthy rule name '" + nm + "'");
      if (bad.length) add("High", A, "Suspicious inbox rule: " + bad.join(", "), "Operation " + r.op + (nm ? ", rule '" + nm + "'" : "") + ".", r.upn, r.t, "T1564.008");
    });
    // Volumetric mailbox / SharePoint
    Object.keys(VOL).forEach(function (op) {
      const th = VOL[op];
      const hits = norm.filter(function (r) { return r.op === op; });
      if (!hits.length) return;
      const perUserDay = {};
      hits.forEach(function (r) { const k = r.upn + "|" + day(r.t); perUserDay[k] = (perUserDay[k] || 0) + 1; });
      Object.keys(perUserDay).forEach(function (k) {
        if (perUserDay[k] >= th) {
          const parts = k.split("|");
          add("High", A, "Mass " + op + ": " + perUserDay[k] + " on " + parts[1] + " (≥" + th + "/day)", op === "FileDownloaded" ? "Bulk download — possible exfiltration." : "Bulk mailbox operation — possible deletion/exfiltration.", parts[0], parts[1], op === "FileDownloaded" ? "T1567" : "T1114");
        }
      });
    });
    // MailItemsAccessed sync + throttle
    const mia = norm.filter(function (r) { return r.op === "MailItemsAccessed"; });
    if (mia.length) {
      const sync = mia.filter(function (r) { const opp = get(r.ad, "OperationProperties", []) || []; return opp.some(function (p) { return p.Name === "MailAccessType" && p.Value === "Sync"; }); });
      const throttled = mia.filter(function (r) { const opp = get(r.ad, "OperationProperties", []) || []; return opp.some(function (p) { return p.Name === "IsThrottled" && /true/i.test(p.Value); }); });
      if (sync.length) add("High", A, "Whole-folder mailbox sync (MailItemsAccessed — Sync): " + sync.length, "Sync access pulls an entire folder to a client — bulk read/exfiltration. Users: " + uniq(sync.map(function (r) { return r.upn; })).slice(0, 6).join(", "), uniq(sync.map(function (r) { return r.upn; })).length === 1 ? sync[0].upn : "", sync[0].t, "T1114");
      if (throttled.length) add("Medium", A, "MailItemsAccessed throttled — evidence gap", "Microsoft stops logging after >1000 MailItemsAccessed in <24h; some access is unrecorded.", uniq(throttled.map(function (r) { return r.upn; })).length === 1 ? throttled[0].upn : "", throttled[0].t, "T1114");
    }
  }

  // ================================================= identity protection --
  function anRiskyDetections(ev, add, S) {
    const rd = ev.riskDetections || [];
    if (!rd.length) return;
    const A = "RiskyDetections";
    const RED = { maliciousIPAddress: 1, mcasSuspiciousInboxManipulationRules: 1, nationStateIP: 1, passwordSpray: 1 };
    S.riskEventTypes = top(count(rd, function (r) { return r.riskEventType || ""; }), 12);
    rd.slice(0, 40).forEach(function (r) {
      const et = r.riskEventType || "", lvl = lc(r.riskLevel);
      let sev = RED[et] ? "High" : (et === "unlikelyTravel" ? "Medium" : (lvl === "high" ? "High" : lvl === "medium" ? "Medium" : "Low"));
      const mitre = get(r, "additionalInfo", ""); // often JSON; keep light
      add(sev, A, "Risk detection: " + (et || "risk") + " (" + (r.riskLevel || "?") + ")",
        "State " + (r.riskState || "?") + (r.ipAddress ? ", IP " + r.ipAddress : "") + (r.location && r.location.countryOrRegion ? " (" + r.location.countryOrRegion + ")" : "") + ".",
        r.userPrincipalName || "", r.detectedDateTime || r.activityDateTime, typeof mitre === "string" && /T1\d/.test(mitre) ? (mitre.match(/T1[\d.]+/) || [""])[0] : "");
    });
  }
  function anRiskyUsers(ev, add, S) {
    const ru = ev.riskyUsers || [];
    if (!ru.length) return;
    const A = "RiskyUsers";
    ru.forEach(function (r) {
      const lvl = lc(r.riskLevel), st = lc(r.riskState);
      if (/dismissed|remediated/.test(st)) return;
      const sev = lvl === "high" ? "Critical" : lvl === "medium" ? "High" : lvl === "low" ? "Medium" : "Low";
      add(sev, A, "Risky user: " + (r.riskLevel || "?") + " (" + (r.riskState || "?") + ")", "Identity Protection flagged this account.", r.userPrincipalName || "", r.riskLastUpdatedDateTime);
    });
  }

  // ============================================================ OAuth --
  function anOauth(ev, add, S) {
    const g = ev.oauthGrants || [];
    if (!g.length) return;
    const A = "OAuthPermissions";
    g.forEach(function (grant) {
      const scopes = (grant.scope || "").split(/\s+/).filter(Boolean);
      const type = grant.permissionType || "Delegated";
      const table = type === "Application" ? BL.APP_PERM : BL.DEL_PERM;
      const risky = scopes.filter(function (s) { return table[s]; });
      const worst = risky.reduce(function (w, s) { return SEV_RANK[table[s]] < SEV_RANK[w] ? table[s] : w; }, "Low");
      const appBl = blApp(grant.appId || grant.clientId);
      const name = grant.appName || grant.appDisplayName || grant.clientId || "app";
      // Blacklisted app itself
      if (appBl) add(appBl.sev, A, "Blacklisted application consented: " + (appBl.name || name), "Known-risky OAuth app. Consent type: " + (grant.consentType || "?") + ".", grant.principalUpn || grant.principalDisplayName || "", grant.createdDateTime);
      // Non-alphanumeric / user-shaped app name
      if (/^[^a-zA-Z0-9]+$/.test(name)) add("High", A, "OAuth app with non-alphanumeric name: '" + name + "'", "Random/garbage app names are a hallmark of illicit consent grants.", "", grant.createdDateTime, "T1528");
      // Risky scopes
      if (risky.length) add(worst, A, "OAuth app '" + name + "' holds risky " + type.toLowerCase() + " permissions",
        (grant.consentType === "AllPrincipals" ? "Tenant-wide" : "Per-user") + " grant. Risky scopes: " + risky.slice(0, 10).join(", ") + (risky.length > 10 ? " +" + (risky.length - 10) : "") + ".",
        grant.principalUpn || grant.principalDisplayName || "", grant.createdDateTime, "T1528");
    });
  }

  // ============================================================ inventory --
  function anUsers(ev, add, S) {
    const us = ev.users || ev.allUsers || [];
    if (!us.length) return;
    const A = "Users";
    const now = Date.now();
    const enabled = us.filter(function (u) { return u.accountEnabled !== false && String(u.accountEnabled) !== "False"; }).length;
    S.usersTotal = us.length; S.usersEnabled = enabled; S.usersGuests = us.filter(function (u) { return /#EXT#@/i.test(u.userPrincipalName || ""); }).length;
    // Recently created (7d) - informational
    const recent = us.filter(function (u) { const c = +new Date(u.createdDateTime || 0); return c && (now - c) < 7 * 864e5; });
    if (recent.length) add("Low", A, recent.length + " account(s) created in the last 7 days", recent.slice(0, 10).map(function (u) { return u.userPrincipalName; }).join(", "), recent.length === 1 ? recent[0].userPrincipalName : "", recent[0] && recent[0].createdDateTime);
    // Stale password (never changed in >1y) on enabled accounts
    const stale = us.filter(function (u) { const p = +new Date(u.lastPasswordChangeDateTime || 0); return p && (now - p) > 365 * 864e5 && u.accountEnabled !== false; });
    if (stale.length) add("Low", A, stale.length + " enabled account(s) with a password older than a year", "Credential-stuffing exposure where MFA is absent.", "", "");
  }
  function anDevices(ev, add, S) {
    const dv = ev.devices || [];
    if (!dv.length) return;
    const A = "Devices";
    const now = Date.now();
    S.devicesTotal = dv.length;
    const stale = dv.filter(function (d) { const s = +new Date(d.approximateLastSignInDateTime || d.lastSignInDateTime || 0); return s && (now - s) > 90 * 864e5; });
    if (stale.length) add("Low", A, stale.length + " stale device(s) (no sign-in in 90+ days)", "Dormant registered devices widen the attack surface; review and retire.", "", "");
    const recent = dv.filter(function (d) { const c = +new Date(d.registrationDateTime || d.createdDateTime || 0); return c && (now - c) < 7 * 864e5; });
    if (recent.length) add("Medium", A, recent.length + " device(s) registered in the last 7 days", "New device joins during an incident window can be attacker persistence — confirm each.", "", recent[0] && (recent[0].registrationDateTime || recent[0].createdDateTime), "T1098.005");
  }
  function anAdmins(ev, add, S) {
    const ad = ev.admins || [];
    if (!ad.length) return;
    const A = "Admins";
    S.adminsTotal = ad.length;
    const disabled = ad.filter(function (a) { return a.accountEnabled === false || String(a.accountEnabled) === "False"; });
    if (disabled.length) add("Medium", A, disabled.length + " disabled account(s) still holding a directory role", disabled.slice(0, 10).map(function (a) { return (a.userPrincipalName || a.userName) + " (" + (a.role || a.roles || "?") + ")"; }).join(", "), "", "");
    const guests = ad.filter(function (a) { return /#EXT#@/i.test(a.userPrincipalName || a.userName || ""); });
    if (guests.length) add("High", A, guests.length + " guest/external account(s) hold a directory role", "External identities with admin roles are a high-value target and a common backdoor.", "", "", "T1098");
    // Dormant admins (no interactive sign-in in 90+ days)
    const now = Date.now();
    const dormant = ad.filter(function (a) { const s = +new Date(a.lastInteractiveSignIn || a.lastSignIn || 0); return s && (now - s) > 90 * 864e5; });
    if (dormant.length) add("Medium", A, dormant.length + " admin account(s) dormant 90+ days", "Unused privileged accounts should be removed or converted to eligible (PIM).", "", "");
  }
  function anMfa(ev, add, S) {
    const mfa = ev.mfa || [];
    if (!mfa.length) return;
    const A = "MFA";
    const noMfa = mfa.filter(function (m) { return m.isMfaRegistered === false || String(m.isMfaRegistered) === "False" || (m.methodsRegistered && m.methodsRegistered.length === 0); });
    S.mfaTotal = mfa.length; S.mfaNoSecondFactor = noMfa.length;
    if (noMfa.length) {
      const admins = noMfa.filter(function (m) { return m.isAdmin === true || String(m.isAdmin) === "True"; });
      add(admins.length ? "High" : "Medium", A, noMfa.length + " account(s) with no second factor registered" + (admins.length ? " (" + admins.length + " admin)" : ""),
        "Password-only accounts. " + (admins.length ? "Admins without MFA: " + admins.slice(0, 8).map(function (m) { return m.userPrincipalName; }).join(", ") : "Register phishing-resistant MFA and enforce via CA."),
        noMfa.length === 1 ? noMfa[0].userPrincipalName : "", "");
    }
  }

  window.BETA_Analyzers = { analyze: analyze, SEV_RANK: SEV_RANK };
})();
