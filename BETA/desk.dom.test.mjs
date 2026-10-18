import { checkWorkflow } from "../tests/workflow-ui.mjs";
import { checkAnalysisStatus } from "../tests/execution-ui.mjs";
import { checkOAuthScope } from "../tests/oauth-scope-ui.mjs";
import { checkReadiness } from "../tests/readiness-ui.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
// BETA 31 · the seven-step workflow in a real browser: Start → Connect → Scope → Collect →
// Review → Respond → Hand over. Synthetic evidence only; Microsoft is never contacted.
const root = path.resolve(import.meta.dirname, "..");
let server;
const base =
  process.env.BETA_BASE_URL ||
  (await new Promise((resolve) => {
    server = http
      .createServer((req, res) => {
        const file = path.join(
          root,
          new URL(req.url, "http://localhost").pathname,
        );
        if (!file.startsWith(root + path.sep)) {
          res.writeHead(403).end();
          return;
        }
        fs.readFile(file, (err, data) => {
          if (err) {
            res.writeHead(404).end();
            return;
          }
          res.setHeader(
            "Content-Type",
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".svg": "image/svg+xml",
              ".md": "text/plain",
            }[path.extname(file)] || "application/octet-stream",
          );
          res.end(data);
        });
      })
      .listen(0, "127.0.0.1", () =>
        resolve("http://127.0.0.1:" + server.address().port),
      );
  }));
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  headless: true,
});
let checks = 0;
const ok = (value, label) => {
  assert.ok(value, label);
  console.log("ok " + ++checks + " " + label);
};
const shots = path.join(root, "test-results");
fs.mkdirSync(shots, { recursive: true });
const shot = (page, name) =>
  page.screenshot({
    path: path.join(shots, "beta31-" + name + ".png"),
    fullPage: true,
  });
const hash = (page) => page.evaluate(() => location.hash);
const fits = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
// A stubbed Microsoft Graph session for the web surface: sign-in, one affected account, canned pages.
const stubGraph = (page, options = {}) =>
  page.evaluate((o) => {
    window.connectedAccount = o.connected
      ? {
          tenantId: "11111111-1111-4111-8111-111111111111",
          username: "analyst@example.com",
        }
      : null;
    Object.defineProperty(TriageGraph, "account", {
      configurable: true,
      get: () => window.connectedAccount,
    });
    TriageGraph.signIn = async () =>
      (window.connectedAccount = {
        tenantId: "11111111-1111-4111-8111-111111111111",
        username: "analyst@example.com",
      });
    TriageGraph.signOut = async () => {
      window.connectedAccount = null;
    };
    window.tenantPins = [];
    TriageGraph.setTenant = (id) => {
      window.tenantPins.push(id);
      return id;
    };
    TriageGraph.resolveTenant = async (domain) => {
      if (domain === "unknown.example")
        throw Error(
          "Microsoft has no tenant for unknown.example. Check the domain.",
        );
      return { tenantId: "33333333-3333-4333-8333-333333333333", domain };
    };
    TriageGraph.gfetch = async (url) => {
      if (url.includes("/users?"))
        return {
          value: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              displayName: "Alice Example",
              userPrincipalName: "alice@example.com",
            },
          ],
        };
      return {
        id: "22222222-2222-4222-8222-222222222222",
        userPrincipalName: "alice@example.com",
      };
    };
    window.queries = [];
    TriageGraph.pages = async (url) => {
      window.queries.push(url);
      return { state: "complete", records: [], pages: 1, nextLink: null };
    };
  }, options);
