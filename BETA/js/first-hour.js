// Respond · the first 60 minutes. The shared response engine (js/contain.js) keeps its action
// guards; this adapter owns the phase layout and the rows around the embedded runbook.
(function () {
  "use strict";
  function arrange(phase) {
    const root = document.getElementById("screen-contain");
    if (!root) return;
    const body = document.getElementById("containBody");
    if (!body) return;
    root.classList.add("phase-workspace");
    for (const card of body.children) {
      let belongs = "none";
      if (
        card.id === "armCard" ||
        (card.id.startsWith("cs-") && card.id !== "cs-preserve")
      )
        belongs = "contain";
      // The BETA's own phase-1 rows cover preservation; the runbook's card would ask to run triage again.
      if (card.id === "cs-preserve") belongs = "none";
      if (card.querySelector(".cl-grid.blast")) belongs = "scope";
      if (card.querySelector("#evidDone")) belongs = "evidence";
      if (card.querySelector("#commDone")) belongs = "handover";
      card.hidden = belongs !== phase;
    }
  }
  function check(esc, title, detail, action, mark) {
    const marks = { ok: ["ok", "✓"], warn: ["warn", "!"] };
    const m = marks[mark];
    return `<div class="hour-check"><div class="who">${m ? `<span class="checkmark ${m[0]}">${m[1]}</span>` : '<span class="checkmark"></span>'}<div><h3>${esc(title)}</h3><p>${detail}</p></div></div><div class="row-actions">${action || ""}</div></div>`;
  }
  function render(o) {
    const {
      ev,
      phase,
      phases,
      latest,
      esc,
      btn,
      stepBtn,
      coverage,
      logRow,
      mailbox,
      connected,
      runbook,
      native,
      busy,
      target,
      offer,
      exported,
    } = o;
    const p = phases.find((x) => x.id === phase) || phases[0],
      index = phases.indexOf(p);
    const history =
      (ev.actionLog || []).slice(-6).reverse().map(logRow).join("") ||
      '<p class="muted">Checks and decisions will appear here.</p>';
    const who = target ? esc(target) : "";
    const tenant = esc(ev.tenantName || ev.tenantId || "Unverified tenant");
    const gaps = coverage.gaps;
    const chooser = check(
      esc,
      "Choose the affected account",
      "Response always targets one account, even in a tenant-wide investigation.",
      btn("choose-account", "Choose account", "primary"),
    );
    // The account checks: connected silently on the web, one announced window in the app.
    const offerAction = !offer
      ? ""
      : offer.kind === "connected"
        ? '<span class="badge complete">Connected</span>'
        : offer.kind === "connecting"
          ? ""
          : offer.action
            ? btn(offer.action, offer.label, "primary")
            : offer.step
              ? stepBtn(offer.step, offer.label, "primary")
              : offer.kind === "account"
                ? btn("choose-account", "Choose account", "primary")
                : "";
    const offerText = !offer
      ? ""
      : offer.kind === "connecting"
        ? `<span class="spin"></span>${esc(offer.text)}`
        : esc(offer.text);
    const sessionRow = check(
      esc,
      "Account checks",
      offerText,
      offerAction,
      connected ? "ok" : "",
    );
    let content = "";
    if (phase === "preserve")
      content = `<section class="panel">${check(esc, "Confirm account and tenant", `${who || "Tenant-wide case"} · ${tenant}`, stepBtn("review", "Inspect evidence", "", "evidence"), "ok")}${check(esc, "Review collection coverage", `${coverage.complete} / ${coverage.total} selected sources complete; ${gaps} gap${gaps === 1 ? "" : "s"} to inspect.`, stepBtn("review", "Review gaps", "", "evidence"), gaps ? "warn" : "ok")}${check(esc, "Preserve the starting point", exported ? "Exported " + esc(exported) + " — before any change." : "Export original evidence before changing an account.", exported ? "" : btn("export", "Export case", "primary"), exported ? "ok" : "")}</section>`;
    // The embedded runbook carries its own mailbox card whenever it is mounted (preview or connected).
    if (phase === "contain")
      content = target
        ? `<section class="panel">${check(esc, "Affected account", `<strong>${who}</strong> · ${tenant}${ev.scope === "tenant" ? " · tenant-wide case" : ""}`, ev.scope === "tenant" ? btn("choose-account", "Change", "text-button") : "", "ok")}${sessionRow}</section>${runbook ? "" : mailbox()}`
        : `<section class="panel">${chooser}</section>${mailbox()}`;
    if (phase === "scope")
      content = `<section class="panel">${target ? sessionRow : chooser}${check(esc, "Establish the affected accounts", connected ? "Run the impact checks below against this account's context: same IPs, same user agent, rules and grants tenant-wide, role and MFA changes." : "The impact checks below need the account checks.", "", "")}</section>`;
    if (phase === "evidence")
      content = `<section class="panel">${check(esc, "Preserve this investigation", "Export all source records, collection errors, decisions and the case action log in one integrity-checked file.", btn("export", "Export case", "primary"), exported ? "ok" : "")}${check(
        esc,
        "Sources with gaps",
        gaps
          ? esc(
              coverage.scope
                .filter((s) => s.displayState !== "complete")
                .map((s) => s.label)
                .join(", "),
            ) + " — recorded as gaps in the handover."
          : "Every selected source completed.",
        gaps ? stepBtn("review", "Inspect", "", "evidence") : "",
        gaps ? "warn" : "ok",
      )}</section>`;
    if (phase === "handover")
      content = `<section class="panel">${check(esc, "Communication templates", "Drafts for the incident owner, the affected user, leadership and privacy/legal live in the runbook below. A download is a draft — never a record that it was sent.", "", "")}${check(esc, "Outstanding work and handover", "Findings, decisions, references and unresolved work for the next owner live on step 7.", stepBtn("handover", "Hand over →", "primary"), "")}</section>`;
    const outcome = latest(ev, phase);
    return `<div class="page-head"><div><div class="eyebrow">STEP 6 OF 7 · RESPOND</div><h1>First 60 minutes</h1><p class="subtitle">One guided workflow. Every check, decision and action stays with this case.</p></div><div class="row-actions">${stepBtn("handover", "Hand over →")}</div></div><div class="phase-track">${phases
      .map(
        (x, i) =>
          `<button type="button" data-step="respond" data-tab="${x.id}" aria-current="${phase === x.id ? "step" : "false"}"><small>${x.minutes} MIN</small><b>${i + 1}. ${esc(x.title)}</b><span>${esc(latest(ev, x.id)?.outcome === "verified" ? "Analyst reviewed" : latest(ev, x.id)?.outcome || "Not reviewed")}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="hour-layout"><div><div class="hour-heading"><h2>${index + 1}. ${esc(p.title)}</h2>${btn("phase-note", "＋ Note or decision", "text-button")}</div><div class="hour-engine"><b>${native ? "PS" : "JS"}</b><div><strong>${native ? "Local PowerShell collector" : "Browser JavaScript checks"}</strong><p>${busy ? "Collection is running; follow progress on Collect." : native ? "Graph and Exchange collection ran on this computer; the account checks open one Microsoft window, announced on the row below." : "Graph checks run in this browser with the Connect sign-in — no new window. Exchange collection needs the desktop app."}</p></div>${connected ? '<span class="badge complete">checks connected</span>' : offer?.kind === "connecting" ? '<span class="badge pending">connecting</span>' : offer?.kind === "account" ? btn("choose-account", "Choose account") : offer?.action ? btn(offer.action, offer.label) : offer?.step ? stepBtn(offer.step, offer.label) : ""}</div>${content}<div id="hour-response-slot"></div>${outcome ? `<p class="form-note section-gap">Latest analyst decision · <strong>${esc(outcome.outcome)}</strong> — ${esc(outcome.detail)}${outcome.reference ? " [" + esc(outcome.reference) + "]" : ""}</p>` : ""}<div class="hour-next"><span>Check results and decisions belong to this phase.</span>${index < 4 ? stepBtn("respond", "Next phase →", "", phases[index + 1].id) : stepBtn("handover", "Hand over →", "primary")}</div></div><aside class="panel hour-log"><div class="panel-head"><h2>Case action log</h2><span class="badge">UTC</span></div><div class="panel-body"><p class="form-note">Results are recorded automatically. Add context when it helps.</p><div id="hour-events">${history}</div>${btn("phase-note", "＋ Note or external action")}${stepBtn("handover", "View complete history →", "text-button")}</div></aside></div>`;
  }
  window.TriageFirstHour = { render, arrange };
})();
