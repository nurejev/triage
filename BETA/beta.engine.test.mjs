// Unit test for the BETA MAS engine + import, run against the demo tenant.
import { readFileSync } from "fs";
const R = "/sessions/funny-brave-bohr/mnt/triage/BETA";
const win = {};
global.window = win;
for (const f of ["js/blacklists.js", "js/analyzers.js", "js/demo.js", "js/import.js"]) {
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
ok(F.some(f => f.Severity === "Critical" && /30 seconds/.test(f.Title)), "AiTM relay is Critical");
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
ok(has(/forwards\/redirects externally/i), "external forward in inbox rule flagged");
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
