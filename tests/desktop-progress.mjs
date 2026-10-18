import { checkAnalysisStatus } from "./execution-ui.mjs";
import { checkOAuthScope } from "./oauth-scope-ui.mjs";
import { _electron as electron, chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
// The desktop workflow end to end with synthetic evidence: Connect → Scope → Collect (live progress,
// stop, foreign-tenant refusal) → Review → Respond (mailbox check, response worker) → saved case.
const repo = path.resolve(import.meta.dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "triage-live-ui-"));
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
  path.join(repo, "tests/fixtures/desktop-progress.ps1"),
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
fs.writeFileSync(
  path.join(desktop, "collector/response.ps1"),
  `param($ModuleRoot)
$count=0
while($null -ne ($line=[Console]::In.ReadLine())){
 $r=$line|ConvertFrom-Json;$count++
 $value=if($r.connect){@{account=@{tenantId=$r.tenantId;username='operator@example.com'}}}else{@{pid=$PID;count=$count}}
 [Console]::Out.WriteLine('TRIAGE_RESPONSE:'+(@{ok=$true;value=$value}|ConvertTo-Json -Depth 8 -Compress))
}`,
);
const TENANT = "11111111-1111-4111-8111-111111111111";
let app,
  browser,
  checks = 0;
const ok = (value, label) => {
  assert.ok(value, label);
  console.log("ok " + ++checks + " " + label);
};
try {
  app = await electron.launch({ args: [desktop] });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector("[data-action=new-investigation]");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator("#theme").selectOption("light");
  ok(
    (await page.locator("h1").textContent()).includes("Clarity"),
    "the app opens on Start",
  );
  // Connect: readiness, tenant, Graph sign-in (the fixture signs in at once).
  const signIn = async (services = ["graph"]) => {
    await page.locator("#navigation [data-step=connect]").click();
    await page.waitForSelector(
      "[data-action=signin-service][data-service=graph]",
    );
    if (await page.locator("[name=domain]").isEnabled()) {
      await page.locator("[name=domain]").fill(TENANT);
      if (await page.locator("[data-action=resolve-tenant]").isVisible())
        await page.locator("[data-action=resolve-tenant]").click();
    }
    for (const service of services) {
      await page.waitForFunction(
        (s) =>
          !document.querySelector(
            `[data-action=signin-service][data-service=${s}]`,
          ).disabled,
        service,
      );
      await page
        .locator(`[data-action=signin-service][data-service=${service}]`)
        .click();
      await page.waitForSelector(
        `.service-connection[data-service=${service}][data-state=ready]`,
      );
    }
  };
  await signIn();
  ok(
    (await page.locator(".notice.good").first().textContent()).includes(
      "ready",
    ),
    "readiness is checked when Connect opens",
  );
  ok(
    (await page.locator("#connection").textContent()).includes(
      "analyst@example.com",
    ),
    "the topbar names the signed-in operator",
  );
  // Scope: evidence folder, presets, custom sources.
  await page.locator("[data-step=scope].primary").click();
  await page.waitForSelector("#scope-form");
  const evidence = path.join(root, "dedicated-evidence");
  fs.mkdirSync(evidence);
  ok(
    (await page.evaluate(() => triageNative.evidenceFolder())).folder === data,
    "the default evidence folder is app-private data",
  );
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, evidence);
  await page.locator("[data-action=evidence-folder]").click();
  await page.waitForFunction(
    (folder) =>
      document.querySelector("#scope-form").textContent.includes(folder),
    evidence,
  );
  await page.evaluate(() => triageNative.setTheme("dark"));
  ok(
    JSON.parse(fs.readFileSync(path.join(data, "preferences.json")))
      .evidenceFolder === evidence,
    "theme changes preserve the evidence destination",
  );
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  ok(
    (await page.evaluate(() => triageNative.chooseEvidenceFolder())).folder ===
      evidence,
    "a cancelled folder picker preserves the destination",
  );
  await page.locator("#theme").selectOption("light");
  ok(
    (await page
      .locator("#scope-form [data-engine=powershell][data-stage=ready]")
      .isVisible()) &&
      (
        await page.locator("#scope-form .execution-card").textContent()
      ).includes("Runs on this computer"),
    "Scope names local PowerShell collection",
  );
  ok(
    (await page.locator("[name=preset]").count()) === 4 &&
      (await page.locator("[name=preset][value=standard]").isDisabled()),
    "app presets are offered; the mailbox preset waits for Exchange",
  );
  await page.locator("[name=preset][value=custom]").check();
  await page.waitForSelector("input[name=source]");
  ok(
    (await page.locator("input[name=source]").count()) === 34 &&
      (await page.locator("input[name=source][value=exchange]").isDisabled()),
    "Custom lists every app source; mailbox sources wait for Exchange",
  );
  await page.locator("[data-action=sources-none]").click();
  ok(
    (await page.locator("input[name=source]:checked").count()) === 0,
    "Deselect all clears the sources",
  );
  await page.locator("[data-action=sources-all]").click();
  ok(
    (await page.locator("input[name=source]:checked").count()) > 20,
    "Select all restores the available sources",
  );
  const start = async (upn) => {
    await page.locator("[data-step=scope]").first().click();
    await page.waitForSelector("#scope-form");
    await page.locator("#scope-form [name=upn]").fill(upn);
    await page.locator("[name=preset][value=custom]").check();
    await page.waitForSelector("input[name=source]");
    for (const box of await page
      .locator("input[name=source]:not(:disabled)")
      .all())
      await box.setChecked(
        ["interactive", "audits", "users"].includes(await box.inputValue()),
      );
    await page.locator("[data-action=start-collection]").click();
  };
  await page.screenshot({
    path: "test-results/beta31-native-scope.png",
    fullPage: true,
  });
  await start("alice@example.com");
  await page.waitForSelector("#source-interactive[data-state=running]");
  ok(
    (await page.evaluate(() => location.hash)) === "#/collect",
    "starting a collection opens Collect",
  );
  ok(
    await page.locator("#navigation .nav-collection").isVisible(),
    "the rail shows the running collection",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#source-interactive .source-count")
        ?.textContent === "2 records so far",
  );
  ok(
    await page.evaluate(() => window.scrollY === 0),
    "Collect opens at the top",
  );
  ok(
    (await page.locator(".coverage-meter").getAttribute("aria-valuemax")) ===
      "3",
    "the progress denominator is the selected plan",
  );
  ok(
    (await page.locator("#source-audits").getAttribute("data-state")) ===
      "queued",
    "unstarted sources use the shared Waiting status",
  );
  ok(
    (await page
      .locator(".service-connection[data-service=graph][data-state=collecting]")
      .count()) === 1,
    "the Graph row on Collect shows the released session",
  );
  ok(
    !(await page.locator("#collection-details").evaluate((el) => el.open)),
    "PowerShell output is collapsed by default",
  );
  ok(
    await page
      .locator(
        "#execution-status [data-engine=powershell][data-stage=collecting]",
      )
      .isVisible(),
    "live collection clearly shows PowerShell",
  );
  ok(
    (await page
      .locator("#navigation [data-step=review][aria-disabled=true]")
      .count()) === 1,
    "Review waits for the collection to end",
  );
  await page.screenshot({
    path: "test-results/beta31-native-running.png",
    fullPage: true,
  });
  await page.locator("#theme").selectOption("dark");
  await page.screenshot({
    path: "test-results/beta31-native-running-dark.png",
    fullPage: true,
  });
  await page.locator("#theme").selectOption("light");
  await page.locator("#collection-details summary").click();
  ok(
    (await page.locator("#collection-details pre").textContent()).includes(
      "<script>test</script>",
    ),
    "raw output is escaped and inspectable",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send("triage:progress", {
      caseId: "stale-case",
      type: "source",
      source: "interactive",
      records: [{ id: "stale" }],
      manifest: { state: "complete" },
    }),
  );
  await page.locator("#source-interactive").click();
  await page.waitForSelector("#source-records-interactive");
  ok(
    await page.locator('[data-ref="interactive:2"]').isVisible(),
    "checkpoint records are inspectable before collection finishes",
  );
  await page.locator('[data-ref="interactive:1"]').click();
  await page.waitForSelector("#detail[open]");
  ok(
    (await page.locator("#detail-content").textContent()).includes("fixture-1"),
    "the inspector opens original evidence during collection; stale events are ignored",
  );
  await page.locator("[data-action=close-dialog]").click();
  // Connect pins the running worker's attempt directory before Scope can
  // change the destination. That existing session keeps its original raw
  // checkpoint path; reviewed saves below must use the selected destination.
  // This limitation is tracked in the Beta 34 implementation report.
  const caseDir = path.join(
    data,
    "cases",
    fs.readdirSync(path.join(data, "cases"))[0],
  );
  const attempt = path.join(caseDir, fs.readdirSync(caseDir)[0]);
  const plan = JSON.parse(fs.readFileSync(path.join(attempt, "plan.json")));
  ok(
    plan.upn === "alice@example.com" &&
      plan.sources.join(",") === "interactive,audits,users" &&
      plan.tenantName === undefined,
    "the released plan carries the affected account and the chosen sources",
  );
  fs.writeFileSync(path.join(attempt, "advance"), "");
  await page.waitForFunction(
    () =>
      location.hash.includes("/review/overview") &&
      !document.querySelector("[data-action=cancel]"),
  );
  ok(true, "Review opens by itself when collection ends");
  const deadline = Date.now() + 15000;
  while (
    !fs.existsSync(path.join(attempt, "case.json")) &&
    Date.now() < deadline
  )
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(fs.existsSync(path.join(attempt, "case.json")));
  await page.waitForSelector("#source-audits[data-state=failed]");
  ok(
    (await page.locator(".coverage-meter").getAttribute("aria-valuenow")) ===
      "2",
    "finished coverage shows two complete sources and one failed source",
  );
  ok(
    (await page
      .locator(".notice")
      .filter({ hasText: "Evidence gaps remain" })
      .count()) === 1,
    "Review keeps incomplete evidence visible",
  );
  await page.waitForFunction(() =>
    document.querySelector("#casebar")?.textContent.includes("saved "),
  );
  ok(
    fs.readdirSync(path.join(evidence, "saved-cases")).length === 1,
    "the case saves itself to the evidence folder",
  );
  const pointer = JSON.parse(
    fs.readFileSync(path.join(data, "selected-case.json")),
  );
  let bundle = JSON.parse(
    fs.readFileSync(path.join(data, "saved-cases", pointer.caseId + ".json")),
  );
  ok(
    bundle.evidence.raw.interactive.length === 3 &&
      bundle.evidence.raw.users.length === 1,
    "the final bundle retains authoritative records",
  );
  ok(
    bundle.evidence.actionLog.filter(
      (e) => e.type === "source-result" && e.source === "interactive",
    ).length === 1,
    "source completion is logged once",
  );
  ok(
    bundle.evidence.actionLog.some((e) => e.type === "connection-ready"),
    "the Connect step is part of the case history",
  );
  // A note on Hand over is saved with the case.
  await page.locator("#navigation [data-step=handover]").click();
  await page.waitForSelector("#note-form");
  await page
    .locator("[name=note]")
    .fill("Preserve this note written after collection.");
  await page.locator("[data-action=add-note]").click();
  await page.waitForFunction(() =>
    document.querySelector("#casebar")?.textContent.includes("saving"),
  );
  await page.waitForFunction(() =>
    document.querySelector("#casebar")?.textContent.includes("saved "),
  );
  bundle = JSON.parse(
    fs.readFileSync(path.join(data, "saved-cases", pointer.caseId + ".json")),
  );
  ok(
    bundle.evidence.actionLog.some(
      (e) => e.detail === "Preserve this note written after collection.",
    ),
    "analyst notes reach the saved case without pressing Save",
  );
  await page.screenshot({
    path: "test-results/beta31-native-results.png",
    fullPage: true,
  });
  // Private browser viewer.
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      globalThis.testViewerURL = url;
    };
  });
  await page.evaluate((b) => triageNative.openBrowser(b), bundle);
  ok(
    bundle.evidence.collectionMethod === "powershell",
    "the saved case retains the actual collection method",
  );
  const url = await app.evaluate(() => globalThis.testViewerURL);
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
  });
  const web = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    colorScheme: "light",
  });
  await web.goto(url);
  await web.waitForSelector(".coverage-meter");
  await web.waitForSelector("#execution-status [data-stage=viewing]", {
    state: "attached",
  });
  ok(
    (await web.locator("#execution-status").textContent()).includes(
      "Browser viewer · no checks running",
    ) &&
      (await web.locator("#execution-status").textContent()).includes(
        "Collection method recorded in this case: PowerShell",
      ),
    "the private viewer preserves PowerShell provenance without claiming to run it",
  );
  ok(
    (await web
      .locator("#navigation [data-step=connect][aria-disabled=true]")
      .count()) === 1,
    "the private viewer never offers Connect",
  );
  await web.locator("#navigation .sub[data-tab=evidence]").click();
  await page.locator("#navigation .sub[data-tab=evidence]").click();
  const display = async (p) =>
    p.locator(".source-row").evaluateAll((elements) =>
      elements.map((e) => ({
        id: e.id,
        state: e.dataset.state,
        text: e.textContent,
      })),
    );
  assert.deepEqual(await display(web), await display(page));
  ok(true, "web and native render identical source rows for the same case");
  await page.setViewportSize({ width: 400, height: 850 });
  ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "the native workspace fits a narrow window",
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  // Stop collecting keeps the returned records.
  await page.locator("#casebar [data-action=new]").click();
  await page.locator("#new-case-panel [data-action=confirm-new]").click();
  await signIn();
  await start("cancel@example.com");
  await page.waitForFunction(
    () =>
      document.querySelector("#source-interactive .source-count")
        ?.textContent === "2 records so far",
  );
  await page.locator("#navigation [data-action=cancel]").click();
  await page.waitForFunction(
    () =>
      location.hash.includes("/review/overview") &&
      !document.querySelector("[data-action=cancel]"),
  );
  await page.waitForSelector("#source-interactive[data-state=cancelled]");
  ok(
    (await page.locator("#source-interactive .source-count").textContent()) ===
      "2 records",
    "stopping preserves the returned records",
  );
  ok(
    (await page.locator(".coverage-meter").getAttribute("aria-valuenow")) ===
      "0",
    "cancelled sources are not presented as complete",
  );
  // A foreign-tenant context never becomes evidence.
  await page.locator("#casebar [data-action=new]").click();
  await page.locator("#new-case-panel [data-action=confirm-new]").click();
  await signIn();
  await start("mismatch@example.com");
  await page.waitForSelector("#source-interactive[data-state=failed]");
  await page.waitForFunction(() => location.hash.includes("/review/overview"));
  ok(
    (await page
      .locator(".stats .stat")
      .nth(1)
      .locator("strong")
      .textContent()) === "0",
    "foreign tenant checkpoint evidence never reaches the viewer",
  );
  ok(
    (await page.locator("#source-interactive").textContent()).includes(
      "Failed",
    ),
    "the tenant mismatch is a visible failure",
  );
  // Sample review in the drawer, then the mailbox check through the Exchange session.
  await page.locator("#casebar [data-action=new]").click();
  await page.locator("#new-case-panel [data-action=confirm-new]").click();
  await page.locator("#navigation [data-step=start]").click();
  await page.locator("[data-action=demo]").first().click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-finding]").length > 0,
  );
  await page.locator("[data-finding]").first().click();
  await page.waitForSelector(".drawer #review-form");
  const supportingReference = await page
    .locator("#review-form [name=reference]")
    .inputValue();
  await page.locator("#review-form [name=reference]").fill("");
  await page.locator("#review-form [name=state]").selectOption("confirmed");
  await page.locator("[data-action=review]").click();
  ok(
    (await page.locator("#review-validation").isVisible()) &&
      (await page.locator("#review-note-error").isVisible()) &&
      (await page.locator("#review-reference-error").isVisible()),
    "the native review shows both required-field errors in the drawer",
  );
  await page
    .locator("#review-form [name=note]")
    .fill("Native review of preserved fixture evidence.");
  await page.locator("#review-form [name=reference]").fill(supportingReference);
  ok(
    !(await page.locator("#review-validation").isVisible()),
    "errors clear as the draft is corrected",
  );
  await page.locator("[data-action=review]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#navigation [data-step=review] .nav-text small")
      ?.textContent.includes("1 of"),
  );
  await page.locator("#navigation [data-step=handover]").click();
  ok(
    (await page
      .locator(".log-row")
      .filter({ hasText: "Native review of preserved fixture evidence." })
      .count()) === 1,
    "the action log records the successful review once",
  );
  const mailboxCase = await page.evaluate(async () => {
    const e = BETA_Evidence.create({
      tenantId: "11111111-1111-4111-8111-111111111111",
      tenantName: "Example",
      scope: "user",
      subject: {
        upn: "alice@example.com",
        objectId: "22222222-2222-4222-8222-222222222222",
      },
      window: { start: "2026-07-01", end: "2026-07-02" },
    });
    BETA_Evidence.setSource(
      e,
      "interactive",
      [
        {
          id: "keep-me",
          userPrincipalName: "alice@example.com",
          createdDateTime: "2026-07-01T01:00:00Z",
          status: { errorCode: 0 },
        },
      ],
      { state: "complete" },
    );
    return BETA_Evidence.bundle(e);
  });
  await page.locator("#casebar [data-action=new]").click();
  await page.locator("#new-case-panel [data-action=confirm-new]").click();
  await page.locator("#import-files").setInputFiles({
    name: "mailbox-test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(mailboxCase)),
  });
  await page.waitForFunction(() => location.hash.includes("/review/overview"));
  await page.locator("#navigation [data-step=respond]").click();
  await page.locator(".phase-track [data-tab=contain]").click();
  await page.waitForSelector("#cs-rules");
  ok(
    await page.locator("[data-action=mailbox-collect]").isDisabled(),
    "the mailbox check waits for an Exchange sign-in",
  );
  await signIn(["graph", "exchange"]);
  await page.locator("#navigation [data-step=respond]").click();
  await page.locator(".phase-track [data-tab=contain]").click();
  await page.locator("[data-action=mailbox-collect]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#cs-rules")
      ?.textContent.includes("Synthetic redirect"),
  );
  ok(
    (await page.locator("#cs-rules").textContent()).includes(
      "external@example.net",
    ),
    "the local mailbox check renders redirect destinations even with an empty ForwardTo",
  );
  ok(
    (await page.locator("#hour-events").textContent()).includes(
      "Local mailbox check: complete",
    ),
    "the mailbox check records its result in the case action log",
  );
  await page.locator("#navigation .sub[data-tab=evidence]").click();
  ok(
    (await page.locator("#source-interactive").textContent()).includes(
      "1 record",
    ),
    "the mailbox acquisition preserves existing sign-in evidence",
  );
  await page.locator("#navigation [data-step=respond]").click();
  await page.screenshot({
    path: "test-results/beta31-native-mailbox.png",
    fullPage: true,
  });
  const sessionCheck = await page.evaluate(async () => {
    const c = {
      caseId: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      objectId: "33333333-3333-4333-8333-333333333333",
      upn: "person@example.com",
    };
    await triageNative.responseConnect(c);
    const request = {
      method: "GET",
      url: "https://graph.microsoft.com/v1.0/users/" + c.objectId,
    };
    const a = await triageNative.responseRequest(request),
      b = await triageNative.responseRequest(request);
    await triageNative.cancel();
    let rejected = false;
    try {
      await triageNative.responseRequest(request);
    } catch {
      rejected = true;
    }
    return { same: a.pid === b.pid, counts: [a.count, b.count], rejected };
  });
  ok(
    sessionCheck.same && sessionCheck.counts.join(",") === "2,3",
    "native response commands reuse a single PowerShell worker",
  );
  ok(
    sessionCheck.rejected,
    "stopping closes the response worker and requires an explicit reconnection",
  );
  await checkOAuthScope(page, ok, "test-results/beta31-native-oauth");
  await checkAnalysisStatus(page, ok, "test-results/beta31-native");
  ok(errors.length === 0, "no renderer exceptions: " + errors.join(";"));
  console.log(
    `${checks} native workflow checks passed. Synthetic data only; no tenant contacted.`,
  );
} catch (error) {
  console.error("Native workflow failure:", error);
  if (app) console.error("Native failure screen:", await (await app.firstWindow()).locator("main").innerText().catch(() => "unavailable"));
  throw error;
} finally {
  // Test cleanup must bypass the product's unsaved-case beforeunload prompt.
  await app
    ?.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    )
    .catch(() => {});
  await browser?.close();
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
