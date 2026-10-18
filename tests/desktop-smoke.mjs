import { _electron as electron, chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const backups = [];
let app = await electron.launch({ args: ["desktop"], timeout: 30000 });
try {
  const userData = await app.evaluate(({ app }) => app.getPath("userData"));
  for (const name of ["preferences.json", "selected-case.json"]) {
    const file = path.join(userData, name);
    backups.push({
      file,
      data: fs.existsSync(file) ? fs.readFileSync(file) : null,
    });
  }
  const page = await app.firstWindow();
  await page.waitForSelector("h1");
  assert.match(
    await page.locator("h1").textContent(),
    /Clarity in the first hour/,
  );
  const state = await page.evaluate(() => ({
    node: typeof require,
    bridge: typeof triageNative,
    platform: navigator.platform,
  }));
  assert.equal(state.node, "undefined");
  assert.equal(state.bridge, "object");
  // Playwright defaults to forced light; remove that override to test Electron.
  await page.emulateMedia({ colorScheme: null });
  await page.locator("#theme").selectOption("system");
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "dark";
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "light";
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  console.log(
    "Native System theme follows live Electron appearance changes in both directions",
  );
  const invalidTheme = await page.evaluate(() =>
    triageNative.setTheme("unexpected").then(
      () => "",
      (e) => e.message,
    ),
  );
  assert.match(invalidTheme, /Unsupported theme preference/);
  console.log("Native theme IPC rejects unsupported preferences");
  const ready = await page.evaluate(() => triageNative.preflight());
  assert.equal(ready.ready, true, JSON.stringify(ready));
  console.log(
    "Native launch and bundled runtime readiness passed: " +
      JSON.stringify(ready),
  );
  const rejection = await page.evaluate(() =>
    triageNative.collect({ schema: "arbitrary", command: "whoami" }).then(
      () => "",
      (e) => e.message,
    ),
  );
  assert.match(rejection, /Unsupported collection plan/);
  console.log("Native IPC rejects arbitrary command plans");
  // Collection never starts without a Connect session; nothing here contacts Microsoft.
  const gate = await page.evaluate(async () => {
    const plan = {
      schema: "limon.triage.plan",
      schemaVersion: 1,
      caseId: "33333333-3333-4333-8333-333333333333",
      tenantId: "11111111-1111-4111-8111-111111111111",
      scope: "user",
      upn: "alice@example.com",
      window: { start: "2026-07-01T00:00:00Z", end: "2026-07-02T00:00:00Z" },
      sources: ["interactive"],
    };
    const rejected = await triageNative.collect(plan).then(
      () => "",
      (e) => e.message,
    );
    const badService = await triageNative
      .connect({
        caseId: plan.caseId,
        service: "teams",
        tenantId: plan.tenantId,
      })
      .then(
        () => "",
        (e) => e.message,
      );
    return {
      rejected,
      badService,
      sessions: await triageNative.sessions(),
      cancelled: await triageNative.cancelConnect({ service: "graph" }),
    };
  });
  assert.match(gate.rejected, /Sign in on the Connect step/);
  assert.match(gate.badService, /Unknown service/);
  assert.equal(gate.sessions, null);
  assert.equal(gate.cancelled.cancelled, false);
  console.log(
    "Native collection is gated on a Connect session; unknown services are rejected",
  );
  await page.locator("#navigation [data-step=start]").click();
  await page.locator("[data-action=demo]").first().click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-finding]").length > 0,
  );
  await page.screenshot({
    path: path.resolve("test-results/beta31-native.png"),
    fullPage: true,
  });
  console.log("Native shared case viewer analyzed the sample");
  // Capture the intended browser URL while exercising the actual local server and case route.
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      globalThis.openedTriageUrl = url;
    };
  });
  const bundle = JSON.parse(fs.readFileSync("test-results/beta31-case.json"));
  await page.evaluate((b) => triageNative.openBrowser(b), bundle);
  const url = await app.evaluate(() => globalThis.openedTriageUrl);
  assert.match(
    url,
    /^http:\/\/127\.0\.0\.1:\d+\/view\/[a-f0-9]{64}\/BETA\/index.html\?localCase=1$/,
  );
  const caseUrl = new URL("../case.json", url);
  const result = await fetch(caseUrl);
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert.equal(saved.evidence.caseId, bundle.evidence.caseId);
  assert.equal((await fetch(new URL("/case.json", url))).status, 404);
  assert.equal((await fetch(new URL("/backend/server.js", url))).status, 404);
  console.log(
    "Local browser handoff preserves case and denies unscoped/private paths",
  );
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    headless: true,
  });
  try {
    const viewer = await browser.newPage();
    await viewer.goto(url);
    await viewer.waitForFunction(
      () => document.querySelectorAll("[data-finding]").length > 0,
    );
    assert.match(
      await viewer.locator("#casebar").textContent(),
      new RegExp(bundle.evidence.caseId.slice(0, 8)),
    );
    assert.equal(await viewer.locator("#signin").textContent(), "Viewer guide");
    console.log(
      "Private browser URL loads the full case viewer without local OAuth prompts",
    );
  } finally {
    await browser.close();
  }
  await page.locator("#theme").selectOption("dark");
  await page.waitForFunction(
    () => localStorage.getItem("triage-desk-theme") === "dark",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(userData, "preferences.json"))).theme,
    "dark",
  );
  await page.reload();
  await page.waitForSelector("h1");
  assert.equal(await page.locator("#theme").inputValue(), "dark");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  console.log("Native manual theme survives a viewer reload");
  await page.evaluate((b) => triageNative.saveCase(b), bundle);
  await app.close();
  app = await electron.launch({ args: ["desktop"], timeout: 30000 });
  const reopened = await app.firstWindow();
  await reopened.waitForSelector("h1");
  assert.equal(await reopened.locator("#theme").inputValue(), "dark");
  assert.equal(
    await reopened.locator("html").getAttribute("data-theme"),
    "dark",
  );
  console.log(
    "Native theme preference survives a full app restart and new local server port",
  );
  const restored = await reopened.evaluate(() => triageNative.loadCase());
  assert.equal(restored.evidence.caseId, bundle.evidence.caseId);
  assert.deepEqual(restored.evidence.actionLog, bundle.evidence.actionLog);
  console.log(
    "Native saved case and action history survive a full app restart",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  try {
    await app.close();
  } finally {
    for (const { file, data } of backups) {
      if (data === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, data);
    }
  }
}
