// Captures the rendered BETA screens (the .shell markup) for the as-built workflow page
// (review/2026-09-17/workflow-redesign-beta33.html). Synthetic data only; Microsoft is never
// contacted. Output: test-results/workflow-frames/<name>.html (+ .png). Then run make-workflow-page.mjs.
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..", "..");
const out = path.join(root, "test-results", "workflow-frames");
fs.mkdirSync(out, { recursive: true });
const server = http
  .createServer((req, res) => {
    const file = path.join(root, new URL(req.url, "http://localhost").pathname);
    fs.readFile(file, (err, data) => {
      if (err) return void res.writeHead(404).end();
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[path.extname(file)] || "application/octet-stream",
      );
      res.end(data);
    });
  })
  .listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true });
const TENANT = "44444444-4444-4444-8444-444444444444";
const stub = (page, connected) =>
  page.evaluate(
    ({ connected, TENANT }) => {
      window.connectedAccount = connected
        ? { tenantId: TENANT, username: "analyst@contoso.nl" }
        : null;
      Object.defineProperty(TriageGraph, "account", {
        configurable: true,
        get: () => window.connectedAccount,
      });
      TriageGraph.signIn = async () =>
        (window.connectedAccount = {
          tenantId: TENANT,
          username: "analyst@contoso.nl",
        });
      TriageGraph.signOut = async () => {
        window.connectedAccount = null;
      };
      TriageGraph.setTenant = (id) => id;
      TriageGraph.resolveTenant = async (domain) => ({
        tenantId: TENANT,
        domain,
      });
      TriageGraph.gfetch = async (url) => {
        if (url.includes("/users?"))
          return {
            value: [
              {
                id: "55555555-5555-4555-8555-555555555555",
                displayName: "Jan de Vries",
                userPrincipalName: "jan.devries@contoso.nl",
              },
            ],
          };
        return {
          id: "55555555-5555-4555-8555-555555555555",
          userPrincipalName: "jan.devries@contoso.nl",
        };
      };
      TriageGraph.pages = async (url) => {
        const filter = new URL(url).searchParams.get("$filter") || "";
        if (url.includes("registeredDevices") || url.includes("/devices?"))
          await new Promise((resolve) => (window.finishCapture = resolve));
        const n = filter.includes("'interactiveUser'")
          ? 61
          : filter.includes("'nonInteractiveUser'")
            ? 402
            : url.includes("directoryAudits")
              ? 12
              : url.includes("riskDetections")
                ? 2
                : url.includes("oauth2PermissionGrants")
                  ? 5
                  : url.includes("servicePrincipals")
                    ? 148
                    : url.includes("devices")
                      ? 3
                      : url.includes("roleAssignments")
                        ? 1
                        : 0;
        return {
          state: "complete",
          records: Array.from({ length: n }, (_, i) => ({
            id: "rec-" + i,
            userPrincipalName: "jan.devries@contoso.nl",
            createdDateTime: "2026-09-15T09:00:00Z",
            ipAddress: "185.220.101.4",
          })),
          pages: 1,
          nextLink: null,
        };
      };
    },
    { connected, TENANT },
  );
const grab = async (page, name) => {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.waitForTimeout(250);
  const html = await page.$eval(".shell", (el) => el.outerHTML);
  fs.writeFileSync(path.join(out, name + ".html"), html);
  await page.screenshot({
    path: path.join(out, name + ".png"),
    fullPage: true,
  });
  console.log(
    "captured",
    name,
    (html.length / 1024).toFixed(0) + " KB",
    await page.evaluate(() => location.hash),
  );
};
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
// 1 · Start, nothing open.
await page.goto(base + "/BETA/index.html#/start");
await page.waitForSelector("#navigation button");
await grab(page, "01-start");
// 2 · Connect on the web: customer tenant resolved, sign-in open.
await page.evaluate(() => {
  const s = JSON.parse(
    localStorage.getItem("triage-desk-settings-v31") || "{}",
  );
  Object.assign(s, {
    tenantMode: "customer",
    domain: "contoso.nl",
    tenant: null,
  });
  localStorage.setItem("triage-desk-settings-v31", JSON.stringify(s));
});
await page.goto(base + "/BETA/index.html?fresh=1#/connect");
await page.waitForSelector("[name=domain]");
await stub(page, false);
await page.locator("[data-action=resolve-tenant]").click();
await page.waitForSelector(".notice.good");
await grab(page, "02-connect-web");
// 3 · Scope on the web with the account picked (Custom: every Graph source).
await page.goto(base + "/BETA/index.html?fresh=2#/start");
await page.waitForSelector("#navigation button");
await stub(page, true);
await page.locator("[data-action=new-investigation]").click();
await page.waitForSelector("#scope-form");
await page.locator("#scope-form [name=upn]").fill("jan");
await page.waitForSelector("[data-action=pick-account]");
await page.locator("[data-action=pick-account]").click();
await page
  .locator("#scope-form [name=days]")
  .selectOption("30")
  .catch(() => {});
