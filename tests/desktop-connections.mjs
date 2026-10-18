import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
// Connect-first desktop flow with a synthetic collector: each service is a row on Connect,
// its PowerShell worker holds the sign-in until Collect releases it. No Microsoft contact.
const repo = path.resolve(import.meta.dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "triage-connections-ui-"));
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
  path.join(desktop, "collector/disconnect.ps1"),
  `param($ModuleRoot)\n'{"disconnected":true}'`,
);
fs.writeFileSync(
  path.join(desktop, "package.json"),
  JSON.stringify({ name: "triage-isolated-ui-test", main: "bootstrap.cjs" }),
);
fs.writeFileSync(
  path.join(desktop, "bootstrap.cjs"),
  `require('electron').app.setPath('userData', ${JSON.stringify(data)});require('./main.cjs');`,
);
const TENANT = "11111111-1111-4111-8111-111111111111";
let app,
  checks = 0;
const ok = (value, label) => {
  assert.ok(value, label);
  console.log("ok " + ++checks + " " + label);
};
const newestAttempt = () => {
  const dirs = fs
    .readdirSync(path.join(data, "cases"))
    .flatMap((caseId) =>
      fs
        .readdirSync(path.join(data, "cases", caseId))
        .map((attempt) => path.join(data, "cases", caseId, attempt)),
    );
  return dirs.sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  )[0];
};
const waitFor = async (file, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (!fs.existsSync(file) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100));
  return fs.existsSync(file);
};
try {
  app = await electron.launch({ args: [desktop] });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector("[data-action=new-investigation]");
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Connect: pin the tenant, sign the services in one row at a time.
  const connect = async ({ exchange = "approve" } = {}) => {
    await page.locator("#navigation [data-step=connect]").click();
    await page.waitForSelector(
      "[data-action=signin-service][data-service=graph]",
    );
    await page.locator("[name=domain]").fill(TENANT);
    await page.locator("[data-action=resolve-tenant]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          "[data-action=signin-service][data-service=graph]",
        ).disabled,
    );
    await page
      .locator("[data-action=signin-service][data-service=graph]")
      .click();
    await page.waitForSelector(
      ".service-connection[data-service=graph][data-state=ready]",
    );
    const attempt = newestAttempt();
    if (exchange !== "skip") {
      await page
        .locator("[data-action=signin-service][data-service=exchange]")
        .click();
      await page.waitForSelector(
        ".service-connection[data-service=exchange][data-state=connecting]",
      );
      await waitFor(path.join(attempt, "exchange-started.json"));
      fs.writeFileSync(
        path.join(
          attempt,
          exchange === "approve" ? "approve-exchange" : "deny-exchange",
        ),
        "",
      );
      await page.waitForSelector(
        `.service-connection[data-service=exchange][data-state=${exchange === "approve" ? "ready" : "failed"}]`,
      );
    }
    return attempt;
  };
  const collect = async (upn, sources) => {
    await page.locator("[data-step=scope].primary").click();
    await page.waitForSelector("#scope-form");
    await page.locator("#scope-form [name=upn]").fill(upn);
    await page.locator("[name=preset][value=custom]").check();
    await page.waitForSelector("input[name=source]");
    for (const box of await page
      .locator("input[name=source]:not(:disabled)")
      .all())
      await box.setChecked(sources.includes(await box.inputValue()));
    await page.locator("[data-action=start-collection]").click();
    await page.waitForFunction(
      () =>
        location.hash.includes("/review/overview") &&
        !document.querySelector("[data-action=cancel]"),
    );
  };
  const attempt = await connect();
  ok(
    (
      await page
        .locator(".service-connection[data-service=graph]")
        .textContent()
    ).includes("operator@example.com"),
    "the Graph row shows the connected operator",
  );
  ok(
    !fs.existsSync(path.join(attempt, "graph-released.json")) &&
      !fs.existsSync(path.join(attempt, "users.json")),
    "Graph waits without collecting while Exchange signs in",
  );
  const connectionPlan = JSON.parse(
    fs.readFileSync(path.join(attempt, "plan.json")),
  );
  ok(
    connectionPlan.scope === "tenant" &&
      connectionPlan.upn === "" &&
      connectionPlan.sources.includes("interactive") &&
      connectionPlan.sources.includes("exchange"),
    "the connection plan pins the tenant and lists every source the services may serve",
  );
  await page.screenshot({
    path: "test-results/beta31-connect-ready.png",
    fullPage: true,
  });
  await page.locator("#theme").selectOption("dark");
  await page.screenshot({
    path: "test-results/beta31-connect-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 400, height: 850 });
  ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "connection rows fit a narrow window",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#theme").selectOption("light");
  // A reload keeps the retained sessions: the rows come back ready from the main process.
  await page.reload();
  await page.waitForSelector(
    ".service-connection[data-service=graph][data-state=ready]",
  );
  ok(
    (await page
      .locator(".service-connection[data-service=exchange][data-state=ready]")
      .count()) === 1,
    "reloading the window restores both signed-in rows",
  );
  await collect("alice@example.com", ["users", "exchange"]);
  const bundle = JSON.parse(fs.readFileSync(path.join(attempt, "case.json")));
  ok(
    bundle.evidence.manifest.users.state === "complete" &&
      bundle.evidence.manifest.exchange.state === "complete",
    "both services collect after release using the retained workers",
  );
  const released = JSON.parse(
    fs.readFileSync(path.join(attempt, "graph-released.json")),
  );
  ok(
    released.upn === "alice@example.com" &&
      released.sources.join(",") === "users,exchange",
    "the workers read the completed plan only after release",
  );
  ok(
    bundle.evidence.subject?.upn === "alice@example.com" &&
      bundle.evidence.collectorAccount === "operator@example.com",
    "the case carries the affected account and the operator",
  );
  const log = bundle.evidence.actionLog;
  ok(
    log.filter((e) => e.type === "connection-ready").length === 2 &&
      log.findIndex((e) => e.type === "source-result") >
        log.findLastIndex((e) => e.type === "connection-ready"),
    "the action log records both connections before source results",
  );
  ok(
    (await page.locator(".service-connection[data-service=graph]").count()) ===
      0 ||
      (
        await page
          .locator("#navigation [data-step=connect] .nav-text small")
          .textContent()
      ).includes("Sign in"),
    "collection consumes the sessions; Connect asks to sign in again",
  );
  // Exchange denied: Graph still collects, the mailbox source is an explicit gap.
  await page.locator("#casebar [data-action=new]").click();
  await page.locator("#new-case-panel [data-action=confirm-new]").click();
  const denied = await connect({ exchange: "deny" });
  ok(
    (
      await page
        .locator(".service-connection[data-service=exchange]")
        .textContent()
    ).includes("denied"),
    "a failed sign-in shows its reason on the row",
  );
  ok(
    !(await page.locator("[data-step=scope].primary").isDisabled()),
    "Next stays open while one service is signed in",
  );
  await page.locator("[data-step=scope].primary").click();
  await page.waitForSelector("#scope-form");
  ok(
    (await page.locator("[name=preset][value=standard]").isDisabled()) &&
      (await page.locator("[name=preset][value=everything]").isDisabled()),
    "presets that need the mailbox wait for an Exchange sign-in",
  );
  await page.locator("[name=preset][value=custom]").check();
  await page.waitForSelector("input[name=source]");
  ok(
    await page.locator("input[name=source][value=exchange]").isDisabled(),
    "mailbox sources cannot be chosen without the Exchange session",
  );
  await page.locator("#navigation [data-step=connect]").click();
  await page.waitForSelector(
    "[data-action=signin-service][data-service=exchange]",
  );
  await collect("failed@example.com", ["users", "exchange"]);
  const failedCase = JSON.parse(
    fs.readFileSync(path.join(denied, "case.json")),
  ).evidence;
  ok(
    failedCase.manifest.users.state === "complete" &&
      !failedCase.selectedSources.includes("exchange") &&
      failedCase.manifest.exchange.state === "not-collected",
    "Graph collects while the mailbox stays outside the plan",
  );
  ok(
    failedCase.actionLog.filter((e) => e.type === "connection-failed")
      .length === 1,
    "the failed connection is logged once in the case",
  );
  // Cancelling a sign-in stops its worker and never releases collection.
  await page.locator("#casebar [data-action=new]").click();
  await page.locator("#new-case-panel [data-action=confirm-new]").click();
  await page.locator("#navigation [data-step=connect]").click();
  await page.waitForSelector(
    "[data-action=signin-service][data-service=graph]",
  );
  await page.locator("[name=domain]").fill(TENANT);
  await page.locator("[data-action=resolve-tenant]").click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        "[data-action=signin-service][data-service=graph]",
      ).disabled,
  );
  await page
    .locator("[data-action=signin-service][data-service=graph]")
    .click();
  await page.waitForSelector(
    ".service-connection[data-service=graph][data-state=ready]",
  );
  await page
    .locator("[data-action=signin-service][data-service=exchange]")
    .click();
  await page.waitForSelector(
    ".service-connection[data-service=exchange][data-state=connecting]",
  );
  const cancelled = newestAttempt();
  await waitFor(path.join(cancelled, "exchange-started.json"));
  await page
    .locator("[data-action=cancel-signin][data-service=exchange]")
    .click();
  await page.waitForSelector(
    ".service-connection[data-service=exchange][data-state=cancelled]",
  );
  const { pid } = JSON.parse(
    fs.readFileSync(path.join(cancelled, "exchange-started.json")),
  );
  await new Promise((r) => setTimeout(r, 500));
  let running = false;
  try {
    process.kill(pid, 0);
    running = true;
  } catch {}
  ok(
    !running && !fs.existsSync(path.join(cancelled, "exchange-released.json")),
    "cancelling a sign-in stops the worker without releasing it",
  );
  ok(
    (await page
      .locator(".service-connection[data-service=graph][data-state=ready]")
      .count()) === 1,
    "cancelling one service leaves the other signed in",
  );
  await page
    .locator("[data-action=signout-service][data-service=graph]")
    .click();
  await page.waitForSelector(
    ".service-connection[data-service=graph][data-state=idle]",
  );
  ok(
    await page.locator("[data-step=scope].primary").isDisabled(),
    "signing out closes Next again",
  );
  // Exchange only: no Graph worker, mailbox collection still works.
  await page.locator("[name=domain]").fill(TENANT);
  await page.locator("[data-action=resolve-tenant]").click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        "[data-action=signin-service][data-service=exchange]",
      ).disabled,
  );
  await page
    .locator("[data-action=signin-service][data-service=exchange]")
    .click();
  await page.waitForSelector(
    ".service-connection[data-service=exchange][data-state=connecting]",
  );
  const exchangeOnly = newestAttempt();
  await waitFor(path.join(exchangeOnly, "exchange-started.json"));
  fs.writeFileSync(path.join(exchangeOnly, "approve-exchange"), "");
  await page.waitForSelector(
    ".service-connection[data-service=exchange][data-state=ready]",
  );
  ok(
    !fs.existsSync(path.join(exchangeOnly, "graph-started.json")),
    "a mailbox-only connection never starts a Graph worker",
  );
  await collect("mailbox@example.com", ["exchange"]);
  ok(
    JSON.parse(fs.readFileSync(path.join(exchangeOnly, "case.json"))).evidence
      .manifest.exchange.state === "complete",
    "Exchange-only collection works without a Graph account",
  );
  ok(!errors.length, "no renderer exceptions: " + errors.join("; "));
  console.log(checks + " connection UI checks passed; synthetic data only.");
} finally {
  if (app) await app.close();
  fs.rmSync(root, { recursive: true, force: true });
}
