// Desktop readiness on the Connect step: checked when the step opens, shown in place, never a dialog.
export async function checkReadiness(browser, base, ok, prefix) {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 760 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.readinessCalls = 0;
    window.triageNative = {
      onProgress() {},
      onPlan() {},
      profiles: async () => [],
      evidenceFolder: async () => ({ folder: "/tmp/evidence" }),
      listCases: async () => [],
      sessions: async () => null,
      loadCase: async () => null,
      preflight() {
        window.readinessCalls++;
        return new Promise((resolve, reject) => {
          window.finishReadiness = resolve;
          window.failReadiness = () =>
            reject(Error("PowerShell could not start."));
        });
      },
    };
  });
  try {
    await page.goto(base + "/BETA/index.html#/connect");
    await page.waitForSelector(".readiness-checking");
    const bounds = await page.locator(".readiness-checking").boundingBox();
    ok(
      bounds.y >= 0 && bounds.y + bounds.height < 760,
      "readiness progress appears on Connect before the native check resolves",
    );
    ok(
      await page
        .locator("[data-action=signin-service][data-service=graph]")
        .isDisabled(),
      "sign-in waits for readiness and the tenant",
    );
    await page.screenshot({ path: prefix + "-checking.png" });
    await page.locator("#navigation [data-step=start]").click();
    await page.locator("#navigation [data-step=connect]").click();
    await page.waitForSelector(".readiness-checking");
    ok(
      (await page.evaluate(() => readinessCalls)) === 1,
      "leaving and returning reuses the pending native check",
    );
    await page.evaluate(() =>
      finishReadiness({ ready: true, powerShell: "7.6.0", modules: {} }),
    );
    await page.waitForSelector(".notice.good");
    ok(
      (await page.locator(".notice.good").textContent()).includes("ready"),
      "the result replaces the progress line in place",
    );
    await page
      .locator("[name=domain]")
      .fill("11111111-1111-4111-8111-111111111111");
    await page.locator("[data-action=resolve-tenant]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          "[data-action=signin-service][data-service=graph]",
        ).disabled,
    );
    ok(true, "a ready runtime and a pinned tenant open the sign-in button");
    await page.screenshot({ path: prefix + "-ready.png" });
    // A failed check explains itself and offers to check again, without a dialog.
    await page.evaluate(() => {
      window.triageNative.preflight = () =>
        new Promise((resolve, reject) => {
          window.finishReadiness = resolve;
          window.failReadiness = () =>
            reject(Error("PowerShell could not start."));
        });
    });
    await page.reload();
    await page.waitForSelector(".readiness-checking");
    await page.evaluate(() =>
      finishReadiness({
        ready: false,
        reason: "Bundled module is missing: ExchangeOnlineManagement",
      }),
    );
    await page.waitForSelector(".notice.error");
    ok(
      (await page.locator(".notice.error").textContent()).includes(
        "Bundled module is missing",
      ) &&
        (await page
          .locator(".notice.error [data-action=preflight]")
          .count()) === 1,
      "missing prerequisites are shown on the step with a retry",
    );
    ok(
      await page
        .locator("[data-action=signin-service][data-service=graph]")
        .isDisabled(),
      "sign-in stays closed while prerequisites are missing",
    );
    await page.locator(".notice.error [data-action=preflight]").click();
    await page.waitForSelector(".readiness-checking");
    await page.evaluate(() => failReadiness());
    await page.waitForSelector(".notice.error");
    ok(
      (await page.locator(".notice.error").textContent()).includes(
        "PowerShell could not start",
      ),
      "a rejected native check ends progress and explains the failure",
    );
    ok(
      !(await page.locator("#detail").isVisible()),
      "readiness never opens a dialog",
    );
    await page.setViewportSize({ width: 390, height: 760 });
    await page.locator(".notice.error [data-action=preflight]").click();
    await page.waitForSelector(".readiness-checking");
    const narrow = await page.locator(".readiness-checking").boundingBox();
    ok(
      narrow.x >= 0 &&
        narrow.x + narrow.width <= 390 &&
        narrow.y >= 0 &&
        narrow.y + narrow.height <= 760,
      "readiness progress remains visible in a narrow window",
    );
    await page.evaluate(() => finishReadiness({ ready: true }));
    await page.waitForSelector(".notice.good");
    ok(
      errors.length === 0,
      "readiness has no browser runtime errors: " + errors.join("; "),
    );
  } finally {
    await page.close();
  }
}
