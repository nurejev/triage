import fs from "node:fs";
export async function checkOAuthScope(page, ok, prefix) {
  // Observe completion of the real worker, rather than asserting during the
  // initial empty render shown while an imported case is being analyzed.
  await page.evaluate(() => {
    window.oauthOriginalAnalyze = TriageAnalysis.run;
    TriageAnalysis.run = (...args) =>
      window.oauthOriginalAnalyze(...args).then((result) => {
        window.oauthAnalysisDone = true;
        return result;
      });
  });
  const bundle = await page.evaluate(async () => {
    const E = BETA_Evidence;
    const ev = E.create({
      scope: "user",
      tenantName: "Fictional OAuth scope test",
      subject: { upn: "alice@example.test", objectId: "a1" },
    });
    E.setSource(
      ev,
      "oauth",
      [
        {
          id: "mine",
          consentType: "Principal",
          principalId: "a1",
          appName: "User-connected app",
          scope: "Mail.ReadWrite",
        },
        {
          id: "global",
          consentType: "AllPrincipals",
          principalId: null,
          appName: "SharePoint Online Web Client Extensibility",
          scope: "Mail.ReadWrite",
        },
        {
          id: "other",
          consentType: "Principal",
          principalId: "b1",
          principalUpn: "alice@example.test",
          appName: "Other account app",
          scope: "Mail.ReadWrite",
        },
        {
          id: "unknown",
          consentType: "Principal",
          principalId: null,
          appName: "Unknown account app",
          scope: "Mail.ReadWrite",
        },
        {
          id: "global2",
          consentType: "AllPrincipals",
          appName: "Microsoft Graph Command Line Tools",
          scope: "Mail.ReadWrite",
        },
      ],
      { state: "complete" },
    );
    return E.bundle(ev);
  });
  const open = async (value, userCase = true) => {
    await page.evaluate(() => {
      window.oauthAnalysisDone = false;
      window.oauthPreviousContent =
        document.querySelector("#main").firstElementChild;
    });
    await page.locator("#import-files").setInputFiles({
      name: "oauth-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
    await page.waitForFunction(
      () =>
        document.querySelector("#main").firstElementChild !==
        window.oauthPreviousContent,
    );
    await page.waitForFunction(() => window.oauthAnalysisDone === true);
    await page.waitForFunction(
      () =>
        document.querySelector("h1")?.textContent === "The case, at a glance.",
    );
    if (userCase) await page.waitForSelector(".oauth-scope-note");
  };
  await open(bundle);
  ok(
    (await page.locator(".stat.attention strong").textContent()) === "1" &&
      (await page.locator("[data-finding]").count()) === 1,
    "mixed OAuth evidence contributes only one user priority signal",
  );
  ok(
    (await page
      .locator("#navigation [data-step=review] .count")
      .textContent()) === "1",
    "sidebar finding count excludes tenant-wide and unrelated grants",
  );
  await page.locator("#navigation .sub[data-tab=findings]").click();
  ok(
    (await page.locator("[data-finding]").count()) === 1 &&
      (await page.locator("[data-finding]").textContent()).includes(
        "User-connected app",
      ),
    "user findings list includes the direct grant and excludes tenant and other-account apps",
  );
  const summary = await page.locator(".oauth-scope-note").textContent();
  ok(
    summary.includes("1 user-specific grant") &&
      summary.includes("2 tenant-wide") &&
      summary.includes("1 for other accounts") &&
      summary.includes("1 with unverified"),
    "scope summary explains all retained grant relationships",
  );
  await page.screenshot({ path: prefix + "-findings.png", fullPage: true });
  await page.locator("#theme").selectOption("dark");
  await page.screenshot({ path: prefix + "-dark.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "OAuth scope summary fits a narrow viewport",
  );
  await page.screenshot({ path: prefix + "-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator("#theme").selectOption("light");
  await page.locator(".oauth-scope-note [data-action=source]").click();
  ok(
    (await page.locator("#source-records-oauth [data-ref]").count()) === 5,
    "all five original OAuth grants remain available in Evidence",
  );
  ok(
    (await page.locator('[data-ref="oauth:2"]').textContent()).includes(
      "Tenant-wide consent",
    ),
    "global evidence is explicitly labelled as shared context",
  );
  await page.locator('[data-ref="oauth:2"]').click();
  await page.waitForSelector(".drawer .evidence-facts");
  ok(
    (await page.locator(".drawer").textContent()).includes("AllPrincipals"),
    "tenant-wide original evidence opens in the record drawer",
  );
  await page.locator("[data-action=close-drawer]").click();
  let saved;
  if (await page.evaluate(() => !!window.triageNative)) {
    await page.locator("[data-action=save]").click();
    await page.waitForFunction(
      async (id) => (await triageNative.loadCase())?.evidence.caseId === id,
      bundle.evidence.caseId,
    );
    saved = await page.evaluate(() => triageNative.loadCase());
    fs.writeFileSync(prefix + "-case.json", JSON.stringify(saved));
  } else {
    const downloaded = page.waitForEvent("download");
    await page.locator("#casebar [data-action=export]").click();
    const result = await downloaded;
    await result.saveAs(prefix + "-case.json");
    saved = JSON.parse(fs.readFileSync(prefix + "-case.json"));
  }
  ok(
    JSON.stringify(saved.evidence.raw) === JSON.stringify(bundle.evidence.raw),
    "case save/export retains every original grant unchanged",
  );
  await open(saved);
  ok(
    (await page.locator("[data-finding]").count()) === 1,
    "reopening an existing case re-applies user attribution",
  );
  const onlyGlobal = await page.evaluate(async (value) => {
    BETA_Evidence.setSource(
      value.evidence,
      "oauth",
      value.evidence.raw.oauth.filter((g) => g.consentType === "AllPrincipals"),
      { state: "complete" },
    );
    return BETA_Evidence.bundle(value.evidence);
  }, bundle);
  await open(onlyGlobal);
  ok(
    (await page.locator(".stat.attention strong").textContent()) === "0" &&
      (await page.locator("[data-finding]").count()) === 0,
    "a case with only global consent has zero user OAuth priority signals",
  );
  const tenantCase = await page.evaluate(async (value) => {
    value.evidence.scope = "tenant";
    delete value.evidence.subject;
    return BETA_Evidence.bundle(value.evidence);
  }, bundle);
  await open(tenantCase, false);
  await page.waitForFunction(
    () => document.querySelectorAll("[data-finding]").length === 5,
  );
  ok(
    (await page.locator("[data-finding]").count()) === 5 &&
      (await page.locator(".oauth-scope-note").count()) === 0,
    "tenant-wide review still analyzes all five grants",
  );
  await page.evaluate(() => {
    TriageAnalysis.run = window.oauthOriginalAnalyze;
  });
}
