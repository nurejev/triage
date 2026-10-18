import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
// The sign-in watchdog on Connect: a service that never completes its browser sign-in fails with
// its last stage, its worker is stopped, and collection with the other service still works.
const repo = path.resolve(import.meta.dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "triage-timeout-ui-"));
const desktop = path.join(root, "desktop"),
  data = path.join(root, "profile");
fs.mkdirSync(path.join(desktop, "collector"), { recursive: true });
for (const name of [
  "main.cjs",
  "preload.cjs",
  "core.cjs",
  "profiles.cjs",
  "response.cjs",
])
  fs.copyFileSync(path.join(repo, "desktop", name), path.join(desktop, name));
for (const name of ["BETA", "js", "assets", "vendor", "index.html", "css"])
  fs.symlinkSync(path.join(repo, name), path.join(root, name));
const runtime = path.join(
  desktop,
  "runtime",
  process.platform + "-" + process.arch,
);
fs.mkdirSync(path.join(runtime, "modules"), { recursive: true });
fs.symlinkSync(
  path.join(
    repo,
    "desktop/runtime",
    process.platform + "-" + process.arch,
    "powershell",
  ),
  path.join(runtime, "powershell"),
);
fs.copyFileSync(
  path.join(repo, "tests/fixtures/desktop-connections.ps1"),
  path.join(desktop, "collector/collect.ps1"),
);
fs.writeFileSync(
  path.join(desktop, "collector/preflight.ps1"),
  `param($ModuleRoot,$ProbeModule)\n'{"ready":true,"fixture":true}'`,
);
fs.writeFileSync(
  path.join(desktop, "package.json"),
  JSON.stringify({ name: "triage-isolated-ui-test", main: "bootstrap.cjs" }),
);
fs.writeFileSync(
  path.join(desktop, "bootstrap.cjs"),
  `require('electron').app.setPath('userData', ${JSON.stringify(data)});require('./main.cjs');`,
);
// Shorten the watchdog in the isolated copy only; production remains ten minutes.
const mainFile = path.join(desktop, "main.cjs");
const main = fs.readFileSync(mainFile, "utf8");
assert.ok(
  main.includes("}, CONNECT_TIMEOUT);") &&
    main.includes("const CONNECT_TIMEOUT = 600000;"),
);
fs.writeFileSync(
  mainFile,
  main.replace(
    "const CONNECT_TIMEOUT = 600000;",
    "const CONNECT_TIMEOUT = 2000;",
  ),
);
const fixture = path.join(desktop, "collector/collect.ps1");
fs.writeFileSync(
  fixture,
  fs
    .readFileSync(fixture, "utf8")
    .replace(
      "if($Mode -eq 'exchange') {",
      'if($Mode -eq \'exchange\') {\n[Console]::Out.WriteLine(\'TRIAGE_PROGRESS:{"type":"connection-stage","mode":"exchange","stage":"Waiting for browser callback (fixture)"}\')',
    ),
);
let app;
try {
  app = await electron.launch({ args: [desktop] });
  const page = await app.firstWindow();
  await page.waitForSelector("[data-action=new-investigation]");
  const result = await page.evaluate(async () => {
    const events = [];
    window.triageNative.onProgress((e) => events.push(e));
    const caseId = "55555555-5555-4555-8555-555555555555",
      tenantId = "11111111-1111-4111-8111-111111111111";
    const graph = await window.triageNative.connect({
      caseId,
      service: "graph",
      tenantId,
      connection: { mode: "delegated" },
    });
    let exchangeError = "";
    try {
      await window.triageNative.connect({
        caseId,
        service: "exchange",
        tenantId,
        connection: { mode: "delegated" },
      });
    } catch (e) {
      exchangeError = e.message;
    }
    const sessions = await window.triageNative.sessions();
    const bundle = await window.triageNative.collect({
      schema: "limon.triage.plan",
      schemaVersion: 1,
      caseId,
      tenantId,
      scope: "user",
      upn: "timeout@example.com",
      sources: ["users", "exchange"],
      window: { start: "2026-07-01", end: "2026-07-02" },
    });
    return { graph, exchangeError, sessions, bundle, events };
  });
  assert.equal(result.graph.account, "operator@example.com");
  assert.match(
    result.exchangeError,
    /Waiting for browser callback \(fixture\)/,
  );
  assert.match(result.exchangeError, /10 minutes/);
  assert.equal(result.sessions.services.exchange.state, "failed");
  assert.equal(result.bundle.evidence.manifest.users.state, "complete");
  assert.equal(result.bundle.evidence.manifest.exchange.state, "failed");
  assert.match(result.bundle.evidence.manifest.exchange.error, /not signed in/);
  assert.ok(
    result.events.some(
      (e) => e.type === "status" && e.text.includes("browser callback"),
    ),
  );
  assert.ok(
    result.events.some(
      (e) =>
        e.type === "connection" &&
        e.mode === "exchange" &&
        e.state === "failed",
    ),
  );
  assert.equal(
    result.bundle.evidence.actionLog.filter(
      (e) => e.type === "connection-failed",
    ).length,
    1,
  );
  const attempts = fs.readdirSync(
    path.join(data, "cases", "55555555-5555-4555-8555-555555555555"),
  );
  const attempt = path.join(
    data,
    "cases",
    "55555555-5555-4555-8555-555555555555",
    attempts[0],
  );
  assert.equal(
    fs.existsSync(path.join(attempt, "exchange-released.json")),
    false,
  );
  assert.equal(fs.existsSync(path.join(attempt, "graph-released.json")), true);
  const pid = JSON.parse(
    fs.readFileSync(path.join(attempt, "exchange-started.json")),
  ).pid;
  assert.throws(() => process.kill(pid, 0));
  console.log(
    "10 native watchdog checks passed: stage, bounded failure, preserved error, surviving Graph collection, no Exchange release, stopped worker. Synthetic data only.",
  );
} finally {
  if (app) await app.close();
  fs.rmSync(root, { recursive: true, force: true });
}
