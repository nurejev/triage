// BETA analyzer engine - MAS detection rules ported to JS.
// Pure functions: normalized evidence in, findings + stats + per-user rollup out.
// Rule provenance: LETHAL-FORENSICS/Microsoft-Analyzer-Suite (MIT). Each rule
// keeps MAS's severity intent: Red=High, Orange/Yellow=Medium, benign highlight
// =Info; Critical is reserved for compound/high-confidence hits (device-code to
// the auth broker, audit-log tampering, federation change, confirmed AiTM).
(function () {
  const BL = window.BETA_BL || { ASN: {}, COUNTRY: {}, USERAGENT: [], APP: {}, APP_PERM: {}, DEL_PERM: {}, MOVE_FOLDER: [], OPERATION: {}, ASN_WHITE: [] };
  const RECORD = Symbol("raw evidence record");
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
  // Microsoft first-party clients sit in the upstream app blacklist because attackers use them too;
  // every tenant uses them every day, so they are handled by their dedicated rules, not as "blacklisted".
  const FIRST_PARTY = ["4765445b-32c6-49b0-83e6-1d93765276ca", "72782ba9-4490-4f03-8d82-562370ea3566", "00000002-0000-0ff1-ce00-000000000000", "9ba1a5c7-f17a-4de9-a1f1-6178c8d51223", "aebc6443-996d-45c2-90f0-388ff96faa56", "d3590ed6-52b3-4102-aeff-aad2292ab01c", "1fec8e78-bce4-4aaf-ab1b-5451cc387264", "00000003-0000-0000-c000-000000000000", "1b730954-1685-4b74-9bfd-dac224a7b894", "04b07795-8ddb-461a-bbee-02f9e1bf7b46", "fb78d390-0c51-40cd-8e17-fdbfab77341b", "14d82eec-204b-4c2f-b7e8-296a70dab67e"];
  function blApp(appId) { const id = lc(appId); return id && FIRST_PARTY.indexOf(id) === -1 ? BL.APP[id] || null : null; }
  function asnWhitelisted(v) { const n = asnNum(v); return BL.ASN_WHITE.indexOf(n) !== -1; }
  // Residential / tier-1 carriers that appear in the upstream ASN blacklist. A successful
  // sign-in from a home ISP is not an incident signal on its own; report as Info, never High.
  const ASN_CARRIER = ["174","852","1221","1257","1267","1299","2856","2914","3257","3269","3320","3356","3549","7018","7922","11427","15169","16724","20115","22773"];
  function asnCarrier(v) { return ASN_CARRIER.indexOf(asnNum(v)) !== -1; }
  function isInteractive(s) { return s.interactive === true || s.interactive === "True" || (s.interactive == null && !!s.upn && s.eventTypes.indexOf("nonInteractiveUser") === -1 && s.eventTypes.indexOf("servicePrincipal") === -1 && s.eventTypes.indexOf("managedIdentity") === -1); }

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
    const references = window.BETA_Evidence.referenceIndex(ev);
    function add(sev, analyzer, title, detail, user, ts, mitre, records = []) {
      F.push({ Severity: sev, Analyzer: analyzer, Title: title, Detail: detail || "",
        Confidence: "Signal requires analyst review", User: user || "", Timestamp: fmtTime(ts), _t: ts || "", Mitre: mitre || "", Source: analyzer, References: references(records.map(r => r[RECORD] || r)),
        EvidenceWindow: ev.window ? { ...ev.window } : null });
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
    if (window.BETA_ExchangeAnalysis) F.push(...window.BETA_ExchangeAnalysis.analyze(ev));
    F.forEach(function(f){const text=[f.Analyzer,f.Title,f.Detail,f.User,f._t].join("|");let hash=2166136261;for(const c of text)hash=Math.imul(hash^c.charCodeAt(0),16777619);f.Id=f.Analyzer+"-"+(hash>>>0).toString(16);});
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
        [RECORD]: r, upn: r.userPrincipalName || "", uid: r.userId || "", t: r.createdDateTime,
        ip: r.ipAddress || "", err: typeof get(r, "status.errorCode", null) === "number" ? r.status.errorCode : null,
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
        interactive: r.isInteractive, eventTypes: Array.isArray(r.signInEventTypes) ? r.signInEventTypes : [],
        session: r.sessionId || "", spId: r.servicePrincipalId || "", spName: r.servicePrincipalName || "",
        credKey: r.servicePrincipalCredentialKeyId || ""
      };
    });
    norm.forEach(function (s) { s.isInteractive = isInteractive(s); s.isSp = !!s.spId || s.eventTypes.indexOf("servicePrincipal") !== -1 || s.eventTypes.indexOf("managedIdentity") !== -1; });
    const ok = norm.filter(function (s) { return s.err === 0; });
    const fail = norm.filter(function (s) { return s.err !== null && s.err !== 0; });

    S.signinCountries = top(count(ok, function (s) { return s.cc; }), 12);
    S.signinApps = top(count(ok, function (s) { return s.app; }), 12);
    S.signinErrors = top(count(fail, function (s) { return String(s.err); }), 12);

    // Brute force: >=1000 failures per calendar day
    const perDay = count(fail, function (s) { return day(s.t); });
    Object.keys(perDay).forEach(function (d) {
      if (perDay[d] >= 1000) add("High", A, "Possible brute-force: " + perDay[d] + " failed sign-ins on " + d,
        uniq(fail.filter(function (s) { return day(s.t) === d; }).map(function (s) { return s.upn; })).length + " distinct account(s) targeted.", "", d, "T1110", fail.filter(s => day(s.t) === d));
    });
    // Suspicious error codes, aggregated per code
    Object.keys(BAD_ERRORS).forEach(function (code) {
      const hits = fail.filter(function (s) { return s.err === +code; });
      if (!hits.length) return;
      const byUser = count(hits, function (s) { return s.upn; });
      const sev = (+code === 50126 && hits.length >= 20) || +code === 530032 || +code === 50053 ? "High" : "Medium";
      add(sev, A, "Sign-in error " + code + " ×" + hits.length + " — " + BAD_ERRORS[code],
        "Affected: " + topStr(byUser, 8), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", hits[0].t, "T1110", hits);
    });
    // Legacy auth: Authenticated SMTP
    const smtp = norm.filter(function (s) { return s.client === "Authenticated SMTP"; });
    if (smtp.length) {
      const okSmtp = smtp.filter(function (s) { return s.err === 0; }).length;
      add(okSmtp ? "High" : "Medium", A, "Authenticated SMTP (legacy auth): " + smtp.length + " sign-in(s), " + okSmtp + " successful",
        "Legacy auth bypasses MFA. Users: " + uniq(smtp.map(function (s) { return s.upn; })).slice(0, 8).join(", "),
        uniq(smtp.map(function (s) { return s.upn; })).length === 1 ? smtp[0].upn : "", smtp[0].t, "T1078.004", smtp);
    }
    // ROPC
    norm.filter(function (s) { return s.proto === "ropc" || /^(BAV2ROPC|AConsumerV2ROPC)$/.test(s.ua); }).forEach(function (s) {
      add("High", A, "ROPC flow (single-factor, non-interactive)", "Resource Owner Password Credentials: password used directly, MFA impossible. " + (s.ua || s.proto) + ", IP " + s.ip + " (" + s.cc + ").", s.upn, s.t, "T1078.004", [s]);
    });
    // Device code
    norm.filter(function (s) { return s.proto === "deviceCode" || s.xfer === "deviceCodeFlow"; }).forEach(function (s) {
      const broker = s.appId === APPID.AUTH_BROKER, drs = s.resId === APPID.DRS;
      add(broker || drs ? "Critical" : "High", A,
        "Device-code authentication" + (broker ? " to Microsoft Authentication Broker (PRT phishing)" : drs ? " → Device Registration Service" : ""),
        "Device-code phishing yields a token with no password prompt. App: " + s.app + ", IP " + s.ip + " (" + s.cc + ").", s.upn, s.t, "T1528", [s]);
    });
    // Session replay: one session ID seen from more than one IP/ASN (token theft, AiTM cookie replay).
    const bySession = {};
    ok.forEach(function (s) { if (s.session && s.ip && !s.isSp) (bySession[s.session] = bySession[s.session] || []).push(s); });
    const replayed = new Set();
    const replayEvidence = new Map();
    Object.keys(bySession).forEach(function (sid) {
      const g = bySession[sid], ips = uniq(g.map(function (s) { return s.ip; })), asns = uniq(g.map(function (s) { return s.asn; }));
      // Different ASN (or 3+ IPs) rules out ordinary DHCP/mobile-carrier IP churn on one network.
      if (ips.length < 2 || (asns.length < 2 && ips.length < 3)) return;
      if (asns.every(asnWhitelisted)) return;
      uniq(g.map(s => s.upn)).forEach(function (upn) { replayed.add(upn); replayEvidence.set(upn, [...(replayEvidence.get(upn) || []), ...g]); });
      const first = g.slice().sort(function (a, b) { return String(a.t).localeCompare(String(b.t)); })[0];
      add("High", A, "Session ID reused from " + ips.length + " IP addresses (token replay)",
        "Session " + sid.slice(0, 8) + "… used from " + ips.slice(0, 6).join(", ") + (asns.length > 1 ? " across AS" + asns.join(", AS") : "") + ". A stolen session cookie/refresh token replayed from another network looks exactly like this. Countries: " + uniq(g.map(function (s) { return s.cc; })).join(", ") + ".", first.upn, first.t, "T1550.004", g);
    });
    // AiTM: OfficeHome + no device + interrupt/success codes. On its own this is every unmanaged-browser
    // sign-in to office.com, so it is High only with a second signal (session replay or blacklisted ASN).
    const aitm = norm.filter(function (s) { return s.isInteractive && s.appId === APPID.OFFICE_HOME && !s.devId && [0, 50074, 50140, 53000].indexOf(s.err) !== -1 && !asnWhitelisted(s.asn); });
    if (aitm.length) {
      const strong = aitm.filter(function (s) { return replayed.has(s.upn) || (blAsn(s.asn) && !asnCarrier(s.asn)); });
      const set = strong.length ? strong : aitm, byUser = count(set, function (s) { return s.upn; });
      add(strong.length ? "High" : "Info", A, (strong.length ? "Possible AiTM phishing pattern" : "OfficeHome sign-ins without device identity") + " (" + set.length + ")",
        "OfficeHome + empty DeviceId + error 0/50074/50140/53000 is the evilginx/Tycoon fingerprint" + (strong.length ? ", here combined with session replay or a hosting/VPN ASN" : "; without a second signal it is also every browser sign-in from an unmanaged device") + ". Users: " + topStr(byUser, 8) +
        ". Countries: " + uniq(set.map(function (s) { return s.cc; })).join(", "), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", set[0].t, "T1557", set.concat(uniq(set.map(s => s.upn)).flatMap(upn => replayEvidence.get(upn) || [])));
    }
    // AiTM 30-second pair rule (Find-AiTMSuspiciousUserLogin) — interactive sign-ins only; token refreshes
    // from a phone and a laptop within 30 s are routine.
    const byUserOk = {};
    ok.forEach(function (s) { if (s.upn && s.isInteractive) (byUserOk[s.upn] = byUserOk[s.upn] || []).push(s); });
    Object.keys(byUserOk).forEach(function (u) {
      const list = byUserOk[u].slice().sort(function (a, b) { return String(a.t).localeCompare(String(b.t)); });
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i];
        if (!a.ip || !b.ip) continue;
        const dt = (new Date(b.t) - new Date(a.t)) / 1000;
        if (dt >= 0 && dt <= 30 && (a.ip !== b.ip || (a.asn && b.asn && a.asn !== b.asn))) {
          add("Medium", A, "Two successful sign-ins from different IPs within 30 seconds",
            a.ip + " (" + a.cc + (a.asn ? ", AS" + a.asn : "") + ") then " + b.ip + " (" + b.cc + (b.asn ? ", AS" + b.asn : "") + ") " + Math.round(dt) + "s apart. Correlate session and device evidence; VPNs and multiple devices can produce this pattern. This does not confirm AiTM.", u, b.t, "T1557", [a, b]);
          break;
        }
      }
    });
    // Very risky authentication (P2)
    norm.filter(function (s) { return s.risk === "high" && s.riskState === "atRisk" && /medium|high/.test(s.riskAgg); }).forEach(function (s) {
      add("High", A, "Very risky authentication (high risk, atRisk)", "IP " + s.ip + " (" + s.cc + "), app " + s.app + ".", s.upn, s.t, undefined, [s]);
    });
    // PRT token replay (ROADtx)
    norm.filter(function (s) { return s.appId === APPID.AUTH_BROKER && s.userType === "member" && s.tokenProt === "unbound" && s.devId && s.tokenType === "primaryRefreshToken"; }).forEach(function (s) {
      add("High", A, "Unusual PRT usage on registered device (token replay)", "Authentication Broker + unbound primary refresh token: the shape of ROADtx PRT abuse. Device " + s.devId + ", IP " + s.ip + ".", s.upn, s.t, "T1098.005", [s]);
    });
    // VSCode OAuth phishing
    norm.filter(function (s) { return s.appId === APPID.VSCODE && s.resId === APPID.GRAPH && s.err === 0 && s.userType === "member"; }).forEach(function (s) {
      add("Medium", A, "Visual Studio Code client obtained a Graph token", "The public VSCode client is abused for OAuth phishing (token grab without app consent). IP " + s.ip + " (" + s.cc + ").", s.upn, s.t, "T1528", [s]);
    });
    // Cross-tenant B2B
    const b2b = norm.filter(function (s) { return s.xTenant === "b2bCollaboration" && s.err === 0; });
    if (b2b.length) add("Medium", A, "B2B cross-tenant sign-ins: " + b2b.length, "Cross-tenant sync/B2B is a lateral-movement path. Users: " + uniq(b2b.map(function (s) { return s.upn; })).slice(0, 8).join(", "), "", b2b[0].t, undefined, b2b);
    // Compliance bypass via Intune Company Portal
    norm.filter(function (s) {
      return s.appId === APPID.INTUNE_PORTAL && (s.err === 0 || s.err === 50199) && s.compliant === false &&
        (s.caPolicies || []).some(function (p) { const g = (p.enforcedGrantControls || []).join(","); return (/RequireCompliantDevice/.test(g) && p.result === "failure") || (/Block/.test(g) && p.result === "notApplied"); });
    }).forEach(function (s) {
      add("High", A, "Possible device-compliance bypass via Intune Company Portal", "Non-compliant device, CA compliance control failed or not applied. IP " + s.ip + ".", s.upn, s.t, "T1548", [s]);
    });
    // Offensive-tool browser
    norm.filter(function (s) { return /Python Requests/i.test(s.browser) || /python-requests|PostmanRuntime|python\//i.test(s.ua); }).forEach(function (s) {
      add("High", A, "Scripting/HTTP-client user agent in sign-in", (s.browser || s.ua) + " — automated tooling, not a browser. IP " + s.ip + ".", s.upn, s.t, undefined, [s]);
    });
    // Service-principal / managed-identity sign-ins (MAS ServicePrincipal analyzer): credential use from
    // a hosting/VPN ASN or a blacklisted country, and new credential keys, are the signals worth a look.
    const sp = norm.filter(function (s) { return s.isSp && s.err === 0; });
    if (sp.length) {
      S.spSignIns = sp.length; S.spApps = top(count(sp, function (s) { return s.spName || s.spId; }), 12);
      const odd = sp.filter(function (s) { return (blAsn(s.asn) && !asnCarrier(s.asn)) || blCountry(s.cc); });
      const byApp = {};
      odd.forEach(function (s) { const k = s.spName || s.spId; (byApp[k] = byApp[k] || []).push(s); });
      Object.keys(byApp).forEach(function (k) {
        const g = byApp[k];
        add("High", A, "Service principal '" + k + "' authenticated from a blacklisted network (" + g.length + ")",
          "IPs " + uniq(g.map(function (s) { return s.ip; })).slice(0, 6).join(", ") + ", countries " + uniq(g.map(function (s) { return s.cc; })).join(", ") + (g[0].credKey ? ", credential key " + g[0].credKey : "") + ". Application credentials used from VPN/hosting space suggest a leaked secret or certificate.", "", g[0].t, "T1078.004", g);
      });
    }
    // Blacklists (successful sign-ins only), grouped. MAS highlights these; they are context, not verdicts:
    // hosting/VPN ASN and blacklisted country → Medium, residential carriers → Info, UA/app keep their own rating.
    norm.forEach(function (s) { s._bl = s.isSp ? {} : { asn: blAsn(s.asn), cc: blCountry(s.cc), ua: blUa(s.ua), app: blApp(s.appId) }; });
    blGroup(norm, "asn", "ASN", function (s) { return "AS" + s._bl.asn.asn + " " + s._bl.asn.org; }, add, A, function (g) { return asnCarrier(g[0].asn) ? "Info" : "Medium"; });
    blGroup(norm, "cc", "country", function (s) { return s._bl.cc; }, add, A, function () { return "Medium"; });
    blGroup(norm, "ua", "user agent", function (s) { return s.ua; }, add, A, function (g) { return g[0]._bl.ua.sev || "High"; });
    blGroup(norm, "app", "application", function (s) { return s._bl.app.name; }, add, A, function (g) { return g[0]._bl.app.sev || "High"; });
  }
  function blGroup(norm, kind, label, fmt, add, A, sevFn) {
    const hits = norm.filter(function (s) { return s._bl[kind] && s.err === 0; });
    if (!hits.length) return;
    const byKey = {};
    hits.forEach(function (s) { const k = fmt(s); (byKey[k] = byKey[k] || []).push(s); });
    Object.keys(byKey).forEach(function (k) {
      const g = byKey[k], users = uniq(g.map(function (s) { return s.upn; }));
      const sev = sevFn(g);
      add(sev, A, (sev === "Info" ? "Residential-carrier ASN on the watch list: " : "Blacklisted " + label + ": ") + k + " (" + g.length + " successful sign-in" + (g.length === 1 ? "" : "s") + ")",
        "Users: " + users.slice(0, 8).join(", ") + (users.length > 8 ? " +" + (users.length - 8) + " more" : "") + (sev === "Info" ? ". Home-ISP traffic; only relevant together with another signal for the same account." : ""), users.length === 1 ? users[0] : "", g[0].t, undefined, g);
    });
  }

  // ====================================================== directory audits --
  function anAudits(ev, add, S) {
    const da = ev.directoryAudits || [];
    if (!da.length) return;
    const A = "EntraAuditLogs";
    const norm = da.map(function (r) {
      return {
        [RECORD]: r, act: r.activityDisplayName || r.Activity || "", cat: r.category || "", svc: r.loggedByService || "",
        status: get(r, "result", r.Status || ""), reason: r.resultReason || r.StatusReason || "",
        by: get(r, "initiatedBy.user.userPrincipalName", "") || get(r, "initiatedBy.app.displayName", ""),
        t: r.activityDateTime || r.ActivityDateTime, targets: r.targetResources || []
      };
    });
    S.auditActivities = top(count(norm, function (r) { return r.act; }), 15);

    // What the audit entry is actually about: the target objects (app, role, user) and the
    // modified properties (consented scopes, role name, admin vs user consent, method registered).
    const strip = function (v) { return String(v == null ? "" : v).replace(/^"|"$/g, "").replace(/^\[|\]$/g, "").trim(); };
    function describe(r) {
      const targets = (r.targets || []).map(function (t) { return { type: t.type || "", name: t.displayName || t.userPrincipalName || "", id: t.id || "" }; });
      const props = {};
      (r.targets || []).forEach(function (t) { (t.modifiedProperties || []).forEach(function (m) { if (m.displayName && !(m.displayName in props)) props[m.displayName] = strip(m.newValue); }); });
      const app = targets.find(function (t) { return /ServicePrincipal|Application/i.test(t.type); }) || {};
      const user = targets.find(function (t) { return /User/i.test(t.type) && t.name; }) || {};
      const role = props["Role.DisplayName"] || props["RoleDefinition.DisplayName"] || props["Role.TemplateId"] || "";
      const scopes = props["ConsentAction.Permissions"] || props["DelegatedPermissionGrant.Scope"] || "";
      const adminConsent = /true/i.test(props["ConsentContext.IsAdminConsent"] || "");
      return { targets: targets, props: props, app: app.name || "", user: user.name || "", role: role, scopes: scopes, adminConsent: adminConsent, method: props["StrongAuthenticationMethod"] || props["StrongAuthenticationUserDetails"] || "" };
    }
    function scopeSeverity(scopes) {
      const list = String(scopes || "").match(/[A-Za-z][\w.-]*\.[\w.-]+|offline_access|openid|profile|email/g) || [];
      const risky = list.filter(function (x) { return BL.DEL_PERM[x] && SEV_RANK[BL.DEL_PERM[x]] < SEV_RANK.Low; });
      const worst = risky.reduce(function (w, x) { return SEV_RANK[BL.DEL_PERM[x]] < SEV_RANK[w] ? BL.DEL_PERM[x] : w; }, "Low");
      return { risky: risky, worst: worst };
    }
    function flag(pred, sev, title, mitre) {
      const hits = norm.filter(pred);
      hits.slice(0, 12).forEach(function (r) {
        const d = describe(r);
        let t = title, s = sev, extra = [];
        if (/consent|delegated permission|app role assignment|service principal|application/i.test(title)) {
          if (d.app) t += ": " + d.app;
          if (d.scopes) {
            const sc = scopeSeverity(d.scopes);
            extra.push("Permissions: " + d.scopes);
            if (sc.risky.length) { extra.push("Risky: " + sc.risky.join(", ")); s = sc.worst; }
            else if (/consent|delegated/i.test(title)) s = d.adminConsent ? "Medium" : "Low";
          }
          if (/consent/i.test(title)) extra.push(d.adminConsent ? "Tenant-wide admin consent — review under Entra › Enterprise applications" : "User consent" + (d.user ? " for " + d.user : ""));
        }
        if (/role/i.test(title)) { if (d.role) t += ": " + d.role; if (d.user) extra.push("Assigned to " + d.user); }
        if (/MFA|Strong-authentication|security info/i.test(title) && (d.method || d.user)) extra.push((d.method ? "Method: " + d.method + ". " : "") + (d.user ? "Account: " + d.user : ""));
        if (/domain/i.test(title) && d.targets[0]?.name) t += ": " + d.targets[0].name;
        if (/password/i.test(title) && d.user) extra.push("Account: " + d.user);
        if (!extra.length && d.targets.length) extra.push("Target: " + d.targets.map(function (x) { return x.name || x.id; }).filter(Boolean).slice(0, 3).join(", "));
        add(s, A, t, "Activity '" + r.act + "'" + (r.by ? " by " + r.by : "") + (r.status ? " (" + r.status + ")" : "") + "." + (extra.length ? " " + extra.join(". ") + "." : ""), d.user && /role|password|MFA|Strong/i.test(title) ? d.user : r.by, r.t, mitre, [r]);
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
    // Privilege escalation and persistence in the directory
    flag(function (r) { return /^Add (eligible )?member to role/i.test(r.act) && /success/i.test(r.status); }, "High", "Directory role assigned (member or PIM-eligible)", "T1098.003");
    flag(function (r) { return /^Add member to group/i.test(r.act) && r.targets.some(function (t) { return (t.modifiedProperties || []).some(function (p) { return /isAssignableToRole/i.test(p.displayName) && /true/i.test(p.newValue || ""); }); }); }, "High", "Member added to a role-assignable group", "T1098.003");
    flag(function (r) { return /^Update user/i.test(r.act) && r.targets.some(function (t) { return (t.modifiedProperties || []).some(function (p) { return /StrongAuthentication(Method|PhoneAppDetail|UserDetails)/i.test(p.displayName); }); }); }, "High", "Strong-authentication (MFA) details changed on a user", "T1098.005");
    flag(function (r) { return /^Add unverified domain|^Verify domain/i.test(r.act); }, "High", "Domain added or verified in the tenant", "T1585");
    flag(function (r) { return /^Add partner to company|^Set Company Information/i.test(r.act) && /success/i.test(r.status); }, "Medium", "Tenant-level partner or company setting changed", "T1098");
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
          add("High", A, "Suspicious cloud device registration (ROADtools pattern)", "Add device + registered users + registered owner within 60s on one correlation id — automated device join for persistence.", get(addDev, "initiatedBy.user.userPrincipalName", ""), addDev.activityDateTime, "T1098.005", g);
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
        [RECORD]: r, op: r.operation || r.Operations || ad.Operation || "", rt: r.recordType || ad.RecordType || "",
        upn: r.userPrincipalName || r.UserIds || ad.UserId || "", t: r.createdDateTime || ad.CreationTime || r.CreationDate,
        ip: ad.ClientIP || ad.ClientIPAddress || "", ad: ad
      };
    });
    S.ualOps = top(count(norm, function (r) { return r.op; }), 15);

    // Suspicious operations: the curated UAL_OPS table (severity + MITRE) plus the full upstream
    // operation blacklist (BL.OPERATION), matched case-insensitively and with/without the trailing dot.
    const opKey = function (op) { return lc(op).replace(/\.$/, ""); };
    const ops = {};
    Object.keys(BL.OPERATION || {}).forEach(function (op) { ops[opKey(op)] = { label: op.replace(/\.$/, ""), sev: BL.OPERATION[op].sev || "Medium", mitre: "", note: BL.OPERATION[op].d || "" }; });
    Object.keys(UAL_OPS).forEach(function (op) { ops[opKey(op)] = { label: op, sev: UAL_OPS[op][0], mitre: UAL_OPS[op][1], note: UAL_OPS[op][2] }; });
    const byOp = {};
    norm.forEach(function (r) { const k = opKey(r.op); if (ops[k]) (byOp[k] = byOp[k] || []).push(r); });
    Object.keys(byOp).forEach(function (k) {
      const meta = ops[k], hits = byOp[k];
      const byUser = count(hits, function (r) { return r.upn; });
      add(meta.sev, A, meta.label + " ×" + hits.length + " — " + meta.note, "Users: " + topStr(byUser, 8), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", hits[0].t, meta.mitre, hits);
    });
    // Sign-in records inside the UAL (UserLoggedIn/UserLoginFailed) carry their own IP and user agent;
    // run the UA blacklist and scripting-client check there as well (MAS UAL "UserLoggedIn" checks).
    const logins = norm.filter(function (r) { return /^UserLoggedIn$/i.test(r.op); });
    if (logins.length) {
      const ua = function (r) { const x = get(r.ad, "ExtendedProperties", []) || []; const p = x.find(function (e) { return e.Name === "UserAgent"; }); return p ? String(p.Value || "") : ""; };
      const hitsUa = logins.filter(function (r) { const u = ua(r); return u && (blUa(u) || /python-requests|PostmanRuntime|python\/|axios\/|curl\//i.test(u)); });
      if (hitsUa.length) {
        const byUser = count(hitsUa, function (r) { return r.upn; });
        add("High", A, "UAL sign-ins with a scripting or blacklisted user agent (" + hitsUa.length + ")", "Agents: " + uniq(hitsUa.map(ua)).slice(0, 4).join(" | ") + ". Users: " + topStr(byUser, 6), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", hitsUa[0].t, "T1078.004", hitsUa);
      }
    }
    // Disable Unified Audit Logging
    norm.filter(function (r) {
      if (r.op !== "Set-AdminAuditLogConfig") return false;
      const params = get(r.ad, "Parameters", []) || [];
      return params.some(function (p) { return /UnifiedAuditLogIngestionEnabled/i.test(p.Name) && /false/i.test(p.Value); });
    }).forEach(function (r) { add("Critical", A, "Unified Audit Logging disabled (anti-forensics)", "Set-AdminAuditLogConfig set UnifiedAuditLogIngestionEnabled=False.", r.upn, r.t, "T1562.008", [r]); });
    // Forwarding via Set-Mailbox
    norm.filter(function (r) { return r.op === "Set-Mailbox"; }).forEach(function (r) {
      const params = get(r.ad, "Parameters", []) || [];
      const fwd = params.filter(function (p) { return /^(ForwardingAddress|ForwardingSmtpAddress)$/i.test(p.Name) && !/^(null|\$null|false)?$/i.test(String(p.Value ?? "").trim()); });
      if (fwd.length) add("High", A, "Mailbox forwarding configured", fwd.map(function (p) { return p.Name + " = " + p.Value; }).join("; "), r.upn, r.t, "T1114.003", [r]);
    });
    // Inbox rule content highlights (hide/forward)
    norm.filter(function (r) { return /InboxRule|UpdateInboxRules/i.test(r.op); }).forEach(function (r) {
      // PowerShell/OWA rules log Parameters[]; Outlook desktop and EWS (UpdateInboxRules) log
      // OperationProperties[] with RuleName / RuleActions / RuleCondition (JSON strings).
      const params = get(r.ad, "Parameters", []) || [];
      const byName = {}; params.forEach(function (p) { byName[p.Name] = p.Value; });
      const opp = get(r.ad, "OperationProperties", []) || [];
      opp.forEach(function (p) {
        if (p.Name === "RuleName" && !byName.Name) byName.Name = p.Value;
        if (p.Name === "RuleActions") {
          let actions = []; try { actions = JSON.parse(p.Value); } catch (e) { actions = []; }
          (Array.isArray(actions) ? actions : [actions]).forEach(function (a) {
            const t = lc(a && (a.ActionType || a.Type || a.actionType)), v = a && (a.Recipients || a.Recipient || a.Folder || a.FolderName || a.Value || "");
            if (/forward|redirect/.test(t)) byName.ForwardTo = byName.ForwardTo || String(Array.isArray(v) ? v.join(", ") : v || "(recipient not logged)");
            if (/delete/.test(t)) byName.DeleteMessage = "True";
            if (/markasread/.test(t)) byName.MarkAsRead = "True";
            if (/move/.test(t) && v) byName.MoveToFolder = byName.MoveToFolder || String(v);
            if (/stopprocessing/.test(t)) byName.StopProcessingRules = "True";
          });
        }
      });
      const bad = [];
      if (/^true$/i.test(byName.MarkAsRead || "")) bad.push("marks as read");
      if (/^true$/i.test(byName.DeleteMessage || "")) bad.push("deletes message");
      if (/^true$/i.test(byName.StopProcessingRules || "")) bad.push("stops processing rules");
      if (byName.MoveToFolder && BL.MOVE_FOLDER.some(function (f) { return lc(f) === lc(byName.MoveToFolder) || lc(byName.MoveToFolder).indexOf(lc(f)) !== -1; })) bad.push("moves to '" + byName.MoveToFolder + "'");
      if (byName.ForwardTo || byName.ForwardAsAttachmentTo || byName.RedirectTo) bad.push("forwards/redirects mail");
      const nm = byName.Name || "";
      if (/^[^a-zA-Z\d\s:]/.test(nm) || /^[a-zA-Z0-9]{1,5}$/.test(nm)) bad.push("stealthy rule name '" + nm + "'");
      if (bad.length) add("High", A, "Suspicious inbox rule: " + bad.join(", "), "Operation " + r.op + (nm ? ", rule '" + nm + "'" : "") + (byName.ForwardTo ? ", to " + byName.ForwardTo : "") + ".", r.upn, r.t, "T1564.008", [r]);
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
          add("High", A, "Mass " + op + ": " + perUserDay[k] + " on " + parts[1] + " (≥" + th + "/day)", op === "FileDownloaded" ? "Bulk download — possible exfiltration." : "Bulk mailbox operation — possible deletion/exfiltration.", parts[0], parts[1], op === "FileDownloaded" ? "T1567" : "T1114", hits.filter(r => r.upn + "|" + day(r.t) === k));
        }
      });
    });
    // MailItemsAccessed sync + throttle
    const mia = norm.filter(function (r) { return r.op === "MailItemsAccessed"; });
    if (mia.length) {
      const sync = mia.filter(function (r) { const opp = get(r.ad, "OperationProperties", []) || []; return opp.some(function (p) { return p.Name === "MailAccessType" && p.Value === "Sync"; }); });
      const throttled = mia.filter(function (r) { const opp = get(r.ad, "OperationProperties", []) || []; return opp.some(function (p) { return p.Name === "IsThrottled" && /true/i.test(p.Value); }); });
      if (sync.length) add("High", A, "Whole-folder mailbox sync (MailItemsAccessed — Sync): " + sync.length, "Sync access pulls an entire folder to a client — bulk read/exfiltration. Users: " + uniq(sync.map(function (r) { return r.upn; })).slice(0, 6).join(", "), uniq(sync.map(function (r) { return r.upn; })).length === 1 ? sync[0].upn : "", sync[0].t, "T1114", sync);
      if (throttled.length) add("Medium", A, "MailItemsAccessed throttled — evidence gap", "Microsoft stops logging after >1000 MailItemsAccessed in <24h; some access is unrecorded.", uniq(throttled.map(function (r) { return r.upn; })).length === 1 ? throttled[0].upn : "", throttled[0].t, "T1114", throttled);
      // Client depth (MAS MailItemsAccessed + ClientInfoString): which client read the mail, from where,
      // and how many items per folder. Non-Outlook clients and blacklisted apps/UAs are the signal.
      const client = function (r) { return String(get(r.ad, "ClientInfoString", "") || get(r.ad, "ClientAppId", "") || ""); };
      const oddClient = mia.filter(function (r) { const c = client(r), app = lc(get(r.ad, "AppId", "") || get(r.ad, "ClientAppId", "")); return (c && (blUa(c) || /python|axios|curl|PostmanRuntime|Client=REST;.*(Graph|Explorer)/i.test(c))) || (app && blApp(app)); });
      if (oddClient.length) {
        const byUser = count(oddClient, function (r) { return r.upn; });
        add("High", A, "Mailbox read by a scripting or blacklisted client (" + oddClient.length + " MailItemsAccessed)", "Clients: " + uniq(oddClient.map(client)).slice(0, 4).join(" | ") + ". IPs: " + uniq(oddClient.map(function (r) { return r.ip; })).slice(0, 6).join(", ") + ". Users: " + topStr(byUser, 6), Object.keys(byUser).length === 1 ? Object.keys(byUser)[0] : "", oddClient[0].t, "T1114.002", oddClient);
      }
      const perClient = count(mia, function (r) { return (client(r) || "unknown").split(";")[0]; });
      S.miaClients = top(perClient, 8);
      const items = {};
      mia.forEach(function (r) { (get(r.ad, "Folders", []) || []).forEach(function (f) { const k = r.upn + "|" + (f.Path || f.Id || "?"); items[k] = (items[k] || 0) + ((f.FolderItems || []).length || 0); }); });
      Object.keys(items).filter(function (k) { return items[k] >= 500; }).slice(0, 5).forEach(function (k) {
        const parts = k.split("|");
        add("Medium", A, "Heavy folder access: " + items[k] + " items read from " + parts[1], "Individual item reads recorded in MailItemsAccessed for one folder — consistent with a mailbox being combed or downloaded.", parts[0], mia[0].t, "T1114.002", mia.filter(r => r.upn === parts[0] && (get(r.ad, "Folders", []) || []).some(f => (f.Path || f.Id || "?") === parts[1])));
      });
    }
  }

  // ================================================= identity protection --
  function anRiskyDetections(ev, add, S) {
    const rd = ev.riskDetections || [];
    if (!rd.length) return;
    const A = "RiskyDetections";
    const RED = { maliciousIPAddress: 1, mcasSuspiciousInboxManipulationRules: 1, nationStateIP: 1, passwordSpray: 1 };
    S.riskEventTypes = top(count(rd, function (r) { return r.riskEventType || ""; }), 12);
    rd.forEach(function (r) {
      const et = r.riskEventType || "", lvl = lc(r.riskLevel);
      let sev = RED[et] ? "High" : (et === "unlikelyTravel" ? "Medium" : (lvl === "high" ? "High" : lvl === "medium" ? "Medium" : "Low"));
      const mitre = get(r, "additionalInfo", ""); // often JSON; keep light
      add(sev, A, "Risk detection: " + (et || "risk") + " (" + (r.riskLevel || "?") + ")",
        "State " + (r.riskState || "?") + (r.ipAddress ? ", IP " + r.ipAddress : "") + (r.location && r.location.countryOrRegion ? " (" + r.location.countryOrRegion + ")" : "") + ".",
        r.userPrincipalName || "", r.detectedDateTime || r.activityDateTime, typeof mitre === "string" && /T1\d/.test(mitre) ? (mitre.match(/T1[\d.]+/) || [""])[0] : "", [r]);
    });
  }
  function anRiskyUsers(ev, add, S) {
    const ru = ev.riskyUsers || [];
    if (!ru.length) return;
    const A = "RiskyUsers";
    ru.forEach(function (r) {
      const lvl = lc(r.riskLevel), st = lc(r.riskState);
      if (/dismissed|remediated|confirmedsafe/.test(st) || lvl === "none" || lvl === "hidden") return;
      const sev = lvl === "high" ? "Critical" : lvl === "medium" ? "High" : lvl === "low" ? "Medium" : "Low";
      add(sev, A, "Risky user: " + (r.riskLevel || "?") + " (" + (r.riskState || "?") + ")", "Identity Protection flagged this account.", r.userPrincipalName || "", r.riskLastUpdatedDateTime, undefined, [r]);
    });
  }

  // ============================================================ OAuth --
  function anOauth(ev, add, S) {
    const scoped = window.BETA_Evidence.userScope(ev);
    const g = (ev.oauthGrants || []).filter(grant =>
      !scoped || window.BETA_Evidence.oauthScope(ev, grant) === "user");
    if (!g.length) return;
    const A = "OAuthPermissions";
    // Without the servicePrincipals inventory grants carry only object IDs, so the app blacklist
    // cannot be evaluated; the desk shows this from the stats rather than as a finding.
    S.oauthAppBlacklistEvaluated = (ev.servicePrincipals || []).length > 0 || g.some(function (x) { return x.appId; });
    g.forEach(function (grant) {
      const principal = scoped ? ev.subject?.upn || ev.upn || ev.user?.userPrincipalName || grant.principalUpn || ev.subject?.objectId || ev.user?.id || "" :
        grant.consentType === "AllPrincipals" ? "" : grant.principalUpn || grant.principalDisplayName || "";
      const scopes = (grant.scope || "").split(/\s+/).filter(Boolean);
      const type = grant.permissionType || "Delegated";
      const table = type === "Application" ? BL.APP_PERM : BL.DEL_PERM;
      // "Low" rows in the upstream table (openid, profile, User.Read, offline_access…) are baseline
      // sign-in scopes every app holds; they never make a grant a finding on their own.
      const risky = scopes.filter(function (s) { return table[s] && SEV_RANK[table[s]] < SEV_RANK.Low; });
      const worst = risky.reduce(function (w, s) { return SEV_RANK[table[s]] < SEV_RANK[w] ? table[s] : w; }, "Low");
      // clientId is the service-principal object id; the app blacklist is keyed by appId, which
      // evidence.refresh() fills in from the servicePrincipals inventory when it was collected.
      const appBl = blApp(grant.appId);
      const name = grant.appName || grant.appDisplayName || grant.clientId || "app";
      // Blacklisted app itself
      if (appBl) add(appBl.sev, A, "Blacklisted application consented: " + (appBl.name || name), "Known-risky OAuth app. Consent type: " + (grant.consentType || "?") + ".", principal, grant.createdDateTime, undefined, [grant, ...(ev.servicePrincipals || []).filter(sp => sp.id === grant.clientId)]);
      // Non-alphanumeric / user-shaped app name
      if (/^[^a-zA-Z0-9]+$/.test(name)) add("High", A, "OAuth app with non-alphanumeric name: '" + name + "'", "Random/garbage app names are a hallmark of illicit consent grants.", principal, grant.createdDateTime, "T1528", [grant, ...(ev.servicePrincipals || []).filter(sp => sp.id === grant.clientId)]);
      // Risky scopes
      if (risky.length) add(worst, A, "OAuth app '" + name + "' holds risky " + type.toLowerCase() + " permissions",
        (grant.consentType === "AllPrincipals" ? "Tenant-wide" : "Per-user") + " grant. Risky scopes: " + risky.slice(0, 10).join(", ") + (risky.length > 10 ? " +" + (risky.length - 10) : "") + ".",
        principal, grant.createdDateTime, "T1528", [grant, ...(ev.servicePrincipals || []).filter(sp => sp.id === grant.clientId)]);
    });
  }

  // ============================================================ inventory --
  function anUsers(ev, add, S) {
    const us = ev.users || ev.allUsers || [];
    if (!us.length) return;
    const A = "Users";
    const now = +new Date(ev.generated || Date.now());
    const enabled = us.filter(function (u) { return u.accountEnabled !== false && String(u.accountEnabled) !== "False"; }).length;
    S.usersTotal = us.length; S.usersEnabled = enabled; S.usersGuests = us.filter(function (u) { return /#EXT#@/i.test(u.userPrincipalName || ""); }).length;
    // Recently created (7d) - informational
    const recent = us.filter(function (u) { const c = +new Date(u.createdDateTime || 0); return c && (now - c) < 7 * 864e5; });
    if (recent.length) add("Low", A, recent.length + " account(s) created in the last 7 days", recent.slice(0, 10).map(function (u) { return u.userPrincipalName; }).join(", "), recent.length === 1 ? recent[0].userPrincipalName : "", recent[0] && recent[0].createdDateTime, undefined, recent);
    // Stale password (never changed in >1y) on enabled accounts
    const stale = us.filter(function (u) { const p = +new Date(u.lastPasswordChangeDateTime || 0); return p && (now - p) > 365 * 864e5 && u.accountEnabled !== false; });
    if (stale.length) add("Low", A, stale.length + " enabled account(s) with a password older than a year", "Credential-stuffing exposure where MFA is absent.", "", "", undefined, stale);
  }
  function anDevices(ev, add, S) {
    const dv = ev.devices || [];
    if (!dv.length) return;
    const A = "Devices";
    const now = +new Date(ev.generated || Date.now());
    S.devicesTotal = dv.length;
    const stale = dv.filter(function (d) { const s = +new Date(d.approximateLastSignInDateTime || d.lastSignInDateTime || 0); return s && (now - s) > 90 * 864e5; });
    if (stale.length) add("Low", A, stale.length + " stale device(s) (no sign-in in 90+ days)", "Dormant registered devices widen the attack surface; review and retire.", "", "", undefined, stale);
    const recent = dv.filter(function (d) { const c = +new Date(d.registrationDateTime || d.createdDateTime || 0); return c && (now - c) < 7 * 864e5; });
    if (recent.length) add("Medium", A, recent.length + " device(s) registered in the last 7 days", "New device joins during an incident window can be attacker persistence — confirm each.", "", recent[0] && (recent[0].registrationDateTime || recent[0].createdDateTime), "T1098.005", recent);
  }
  function anAdmins(ev, add, S) {
    const ad = ev.admins || [];
    if (!ad.length) return;
    const A = "Admins";
    S.adminsTotal = ad.length;
    const disabled = ad.filter(function (a) { return a.accountEnabled === false || String(a.accountEnabled) === "False"; });
    if (disabled.length) add("Medium", A, disabled.length + " disabled account(s) still holding a directory role", disabled.slice(0, 10).map(function (a) { return (a.userPrincipalName || a.userName) + " (" + (a.role || a.roles || "?") + ")"; }).join(", "), "", "", undefined, [...disabled, ...(ev.users || []).filter(u => disabled.some(a => a.principalId === u.id))]);
    const guests = ad.filter(function (a) { return /#EXT#@/i.test(a.userPrincipalName || a.userName || ""); });
    if (guests.length) add("High", A, guests.length + " guest/external account(s) hold a directory role", "External identities with admin roles are a high-value target and a common backdoor.", "", "", "T1098", guests);
    // Dormant admins (no interactive sign-in in 90+ days). Needs signInActivity on the user inventory
    // (collected with $select=…,signInActivity); without it the rule stays silent rather than guessing.
    const now = +new Date(ev.generated || Date.now());
    const byId = new Map((ev.users || []).map(function (u) { return [u.id, u]; }));
    const lastSeen = function (a) { const u = byId.get(a.principalId) || {}; const sa = u.signInActivity || a.signInActivity || {}; return a.lastInteractiveSignIn || a.lastSignIn || sa.lastSuccessfulSignInDateTime || sa.lastSignInDateTime || sa.lastNonInteractiveSignInDateTime || ""; };
    const known = ad.filter(function (a) { return lastSeen(a); });
    const dormant = known.filter(function (a) { const s = +new Date(lastSeen(a)); return s && (now - s) > 90 * 864e5; });
    if (dormant.length) add("Medium", A, dormant.length + " admin account(s) dormant 90+ days", "Unused privileged accounts should be removed or converted to eligible (PIM): " + dormant.slice(0, 8).map(function (a) { return a.userPrincipalName || a.displayName; }).join(", "), "", "", undefined, [...dormant, ...(ev.users || []).filter(u => dormant.some(a => a.principalId === u.id))]);
    // PIM: eligible and time-bound active assignments (roleEligibilityScheduleInstances /
    // roleAssignmentScheduleInstances) are merged into the admins view by the collectors with a `kind`.
    const eligible = ad.filter(function (a) { return a.kind === "eligible"; });
    if (eligible.length) S.adminsEligible = eligible.length;
    const privileged = /Global Administrator|Privileged Role Administrator|Privileged Authentication Administrator|Security Administrator|Exchange Administrator|Application Administrator|Cloud Application Administrator|Hybrid Identity Administrator|Partner Tier2 Support|User Administrator|Authentication Administrator|Conditional Access Administrator|Intune Administrator/i;
    const highly = ad.filter(function (a) { return privileged.test(a.role || "") && a.kind !== "eligible"; });
    S.adminsPrivilegedActive = highly.length;
    if (highly.length >= 6) add("Low", A, highly.length + " permanently active assignments in highly privileged roles", "Consider PIM eligibility for: " + uniq(highly.map(function (a) { return a.userPrincipalName || a.displayName; })).slice(0, 10).join(", "), "", "", undefined, highly);
  }
  function anMfa(ev, add, S) {
    const mfa = ev.mfa || [];
    if (!mfa.length) return;
    const A = "MFA";
    const noMfa = mfa.filter(function (m) { return m.isMfaRegistered === false || String(m.isMfaRegistered) === "False"; });
    S.mfaTotal = mfa.length; S.mfaNoSecondFactor = noMfa.length;
    if (noMfa.length) {
      const admins = noMfa.filter(function (m) { return m.isAdmin === true || String(m.isAdmin) === "True"; });
      add(admins.length ? "High" : "Medium", A, noMfa.length + " account(s) with no second factor registered" + (admins.length ? " (" + admins.length + " admin)" : ""),
        "Password-only accounts. " + (admins.length ? "Admins without MFA: " + admins.slice(0, 8).map(function (m) { return m.userPrincipalName; }).join(", ") : "Register phishing-resistant MFA and enforce via CA."),
        noMfa.length === 1 ? noMfa[0].userPrincipalName : "", "", undefined, noMfa);
    }
    // Weak second factor only (SMS / voice) — phishable and SIM-swappable; MAS MFA report "methods registered".
    const strong = /microsoftAuthenticator|fido2|passKey|windowsHelloForBusiness|softwareOneTimePasscode|hardwareOneTimePasscode|temporaryAccessPass|x509Certificate|macOsSecureEnclaveKey|passKeyDeviceBound/i;
    const weak = mfa.filter(function (m) { if (!(m.isMfaRegistered === true || String(m.isMfaRegistered) === "True")) return false; const methods = m.methodsRegistered || []; return methods.length && !methods.some(function (x) { return strong.test(x); }) && methods.some(function (x) { return /mobilePhone|alternateMobilePhone|officePhone|sms|voice/i.test(x); }); });
    S.mfaWeakOnly = weak.length;
    if (weak.length) {
      const admins = weak.filter(function (m) { return m.isAdmin === true || String(m.isAdmin) === "True"; });
      add(admins.length ? "High" : "Low", A, weak.length + " account(s) rely on SMS/voice as their only second factor" + (admins.length ? " (" + admins.length + " admin)" : ""),
        "Phone-based MFA is phishable and SIM-swappable. " + (admins.length ? "Admins: " + admins.slice(0, 8).map(function (m) { return m.userPrincipalName; }).join(", ") : "Move these users to Authenticator or passkeys."),
        weak.length === 1 ? weak[0].userPrincipalName : "", "", undefined, weak);
    }
  }

  window.BETA_Analyzers = { analyze: analyze, SEV_RANK: SEV_RANK };
})();
