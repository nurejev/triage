import fs from "node:fs";

// Synthetic cases exercise the workflow's meaning, not just its appearance.
export async function checkWorkflow(browser, base, ok, prefix) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/BETA/index.html");
  const load = async (bundle) => {
    await page.locator("#import-files").setInputFiles({
      name: "workflow.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bundle)),
    });
    await page.waitForFunction(
      () =>
        location.hash.includes("/review/overview") &&
        !document.querySelector("#execution-status [data-stage=analyzing]"),
    );
  };
  const nav = async (step, tab) => {
    const toggle = page.locator("#workflow-toggle");
    if (
      (await toggle.isVisible()) &&
      (await toggle.getAttribute("aria-expanded")) !== "true"
    )
      await toggle.click();
    await page
      .locator(
        tab
          ? `#navigation [data-tab=${tab}]`
          : `#navigation [data-step=${step}]`,
      )
      .first()
      .click();
  };
  const state = (step) =>
    page
      .locator(`#navigation [data-step=${step}] .nav-icon`)
      .first()
      .getAttribute("data-state");
  const rail = (step) =>
    page
      .locator(`#navigation [data-step=${step}] .nav-text small`)
      .first()
      .textContent();
  const bundle = await page.evaluate(async () => {
    const E = BETA_Evidence;
    const ev = E.create({
      scope: "user",
      subject: { upn: "alex@example.test", objectId: "alex" },
      tenantName: "Fictional workflow tenant",
      selectedSources: ["ual", "audits"],
      collectionMethod: "powershell",
      window: { start: "2026-09-01T00:00:00Z", end: "2026-09-18T00:00:00Z" },
    });
    E.setSource(
      ev,
      "ual",
      Array.from({ length: 50 }, (_, i) => ({
        id: `delete-${i}`,
        operation: "HardDelete",
        userPrincipalName: "alex@example.test",
        createdDateTime: "2026-09-17T12:00:00Z",
        objectId: `message-${i}`,
      })),
      { state: "complete" },
    );
    E.setSource(ev, "audits", [], {
      state: "failed",
      error: "Synthetic denied source",
    });
    return E.bundle(ev);
  });
  await load(bundle);
  ok(
    (await page.locator(".workflow-group").allTextContents()).join("|") ===
      "Prepare|Investigate|Act & transfer",
    "seven steps are grouped into the approved three stages",
  );
  ok(
    (await state("collect")).includes("exceptions"),
    "ended collection with a failed source never gets a completed tick",
  );
  await nav("respond");
  await nav("handover");
  ok(
    !(await state("review")).includes("done") &&
      !(await state("respond")).includes("done"),
    "visiting Review and Respond does not complete them",
  );
  const download = page.waitForEvent("download");
  await page.locator("[data-action=handover]").click();
  await (await download).saveAs(prefix + "-export.md");
  ok(
    (await rail("handover")).includes("Exported · handover not recorded") &&
      fs
        .readFileSync(prefix + "-export.md", "utf8")
        .includes("does not transfer ownership"),
    "exported notes explicitly retain the unrecorded handover state",
  );
  await page.locator("[data-action=record-handover]").click();
  ok(
    await page
      .locator("#handover-form [name=recipient]")
      .evaluate((el) => !el.validity.valid),
    "recording a handover requires a next owner",
  );
  await nav("review", "findings");
  ok(
    await page.locator(".evidence-gap").isVisible(),
    "source gaps remain visible on Findings",
  );
  await page
    .locator("[data-finding]")
    .filter({ hasText: "Mass HardDelete" })
    .click();
  const findingId = await page.locator("#review-form").getAttribute("data-id");
  ok(
    await page.evaluate(
      () =>
        !!(
          document
            .querySelector(".finding-evidence")
            .compareDocumentPosition(document.querySelector("#review-form")) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
    "supporting records precede the analyst decision",
  );
  ok(
    (await page.locator("#review-form [name=reference]").inputValue()) ===
      "ual:1",
    "the first actual supporting record is attached automatically",
  );
  await page.locator(".supporting-set > summary").click();
  const found = [];
  for (let i = 0; i < 5; i++) {
    found.push(
      ...(await page.locator(".supporting-record strong").allTextContents()),
    );
    if (i < 4)
      await page.locator("[data-action=reference-page]").last().click();
  }
  ok(
    found.length === 50 &&
      new Set(found).size === 50 &&
      found.at(-1) === "ual:50",
    "all fifty aggregate records are reachable without silent truncation",
  );
  await page
    .locator('[data-action=attach-reference][data-ref="ual:50"]')
    .click();
  await page
    .locator("#review-form [name=note]")
    .fill("Check the deletion against the incident ticket.");
  await page.locator("#review-form [name=state]").selectOption("investigating");
  await page
    .locator('[data-action=open-record][data-ref="ual:50"]')
    .first()
    .click();
  await page.locator(".source-metadata summary").click();
  ok(
    (await page.locator(".drawer pre.raw").textContent()).includes(
      '"id": "delete-49"',
    ),
    "the supporting reference opens the preserved original record",
  );
  await page.locator("[data-action=back-to-finding]").click();
  ok(
    (await page.locator("#review-form [name=reference]").inputValue()) ===
      "ual:50" &&
      (await page.locator("#review-form [name=note]").inputValue()).includes(
        "incident ticket",
      ),
    "the decision draft survives opening its evidence",
  );
  await page.locator("[data-action=review]").click();
  ok(
    (await rail("review")).includes("0 of 1 resolved · 1 investigating"),
    "investigating remains outstanding in the workflow count",
  );
  await page.locator(".supporting-set > summary").click();
  await page.locator("#theme").selectOption("light");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: prefix + "-review-light.png",
    fullPage: false,
  });
  await page.locator("#theme").selectOption("dark");
  await page.screenshot({ path: prefix + "-review-dark.png", fullPage: false });
  await page.locator("#review-form [name=state]").selectOption("confirmed");
  await page.locator("[data-action=review]").click();
  await nav("handover");
  ok(
    (await state("review")).includes("done"),
    "Review completes only after its current finding has a resolved decision",
  );
  await page
    .locator("#handover-form [name=recipient]")
    .fill("SOC evening team");
  await page
    .locator("#handover-form [name=channel]")
    .fill("INC-42 / incident call");
  await page
    .locator("#handover-form [name=detail]")
    .fill(
      "Investigate the audit gap and verify response. Next update at 18:00 UTC.",
    );
  await nav("review", "findings");
  await nav("handover");
  ok(
    (await page.locator("#handover-form [name=recipient]").inputValue()) ===
      "SOC evening team",
    "the handover draft survives navigation",
  );
  await page.locator("[data-action=record-handover]").click();
  ok(
    (await rail("handover")) === "Handover recorded",
    "handover needs an explicit owner, channel and next-action record",
  );
  await page.locator("#theme").selectOption("light");
  await page.screenshot({ path: prefix + "-handover.png", fullPage: true });
  const caseDownload = page.waitForEvent("download");
  await page.locator("#casebar [data-action=export]").click();
  await (await caseDownload).saveAs(prefix + "-case.json");
  const saved = JSON.parse(fs.readFileSync(prefix + "-case.json", "utf8"));
  await load(saved);
  await nav("handover");
  ok(
    (await page.locator("main").textContent()).includes("SOC evening team") &&
      (await rail("handover")) === "Handover recorded",
    "handover ownership and state survive case export and reopening",
  );
  await nav("review", "findings");
  await page.locator(`[data-finding="${findingId}"]`).click();
  ok(
    (await page.locator("#review-form [name=reference]").inputValue()) ===
      "ual:50",
    "reopened analysis preserves the supporting reference and review",
  );
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 950 });
    ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `the evidence-first drawer fits ${width}px`,
    );
    if (width < 760) {
      await page.locator("#workflow-toggle").click();
      ok(
        (await page.locator("#navigation [data-step=handover]").isVisible()) &&
          (await page.locator("#navigation [data-step=start]").isVisible()),
        `all seven steps and their status remain accessible at ${width}px`,
      );
      await page.keyboard.press("Escape");
      ok(
        (await page
          .locator("#workflow-toggle")
          .getAttribute("aria-expanded")) === "false",
        "Escape closes all steps",
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await nav("review", "findings");
  if (!(await page.locator(".drawer").count()))
    await page.locator(`[data-finding="${findingId}"]`).click();
  await page.screenshot({ path: prefix + "-mobile.png", fullPage: true });
  const exceptions = await page.evaluate(async (saved) => {
    const ev = await BETA_Evidence.unpack(saved);
    for (const phase of TriageDeskModel.phases)
      TriageDeskModel.outcome(
        ev,
        phase.id,
        "exception",
        "SOC must verify this phase",
        "",
      );
    return BETA_Evidence.bundle(ev);
  }, saved);
  await load(exceptions);
  await nav("handover");
  ok(
    (await state("respond")) === "exceptions" &&
      (await page
        .locator(".hour-check")
        .filter({ hasText: "First 60 minutes" })
        .locator(".checkmark.warn")
        .count()) === 1,
    "documented phase exceptions remain amber in the rail and handover checklist",
  );
  const empty = await page.evaluate(async () => {
    const ev = BETA_Evidence.create({ selectedSources: ["audits"] });
    BETA_Evidence.setSource(ev, "audits", [], { state: "complete" });
    return BETA_Evidence.bundle(ev);
  });
  await load(empty);
  await nav("handover");
  ok(
    (await state("collect")) === "done" && (await state("review")) !== "done",
    "a complete zero-row collection never automatically resolves Review",
  );
  ok(
    errors.length === 0,
    "no errors in the completion and evidence workflow: " + errors.join("; "),
  );
  await page.close();
}