await page.locator("#scope-form [name=preset][value=standard]").check();
await page.waitForTimeout(300);
await grab(page, "03-scope-web");
// 4 · Collect running on the web: the target banner, 8 of 12 done, one collecting.
await page.locator("[data-action=start-collection]").click();
await page.waitForFunction(() => typeof window.finishCapture === "function");
await page.waitForTimeout(400);
await grab(page, "04-collect-web");
await page.evaluate(() => window.finishCapture());
await page.waitForFunction(() => location.hash.includes("/review/overview"));
await page.waitForSelector("#execution-status [data-stage=viewing]");
await grab(page, "04b-review-overview-web");
// Respond on the live web case: the account checks connect by themselves with the Connect sign-in.
await page.locator("#navigation [data-step=respond]").click();
await page.waitForFunction(() => location.hash.includes("/respond/"));
await page.waitForTimeout(800);
await grab(page, "06a-respond-preserve");
await page.locator(".phase-track [data-tab=contain]").click();
await page.waitForFunction(() => location.hash.includes("/respond/contain"));
await page
  .waitForSelector(".hour-check .badge.complete", { timeout: 15000 })
  .catch(() => console.log("no Connected badge"));
await page.waitForTimeout(800);
await grab(page, "06-respond-contain");
// 5 · The sample case: Review with the finding drawer, Respond, Hand over.
await page.evaluate(() => {
  sessionStorage.clear();
  localStorage.clear();
});
await page.goto(base + "/BETA/index.html?fresh=3#/start");
await page.waitForSelector("#navigation button");
await page.waitForTimeout(500);
await page.locator("[data-action=demo]").first().click();
await page.waitForFunction(() => location.hash.includes("/review/"));
await page.waitForSelector("#execution-status [data-stage=viewing]");
await page.locator("#navigation .sub[data-tab=findings]").click();
await page.waitForSelector("[data-finding]");
await page.locator("[data-finding]").first().click();
await page.waitForSelector(".drawer");
await page.waitForTimeout(300);
await grab(page, "05-review-findings-drawer");
await page.locator("#navigation .sub[data-tab=evidence]").click();
await page.waitForSelector(".evidence-sources .source-row");
await page.locator(".evidence-sources .source-row").first().click();
await page.waitForTimeout(300);
await grab(page, "05b-review-evidence");
await page.locator("#navigation [data-step=handover]").click();
await page.waitForFunction(() => location.hash.includes("/handover"));
await page.waitForTimeout(300);
await grab(page, "07-handover");
await page.locator("#navigation [data-step=collect]").click();
await page.waitForFunction(() => location.hash.includes("/collect"));
await page.waitForTimeout(300);
await grab(page, "07b-collect-sample");
await page.locator("#navigation [data-action=help]").click();
await page.waitForFunction(() => location.hash === "#/guide");
await grab(page, "08-help");
await page.close();
// 9 · The desktop app with a stubbed bridge: Connect rows (Graph ready, Exchange waiting).
const app = await context.newPage();
app.on("pageerror", (e) => console.log("app pageerror", e.message));
await app.addInitScript(
  ({ TENANT }) => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    const sessions = { caseId: null, services: {} };
    window.triageNative = {
      initialTheme: "light",
      onProgress(cb) {
        window.__progress = cb;
      },
      onPlan() {},
      preflight: async () => ({
        ready: true,
        powerShell: "7.5.2",
        modules: {},
      }),
      profiles: async () => [],
      evidenceFolder: async () => ({
        folder: "/Users/analyst/Triage evidence",
      }),
      listCases: async () => [],
      loadCase: async () => null,
      saveCase: async () => ({ saved: true }),
      clearCase: async () => ({}),
      sessions: async () => (sessions.caseId ? sessions : null),
      connect: async (input) => {
        sessions.caseId = input.caseId;
        return new Promise((resolve, reject) => {
          window["__resolve_" + input.service] = (account) => {
            sessions.services[input.service] = {
              state: "ready",
              account,
              since: new Date().toISOString(),
            };
            resolve({
              caseId: input.caseId,
              service: input.service,
              account,
              tenantId: input.tenantId,
              authentication: "delegated",
            });
          };
          window["__reject_" + input.service] = reject;
        });
      },
      cancelConnect: async () => ({ cancelled: true }),
      disconnect: async () => ({ disconnected: true }),
      collect: async (plan) => {
        window.__plan = plan;
        return new Promise((resolve) => {
          window.__resolveCollect = resolve;
        });
      },
      cancel: async () => ({ cancelled: true }),
      openEvidenceFolder: async () => {},
      chooseEvidenceFolder: async () => ({ folder: "/x" }),
      setTheme: async () => ({}),
    };
  },
  { TENANT },
);
await app.goto(base + "/BETA/index.html#/connect");
await app.waitForSelector("[data-action=signin-service][data-service=graph]");
await app.waitForSelector(".notice.good");
await app.locator("[name=domain]").fill("contoso.nl");
await app.evaluate(() => {
  TriageGraph.resolveTenant = async (domain) => ({
    tenantId: "44444444-4444-4444-8444-444444444444",
    domain,
  });
});
await app.locator("[data-action=resolve-tenant]").click();
await app.waitForSelector(".notice.good:has-text('contoso.nl')");
await app.locator("[data-action=signin-service][data-service=graph]").click();
await app.waitForSelector(
  ".service-connection[data-service=graph][data-state=connecting]",
);
await app.evaluate(() => window.__resolve_graph("analyst@contoso.nl"));
await app.waitForSelector(
  ".service-connection[data-service=graph][data-state=ready]",
);
await app
  .locator("[data-action=signin-service][data-service=exchange]")
  .click();