const navClick = async (page, selector) => {
  const toggle = page.locator("#workflow-toggle");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator(selector).first().click();
};
const errors = [];
try {
  // ------------------------------------------------------------ theme and Start
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    colorScheme: "dark",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/BETA/index.html");
  await page.waitForSelector("h1");
  ok(
    (await page.locator("h1").textContent()).includes("Clarity"),
    "Start is the first step",
  );
  ok(
    (await page.locator("#theme").inputValue()) === "system" &&
      (await page.locator("html").getAttribute("data-theme")) === "dark",
    "system theme follows a dark preference",
  );
  await page.locator("#theme").selectOption("light");
  ok(
    (await page.locator("html").getAttribute("data-theme")) === "light" &&
      (await page.locator("h1").textContent()).includes("Clarity"),
    "theme changes without rebuilding the step",
  );
  ok(
    (await page.locator("#navigation [data-step]").count()) === 7 &&
      (await page
        .locator("#navigation [data-step=start][aria-current=page]")
        .count()) === 1,
    "the sidebar is the seven-step rail with Start current",
  );
  ok(
    (await page
      .locator("#navigation [data-step=scope][aria-disabled=true]")
      .count()) === 1,
    "Scope waits for a sign-in",
  );
  await page.locator("#navigation [data-step=review]").click({ force: true });
  ok(
    (await hash(page)) === "" || (await hash(page)) === "#/start",
    "a locked step does not navigate",
  );
  await shot(page, "start");
  // ------------------------------------------------------------ Help
  await navClick(page, "#navigation [data-action=help]");
  await page.waitForFunction(() => location.hash === "#/guide");
  ok(
    (await page.locator(".coverage-table tbody tr").count()) === 34,
    "Help lists every app source and browser coverage",
  );
  await page.goBack();
  await page.waitForFunction(
    () => location.hash === "" || location.hash === "#/start",
  );
  ok(
    (await page.locator("h1").textContent()).includes("Clarity"),
    "browser Back returns from Help to Start",
  );
  // ------------------------------------------------------------ sample case → Review
  await page.locator("[data-action=demo]").first().click();
  await page.waitForFunction(
    () =>
      location.hash.includes("/review/overview") &&
      document.querySelectorAll("[data-finding]").length > 0,
  );
  ok(
    await page.locator(".notice").filter({ hasText: "Fictional" }).isVisible(),
    "the sample is labelled fictional",
  );
  ok(
    (await page
      .locator("#navigation [data-step=review] .count")
      .textContent()) > "20",
    "the rail carries the finding count",
  );
  ok(
    (await page.locator("#navigation .sub").count()) === 4,
    "Review has four sub-pages in the rail",
  );
  await shot(page, "overview");
  await navClick(page, "#navigation .sub[data-tab=findings]");
  const count = await page.locator("[data-finding]").count();
  ok(count > 20, "findings rendered");
  await page.locator("#finding-filter").fill("MFA");
  ok(
    (await page.locator("[data-finding]").count()) < count,
    "filter narrows findings",
  );
  ok(
    await page.evaluate(
      () =>
        document.activeElement === document.querySelector("#finding-filter"),
    ),
    "typing keeps focus in the filter",
  );
  await page.locator("#finding-filter").fill("");
  // ------------------------------------------------------------ finding drawer and review validation
  const reviewedId = await page
    .locator("[data-finding]")
    .first()
    .getAttribute("data-finding");
  await page.locator("[data-finding]").first().click();
  await page.waitForSelector(".drawer #review-form");
  ok(
    (await hash(page)).includes("?f=" + reviewedId),
    "the open finding is in the URL",
  );
  ok(
    (await page.locator("#detail").count()) === 1 &&
      !(await page.locator("#detail").isVisible()),
    "a finding opens in a drawer, not a modal",
  );
  const supportingReference = await page.locator("#review-form [name=reference]").inputValue();
  ok(!!supportingReference, "a supporting record is attached automatically");
  await page.locator("#review-form [name=reference]").fill("");
  await page.locator("#review-form [name=state]").selectOption("confirmed");
  await page.locator("[data-action=review]").click();
  ok(
    (await page.locator("#review-validation").isVisible()) &&
      (await page.locator("#review-note-error").isVisible()) &&
      (await page.locator("#review-reference-error").isVisible()),
    "confirming without a reason or reference is refused in place",
  );
  await page
    .locator("#review-form [name=note]")
    .fill("Sign-in from a new country during the incident window.");
  ok(
    !(await page.locator("#review-note-error").isVisible()),
    "the note error clears while typing",
  );
  await page.locator("#review-form [name=reference]").fill(supportingReference);
  ok(
    !(await page.locator("#review-validation").isVisible()),
    "a valid reference clears the summary",
  );
  await page.locator("[data-action=review]").click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-finding="${id}"]`)
        ?.textContent.includes("confirmed"),
    reviewedId,
  );
  ok(
    (
      await page
        .locator("#navigation [data-step=review] .nav-text small")
        .textContent()
    ).includes("1 of"),
    "the rail counts the review",
  );
  ok(
    await page.locator(".drawer #review-form").isVisible(),
    "the drawer stays open after saving",
  );
  await shot(page, "finding-drawer");
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector(".drawer"));
  ok(!(await hash(page)).includes("?f="), "browser Back closes the drawer");
  await page.locator(`[data-finding="${reviewedId}"]`).click();
  await page.waitForSelector(".drawer #review-form");
  ok(
    (await page.locator("#review-form [name=state]").inputValue()) ===
      "confirmed" &&
      (await page.locator("#review-form [name=reference]").inputValue()) ===
        supportingReference,
    "reopening a finding shows the saved review",
  );
  await page.locator("[data-action=close-drawer]").click();
  await page.waitForFunction(() => !document.querySelector(".drawer"));
  // ------------------------------------------------------------ Evidence and record drawer
  await navClick(page, "#navigation .sub[data-tab=evidence]");
  await page.locator("#source-interactive .source-label").click();
  await page.waitForSelector("#source-records-interactive");
  ok(
    (await hash(page)).includes("s=interactive"),
    "the expanded source is in the URL",
  );
  await page
    .locator("#source-records-interactive [data-action=record]")
    .first()
    .click();
  await page.waitForSelector(".drawer .evidence-facts");
  ok(
    (await page.locator(".drawer pre.raw").count()) === 1,
    "a record opens beside the evidence with its original JSON",
  );
  ok(
    await page.locator("#source-records-interactive").isVisible(),
    "the source stays expanded while a record is open",
  );
  await shot(page, "record-drawer");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".drawer"));
  ok(!(await hash(page)).includes("r="), "Escape closes the record drawer");
  await page.locator("#source-users .source-count").click();
  ok(
    (await page.locator("#source-records-users").count()) === 1 &&
      (await page.locator("#source-records-interactive").count()) === 0,
    "opening another source closes the first",
  );
  await navClick(page, "#navigation .sub[data-tab=timeline]");
  ok(
    (await page.locator(".timeline-row").count()) > 5,
    "timeline lists dated records",
  );
  await page.locator(".timeline-row [data-action=record]").first().click();
  await page.waitForSelector(".drawer .evidence-facts");
  ok(
    (await hash(page)).includes("/review/timeline?r="),
    "a timeline record opens in the drawer on the timeline",
  );
  // ------------------------------------------------------------ Respond
  await navClick(page, "#navigation [data-step=respond]");
  await page.waitForSelector(".phase-track");
  ok(
    (await hash(page)).includes("/respond/preserve") &&
      (await page.locator("#outcome-form").count()) === 0,
    "Respond opens on phase 1 without a dialog",
  );
  await page.locator(".phase-track [data-tab=contain]").click();
  await page.locator("[data-action=choose-account]").first().click();
  await page.locator("[data-action=respond-user]").click();
  await page.waitForSelector("#hour-response-slot #screen-contain");
  ok(
    (await page.locator("#screen-contain").isVisible()) &&
      (await page.locator("#containHead").innerHTML()) === "",
    "the runbook is embedded on Respond without its own header",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#armCard") &&
      !document.querySelector("#armCard").hidden,
  );
  ok(
    (await page.locator("[data-action=respond]").count()) === 0 &&
      (
        await page
          .locator(".hour-check")
          .filter({ hasText: "Account checks" })
          .textContent()
      ).includes("Connected"),
    "the account checks connect by themselves; nothing asks to sign in again",
  );
  ok(
    (await page.locator("#cs-preserve").count()) === 0 ||
      !(await page.locator("#cs-preserve").isVisible()),
    "the runbook never asks to run triage again on Respond",
  );
  ok(
    await page.locator("#cs-rules").isVisible(),
    "mailbox evidence appears in the containment phase",
  );
  ok(
    (await page.locator("#execution-status").textContent()).includes(
      "Response checks: Browser JavaScript",
    ),
    "the status strip names the response engine",
  );
  await page.locator(".phase-track [data-tab=handover]").click();
  await page.waitForSelector("[data-act=tmplAll]");
  ok(
    !(await page.locator("#cs-revoke").isVisible()),
    "response actions are hidden outside the containment phase",
  );
  await page
    .locator("[data-act=tmpl]")
    .filter({ hasText: "Download template" })
    .last()
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("#hour-events")
      ?.textContent.includes("Draft only; not sent"),
  );
  ok(
    (await page.locator("input[data-tick^=comm-]:checked").count()) === 0,
    "downloading a template leaves communication unchecked",
  );
  await page.locator(".phase-track [data-tab=scope]").click();
  await page.waitForSelector("[data-act=blastAll]");
  await page.evaluate(() => {
    const list = TriageBlast.checks.filter((c) => c.run);
    window.savedBlast = list.map((c) => c.run);
    window.blastCalls = 0;
    list.forEach((c, i) => {
      c.run = () => {
        window.blastCalls++;
        return i === 0
          ? new Promise(
              (resolve) =>
                (window.releaseBlast = () =>
                  resolve({ summary: "Late result", rows: [], count: 0 })),
            )
          : Promise.resolve({
              summary: "Unexpected queued call",
              rows: [],
              count: 0,
            });
      };
    });
  });
  await page.locator("[data-act=blastAll]").click();
  await page.waitForFunction(() => typeof window.releaseBlast === "function");
  await page.locator("[data-act=blastStop]").click();
  await page.evaluate(async () => {
    window.releaseBlast();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  ok(
    (await page.evaluate(() => window.blastCalls === 1)) &&
      (await page.locator(".cl-grid.blast").textContent()).includes(
        "Stopped by analyst",
      ),
    "stopping the impact checks prevents further checks and leaves the stopped one explicitly incomplete",
  );
  await page.evaluate(() =>
    TriageBlast.checks
      .filter((c) => c.run)
      .forEach((c, i) => (c.run = window.savedBlast[i])),
  );
  // ------------------------------------------------------------ phase decisions
  await page.locator(".phase-track [data-tab=contain]").click();
  await page.locator("[data-action=phase-note]").first().click();
  await page.locator("#outcome-form [name=outcome]").selectOption("verified");
  await page
    .locator("#outcome-form [name=detail]")
    .fill("Sessions revoked; owner SOC.");
  await page.locator("[data-action=record-outcome]").click();
  ok(
    (await page.locator("#dialog-notification").textContent()).includes(
      "existing evidence reference",
    ),
    "a verified outcome needs an evidence reference",
  );
  await page.locator("#outcome-form [name=reference]").fill("interactive:1");
  await page.locator("[data-action=record-outcome]").click();
  await page.waitForFunction(() => !document.querySelector("#detail").open);
  ok(
    (
      await page.locator(".phase-track [data-tab=contain]").textContent()
    ).includes("Analyst reviewed"),
    "the phase track shows the recorded decision",
  );
  ok(
    (
      await page
        .locator("#navigation [data-step=respond] .nav-text small")
        .textContent()
    ).includes("1 / 5"),
    "the rail counts the phase",
  );
  await shot(page, "respond");
  // ------------------------------------------------------------ Hand over
  await navClick(page, "#navigation [data-step=handover]");
  await page.waitForSelector("#note-form");
  ok(
    (await page.locator(".log-row").count()) >= 4,
    "the action log carries collection, review and response entries",
  );
  await page
    .locator("#note-form [name=note]")
    .fill('Note with <img src=x onerror="alert(1)">');
  await page.locator("[data-action=add-note]").click();
  ok(
    (await page.locator(".log-row").first().textContent()).includes("<img") &&
      (await page.locator(".log-row img").count()) === 0,
    "notes are escaped, never rendered",
  );
  const exported = page.waitForEvent("download");
  await page.locator("#casebar [data-action=export]").click();
  const download = await exported;
  await download.saveAs(path.join(shots, "beta31-case.json"));
  const bundle = JSON.parse(
    fs.readFileSync(path.join(shots, "beta31-case.json")),
  );
  ok(
    bundle.schema === "limon.triage.evidence" &&
      bundle.evidence.dispositions[reviewedId].state === "confirmed" &&
      bundle.evidence.actionLog.some((e) => e.type === "phase-outcome"),
    "the case file carries reviews and decisions",
  );
  ok(
    bundle.evidence.actionLog.filter((e) => e.type === "finding-review")
      .length === 1,
    "refused review attempts never reach the action log",
  );
  const handover = page.waitForEvent("download");
  await page.locator("[data-action=handover]").click();
  await (await handover).saveAs(path.join(shots, "beta31-handover.md"));
  await page.waitForFunction(() =>
    document
      .querySelector("#navigation [data-step=handover] .nav-text small")
      ?.textContent.includes("Exported · handover not recorded"),
  );
  ok(
    fs
      .readFileSync(path.join(shots, "beta31-handover.md"), "utf8")
      .includes("#"),
    "the handover note downloads and the rail says so",
  );
  await shot(page, "handover");
  // ------------------------------------------------------------ responsive
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 950 });
    for (const step of ["start", "collect", "review", "respond", "handover"]) {
      await navClick(page, `#navigation [data-step=${step}]`);
      ok(await fits(page), step + " fits " + width + "px");
    }
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await navClick(page, "#navigation .sub[data-tab=findings]");
  await page.locator("[data-finding]").first().click();
  await page.waitForSelector(".drawer");
  ok(await fits(page), "the drawer stacks under the list on a phone");
  await shot(page, "mobile-drawer");
  await page.close();
  // ------------------------------------------------------------ web: Connect → Scope → Collect → Review
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/BETA/index.html");
  await p.waitForSelector("h1");
  await stubGraph(p);
  await p.locator("[data-action=new-investigation]").click();
  await p.waitForFunction(() => location.hash === "#/connect");
  ok(
    await p.locator("[data-step=scope].primary").isDisabled(),
    "Next waits for the sign-in",
  );
  await p.locator("[name=tenantMode]").selectOption("customer");
  await p.waitForSelector("[name=domain]");
  ok(
    await p.locator("[data-action=signin-service]").isDisabled(),
    "a customer tenant must be looked up before the sign-in button works",
  );
  await p.locator("[name=domain]").fill("unknown.example");
  await p.locator("[data-action=resolve-tenant]").click();
  await p.waitForFunction(() =>
    document.querySelector("#notification")?.textContent.includes("no tenant"),
  );
  ok(
    await p.locator("[data-action=signin-service]").isDisabled(),
    "a failed lookup keeps sign-in closed",
  );
  await p.locator("[name=domain]").fill("contoso.example");
  await p.locator("[data-action=resolve-tenant]").click();
  await p.waitForSelector(".notice.good");
  ok(
    (await p.locator(".notice.good").textContent()).includes(
      "33333333-3333-4333-8333-333333333333",
    ),
    "the domain resolves to its tenant before sign-in",
  );
  await p.locator("[data-action=signin-service]").click();
  await p.waitForSelector(".service-connection[data-state=ready]");
  ok(
    (await p.evaluate(() => window.tenantPins.at(-1))) ===
      "33333333-3333-4333-8333-333333333333",
    "sign-in is pinned to the resolved tenant",
  );
  ok(
    (await p.locator("#connection").textContent()).startsWith(
      "analyst@example.com",
    ) &&
      (await p.locator("#connection").textContent()).includes("Graph ✓") &&
      !(await p.locator("[data-step=scope].primary").isDisabled()),
    "the topbar shows the account and Next opens",
  );
  await shot(p, "connect-ready");
  await p.locator("[data-step=scope].primary").click();
  await p.waitForSelector("#scope-form");
  ok(
    (await p.locator("#scope-form [name=upn]").inputValue()) === "",
    "Scope has no invented account",
  );
  ok(
    await p.evaluate(() => {
      const input = document
        .querySelector("#scope-form [name=upn]")
        .getBoundingClientRect();
      const run = document
        .querySelector("[data-action=start-collection]")
        .getBoundingClientRect();
      return (
        run.left >= input.right &&
        Math.abs(run.bottom - input.bottom) < 3 &&
        run.bottom < innerHeight &&
        scrollY === 0
      );
    }),
    "Start collection sits beside the account without scrolling",
  );
  await p.locator("#scope-form [name=upn]").fill("ali");
  await p.waitForSelector("[data-action=pick-account]");
  await p.locator("[data-action=pick-account]").click();
  await p.waitForFunction(
    () =>
      document.querySelector("#scope-form [name=upn]").value ===
      "alice@example.com",
  );
  ok(
    (await p.locator(".account-hint").textContent()).includes("Alice Example"),
    "the tenant suggests and confirms the account",
  );
  ok(
    (await p.locator("[name=preset]").count()) === 3 &&
      (await p.locator("input[name=source]").count()) === 0,
    "web presets hide the source list until Custom",
  );
  await p.locator("[name=preset][value=custom]").check();
  await p.waitForSelector("input[name=source]");
  ok(
    (await p.locator("input[name=source]").count()) === 12,
    "Custom lists the twelve Graph sources",
  );
  await p.locator("[name=preset][value=quick]").check();
  await p.locator("[name=scope]").selectOption("tenant");
  ok(
    (await p.locator("[name=upn]").isDisabled()) &&
      (await p.locator("[data-action=start-collection]").isVisible()),
    "tenant scope keeps Start available without an account",
  );
  await p.locator("[name=scope]").selectOption("user");
  for (const width of [320, 390]) {
    await p.setViewportSize({ width, height: 950 });
    ok(await fits(p), "Scope fits " + width + "px");
  }
  await p.setViewportSize({ width: 1280, height: 800 });
  await shot(p, "scope");
  const planned = p.waitForEvent("download");
  await p.locator("[data-action=export-plan]").click();
  const plan = JSON.parse(fs.readFileSync(await (await planned).path()));
  ok(
    plan.schema === "limon.triage.plan" &&
      plan.upn === "alice@example.com" &&
      plan.tenantId === "33333333-3333-4333-8333-333333333333" &&
      plan.tenantName === "contoso.example",
    "the saved plan carries account, tenant and domain for the app",
  );
  await p.locator("[data-action=start-collection]").click();
  await p.waitForFunction(() => location.hash === "#/collect");
  await p.waitForFunction(
    () =>
      location.hash.includes("/review/overview") &&
      !document.querySelector("[data-action=cancel]"),
  );
  ok(true, "collection runs on Collect and Review opens by itself");
  ok(
    (await p.evaluate(() => window.queries))
      .filter((u) => u.includes("/signIns?"))
      .every((u) =>
        decodeURIComponent(u.replaceAll("+", " ")).includes(
          "userId eq '22222222-2222-4222-8222-222222222222'",
        ),
      ),
    "web collection filters the affected account",
  );
  ok(
    (await p.locator("#casebar").textContent()).includes("alice@example.com"),
    "the resolved account names the case",
  );
  await p.waitForFunction(() =>
    document.querySelector("#casebar")?.textContent.includes("saved "),
  );
  ok(true, "the case saves itself after collection");
  ok(
    (
      await p
        .locator("#navigation [data-step=scope] .nav-text small")
        .textContent()
    ).includes("alice@example.com"),
    "the rail summarises the scope",
  );
  // Starting another collection with a case open asks first; the open case is kept.
  await navClick(p, "#navigation [data-step=scope]");
  await p.waitForSelector("#scope-form");
  await p.locator("[data-action=start-collection]").click();
  await p.waitForSelector(
    "#detail[open] [data-action=start-collection-confirm]",
  );
  await p.locator("#detail-content [data-action=close-dialog]").click();
  ok(
    (await hash(p)) === "#/scope" &&
      (await p.locator("#casebar").textContent()).includes("alice@example.com"),
    "a second collection asks before opening a new case",
  );
  // Reload lands on the same screen of the saved case.
  await navClick(p, "#navigation .sub[data-tab=evidence]");
  await p.reload();
  await p.waitForFunction(
    () => document.querySelectorAll(".evidence-sources .source-row").length > 0,
  );
  ok(
    (await hash(p)).includes("/review/evidence") &&
      (await p.locator("#casebar").textContent()).includes("alice@example.com"),
    "reload reopens the saved case on the same screen",
  );
  ok(
    (await p.locator("#connection").textContent()) === "Not connected" &&
      (await p
        .locator("#navigation [data-step=scope][aria-disabled=true]")
        .count()) === 1,
    "a reload never restores a sign-in; Scope waits for Connect again",
  );
  // Collect keeps stating whose evidence this is — from the saved case, not the sign-in.
  await navClick(p, "#navigation [data-step=collect]");
  await p.waitForSelector(".collect-target");
  ok(
    (await p.locator(".collect-target h2").innerText())
      .replace(/\s+/g, " ")
      .trim() === "alice@example.com in contoso.example" &&
      (await p.locator(".collect-target").innerText()).includes(
        "COLLECTED FROM",
      ) &&
      (await p.locator(".collect-target-facts").innerText()).includes(
        "analyst@example.com",
      ) &&
      (await p.locator(".collect-target-facts").innerText()).includes(
        "Microsoft Graph in this browser",
      ),
    "Collect states the account, its tenant and the analyst who collected, from the saved case",
  );
  await shot(p, "collect-target-saved");
  await stubGraph(p, { connected: true });
  // New case keeps the previous one.
  await p.locator("#casebar [data-action=new]").click();
  await p.waitForSelector("#new-case-panel");
  await p.setViewportSize({ width: 390, height: 950 });
  ok(await fits(p), "the new-case panel fits a phone");
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.locator("#new-case-panel [data-action=confirm-new]").click();
  await p.waitForSelector("#scope-form");
  ok(
    (await p.locator("#scope-form [name=upn]").inputValue()) === "",
    "a new investigation starts with an empty account",
  );
  const preserved = await p.evaluate(() => TriageJournal.list());
  ok(
    preserved.some((c) => c.subject === "alice@example.com"),
    "the previous case stays saved on this device",
  );
  await p.locator("#casebar [data-action=open-case]").click();
  await p.waitForSelector("#detail [data-action=load-case]");
  await p.locator("#detail [data-action=load-case]").first().click();
  await p.waitForFunction(() =>
    document
      .querySelector("#casebar")
      ?.textContent.includes("alice@example.com"),
  );
  ok(true, "Open a case lists and reopens saved cases");
  await p.locator("#signin").click();
  await p.locator("[data-action=disconnect-confirm]").click();
  await p.waitForFunction(() => location.hash === "#/connect");
  ok(
    (await p.locator("#connection").textContent()) === "Not connected" &&
      (await p.locator("#casebar").textContent()).includes("alice@example.com"),
    "disconnecting keeps the open case",
  );
  // Imported evidence with gaps.
  const evidenceFixture = await p.evaluate(async () => {
    const ev = BETA_Evidence.create({ tenantName: "Example investigation" });
    BETA_Evidence.setSource(ev, "interactive", [], { state: "complete" });
    BETA_Evidence.setSource(
      ev,
      "users",
      [
        {
          id: "fixture-user",
          userPrincipalName: "alice@example.com",
          displayName: "Alice Example",
        },
      ],
      { state: "complete" },
    );
    BETA_Evidence.setSource(ev, "oauth", [], {
      state: "failed",
      error: "Example collection failure",
      query: "https://graph.microsoft.com/v1.0/oauth2PermissionGrants",
    });
    return BETA_Evidence.bundle(ev);
  });
  await p.locator("#import-files").setInputFiles({
    name: "evidence-example.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(evidenceFixture)),
  });
  await p.waitForFunction(() =>
    document.querySelector("h1")?.textContent.includes("at a glance"),
  );
  await p.setViewportSize({ width: 390, height: 950 });
  await navClick(p, "#navigation .sub[data-tab=evidence]");
  await p.locator("#source-users .source-label").click();
  ok(
    await p.evaluate(() => {
      const source = document
        .querySelector("#source-users")
        .getBoundingClientRect();
      const details = document
        .querySelector("#source-records-users")
        .getBoundingClientRect();
      return (
        Math.abs(details.top - source.bottom) < 2 &&
        document.documentElement.scrollWidth <= innerWidth + 1
      );
    }),
    "mobile records open directly beneath their source without overflow",
  );
  await p.locator('[data-ref="users:1"]').click();
  await p.waitForSelector(".drawer .evidence-facts");
  ok(
    (await p.locator(".drawer pre.raw").textContent()).includes(
      "alice@example.com",
    ),
    "a one-record source opens the original evidence",
  );
  await p.locator("[data-action=close-drawer]").click();
  await p.locator("#source-interactive").click();
  ok(
    (await p.locator("#source-records-interactive").textContent()).includes(
      "completed and returned no records",
    ),
    "a completed empty source explains itself",
  );
  await p.locator("#source-oauth").click();
  ok(
    (await p.locator("#source-records-oauth").textContent()).includes(
      "Example collection failure",
    ),
    "a failed source opens its collection error",
  );
  await p.locator("#source-records-oauth summary").click();
  ok(
    (await p.locator("#source-records-oauth pre").textContent()).includes(
      "oauth2PermissionGrants",
    ),
    "a failed source exposes its original query",
  );
  await p.locator("#source-devices").click();
  ok(
    (await p.locator("#source-records-devices").textContent()).includes(
      "was not collected",
    ),
    "an uncollected source is distinct from an empty completed query",
  );
  await shot(p, "evidence-mobile");
  await context.close();
  // ------------------------------------------------------------ web: live progress on Collect
  const coverageContext = await browser.newContext({
    colorScheme: "light",
    viewport: { width: 1440, height: 1050 },
  });
  const q = await coverageContext.newPage();
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(base + "/BETA/index.html");
  await q.waitForSelector("h1");
  await stubGraph(q, { connected: true });
  await q.evaluate(() => {
    TriageGraph.pages = async (url) => {
      const filter = new URL(url).searchParams.get("$filter") || "";
      if (filter.includes("'nonInteractiveUser'"))
        await new Promise(
          (resolve) => (window.finishCoverageRequest = resolve),
        );
      if (url.includes("directoryAudits"))
        return {
          state: "failed",
          records: [],
          error: "Example source request failed",
          pages: 0,
          nextLink: null,
        };
      if (url.includes("riskyUsers"))
        return {
          state: "partial",
          records: [
            { id: "partial-example", userPrincipalName: "analyst@example.com" },
          ],
          error: "Example page limit",
          pages: 1,
          nextLink: null,
        };
      return {
        state: "complete",
        records: filter.includes("'interactiveUser'")
          ? Array.from({ length: 83 }, (_, i) => ({
              id: "example-signin-" + i,
              userPrincipalName: "analyst@example.com",
              createdDateTime: "2026-09-15T09:00:00Z",
            }))
          : [],
        pages: 1,
        nextLink: null,
      };
    };
  });
  await q.locator("[data-action=new-investigation]").click();
  await q.waitForSelector("#scope-form");
  ok(
    (await hash(q)) === "#/scope",
    "a signed-in analyst goes straight to Scope",
  );
  await q.locator("#scope-form [name=upn]").fill("alice@example.com");
  await q.locator("[data-action=start-collection]").click();
  await q.waitForFunction(
    () => typeof window.finishCoverageRequest === "function",
  );
  ok(
    (await hash(q)) === "#/collect" &&
      (await q.locator(".coverage-heading").textContent()).includes(
        "1 / 7 selected sources complete",
      ),
    "Collect shows progress for the selected plan only",
  );
  ok(
    (await q.locator(".collect-target h2").innerText())
      .replace(/\s+/g, " ")
      .trim() === "alice@example.com in example.com" &&
      (await q.locator(".collect-target").innerText()).includes(
        "COLLECTING FROM",
      ) &&
      (await q.locator(".collect-target-facts").innerText()).includes(
        "analyst@example.com",
      ) &&
      (await q.locator(".collect-target-facts").innerText()).includes(
        "7 selected",
      ),
    "a running collection states the account, the tenant, the sources and the analyst prominently",
  );
  ok(
    await q.evaluate(() => window.scrollY === 0),
    "collection starts at the top of Collect",
  );
  ok(
    (await q.locator(".coverage-meter").getAttribute("aria-valuenow")) ===
      "1" &&
      (await q.locator(".coverage-meter").getAttribute("aria-valuemax")) ===
        "7",
    "progress has accessible source counts",
  );
  ok(
    (await q
      .locator(".collection-coverage .source-row")
      .first()
      .getAttribute("data-source")) === "nonInteractive" &&
      (await q
        .locator("#source-nonInteractive .source-status")
        .textContent()) === "Collecting",
    "the running source is first and explicit",
  );
  ok(
    (await q.locator("#source-interactive .source-count").textContent()) ===
      "83 records" &&
      (await q.locator("#source-audits .source-status").textContent()) ===
        "Waiting" &&
      (await q.locator("#source-audits .source-count").count()) === 0,
    "completed and waiting sources are distinct without misleading zeroes",
  );
  ok(
    (await q.locator(".collection-coverage .source-row").count()) === 7 &&
      (await q.locator("#source-devices").count()) === 0,
    "unselected sources stay off the Collect screen",
  );
  ok(
    await q
      .locator(
        '#execution-status [data-engine="browser-js"][data-stage=collecting]',
      )
      .isVisible(),
    "live web checks are labelled Browser JavaScript",
  );
  ok(
    (await q
      .locator("#navigation [data-step=review][aria-disabled=true]")
      .count()) === 1 &&
      (await q.locator("#navigation .nav-collection").count()) === 1,
    "Review waits and the rail shows the running collection",
  );
  await shot(q, "collect-running");
  await q
    .locator(".collection-coverage")
    .screenshot({ path: path.join(shots, "beta31-coverage-running.png") });
  await q.emulateMedia({ reducedMotion: "reduce" });
  ok(
    await q
      .locator("#source-nonInteractive .source-state-icon")
      .evaluate((el) => getComputedStyle(el).animationName === "none"),
    "the running indicator respects reduced motion",
  );
  await q.setViewportSize({ width: 390, height: 950 });
  ok(await fits(q), "live progress fits a phone");
  await q.setViewportSize({ width: 1440, height: 1050 });
  await q.locator("#source-audits").click();
  await q.waitForSelector("#source-records-audits");
  ok(
    (await hash(q)) === "#/collect?s=audits" &&
      (await q.locator("#source-records-audits").textContent()).includes(
        "waiting to start",
      ),
    "a waiting source opens on Collect and explains its pending result",
  );
  await q.locator("#source-interactive").click();
  await q.waitForSelector("#source-records-interactive");
  await q.locator('[data-ref="interactive:1"]').click();
  await q.waitForSelector("#detail[open] .evidence-facts");
  ok(
    (await q.locator("#detail-content").textContent()).includes(
      "example-signin-0",
    ),
    "records that already arrived open in a dialog during collection",
  );
  await q.locator("[data-action=close-dialog]").click();
  await q.evaluate(() => window.finishCoverageRequest());
  await q.waitForFunction(() => location.hash.includes("/review/overview"));
  await q.waitForSelector("#execution-status [data-stage=viewing]", { state: "attached" });
  ok(
    (await q.locator("#execution-status").textContent()).includes(
      "Collection method recorded in this case: Browser JavaScript",
    ),
    "a finished collection keeps its engine without claiming checks run",
  );
  ok(
    (await q.locator(".coverage-heading").textContent()).includes(
      "5 / 7 selected sources complete",
    ),
    "failed and partial results never count as complete",
  );
  ok(
    (await q.locator("#source-audits .source-status").textContent()) ===
      "Failed" &&
      (await q.locator("#source-riskyUsers .source-status").textContent()) ===
        "Partial",
    "failure and partial coverage stay distinct",
  );
  ok(
    (await q.locator(".notice").filter({ hasText: "Evidence gaps remain" }).count()) ===
      1 && (await q.locator("[data-action=resume]").count()) >= 1,
    "Review keeps evidence gaps visible and offers to resume",
  );
  await q.locator("#source-audits").click();
  await q.waitForSelector("#source-records-audits");
  ok(
    (await hash(q)).includes("/review/evidence?s=audits") &&
      (await q.locator("#source-records-audits").textContent()).includes(
        "Example source request failed",
      ),
    "a failed row opens its error on Evidence",
  );
  const interrupted = await q.evaluate(async () => {
    const ev = BETA_Evidence.create({
      selectedSources: ["interactive", "audits"],
    });
    BETA_Evidence.setSource(ev, "interactive", [], { state: "running" });
    return BETA_Evidence.bundle(ev);
  });
  await q.locator("#import-files").setInputFiles({
    name: "interrupted-example.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(interrupted)),
  });
  await q.waitForFunction(() =>
    document.querySelector("h1")?.textContent.includes("at a glance"),
  );
  ok(
    (await q.locator("#source-interactive .source-status").textContent()) ===
      "Interrupted" && (await q.locator(".coverage-current").count()) === 0,
    "saved running requests show as interrupted",
  );
  ok(
    (await q.locator("#source-audits .source-status").textContent()) ===
      "Not collected",
    "unstarted sources in a stopped case are not a live queue",
  );
  await coverageContext.close();
  // ------------------------------------------------------------ web: directory role and MFA queries through Custom
  const directoryPage = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    colorScheme: "light",
  });
  directoryPage.on("pageerror", (e) => errors.push(e.message));
  await directoryPage.goto(base + "/BETA/index.html");
  await directoryPage.waitForSelector("h1");
  await stubGraph(directoryPage, { connected: true });
  await directoryPage.evaluate(() => {
    const id = "22222222-2222-4222-8222-222222222222";
    TriageGraph.gfetch = async (url) => {
      if (url.includes("/users?")) return { value: [] };
      if (url.includes("/users/"))
        return { id, userPrincipalName: "alice@example.com" };
      if (
        url !==
        "https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails/" +
          id
      )
        throw Error("Query not allowed on property: id");
      return {
        id,
        userPrincipalName: "alice@example.com",
        isMfaRegistered: true,
        methodsRegistered: ["fido2"],
      };
    };
    TriageGraph.pages = async (url, opts) => {
      const u = new URL(url);
      if (
        !["/roleAssignments", "/roleEligibilityScheduleInstances"].some((p) =>
          u.pathname.endsWith(p),
        ) ||
        u.searchParams.get("$expand") !== "roleDefinition"
      )
        throw Error("Only one property can be expanded in a single query.");
      const out = {
        records: [
          {
            id: "role-fixture",
            principalId: id,
            roleDefinitionId: "security-reader",
            roleDefinition: { displayName: "Security Reader" },
          },
        ],
        state: "complete",
        pages: 1,
        nextLink: null,
      };
      opts.onPage(out);
      return out;
    };
  });
  await directoryPage.locator("[data-action=new-investigation]").click();
  await directoryPage.waitForSelector("#scope-form");
  await directoryPage
    .locator("#scope-form [name=upn]")
    .fill("alice@example.com");
  await directoryPage.locator("[name=preset][value=custom]").check();
  await directoryPage.waitForSelector("input[name=source]");
  for (const checkbox of await directoryPage
    .locator("input[name=source]")
    .all())
    await checkbox.setChecked(
      ["admins", "mfa"].includes(await checkbox.inputValue()),
    );
  await directoryPage.locator("[data-action=start-collection]").click();
  await directoryPage.waitForFunction(
    () =>
      location.hash.includes("/review/overview") &&
      !document.querySelector("[data-action=cancel]"),
  );
  ok(
    (await directoryPage
      .locator(".coverage-meter")
      .getAttribute("aria-valuenow")) === "2",
    "role and MFA queries complete through the workflow",
  );
  await directoryPage.locator("#source-admins").click();
  await directoryPage.waitForSelector("#source-records-admins");
  await directoryPage.locator("#source-records-admins summary").click();
  ok(
    (
      await directoryPage.locator("#source-records-admins").textContent()
    ).includes("roleDefinition") &&
      !(
        await directoryPage.locator("#source-records-admins").textContent()
      ).includes("principal,roleDefinition"),
    "role evidence exposes the single-expansion query",
  );
  await directoryPage.locator('[data-ref="admins:1"]').click();
  await directoryPage.waitForSelector(".drawer .evidence-facts");
  ok(
    (await directoryPage.locator(".drawer").textContent()).includes(
      "Security Reader",
    ),
    "collected role evidence retains its role name",
  );
  await directoryPage.locator("#source-mfa").click();
  await directoryPage.waitForSelector("#source-records-mfa");
  await directoryPage.locator("#source-records-mfa summary").click();
  ok(
    (await directoryPage.locator("#source-records-mfa").textContent()).includes(
      "/userRegistrationDetails/22222222-2222-4222-8222-222222222222",
    ),
    "MFA evidence exposes the dedicated user report query",
  );
  await directoryPage.locator('[data-ref="mfa:1"]').click();
  await directoryPage.waitForSelector(".drawer .evidence-facts");
  ok(
    (await directoryPage.locator(".drawer").textContent()).includes("fido2"),
    "the MFA report keeps its registration details",
  );
  await directoryPage.close();
  // ------------------------------------------------------------ shared checks
  const oauthPage = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  oauthPage.on("pageerror", (e) => errors.push(e.message));
  await oauthPage.goto(base + "/BETA/index.html");
  await checkOAuthScope(oauthPage, ok, path.join(shots, "beta31-oauth"));
  await checkAnalysisStatus(oauthPage, ok, path.join(shots, "beta31-web"));
  await oauthPage.close();
  await checkReadiness(browser, base, ok, path.join(shots, "beta31-readiness"));
  await checkWorkflow(browser, base, ok, path.join(shots, "beta34-workflow"));
  ok(errors.length === 0, "no browser runtime errors: " + errors.join("; "));
  console.log(checks + " browser checks passed");
} finally {
  await browser.close();
  server?.close();
}
