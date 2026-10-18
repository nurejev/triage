export async function checkAnalysisStatus(page, ok, prefix) {
  const native = await page.evaluate(() => !!window.triageNative);
  await page.evaluate(() => {
    window.executionOriginalAnalyze = TriageAnalysis.run;
    TriageAnalysis.run = (...args) =>
      new Promise((resolve, reject) => {
        window.releaseExecutionAnalysis = () =>
          window.executionOriginalAnalyze(...args).then(resolve, reject);
      });
  });
  const bundle = await page.evaluate(() =>
    BETA_Evidence.bundle(
      BETA_Evidence.create({
        collectionMethod: "powershell",
        tenantName: "Fictional execution test",
      }),
    ),
  );
  await page.locator("#import-files").setInputFiles({
    name: "execution-case.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await page.waitForSelector("#execution-status [data-stage=analyzing]");
  ok(
    (await page
      .locator("#execution-status [data-engine=analysis-js]")
      .count()) === 1 &&
      (await page.locator("#execution-status").textContent()).includes(
        "Analyzing evidence with JavaScript",
      ),
    "analysis is explicitly JavaScript even when collection used PowerShell",
  );
  await page.screenshot({ path: prefix + "-analysis.png", fullPage: true });
  await page.locator("#navigation .sub[data-tab=evidence]").click();
  ok(
    await page.locator("#execution-status [data-stage=analyzing]").isVisible(),
    "execution status stays visible when navigating during analysis",
  );
  await page.evaluate(() => window.releaseExecutionAnalysis());
  await page.waitForSelector("#execution-status [data-stage=viewing]", { state: "attached" });
  ok(
    (await page.locator("#execution-status").textContent()).includes(
      (native ? "App" : "Browser") + " viewer · no checks running",
    ) &&
      (await page.locator("#execution-status").textContent()).includes(
        "Collection method recorded in this case: PowerShell",
      ),
    "viewing an existing case distinguishes viewer location from its recorded PowerShell collection",
  );
  await page.evaluate(() => {
    TriageAnalysis.run = window.executionOriginalAnalyze;
  });
  const unknown = await page.evaluate(() =>
    BETA_Evidence.bundle(
      BETA_Evidence.create({
        tenantName: "Older case without collection metadata",
      }),
    ),
  );
  await page.locator("#import-files").setInputFiles({
    name: "legacy-method-case.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(unknown)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector("#execution-status")
      .textContent.includes("Collection method was not recorded"),
  );
  ok(
    (await page.locator("#execution-status").textContent()).includes(
      "no checks running",
    ),
    "older imported cases do not infer the collector from the current viewer",
  );
}
