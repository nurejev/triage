import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const repo = path.resolve(import.meta.dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "triage-profiles-ui-"));
const desktop = path.join(root, "desktop"),
  data = path.join(root, "profile");
fs.mkdirSync(path.join(desktop, "collector"), { recursive: true });
for (const name of ["main.cjs", "preload.cjs", "core.cjs", "profiles.cjs"])
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
for (const name of [
  "certificate.ps1",
  "check-certificate.ps1",
  "New-TriageRegistrations.ps1",
])
  fs.copyFileSync(
    path.join(repo, "desktop/collector", name),
    path.join(desktop, "collector", name),
  );
let app,
  checks = 0;
const ok = (value, label) => {
  assert.ok(value, label);
  console.log("ok " + ++checks + " " + label);
};
try {
  app = await electron.launch({ args: [desktop] });
  const page = await app.firstWindow();
  await page.waitForSelector("#collection-form");
  await page.setViewportSize({ width: 1440, height: 1050 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("[data-action=customer-manage]").click();
  await page.locator("[data-action=customer-wizard]").click();
  await page.locator("#registration-form [name=name]").fill("Fixture Customer");
  await page
    .locator("#registration-form [name=tenantId]")
    .fill("11111111-1111-4111-8111-111111111111");
  await page
    .locator("#registration-form [name=organization]")
    .fill("fixture.onmicrosoft.com");
  await page.locator("[data-action=customer-preview]").click();
  ok(
    await page
      .locator("#detail-content")
      .getByText("Exchange.ManageAsApp", { exact: false })
      .isVisible(),
    "wizard shows Exchange permission and read-only command scope before export",
  );
  await page.screenshot({
    path: "test-results/beta22-registration-review.png",
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, root);
  await page.locator("[data-action=customer-export-kit]").click();
  await page.waitForSelector("[data-action=customer-add]");
  const folder = fs
      .readdirSync(root)
      .find((n) => n.startsWith("Triage-setup-")),
    settings = JSON.parse(
      fs.readFileSync(path.join(root, folder, "settings.json")),
    );
  ok(
    settings.exchange &&
      !settings.graphPermissions.some((p) => p.includes("Write")),
    "exported collector permission set has no management writes",
  );
  ok(
    fs.existsSync(path.join(root, folder, "New-TriageRegistrations.ps1")) &&
      !fs.existsSync(path.join(root, folder, "customer.pfx")),
    "wizard exports runnable setup without silently generating keys or provisioning",
  );
  ok(
    (await page.locator("#detail-content").innerText()).includes(
      "no cloud registrations have been created",
    ),
    "completion clearly distinguishes preparation from cloud creation",
  );
  await page.locator("[data-action=customer-add]").click();
  await page.locator("[data-action=customer-save]").click();
  ok(
    await page.locator("#customer-error").isVisible(),
    "missing certificate validation stays inside the dialog",
  );
  const imported = path.join(root, "profile.json");
  fs.writeFileSync(
    imported,
    JSON.stringify({
      name: "Imported customer",
      tenantId: settings.tenantId,
      graphAppId: "22222222-2222-4222-8222-222222222222",
      exchangeAppId: "33333333-3333-4333-8333-333333333333",
      organization: settings.organization,
      CertPassword: "MUST-NOT-REACH-RENDERER",
    }),
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, imported);
  await page.locator("[data-action=customer-import]").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#customer-form [name=name]").value ===
      "Imported customer",
  );
  ok(
    !(await page.content()).includes("MUST-NOT-REACH-RENDERER"),
    "registration import transfers IDs only and ignores password fields",
  );
  await page.screenshot({ path: "test-results/beta22-existing-profile.png" });
  const pfxFile = path.join(root, "fixture.pfx"),
    generator = path.join(root, "generate.ps1");
  fs.writeFileSync(
    generator,
    `param($OutputPath)
$ErrorActionPreference='Stop'
$rsa=[Security.Cryptography.RSA]::Create(2048)
$r=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Triage UI fixture',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$c=$r.CreateSelfSigned([datetimeoffset]::UtcNow.AddMinutes(-5),[datetimeoffset]::UtcNow.AddDays(2))
[IO.File]::WriteAllBytes($OutputPath,$c.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'test-fixture-password'))`,
  );
  execFileSync(path.join(runtime, "powershell", "pwsh"), [
    "-NoProfile",
    "-File",
    generator,
    "-OutputPath",
    pfxFile,
  ]);
  await app.evaluate(({ dialog, safeStorage }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    // Isolated host contract test. OS encryption itself is not claimed tested here.
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.encryptString = (s) => Buffer.from(s).reverse();
    safeStorage.decryptString = (b) => Buffer.from(b).reverse().toString();
  }, pfxFile);
  await page.locator("[data-action=customer-certificate]").click();
  await page.locator("#customer-form [name=password]").fill("wrong");
  await page.locator("[data-action=customer-save]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#customer-error")
      .textContent.includes("validation failed"),
  );
  ok(
    (await page.locator("#customer-form [name=password]").inputValue()) === "",
    "failed save clears the PFX password and keeps an actionable error",
  );
  await page
    .locator("#customer-form [name=password]")
    .fill("test-fixture-password");
  await page.locator("[data-action=customer-save]").click();
  await page.waitForFunction(() => !document.querySelector("#detail").open);
  ok(
    (await page.locator("#collection-form [name=tenantId]").inputValue()) ===
      settings.tenantId,
    "saved profile selects its tenant automatically",
  );
  const stored = await page.evaluate(() => window.triageNative.profiles());
  ok(
    stored.length === 1 &&
      !JSON.stringify(stored).includes("test-fixture-password") &&
      !stored[0].secret,
    "native bridge returns profile metadata only",
  );
  ok(
    (await page.locator("#collection-form").innerText()).includes(
      "App + certificate",
    ),
    "setup clearly identifies certificate authentication",
  );
  await page.screenshot({ path: "test-results/beta22-certificate-ready.png" });
  await page.locator("[data-action=customer-manage]").click();
  await page.locator("[data-action=customer-remove]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#detail-content")
      .textContent.includes("No saved customer profiles"),
  );
  ok(
    (await page.evaluate(() => window.triageNative.profiles())).length === 0,
    "removing the local profile removes its saved credential",
  );

  await page.setViewportSize({ width: 820, height: 900 });
  await page.screenshot({ path: "test-results/beta22-profile-narrow.png" });
  ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "profile form fits narrow native window",
  );
  ok(errors.length === 0, "no renderer exceptions");
  console.log(checks + " customer profile UI checks passed; no cloud calls.");
} finally {
  if (app) await app.close();
  fs.rmSync(root, { recursive: true, force: true });
}
