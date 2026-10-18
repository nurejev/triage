// Unit test for the BETA MAS engine + import, run against the demo tenant.
import { readFileSync } from "fs";
const R = new URL(".", import.meta.url).pathname;
const win = {};
global.window = win;
for (const f of ["js/evidence.js", "js/blacklists.js", "js/exchange-analysis.js", "js/analyzers.js", "js/demo.js", "js/import.js"]) {
  new Function("window", readFileSync(R + "/" + f, "utf8"))(win);
}
let fails = 0;
const ok = (c, m) => { console.log((c ? "  ok " : "FAIL ") + m); if (!c) fails++; };

// minimal FileReader mock (defined before any import() call)
global.FileReader = class {
  set onload(fn) { this._l = fn; } set onerror(fn) {}
  readAsText(file) { this.result = file._text; const l = this._l; setTimeout(() => l && l(), 0); }
};
function mockFile(o) { return { name: o.name, _text: o._text }; }

// blacklists loaded
ok(Object.keys(win.BETA_BL.ASN).length > 300, "ASN blacklist loaded (" + Object.keys(win.BETA_BL.ASN).length + ")");
ok(Object.keys(win.BETA_BL.DEL_PERM).length > 100, "delegated-permission blacklist loaded");
ok(win.BETA_BL.COUNTRY.RU === "Russia", "country blacklist maps RU->Russia");

// analyze the demo tenant
const ev = win.BETA_Demo.evidence();
const res = win.BETA_Analyzers.analyze(ev);
const F = res.findings;
const has = (re) => F.some(f => re.test(f.Title) || re.test(f.Detail));
const bySev = s => F.filter(f => f.Severity === s).length;

console.log(`  -- ${F.length} findings, ${res.users.length} accounts; C${bySev("Critical")} H${bySev("High")} M${bySev("Medium")} L${bySev("Low")}`);

ok(F.length >= 20, "produced a substantial finding set");
ok(res.users.length >= 3, "multiple accounts implicated");

// sign-in analyzer
ok(has(/AiTM phishing pattern/i), "OfficeHome AiTM fingerprint detected");
ok(has(/different IPs within 30 seconds/i), "30-second AiTM relay pair detected");
ok(F.some(f => f.Severity === "Medium" && /30 seconds/.test(f.Title)), "rapid IP changes require review and are not asserted as confirmed AiTM");
ok(has(/Authenticated SMTP/i), "legacy SMTP detected");
ok(has(/error 50126/i), "password-spray error code detected");
ok(has(/Device-code authentication to Microsoft Authentication Broker/i), "device-code-to-broker detected");
ok(F.some(f => /Device-code/.test(f.Title) && f.Severity === "Critical"), "device-code-to-broker is Critical");

// audit analyzer
ok(has(/Consent to application/i), "consent-to-application audit detected");
ok(has(/Service principal added/i), "add-service-principal detected");
ok(has(/federation changed/i), "domain federation change detected (critical persistence)");
ok(F.some(f => /federation/i.test(f.Title) && f.Severity === "Critical"), "federation change is Critical");

// UAL analyzer
ok(has(/Suspicious inbox rule/i), "malicious inbox rule detected");
ok(has(/forwards\/redirects mail/i), "forwarding in inbox rule flagged without assuming destination is external");
ok(has(/Mailbox forwarding configured/i), "Set-Mailbox forwarding detected");
ok(has(/Mass HardDelete/i), "mass hard-delete volumetric rule fired");
ok(has(/whole-folder mailbox sync/i) || has(/MailItemsAccessed .* Sync/i), "MailItemsAccessed sync detected");
ok(has(/throttled/i), "MailItemsAccessed throttling flagged");
ok(has(/Add-MailboxPermission/i), "mailbox permission add detected");

// risky
ok(has(/Risky user/i), "risky user detected");
ok(F.some(f => /Risky user/.test(f.Title) && f.Severity === "Critical"), "high risky user is Critical");
ok(has(/mcasSuspiciousInboxManipulationRules/i) || has(/passwordSpray/i), "risky detection types surfaced");

// oauth
ok(has(/Blacklisted application consented/i), "blacklisted OAuth app detected");
ok(has(/risky delegated permissions/i), "risky OAuth scopes detected");

// inventory
ok(has(/created in the last 7 days/i), "recently created user (inventory)");
ok(has(/directory role/i), "admin-role finding");
ok(has(/guest\/external account/i), "guest admin flagged High");
ok(has(/no second factor/i), "MFA gap detected");
ok(F.some(f => /no second factor/i.test(f.Title) && f.Severity === "High"), "admin-without-MFA is High");

