// DOM smoke test for the BETA UI: sign-in (demo), tabs, live scan, report.
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
const R = "/sessions/funny-brave-bohr/mnt/triage/BETA";
const html = readFileSync(R + "/index.html", "utf8").replace(/<script[^>]*src=[^>]*><\/script>/g, "");
const dom = new JSDOM(html, { url: "https://triage.limon-it.nl/BETA/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.scrollTo = () => {};
window.alert = (m) => { throw new Error("alert: " + m); };
for (const f of ["js/authConfig.js", "js/build.js", "js/blacklists.js", "js/analyzers.js", "js/import.js", "js/demo.js", "js/report.js"]) {
  window.eval(readFileSync(R + "/" + f, "utf8"));
}
// stubs for graph + collect (no real network / MSAL)
window.TriageGraph = { account: null, init: async () => {}, forgetSession: async () => {}, signIn: async () => ({ name: "T", username: "t@x.nl" }), signOut: async () => {} };
window.BETA_Collect = { STEPS: [["signins", "Sign-in logs"], ["ual", "UAL"]], collect: async () => ({}) };
window.eval(readFileSync(R + "/js/app.js", "utf8"));
await new Promise(r => setTimeout(r, 50));

const $ = (id) => window.document.getElementById(id);
const active = () => window.document.querySelector(".screen.active").id;
let fails = 0;
const ok = (c, m) => { console.log((c ? "  ok " : "FAIL ") + m); if (!c) fails++; };

ok(active() === "screen-login", "starts on login");
ok($("toolNav").style.display === "none", "tab bar hidden before sign-in");

$("demoBtn").click();
ok(active() === "screen-mode", "demo enters mode choice");

$("modeScanBtn").click();
ok(active() === "screen-config", "live scan opens config");
ok($("toolNav").style.display === "block", "tab bar shows");
ok($("toolNav").textContent.includes("Live scan"), "scan tab present");

// open import in a second tab, then switch back — config screen must resume
$("modeImportBtn").click();
ok(active() === "screen-import", "import tab opens");
ok($("toolNav").textContent.includes("Import"), "import tab present");
window.eval('document.querySelector("[data-nav=scan]").click()');
ok(active() === "screen-config", "scan tab resumes at config, not restarted");

// run the demo scan (uses BETA_Demo, animates steps)
$("startScanBtn").click();
await new Promise(r => setTimeout(r, 500));
ok(active() === "screen-report", "demo scan lands on report");
ok(/findings/.test($("betaRepMeta").textContent), "report meta populated");
ok($("betaTiles").children.length === 5, "five summary tiles rendered");
ok($("betaUsers").querySelectorAll(".urow").length >= 3, "per-account rollup rendered");
ok($("betaFrows").children.length > 0, "findings table rendered");

// click an account row -> filters findings
const before = $("betaFrows").children.length;
window.eval('document.querySelector("#betaUsers .urow").click()');
ok($("betaFilterNote").textContent.length > 0, "clicking an account sets a filter note");
ok($("betaFrows").children.length <= before, "account filter narrows the findings table");

// severity chip filter
const chip = window.document.querySelector("#betaSevchips .chip");
ok(!!chip, "severity chips rendered");

// close a background tab -> current screen unaffected
window.eval('document.querySelector("[data-close=import]").click()');
ok(active() === "screen-report", "closing a background tab leaves the report up");

console.log(fails ? "\n" + fails + " FAILURES" : "\nall passed");
process.exit(fails ? 1 : 0);