await app.waitForSelector(
  ".service-connection[data-service=exchange][data-state=connecting]",
);
await app.evaluate(() =>
  window.__progress({
    type: "status",
    text: "Exchange Online: Waiting for Microsoft browser sign-in and callback",
  }),
);
await app.waitForTimeout(1200);
await grab(app, "09-connect-app");
await app.evaluate(() => window.__resolve_exchange("analyst@contoso.nl"));
await app.waitForSelector(
  ".service-connection[data-service=exchange][data-state=ready]",
);
await grab(app, "09b-connect-app-ready");
await app.locator("[data-step=scope].primary").click();
await app.waitForSelector("#scope-form");
await app
  .locator("#scope-form [name=scope]")
  .selectOption("tenant")
  .catch(() => {});
await app
  .locator("#scope-form [name=days]")
  .selectOption("30")
  .catch(() => {});
await app.locator("#scope-form [name=preset][value=custom]").check();
await app.waitForSelector("#scope-form input[name=source]");
await app.locator("[data-action=sources-none]").click();
await app.waitForTimeout(200);
for (const key of [
  "interactive",
  "nonInteractive",
  "audits",
  "riskyUsers",
  "riskDetections",
  "users",
  "servicePrincipals",
  "oauth",
  "admins",
  "mfa",
  "ual",
  "conditionalAccess",
  "transportRules",
  "messageTrace",
])
  await app
    .locator(`#scope-form input[name=source][value=${key}]`)
    .check()
    .catch((e) => console.log("no source", key, e.message.split("\n")[0]));
await app.waitForTimeout(300);
await app.evaluate(() => window.scrollTo(0, 0));
await grab(app, "10-scope-app");
await app.locator("[data-action=start-collection]").click();
await app.waitForFunction(() => location.hash === "#/collect");
await app.evaluate(() => {
  const caseId = window.__plan.caseId;
  const rec = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: "rec-" + i,
      userPrincipalName: "jan.devries@contoso.nl",
      createdDateTime: "2026-09-15T09:00:00Z",
    }));
  window.__progress({
    type: "connection",
    mode: "graph",
    state: "collecting",
    caseId,
    account: "analyst@contoso.nl",
  });
  window.__progress({
    type: "connection",
    mode: "exchange",
    state: "collecting",
    caseId,
    account: "analyst@contoso.nl",
  });
  window.__progress({
    type: "status",
    caseId,
    text: "Interactive sign-ins · complete",
  });
  for (const [key, n] of [
    ["interactive", 1284],
    ["nonInteractive", 9310],
    ["audits", 212],
    ["riskyUsers", 3],
    ["riskDetections", 7],
    ["users", 418],
    ["servicePrincipals", 148],
    ["oauth", 96],
  ])
    window.__progress({
      type: "source",
      source: key,
      records: rec(n),
      manifest: { state: "complete" },
      caseId,
      collectorAccount: "analyst@contoso.nl",
    });
  window.__progress({
    type: "source",
    source: "admins",
    records: rec(9),
    manifest: { state: "running" },
    caseId,
    collectorAccount: "analyst@contoso.nl",
  });
  window.__progress({
    type: "status",
    caseId,
    text: "Directory role assignments · PIM eligibility",
  });
});
await app.evaluate(() => window.scrollTo(0, 0));
await app.waitForSelector(".source-row[data-state=running]");
await app.waitForTimeout(500);
await grab(app, "11-collect-app");
await browser.close();
server.close();