// per-user rollup points at the compromised mailbox
const jan = res.users.find(u => /jan.devries/.test(u.user));
ok(jan && jan.total >= 3, "rollup attributes multiple findings to jan.devries");
ok(res.users[0].Critical + res.users[0].High > 0, "worst account sorts to the top");

ok(has(/Session ID reused/i), "session replay across IPs detected from sessionId");
ok(F.some(f => /AiTM phishing pattern/i.test(f.Title) && f.Severity === "High"), "AiTM fingerprint is High only with the second signal");

// ---- quiet tenant: real Graph-shaped records, no incident. Must produce nothing above Info. ----
const E = win.BETA_Evidence;
function quietTenant() {
  const q = E.create({ scope: "tenant", tenantId: "11111111-1111-4111-8111-111111111111" });
  const users = [
    { id: "u1", userPrincipalName: "anna@quiet.nl", displayName: "Anna", accountEnabled: true, createdDateTime: "2024-01-10T00:00:00Z", lastPasswordChangeDateTime: "2026-08-01T00:00:00Z", signInActivity: { lastSignInDateTime: "2026-09-14T08:00:00Z" } },
    { id: "u2", userPrincipalName: "bram@quiet.nl", displayName: "Bram", accountEnabled: true, createdDateTime: "2024-01-10T00:00:00Z", lastPasswordChangeDateTime: "2026-08-01T00:00:00Z", signInActivity: { lastSignInDateTime: "2026-09-14T08:00:00Z" } },
  ];
  const sps = [{ id: "sp-teams", appId: "1fec8e78-bce4-4aaf-ab1b-5451cc387264", displayName: "Microsoft Teams" }, { id: "sp-crm", appId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", displayName: "Contoso CRM" }];
  const si = (upn, t, ip, asn, extra) => Object.assign({
    id: t + ip + upn, userPrincipalName: upn, userId: upn === "anna@quiet.nl" ? "u1" : "u2", createdDateTime: t, ipAddress: ip,
    appDisplayName: "OfficeHome", appId: "4765445b-32c6-49b0-83e6-1d93765276ca", clientAppUsed: "Browser", status: { errorCode: 0 },
    location: { countryOrRegion: "NL", city: "Utrecht" }, autonomousSystemNumber: asn, userType: "member",
    deviceDetail: { deviceId: "", operatingSystem: "Windows 11", browser: "Edge 128" }, signInEventTypes: ["interactiveUser"], isInteractive: true, sessionId: "s-" + upn + "-" + asn,
  }, extra || {});
  const interactive = [], nonInteractive = [];
  for (let d = 1; d <= 14; d++) {
    interactive.push(si("anna@quiet.nl", "2026-09-" + String(d).padStart(2, "0") + "T07:30:00Z", "84.83.10.25", 1136));      // KPN
    interactive.push(si("bram@quiet.nl", "2026-09-" + String(d).padStart(2, "0") + "T08:05:00Z", "77.161.4.9", 33915));      // Ziggo
    // phone + laptop token refreshes seconds apart, different IPs
    nonInteractive.push(si("anna@quiet.nl", "2026-09-" + String(d).padStart(2, "0") + "T09:00:00Z", "84.83.10.25", 1136, { signInEventTypes: ["nonInteractiveUser"], isInteractive: false, appDisplayName: "Microsoft Teams", appId: "1fec8e78-bce4-4aaf-ab1b-5451cc387264" }));
    nonInteractive.push(si("anna@quiet.nl", "2026-09-" + String(d).padStart(2, "0") + "T09:00:09Z", "31.20.55.7", 1136, { signInEventTypes: ["nonInteractiveUser"], isInteractive: false, appDisplayName: "Outlook Mobile", appId: "27922004-5251-4030-b22d-91ecd9a37ea4" }));
    // US colleague on Comcast
    interactive.push(si("bram@quiet.nl", "2026-09-" + String(d).padStart(2, "0") + "T15:00:00Z", "73.55.1.20", 7922, { location: { countryOrRegion: "US", city: "Denver" } }));
  }
  E.setSource(q, "interactive", interactive, { state: "complete" });
  E.setSource(q, "nonInteractive", nonInteractive, { state: "complete" });
  E.setSource(q, "users", users, { state: "complete" });
  E.setSource(q, "servicePrincipals", sps, { state: "complete" });
  E.setSource(q, "oauth", [
    { id: "g1", clientId: "sp-teams", consentType: "AllPrincipals", principalId: null, resourceId: "r", scope: "openid profile User.Read offline_access" },
    { id: "g2", clientId: "sp-crm", consentType: "Principal", principalId: "u1", resourceId: "r", scope: "User.Read email profile" },
  ], { state: "complete" });
  E.setSource(q, "admins", [{ id: "ra1", principalId: "u1", roleDefinitionId: "62e90394-69f5-4237-9190-012177145e10", roleDefinition: { displayName: "Global Administrator" } }], { state: "complete" });
  E.setSource(q, "mfa", [
    { id: "u1", userPrincipalName: "anna@quiet.nl", isMfaRegistered: true, isAdmin: true, methodsRegistered: ["microsoftAuthenticatorPush", "mobilePhone"] },
    { id: "u2", userPrincipalName: "bram@quiet.nl", isMfaRegistered: true, isAdmin: false, methodsRegistered: ["passKeyDeviceBound"] },
  ], { state: "complete" });
  E.setSource(q, "riskyUsers", [{ id: "u2", userPrincipalName: "bram@quiet.nl", riskLevel: "none", riskState: "confirmedSafe" }], { state: "complete" });
  E.setSource(q, "audits", [{ id: "a1", activityDisplayName: "Update user", category: "UserManagement", loggedByService: "Core Directory", result: "success", initiatedBy: { user: { userPrincipalName: "anna@quiet.nl" } }, activityDateTime: "2026-09-10T10:00:00Z", targetResources: [{ modifiedProperties: [{ displayName: "JobTitle", newValue: "\"Lead\"" }] }] }], { state: "complete" });
  E.setSource(q, "ual", [
    { id: "ual1", operation: "UserLoggedIn", userPrincipalName: "anna@quiet.nl", createdDateTime: "2026-09-10T07:30:00Z", auditData: { Operation: "UserLoggedIn", ClientIP: "84.83.10.25", ExtendedProperties: [{ Name: "UserAgent", Value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/128.0" }] } },
    { id: "ual2", operation: "MailItemsAccessed", userPrincipalName: "anna@quiet.nl", createdDateTime: "2026-09-10T07:31:00Z", auditData: { Operation: "MailItemsAccessed", ClientIP: "84.83.10.25", ClientInfoString: "Client=OWA;Action=ViaProxy", OperationProperties: [{ Name: "MailAccessType", Value: "Bind" }], Folders: [{ Path: "\\Inbox", FolderItems: [{ Id: "x" }] }] } },
  ], { state: "complete" });
  return q;
}
const quiet = win.BETA_Analyzers.analyze(quietTenant());
const noisy = quiet.findings.filter(f => f.Severity !== "Info");
noisy.forEach(f => console.log("  quiet-tenant noise: " + f.Severity + " " + f.Title));
ok(noisy.length === 0, "quiet tenant with real Graph-shaped records produces nothing above Info (" + quiet.findings.length + " info)");
ok(!quiet.findings.some(f => /risky delegated permissions/i.test(f.Title)), "baseline sign-in scopes are not risky permissions");
ok(!quiet.findings.some(f => /Blacklisted application/i.test(f.Title)), "first-party OfficeHome is not a blacklisted application");
ok(!quiet.findings.some(f => /30 seconds/.test(f.Title)), "non-interactive token refreshes do not trigger the 30-second rule");
ok(!quiet.findings.some(f => /Risky user/.test(f.Title)), "confirmedSafe risky user is not reported");

// ---- targeted rule fixtures on real shapes ----
function withUal(rows) { const q = quietTenant(); E.setSource(q, "ual", rows, { state: "complete" }); return win.BETA_Analyzers.analyze(q).findings; }
const outlookRule = withUal([{ id: "r1", operation: "UpdateInboxRules", userPrincipalName: "anna@quiet.nl", createdDateTime: "2026-09-11T06:00:00Z", auditData: { Operation: "UpdateInboxRules", ClientIP: "154.16.10.88", OperationProperties: [
  { Name: "RuleOperation", Value: "AddMailboxRule" }, { Name: "RuleName", Value: "." },
  { Name: "RuleActions", Value: JSON.stringify([{ ActionType: "Forward", Recipients: ["attacker@evil.top"] }, { ActionType: "Delete" }]) } ] } }]);
ok(outlookRule.some(f => /Suspicious inbox rule/.test(f.Title) && /forwards\/redirects/.test(f.Title) && /attacker@evil.top/.test(f.Detail)), "Outlook/EWS UpdateInboxRules with OperationProperties is parsed for forwarding");
const permAdd = withUal([{ id: "p1", operation: "Add-MailboxPermission", userPrincipalName: "adm@quiet.nl", createdDateTime: "2026-09-11T06:00:00Z", auditData: { Operation: "Add-MailboxPermission" } },
  { id: "p2", operation: "TeamsImpersonationDetected", userPrincipalName: "bram@quiet.nl", createdDateTime: "2026-09-11T06:00:00Z", auditData: { Operation: "TeamsImpersonationDetected" } }]);
ok(permAdd.some(f => /Add-MailboxPermission/.test(f.Title)) && permAdd.some(f => /TeamsImpersonationDetected/i.test(f.Title)), "curated and upstream UAL operation blacklists both fire");
const scripted = withUal([{ id: "m1", operation: "MailItemsAccessed", userPrincipalName: "anna@quiet.nl", createdDateTime: "2026-09-11T06:00:00Z", auditData: { Operation: "MailItemsAccessed", ClientIP: "5.5.5.5", ClientInfoString: "Client=REST;python-requests/2.31", OperationProperties: [{ Name: "MailAccessType", Value: "Bind" }] } }]);
ok(scripted.some(f => /scripting or blacklisted client/i.test(f.Title)), "MailItemsAccessed by a scripting client is flagged");
{
  const q = quietTenant();
  E.setSource(q, "interactive", [
    Object.assign({}, q.raw.interactive[0], { id: "x1", sessionId: "replayed", ipAddress: "84.83.10.25", autonomousSystemNumber: 1136 }),
    Object.assign({}, q.raw.interactive[0], { id: "x2", sessionId: "replayed", ipAddress: "154.16.10.88", autonomousSystemNumber: 328543, createdDateTime: "2026-09-01T07:40:00Z", location: { countryOrRegion: "NG" } }),
  ], { state: "complete" });
  const f = win.BETA_Analyzers.analyze(q).findings;
  ok(f.some(x => /Session ID reused/.test(x.Title) && x.Severity === "High"), "same sessionId from NL and NG ASNs is High session replay");
  E.setSource(q, "mfa", [{ id: "u1", userPrincipalName: "anna@quiet.nl", isMfaRegistered: true, isAdmin: true, methodsRegistered: ["mobilePhone"] }], { state: "complete" });
  const f2 = win.BETA_Analyzers.analyze(q).findings;
  ok(f2.some(x => /SMS\/voice as their only second factor/.test(x.Title) && x.Severity === "High"), "admin with phone-only MFA is High");
  E.setSource(q, "audits", [{ id: "a2", activityDisplayName: "Add eligible member to role", category: "RoleManagement", loggedByService: "PIM", result: "success", initiatedBy: { user: { userPrincipalName: "anna@quiet.nl" } }, activityDateTime: "2026-09-10T10:00:00Z", targetResources: [] }], { state: "complete" });
  ok(win.BETA_Analyzers.analyze(q).findings.some(x => /Directory role assigned/.test(x.Title)), "PIM eligible assignment audit is flagged");
  E.setSource(q, "exchange", [{ schema: "limon.triage.exchange", upn: "anna@quiet.nl", capturedAt: "2026-09-11T06:00:00Z", sources: [
    { key: "mailbox", state: "complete", records: [{ UserPrincipalName: "anna@quiet.nl", ForwardingSmtpAddress: "smtp:attacker@evil.top", AuditEnabled: true }] },
    { key: "rules", state: "complete", records: [{ Name: "..", Enabled: true, ForwardTo: ["evil"], Identity: "x" }] } ] }], { state: "complete" });
  const f3 = win.BETA_Analyzers.analyze(q).findings;
  ok(f3.some(x => x.Analyzer === "ExchangeSnapshot" && /forwarding is configured/i.test(x.Title)) && f3.some(x => /Inbox rule forwards/i.test(x.Title)), "Exchange snapshot analyzer runs inside the engine");
}

// ---- import path: round-trip UAL CSV + sign-in JSON ----
const ualCsv = 'CreationDate,UserIds,Operations,RecordType,AuditData\n' +
  '"2026-07-15T03:23:00Z","jan@x.nl","New-InboxRule","ExchangeAdmin","{""Operation"":""New-InboxRule"",""Parameters"":[{""Name"":""ForwardTo"",""Value"":""evil@bad.top""}]}"\n';
const siJson = JSON.stringify([{ userPrincipalName: "jan@x.nl", createdDateTime: "2026-07-15T03:40:00Z", clientAppUsed: "Authenticated SMTP", ipAddress: "1.2.3.4", status: { errorCode: 0 }, location: {} }]);
let imported = null;
win.BETA_Import.ingest(
  [{ name: "tenant-UAL.csv", _text: ualCsv }, { name: "SignInLogs.json", _text: siJson }].map(mockFile),
  (e) => { imported = e; }, null);
// FileReader is async in browser; our mock is sync via onload microtask
await new Promise(r => setTimeout(r, 20));
ok(imported && imported.ualRecords.length === 1, "UAL CSV imported and normalized");
ok(imported && imported.signIns.length === 1, "sign-in JSON imported");
const impRes = win.BETA_Analyzers.analyze(imported);
ok(impRes.findings.some(f => /inbox rule|Authenticated SMTP/i.test(f.Title)), "imported data produces findings");

console.log(fails ? "\n" + fails + " FAILURES" : "\nall passed");
process.exit(fails ? 1 : 0);
