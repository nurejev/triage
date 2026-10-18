(function () {
  "use strict";
  // BETA 31 · one procedure: Start → Connect → Scope → Collect → Review → Respond → Hand over.
  // The sidebar is the step rail, the URL fragment is the route, and the case saves itself.
  const E = window.BETA_Evidence,
    M = window.TriageDeskModel,
    G = window.TriageGraph,
    N = window.triageNative;
  const LOCAL = new URLSearchParams(location.search).get("localCase") === "1";
  const $ = (s, r = document) => r.querySelector(s),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const fmt = (t) =>
    t && !isNaN(Date.parse(t))
      ? new Date(t)
          .toISOString()
          .replace("T", " ")
          .replace(/\.\d+Z$/, " UTC")
      : "Time unverified";
  const clock = (iso) =>
    iso && !isNaN(Date.parse(iso))
      ? new Date(iso).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";
  const badge = (s, label) => {
    const state = String(s || "unreviewed");
    return `<span class="badge ${esc(state)}">${esc(label || state.replaceAll("-", " "))}</span>`;
  };
  // Only the explicit primary action of a form submits on Enter; everything else is a plain button.
  const btn = (action, label, cls = "", attrs = "") =>
    `<button type="${/\bprimary\b/.test(cls) ? "submit" : "button"}" data-action="${action}" class="${cls}" ${attrs}>${label}</button>`;
  const stepBtn = (step, label, cls = "", tab = "", attrs = "") =>
    `<button type="button" data-step="${step}" ${tab ? `data-tab="${tab}"` : ""} class="${cls}" ${attrs}>${label}</button>`;
  const GUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const catalog = E.CATALOG,
    graph = catalog.filter((c) => c[3] === "Graph"),
    label = (key) => catalog.find((c) => c[0] === key)?.[1] || key,
    EXCHANGE_KEYS = [
      "exchange",
      "transportRules",
      "messageTrace",
      "adminAudit",
      "mailboxAudit",
    ],
    isExchange = (k) => EXCHANGE_KEYS.includes(k),
    isAzure = (k) => ["azureActivity", "azureDirectoryActivity"].includes(k);
  // Evidence presets: what a person means by "quick", "standard" and "everything".
  const PRESETS = {
    quick: [
      "interactive",
      "nonInteractive",
      "audits",
      "riskyUsers",
      "riskDetections",
      "users",
      "oauth",
    ],
    standard: [...graph.map((c) => c[0]), "exchange"],
    everything: catalog.map((c) => c[0]),
  };
  const STEPS = [
    ["start", "Start"],
    ["connect", "Connect"],
    ["scope", "Scope"],
    ["collect", "Collect"],
    ["review", "Review"],
    ["respond", "Respond"],
    ["handover", "Hand over"],
  ];
  const TABS = [
    ["overview", "Overview"],
    ["findings", "Findings"],
    ["timeline", "Timeline"],
    ["evidence", "Evidence"],
  ];
  // ---------------------------------------------------------------- state
  let ev = null,
    findings = [],
    analysisJob = null,
    busy = false,
    cancelling = false,
    controller = null,
    collectionStatus = "",
    jobMessages = [],
    progressTimer,
    filter = "",
    severity = "all",
    offset = 0,
    readiness = null,
    readinessTask = null,
    customerProfiles = [],
    certificateChoice = null,
    evidenceFolder = "",
    caseKey = null, // the case ID the desktop connection is bound to (allocated on New investigation)
    lookupTimer,
    suggestions = [],
    saveTimer,
    saveState = { at: "", dirty: false, error: "" };
  // Service rows on Connect. The desktop app reports its retained PowerShell sessions;
  // the web has one MSAL session (graph) and no Exchange.
  const svc = { graph: { state: "idle" }, exchange: { state: "idle" } };
  const drafts = new Map();
  const referencePages = new Map();
  let stepsOpen = false;
  let mailboxJob = null;
  // Connect and Scope choices survive a reload; tokens and certificates never live here.
  const SETTINGS_KEY = "triage-desk-settings-v31";
  const defaults = () => ({
    tenantMode: N ? "domain" : "org",
    domain: "",
    tenant: null, // { tenantId, domain } resolved before sign-in
    signAs: "delegated",
    mail: false,
    scope: "user",
    upn: "",
    days: "7",
    preset: "quick",
    custom: PRESETS.quick.slice(),
    autosave: true,
    guideSeen: false,
  });
  let settings = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (saved && typeof saved === "object")
      settings = { ...defaults(), ...saved };
  } catch {}
  function remember() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }
  // The route of the open case, so a reload lands on the same screen.
  const ROUTE_KEY = "triage-desk-route";
  // Captured before the first render: the boot guard may rewrite the hash before the saved case is back.
  const initialHash = location.hash;
  let wantedRoute = null,
    restoring = true;
  try {
    wantedRoute = JSON.parse(sessionStorage.getItem(ROUTE_KEY) || "null");
  } catch {}
  function rememberRoute() {
    try {
      if (ev && !ev.demo)
        sessionStorage.setItem(
          ROUTE_KEY,
          JSON.stringify({ caseId: ev.caseId, hash: location.hash }),
        );
      else if (!restoring) sessionStorage.removeItem(ROUTE_KEY);
    } catch {}
  }
  function draftKey(id) {
    return (
      (ev?.caseId || "") +
      ":" +
      id +
      (id === "outcome-form" ? ":" + (route.tab || "preserve") : "")
    );
  }
  function saveDrafts() {
    for (const id of ["outcome-form", "note-form", "review-form", "handover-form"]) {
      const f = document.getElementById(id);
      if (f)
        drafts.set(
          id === "review-form" ? "review:" + f.dataset.id : draftKey(id),
          Object.fromEntries(new FormData(f)),
        );
    }
  }
  function restoreDrafts() {
    for (const id of ["outcome-form", "note-form", "handover-form"]) {
      const f = document.getElementById(id),
        d = drafts.get(draftKey(id));
      if (f && d)
        for (const [k, v] of Object.entries(d))
          if (f.elements[k]) f.elements[k].value = v;
    }
  }
  document.addEventListener("input", (e) => {
    if (e.target.closest("#outcome-form,#note-form,#handover-form")) saveDrafts();
  });
  // ---------------------------------------------------------------- router
  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, qs] = h.split("?");
    const q = Object.fromEntries(new URLSearchParams(qs || ""));
    const p = path.split("/").filter(Boolean);
    if (p[0] === "case")
      return {
        step: ["review", "respond", "handover"].includes(p[2])
          ? p[2]
          : "review",
        caseId: p[1] || "",
        tab: p[3] || (p[2] === "respond" ? "preserve" : "overview"),
        ...q,
      };
    return { step: p[0] || "start", ...q };
  }
  function hashFor(r) {
    const q = new URLSearchParams();
    for (const k of ["f", "r", "s", "state"]) if (r[k]) q.set(k, r[k]);
    const qs = q.toString() ? "?" + q.toString() : "";
    if (["review", "respond", "handover"].includes(r.step))
      return (
        "#/case/" +
        (r.caseId || ev?.caseId || "none") +
        "/" +
        r.step +
        (r.step === "handover"
          ? ""
          : "/" + (r.tab || (r.step === "respond" ? "preserve" : "overview"))) +
        qs
      );
    return "#/" + r.step + qs;
  }
  let route = parseRoute();
  function navigate(r, replace) {
    const previousPage = route.step + ":" + route.tab;
    const target = hashFor({ ...r, caseId: r.caseId || ev?.caseId });
    if (replace) history.replaceState(null, "", target);
    else if (target !== location.hash) history.pushState(null, "", target);
    route = parseRoute();
    render();
    if (previousPage !== route.step + ":" + route.tab) window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", () => {
    route = parseRoute();
    render();
  });
  // App: a service that is ready or busy collecting is a live sign-in.
  const connected = () =>
    N
      ? Object.values(svc).some((s) =>
          ["ready", "collecting"].includes(s.state),
        )
      : !!G.account;
  const collectionDone = () => !!ev && !busy;
  // Which steps may be visited right now, and why not.
  function gateFor(id) {
    const gate = {
      start: [true, ""],
      newcase: [true, ""],
      guide: [true, ""],
      connect: [!LOCAL, "This viewer only reads a case"],
      scope: [
        !LOCAL && (connected() || !!ev?.demo),
        N ? "Sign in on Connect first" : "Sign in first",
      ],
      collect: [!!ev, "Choose the scope first"],
      review: [
        collectionDone(),
        busy ? "Collection is running" : "After collection",
      ],
      respond: [
        collectionDone(),
        busy ? "Collection is running" : "After collection",
      ],
      handover: [
        collectionDone(),
        busy ? "Collection is running" : "After collection",
      ],
    }[id];
    if (!gate) return [false, "Unknown step"];
    if (busy && id !== "collect") return [false, "Collection is running"];
    return gate;
  }
  function stepState(id) {
    if (id === route.step) return { cls: "now", reason: "" };
    const gate = gateFor(id);
    if (!gate[0]) return { cls: "todo", reason: gate[1] };
    const done = {
      start: !!ev || connected(),
      connect: connected(),
      scope: !!ev,
      collect: collectionDone() && collectionCoverage().total > 0 && collectionCoverage().gaps === 0,
      review:
        !!ev &&
        !analysisJob && findings.length > 0 && M.reviewProgress(ev, findings).outstanding === 0,
      respond:
        !!ev &&
        M.phaseProgress(ev).resolved === M.phases.length,
      handover:
        !!ev &&
        !!M.handoverRecord(ev),
    }[id];
    const exceptions = (id === "collect" && collectionDone() && collectionCoverage().gaps > 0) ||
      (id === "respond" && done && M.phaseProgress(ev).exceptions > 0);
    return { cls: exceptions ? "exceptions" : done ? "done" : "", reason: "" };
  }
  function guard() {
    // A route the person may not visit yet falls back to the step that unlocks it.
    if (
      ["review", "respond", "handover"].includes(route.step) &&
      ev &&
      route.caseId !== ev.caseId
    ) {
      route.caseId = ev.caseId;
      history.replaceState(null, "", hashFor(route));
    }
    const gate = gateFor(route.step);
    if (!gate[0] && route.step !== "start") {
      const fallback = busy
        ? { step: "collect" }
        : ev
          ? { step: "review", tab: "overview" }
          : connected()
            ? { step: "scope" }
            : LOCAL
              ? { step: "start" }
              : { step: "connect" };
      if (
        fallback.step !== route.step &&
        gate[1] !== "Unknown step" &&
        !restoring
      )
        message(
          gate[1] +
            " · opening " +
            STEPS.find((s) => s[0] === fallback.step)[1],
        );
      route = { ...fallback, caseId: ev?.caseId };
      history.replaceState(null, "", hashFor(route));
    }
    if (route.step === "newcase" && !ev) {
      route = { step: "start" };
      history.replaceState(null, "", hashFor(route));
    }
  }
  // ---------------------------------------------------------------- notices and dialogs
  let noticeTimer;
  function message(text, error = false) {
    clearTimeout(noticeTimer);
    const n = $("#notification");
    if (error && $("#detail").open) {
      n.hidden = true;
      const alert = $("#dialog-notification");
      alert.textContent = text;
      alert.hidden = false;
      alert.scrollIntoView({ block: "nearest" });
      return;
    }
    n.textContent = text;
    n.dataset.error = String(error);
    n.hidden = false;
    noticeTimer = setTimeout(() => (n.hidden = true), error ? 12000 : 6500);
  }
  // The BETA's own dialog. #confirmModal belongs to the response runbook (contain.js) and is never used here.
  function dialog(title, html) {
    $("#detail-title").textContent = title;
    $("#detail-content").innerHTML = html;
    $("#dialog-notification").hidden = true;
    $("#dialog-notification").textContent = "";
    if (!$("#detail").open) $("#detail").showModal();
  }
  function closeDialog() {
    if ($("#detail").open) $("#detail").close();
  }
  function confirmDialog(title, html, okLabel, action, cls = "danger") {
    dialog(
      title,
      `${html}<div class="row-actions section-gap">${btn(action, okLabel, cls)}${btn("close-dialog", "Cancel")}</div>`,
    );
  }
  function actor() {
    return (
      ev?.collectorAccount ||
      G.account?.username ||
      svc.graph.account ||
      "Local analyst"
    );
  }
  function log(type, detail, extra = {}) {
    if (ev) {
      M.append(ev, type, detail, actor(), extra);
      touch();
    }
  }
  function rows() {
    return Object.values(ev?.raw || {}).reduce((n, r) => n + r.length, 0);
  }
  function recordCount(count) {
    return count.toLocaleString() + (count === 1 ? " record" : " records");
  }
  const elapsed = (since) => {
    const s = Math.max(
      0,
      Math.round((Date.now() - (since || Date.now())) / 1000),
    );
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  // ---------------------------------------------------------------- autosave
  // Every change to the case schedules a save: the evidence folder in the app, IndexedDB on the web.
  function touch() {
    if (!ev || ev.demo || LOCAL) return;
    saveState.dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void autosave(), 1500);
    renderCasebar();
  }
  async function autosave() {
    if (!ev || ev.demo || LOCAL || !settings.autosave || busy) return;
    const current = ev;
    try {
      const bundle = await E.bundle(current);
      if (ev !== current) return;
      if (N) await N.saveCase(bundle);
      else {
        await TriageJournal.enable();
        await TriageJournal.save(bundle);
      }
      if (ev !== current) return;
      saveState = { at: new Date().toISOString(), dirty: false, error: "" };
    } catch (error) {
      if (ev === current) saveState = { ...saveState, error: error.message };
    }
    renderCasebar();
  }
  async function saveNow() {
    if (!ev) throw Error("Open a case first.");
    clearTimeout(saveTimer);
    log(
      "case-saved",
      N ? "Saved to the evidence folder." : "Saved on this device.",
    );
    const bundle = await E.bundle(ev);
    if (N) await N.saveCase(bundle);
    else {
      await TriageJournal.enable();
      await TriageJournal.save(bundle);
    }
    saveState = { at: new Date().toISOString(), dirty: false, error: "" };
    renderCasebar();
  }
  // ---------------------------------------------------------------- chrome
  function executionCard(engine, stage, title, detail) {
    const symbol =
      engine === "powershell" ? "PS" : engine === "viewer" ? "◫" : "JS";
    const labels = {
      ready: "Ready",
      collecting: "Collecting",
      connecting: "Connecting",
      cancelling: "Cancelling",
      analyzing: "Analyzing",
      viewing: "Viewing",
    };
    return `<div class="execution-card" data-engine="${engine}" data-stage="${stage}"><span class="execution-symbol" aria-hidden="true">${symbol}</span><div class="execution-copy"><strong>${esc(title)}</strong><p>${esc(detail)}</p></div><span class="execution-stage">${labels[stage]}</span></div>`;
  }
  function executionStatus() {
    const engine = N ? "powershell" : "browser-js";
    if (busy)
      return executionCard(
        engine,
        cancelling ? "cancelling" : "collecting",
        N
          ? "Collecting with PowerShell"
          : "Running checks with Browser JavaScript",
        (N ? "Runs on this computer" : "Runs in this browser") +
          (cancelling
            ? " · Stopping collection; keeping returned evidence."
            : " · " + (collectionStatus || "Collecting evidence…")),
      );
    if (analysisJob?.evidence === ev)
      return executionCard(
        "analysis-js",
        "analyzing",
        "Analyzing evidence with JavaScript",
        N
          ? "Runs locally in this app · collection is no longer running."
          : "Runs in this browser · collection is no longer running.",
      );
    if (
      route.step === "respond" &&
      ev &&
      responseReady() &&
      !window.TriageContain.preview
    )
      return executionCard(
        engine,
        "ready",
        N
          ? "Response checks: PowerShell on this computer"
          : "Response checks: Browser JavaScript",
        "Read-only checks and separately armed response actions · the selected account and tenant remain bound to this case.",
      );
    if (!ev) return "";
    const method =
      ev.collectionMethod === "powershell"
        ? "PowerShell"
        : ev.collectionMethod === "browser-js"
          ? "Browser JavaScript"
          : "";
    return executionCard(
      "viewer",
      "viewing",
      N
        ? "App viewer · no checks running"
        : "Browser viewer · no checks running",
      method
        ? "Collection method recorded in this case: " + method
        : ev.demo
          ? "Fictional sample evidence."
          : "Collection method was not recorded in this case.",
    );
  }
  function stepStatus(id) {
    const g = svc.graph;
    switch (id) {
      case "start":
        return ev
          ? "Case open"
          : connected()
            ? "Signed in"
            : LOCAL
              ? "Case viewer"
              : "New · Open · Sample";
      case "connect":
        if (N)
          return ["ready", "collecting"].includes(g.state)
            ? g.account
            : g.state === "connecting"
              ? "Waiting for you…"
              : ["ready", "collecting"].includes(svc.exchange.state)
                ? svc.exchange.account
                : "Connect services";
        return G.account ? G.account.username : "Connect services";
      case "scope":
        return ev && !ev.imported
          ? (ev.scope === "tenant"
              ? "Whole tenant"
              : ev.subject?.upn || "One account") +
              " · " +
              windowDays(ev) +
              " d" +
              (Array.isArray(ev.selectedSources) && ev.selectedSources.length
                ? " · " + ev.selectedSources.length + " sources"
                : "")
          : "Who · window · evidence";
      case "collect": {
        if (!ev) return "Progress · Stop";
        const c = collectionCoverage();
        if (!busy && c.gaps) return `Ended · ${c.complete}/${c.total} complete · ${c.gaps} gaps`;
        return (
          (busy ? "collecting " : "") +
          c.complete +
          " / " +
          c.total +
          (busy ? "" : " complete")
        );
      }
      case "review": {
        if (!ev || busy) return "Findings · evidence";
        const p = M.reviewProgress(ev, findings);
        return analysisJob?.evidence === ev
          ? "analyzing…"
          : p.total ? `${p.resolved} of ${p.total} resolved${p.investigating ? ` · ${p.investigating} investigating` : ""}` : "No signals · inspect coverage";
      }
      case "respond": {
        if (!ev || busy) return "First 60 minutes";
        const p = M.phaseProgress(ev);
        return (
          (window.TriageContain?.armed && responseReady() ? "armed · " : "") +
          p.resolved +
          " / 5 reviewed" + (p.exceptions ? ` · ${p.exceptions} exceptions` : "")
        );
      }
      case "handover":
        return ev && M.handoverRecord(ev)
          ? "Handover recorded"
          : ev && (ev.actionLog || []).some(e => e.type === "handover-exported")
            ? "Exported · handover not recorded"
          : ev && !busy
            ? "Exports · next case"
            : "After Respond";
    }
    return "";
  }
  function windowDays(e) {
    if (e.days) return e.days;
    if (e.window?.start && e.window?.end)
      return Math.max(
        1,
        Math.round(
          (Date.parse(e.window.end) - Date.parse(e.window.start)) / 864e5,
        ),
      );
    return "?";
  }
  function renderRail() {
    const c = ev ? collectionCoverage() : null;
    const pill =
      busy && ev
        ? `<button type="button" class="nav-collection" data-step="collect" aria-label="Open collection progress"><span class="nav-collect-dot" aria-hidden="true"></span><span><strong>${cancelling ? "Stopping collection" : mailboxJob ? "Mailbox check" : "Collecting evidence"}</strong><small>${N ? "PowerShell" : "Browser JavaScript"} · ${mailboxJob ? "Exchange Online" : c.complete + " / " + c.total + " sources complete"}</small></span></button>${btn("cancel", cancelling ? "Stopping…" : "Stop collecting", "danger", cancelling ? "disabled" : "")}`
        : "";
    const items = STEPS.map(([id, name], i) => {
      const st = stepState(id);
      const icon = st.cls === "done" ? "✓" : st.cls === "exceptions" ? "!" : String(i + 1);
      const count =
        id === "review" && ev && !busy && findings.length
          ? `<span class="count">${findings.length}</span>`
          : "";
      const subs =
        id === "review" && ev && !busy
          ? TABS.map(
              ([t, n]) =>
                `<button type="button" class="sub" data-step="review" data-tab="${t}" ${route.step === "review" && (route.tab || "overview") === t ? 'aria-current="page"' : ""}>${n}</button>`,
            ).join("")
          : "";
      const group = {0:"Prepare",3:"Investigate",5:"Act & transfer"}[i];
      return `${group ? `<div class="workflow-group">${group}</div>` : ""}<button type="button" data-step="${id}" ${st.cls === "now" ? 'aria-current="page"' : ""} ${st.cls === "todo" ? `aria-disabled="true" title="${esc(st.reason)}"` : ""}><span class="nav-icon step" data-state="${st.cls || "later"}">${icon}</span><span class="nav-text">${name}<small>${esc(st.cls === "todo" ? st.reason : stepStatus(id))}</small></span>${count}</button>${subs}`;
    }).join("");
    $("#navigation").innerHTML =
      pill +
      items +
      `<hr><button type="button" data-action="help" ${route.step === "guide" ? 'aria-current="page"' : ""}><span class="nav-icon">?</span><span class="nav-text">Help · coverage</span></button>`;
    const toggle = $("#workflow-toggle");
    if (toggle) {
      const step = STEPS.findIndex(([id]) => id === route.step);
      toggle.innerHTML = `<span>${step >= 0 ? `${step + 1} / 7 · ${STEPS[step][1]}` : "Case workflow"}</span><span>${stepsOpen ? "Close steps" : "All steps"}</span>`;
      toggle.setAttribute("aria-expanded", String(stepsOpen));
      $(".sidebar").classList.toggle("steps-open", stepsOpen);
    }
  }
  function renderCasebar() {
    const bar = $("#casebar");
    if (!ev) {
      bar.innerHTML = `<span>No active case · Start a new investigation or open existing evidence.</span><div class="row-actions">${btn("open-case", "Open a case")}</div>`;
      return;
    }
    const saved = ev.demo
      ? "sample · not saved"
      : LOCAL
        ? "read-only viewer"
        : busy
          ? "saves when collection ends"
          : !settings.autosave
            ? "autosave off"
            : saveState.error
              ? `<span style="color:var(--red)">not saved · ${esc(saveState.error)}</span>`
              : saveState.dirty
                ? '<span style="color:var(--amber)">saving…</span>'
                : saveState.at
                  ? "saved " + clock(saveState.at)
                  : "not saved yet";
    const responseArmed = responseReady() && window.TriageContain?.armed;
    const access = responseArmed ? "Write access armed" : "Response not armed";
    bar.innerHTML = `<div class="case-identity"><div class="eyebrow">CASE ${esc(ev.caseId.slice(0, 8))} · ${esc(ev.tenantName || ev.tenantId || "Unverified tenant")}</div><strong>${esc(ev.scope === "tenant" || !ev.subject?.upn ? "Whole-tenant investigation" : ev.subject.upn)}</strong><div class="case-facts">${esc(windowDays(ev))} days · ${rows().toLocaleString()} records · ${saved}</div><div class="case-access">${badge(ev.demo ? "pending" : "imported", ev.demo ? "Fictional sample" : ev.imported ? "Imported evidence" : "Read-only collection")} ${badge(responseArmed ? "failed" : "imported", access)}</div></div><div class="row-actions">${btn("export", "Export case", "", busy ? "disabled" : "")}${LOCAL || ev.demo ? "" : btn("save", N ? "Save to evidence folder" : "Save on this device", "", busy ? "disabled" : "")}${N ? btn("evidence-open", "Open folder") : ""}${btn("new", "New case", "text-button", busy ? "disabled" : "")}</div>`;
  }
  function renderChrome() {
    const execution = executionStatus(),
      status = $("#execution-status");
    status.hidden = !execution;
    const active = !!(busy || analysisJob?.evidence === ev);
    const markup = active ? execution : `<details class="execution-details"><summary>Session & collection details</summary>${execution}</details>`;
    if (status.executionMarkup !== markup) {
      const open = status.querySelector("details")?.open;
      status.innerHTML = markup;
      if (open && !active) status.querySelector("details").open = true;
      status.executionMarkup = markup;
    }
    status.dataset.active = String(busy || analysisJob?.evidence === ev);
    renderRail();
    const i = STEPS.findIndex((s) => s[0] === route.step);
    $("#breadcrumb").innerHTML =
      i >= 0
        ? `Limon-IT <span>/</span> Case workspace`
        : `Limon-IT <span>/</span> ${route.step === "guide" ? "Help · coverage" : "Incident workspace"}`;
    const signed = N
      ? Object.values(svc).find(
          (s) => s.account && ["ready", "collecting"].includes(s.state),
        )
      : null;
    const tick = (key) =>
      ["ready", "collecting"].includes(svc[key]?.state) ? " ✓" : "";
    const write =
      ev && responseReady() && !window.TriageContain.preview
        ? " · write " + (window.TriageContain.armed ? "armed" : "not armed")
        : "";
    $("#connection").textContent = N
      ? signed
        ? signed.account +
          (settings.tenant?.domain ? " · " + settings.tenant.domain : "") +
          " · Graph" +
          tick("graph") +
          " · Exchange" +
          tick("exchange") +
          write
        : "Desktop · not signed in"
      : LOCAL
        ? "Local case viewer"
        : G.account
          ? G.account.username +
            (settings.tenant?.domain ? " · " + settings.tenant.domain : "") +
            " · Graph ✓" +
            write
          : "Not connected";
    $("#signin").textContent = LOCAL
      ? "Viewer guide"
      : connected()
        ? "Disconnect"
        : "Sign in";
    $("#signin").disabled = busy;
    renderCasebar();
  }
  // ---------------------------------------------------------------- shared view pieces
  const head = (eyebrow, title, subtitle, actions = "") =>
    `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="row-actions">${actions}</div></div>`;
  const panel = (title, body, sub = "", actions = "") =>
    `<section class="panel"><div class="panel-head"><div><h2>${title}</h2>${sub ? "<p>" + sub + "</p>" : ""}</div>${actions}</div>${body}</section>`;
  const empty = (title, text, action = "") =>
    `<div class="empty"><div class="empty-icon">◫</div><h2>${title}</h2><p>${text}</p>${action}</div>`;
  const runStep = (n, title, text) =>
    `<div class="run-step"><b>${n}</b><div><strong>${title}</strong><p>${text}</p></div></div>`;
  const stepEyebrow = (n, name) =>
    `STEP ${n} OF 7 · ${name.toUpperCase()}${[2, 3].includes(n) ? (N ? " · DESKTOP APP" : " · WEB") : ""}`;
  let lastSaved = null; // the app's most recent saved case, for "Continue last case"
  // ---------------------------------------------------------------- Start
  function viewStart() {
    if (LOCAL)
      return (
        head(
          "MICROSOFT 365 · INCIDENT TRIAGE",
          "Private case viewer.",
          "This window shows a case the desktop app opened for you. It reads; it does not collect or respond.",
        ) +
        `<div class="grid-2">${panel("What you can do here", `<div class="panel-body">${runStep(1, "Review", "Findings, timeline and every original record, with the same drawers as the app.")}${runStep(2, "Export", "Save the case file, the handover note or the action log from Hand over.")}${runStep(3, "Respond in the app or on the website", "Containment needs a signed-in tenant connection. This private viewer never holds one.")}</div>`)}${panel("Case", ev ? `<div class="panel-body"><p class="subtitle">${esc(ev.subject?.upn || ev.tenantName)} · ${rows().toLocaleString()} records</p>${stepBtn("review", "Open Review →", "primary", "overview")}</div>` : `<div class="panel-body"><p class="subtitle">Loading the case from the app…</p></div>`)}</div>`
      );
    const second = N
      ? lastSaved
        ? panel(
            "Continue last case",
            `<div class="panel-body"><p class="subtitle">${esc(lastSaved.subject || lastSaved.tenantName || lastSaved.caseId)} · ${esc(lastSaved.scope === "user" ? "one account" : "whole tenant")} · saved ${esc(fmt(lastSaved.savedAt))}</p><div class="row-actions section-gap">${btn("load-case", "Continue →", "primary", `data-case-id="${esc(lastSaved.caseId)}"`)}${btn("open-case", "All saved cases")}</div></div>`,
            "Saved in your evidence folder",
          )
        : panel(
            "Open a plan",
            `<div class="panel-body"><p class="subtitle">A plan saved on the website fills Scope for you: tenant, account, window and sources. Use the <strong>Triage → Open collection plan…</strong> menu of this app.</p></div>`,
            "From the website",
          )
      : panel(
          "Need mailbox evidence?",
          `<div class="panel-body"><p class="subtitle">Mailbox rules, forwarding, delegates and message trace need the desktop app. Download it once; the same case file opens in both.</p><div class="row-actions section-gap">${btn("download-mac", "↓ macOS · Apple silicon")}${btn("download-win", "↓ Windows · x64")}${btn("app-help", "First launch on macOS", "text-button")}</div></div>`,
          "Desktop app",
        );
    return (
      head(
        "MICROSOFT 365 · INCIDENT TRIAGE",
        "Clarity in the first hour.",
        "One guided flow: sign in, choose the scope, collect, review, respond, hand over. Every decision stays connected to the case.",
        btn("demo", "Explore sample case ↗"),
      ) +
      `<div class="grid-3">
        <section class="panel hero-card primary-path"><span class="path-icon">⌕</span><span class="path-number">01 / NEW INVESTIGATION</span><h2>Start an investigation</h2><p>Connect the required services, choose who and how far back, and collect the first signals with your ${N ? "delegated or application" : "delegated"} Microsoft 365 access.</p><ul><li>One account or a whole tenant</li><li>Read-only collection</li><li>Separate response permissions</li></ul>${btn("new-investigation", "New investigation <span>→</span>", "primary")}</section>
        <section class="panel hero-card"><span class="path-icon">▤</span><span class="path-number">02 / PICK UP A CASE</span><h2>Open a case</h2><p>Bring a case file or a case saved on this ${N ? "computer" : "device"} back into the workspace, exactly where you left it.</p><ul><li>Case files and saved cases</li><li>Reviews, decisions and the action log</li><li>Integrity-checked before analysis</li></ul>${btn("open-case", "Open a case <span>→</span>")}</section>
        <section class="panel hero-card"><span class="path-icon">◷</span><span class="path-number">03 / PRACTISE FIRST</span><h2>Try the sample</h2><p>A fictional Contoso tenant with a staged compromise. Walk all seven steps without touching a real tenant.</p><ul><li>Nothing is real, nothing is changed</li><li>Same screens, same runbook</li><li>Reset any time</li></ul>${btn("demo", "Explore sample case <span>→</span>")}</section>
      </div>
      <div class="grid-even section-gap">${second}${panel("Your evidence, under your control", `<div class="panel-body"><p class="subtitle">The case saves itself while you work — the case bar says when. Export a case file to move between the desktop app and the web viewer. Nothing is uploaded.</p><button type="button" data-action="help" class="text-button">Coverage, permissions and attribution ↗</button></div>`)}</div>`
    );
  }
  function viewNewCase() {
    return `<section class="panel new-case-panel" id="new-case-panel" aria-labelledby="new-case-title"><div class="new-case-symbol" aria-hidden="true">＋</div><div class="eyebrow">NEW INVESTIGATION</div><h2 id="new-case-title">Start a new investigation</h2><p class="subtitle">A case is already open. ${ev.demo ? "The sample is discarded when you continue." : `It is saved on this ${N ? "computer" : "device"} and stays listed under Open a case.`}</p><div class="current-case-summary"><strong>${esc(ev.subject?.upn || ev.tenantName || "Current case")}</strong><span>${esc(ev.caseId.slice(0, 8))} · ${rows().toLocaleString()} records · ${(ev.actionLog || []).length} log entries</span></div><div class="new-case-actions">${btn("confirm-new", ev.demo || LOCAL ? "Start new case →" : "Save &amp; start new case →", "primary")}${btn("export", "Export current case")}</div><div class="row-actions">${stepBtn("review", "Return to current case", "text-button", "overview")}${N && !LOCAL ? btn("browser-view", "Open current case in browser", "text-button") : ""}</div></section>`;
  }
  // ---------------------------------------------------------------- Connect
  function tenantFields() {
    const profile =
      N && settings.signAs !== "delegated"
        ? customerProfiles.find((p) => p.id === settings.signAs)
        : null;
    if (N && settings.signAs !== "delegated")
      return profile
        ? `<div class="notice good">Customer profile <strong>${esc(profile.name)}</strong> · tenant ${esc(profile.tenantId)} · Graph app ${esc(profile.graphAppId || "not configured")} · Exchange app ${esc(profile.exchangeAppId || "not configured")} · certificate expires ${esc(fmt(profile.certificate?.expiresAt))}. No browser sign-in: the services authenticate with the certificate.</div>`
        : `<div class="notice error">That customer profile is no longer on this computer. Choose another connection.</div>`;
    const t = settings.tenant;
    const domainField = `<label class="field">${N ? "Tenant · domain or ID" : "Customer domain"}<input name="domain" value="${esc(settings.domain)}" placeholder="${N ? "customer.onmicrosoft.com" : "contoso.com"}" autocomplete="off" spellcheck="false" ${connected() ? "disabled" : ""}></label>`;
    const modeField = N
      ? ""
      : `<label class="field">Tenant<select name="tenantMode" ${connected() ? "disabled" : ""}><option value="org" ${settings.tenantMode === "org" ? "selected" : ""}>My organisation</option><option value="customer" ${settings.tenantMode === "customer" ? "selected" : ""}>Customer tenant · by domain</option></select></label>`;
    const customer = N || settings.tenantMode === "customer";
    return `<div class="field-grid">${modeField}${customer ? domainField : `<label class="field">Signed-in account<input value="${esc(G.account?.username || "Your Microsoft 365 account")}" disabled></label>`}</div>${
      customer
        ? t && t.domain === settings.domain.trim().toLowerCase()
          ? `<div class="notice good">✓ ${t.domain === t.tenantId ? `Tenant <strong>${esc(t.tenantId)}</strong>` : `<strong>${esc(t.domain)}</strong> · ${esc(t.tenantId)} — resolved from Microsoft's public sign-in configuration`}. The sign-in window opens for this tenant, so a partner account gets a token for the customer, not for its home tenant.</div>`
          : `<div class="row-actions" style="margin-bottom:15px">${btn("resolve-tenant", "Look up tenant", "", connected() ? "disabled" : "")}<span class="form-note">${N ? "Type the customer's domain (contoso.com) or its tenant ID. The tenant is pinned before the browser opens." : "The tenant is pinned before the browser opens."}</span></div>`
        : `<p class="form-note account-hint">The account's own tenant. For a customer tenant choose the other option — the tenant is pinned before the browser opens.</p>`
    }`;
  }
  function tenantReady() {
    if (N && settings.signAs !== "delegated")
      return customerProfiles.some((p) => p.id === settings.signAs);
    if (!N && settings.tenantMode === "org") return true;
    return (
      !!settings.tenant &&
      settings.tenant.domain === settings.domain.trim().toLowerCase()
    );
  }
  function connectionRows(withActions) {
    const rowsDef = [
      [
        "graph",
        "Microsoft Graph",
        "Sign-ins, directory, risk, OAuth grants, MFA, audit log",
        true,
      ],
    ];
    if (N)
      rowsDef.push([
        "exchange",
        "Exchange Online",
        "Mailbox rules, forwarding, delegates, message trace · optional",
        false,
      ]);
    const labels = {
      idle: "Not connected",
      connecting: "Waiting for you",
      ready: "Ready",
      failed: "Not connected",
      cancelled: "Cancelled",
      expired: "Signed out",
      closed: "Session ended",
      collecting: "Collecting",
    };
    return `<div class="service-connections rows" aria-label="Microsoft 365 connections">${rowsDef
      .map(([key, title, sub, required]) => {
        const s = svc[key];
        const cert = s.authentication === "app-certificate";
        const line =
          s.state === "ready" || s.state === "collecting"
            ? `<small class="okline">✓ ${esc(s.account)}${settings.tenant?.domain ? " · " + esc(settings.tenant.domain) : ""}</small>`
            : s.state === "connecting"
              ? `<small class="wait"><span class="spin"></span>${esc(s.stage || (cert ? "Authenticating with the customer certificate — no browser opens" : "Waiting for you in your browser…"))} <span data-elapsed="${key}">${elapsed(s.since)}</span></small>`
              : ["failed", "expired", "cancelled", "closed"].includes(s.state)
                ? `<small class="badline">✕ ${esc(s.error || labels[s.state])}</small>`
                : `<small>${esc(sub)}</small>`;
        const pill = `<span class="badge ${s.state === "failed" || s.state === "expired" ? "failed" : s.state === "ready" ? "complete" : s.state === "collecting" ? "running" : s.state === "connecting" ? "pending" : ""}">${labels[s.state] || "Not connected"}</span>`;
        const action = !withActions
          ? ""
          : s.state === "ready"
            ? btn(
                "signout-service",
                "Sign out",
                "text-button",
                `data-service="${key}"`,
              )
            : s.state === "connecting"
              ? btn("cancel-signin", "Cancel", "", `data-service="${key}"`)
              : btn(
                  "signin-service",
                  ["failed", "expired", "cancelled", "closed"].includes(s.state)
                    ? "Sign in again"
                    : required
                      ? "Sign in"
                      : "Sign in · optional",
                  required ? "primary" : "",
                  `data-service="${key}" ${tenantReady() && readiness?.ready !== false ? "" : "disabled"}`,
                );
        return `<div class="service-connection" data-service="${key}" data-state="${esc(s.state)}"><div><strong>${title}${required ? "" : ' <span class="muted">· optional</span>'}</strong>${line}</div><span class="svc-actions">${pill}${action}</span></div>`;
      })
      .join("")}</div>`;
  }
  function connectionPicker() {
    return `<section class="connection-picker"><div class="split-label"><h3>Microsoft 365 connection</h3>${btn("customer-manage", "Customer connections", "text-button")}</div><label class="field">Authentication<select name="connection" ${connected() ? "disabled" : ""}><option value="delegated" ${settings.signAs === "delegated" ? "selected" : ""}>Delegated user · sign in with your passkey</option>${settings.signAs !== "delegated" && !customerProfiles.some((p) => p.id === settings.signAs) ? `<option value="${esc(settings.signAs)}" selected>Missing local customer profile · choose a connection</option>` : ""}${customerProfiles.map((p) => `<option value="${esc(p.id)}" ${settings.signAs === p.id ? "selected" : ""}>${esc(p.name)} · App + certificate</option>`).join("")}</select></label><p class="form-note">Delegated access needs no new registration. Customer profiles use existing application permissions. Certificates stay on this computer.</p></section>`;
  }
  function viewConnect() {
    if (N && !readiness && !readinessTask) void checkReadiness();
    const anyWaiting = Object.values(svc).some((s) => s.state === "connecting");
    const readinessNote = !N
      ? ""
      : readiness?.ready
        ? `<div class="notice good">✓ Bundled PowerShell and collection modules ready — checked when this step opened.</div>`
        : readiness && readiness.ready === false
          ? `<div class="notice error"><strong>Desktop prerequisites are missing.</strong><p>${esc(readiness.reason || "Collection prerequisites are missing.")}</p><div class="row-actions">${btn("preflight", "Check again")}</div></div>`
          : `<div class="notice"><p class="readiness-checking" style="margin:0" role="status">Checking the bundled PowerShell runtime and collection modules…</p></div>`;
    const mail =
      N && settings.signAs === "delegated"
        ? `<label class="check"><input type="checkbox" name="mail" ${settings.mail ? "checked" : ""} ${svc.graph.state === "ready" || svc.graph.state === "connecting" ? "disabled" : ""}><span>Include email content and attachments<small>Asks for Mail.Read.Shared at sign-in. Needs existing mailbox delegation; admin roles alone do not grant mail access.</small></span></label>`
        : "";
    const webCard = N
      ? connectionRows(true)
      : `<div class="service-connections rows">${
          G.account
            ? `<div class="service-connection" data-service="graph" data-state="ready"><div><strong>Microsoft 365</strong><small class="okline">✓ ${esc(G.account.username)} · ${esc(settings.tenant?.domain || G.account.username.split("@")[1] || "")} · read-only permissions granted</small></div><span class="svc-actions"><span class="badge complete">Ready</span>${btn("disconnect", "Disconnect", "text-button")}</span></div>`
            : svc.graph.state === "connecting"
              ? `<div class="service-connection" data-service="graph" data-state="connecting"><div><strong>Microsoft sign-in window</strong><small class="wait"><span class="spin"></span>Waiting for the Microsoft window… <span data-elapsed="graph">${elapsed(svc.graph.since)}</span> · allow the pop-up if your browser blocks it</small></div><span class="svc-actions"><span class="badge pending">Waiting for you</span></span></div>`
              : `<div class="service-connection" data-service="graph" data-state="${svc.graph.state === "failed" ? "failed" : "idle"}"><div><strong>Sign in with Microsoft</strong><small ${svc.graph.state === "failed" ? 'class="badline"' : ""}>${svc.graph.state === "failed" ? "✕ " + esc(svc.graph.error) : "A Microsoft window opens. Sign in with your analyst account; Microsoft may ask for MFA or consent."}</small></div><span class="svc-actions">${btn("signin-service", svc.graph.state === "failed" ? "Try again" : "Sign in with Microsoft", "primary", `data-service="graph" ${tenantReady() ? "" : "disabled"}`)}</span></div>`
        }</div>`;
    return (
      head(
        stepEyebrow(2, "Connect"),
        "Connect the services this case needs.",
        N
          ? "Connect Graph and any required Exchange access below. Azure sources can require an additional sign-in at collection startup; response permissions are requested separately."
          : "Connect with delegated access. Your account's roles and Microsoft 365 licensing determine the evidence you can collect.",
      ) +
      `<div class="grid-2">${panel(
        "Microsoft 365 connection",
        `<div class="panel-body">${N ? connectionPicker() + readinessNote : ""}${tenantFields()}${mail}${webCard}${anyWaiting ? `<div class="notice">Microsoft may ask for MFA or consent in the browser. Come back here when it says the window can be closed.</div>` : ""}<div class="row-actions section-gap">${stepBtn("start", "← Start", "text-button")}${stepBtn("scope", "Next: choose the scope →", "primary", "", connected() ? "" : "disabled")}</div></div>`,
        N
          ? "PowerShell · user or application access"
          : "Read-only · browser sign-in",
      )}${panel(
        "What happens next",
        `<div class="panel-body">${runStep(1, "Connect required services", "Microsoft handles sign-in, MFA and consent. The tenant and account stay visible on the case.")}${runStep(2, "Choose the scope", "One account or the whole tenant, the window, and how much evidence.")}${runStep(3, "Collect and review", "Progress on one screen; Review opens by itself. Arming containment on step 6 asks for write permissions once, and says so first.")}<div class="notice">${N ? "Exchange Online is optional here. Skip it and the mailbox evidence is simply unavailable on Scope; you can come back." : "Mailbox rules, forwarding and delegates need the desktop app — Scope offers the hand-off."}</div></div>`,
        "One case from first check to handover",
      )}</div>`
    );
  }
  async function resolveTenant() {
    const value = settings.domain.trim().toLowerCase();
    if (!value)
      throw Error(
        N
          ? "Enter the customer's domain or tenant ID."
          : "Enter the customer domain.",
      );
    const result = await G.resolveTenant(value);
    settings.tenant = result;
    remember();
    render();
    message(
      "Tenant " +
        result.tenantId +
        (result.domain !== result.tenantId
          ? " found for " + result.domain
          : " accepted") +
        ".",
    );
  }
  function connectionForPlan() {
    return N && settings.signAs !== "delegated"
      ? { mode: "app", profileId: settings.signAs }
      : { mode: "delegated" };
  }
  function tenantForConnection() {
    if (N && settings.signAs !== "delegated")
      return (
        customerProfiles.find((p) => p.id === settings.signAs)?.tenantId || ""
      );
    return settings.tenant?.tenantId || "";
  }
  async function signInService(service) {
    if (busy) throw Error("Finish or stop the collection first.");
    if (!N) {
      if (settings.tenantMode === "customer" && !tenantReady())
        throw Error("Look up the customer tenant first.");
      G.setTenant(
        settings.tenantMode === "customer" ? settings.tenant.tenantId : null,
      );
      svc.graph = { state: "connecting", since: Date.now() };
      render();
      try {
        await G.signIn();
        svc.graph = {
          state: "ready",
          account: G.account.username,
          since: Date.now(),
        };
        if (settings.tenantMode === "org")
          settings.tenant = {
            tenantId: G.account.tenantId,
            domain: G.account.username.split("@")[1] || "",
          };
        remember();
      } catch (error) {
        svc.graph = {
          state: "failed",
          error:
            /user_cancelled|popup_window_error|interaction_in_progress/i.test(
              error.errorCode || error.message,
            )
              ? "Sign-in window closed before it finished. Allow pop-ups and try again."
              : error.message,
        };
        throw error;
      } finally {
        render();
      }
      return;
    }
    if (!tenantReady())
      throw Error(
        settings.signAs === "delegated"
          ? "Look up the tenant first."
          : "Choose an existing customer profile.",
      );
    if (!caseKey) caseKey = crypto.randomUUID();
    const tenantId = tenantForConnection();
    svc[service] = {
      state: "connecting",
      since: Date.now(),
      stage: "",
      authentication:
        connectionForPlan().mode === "app" ? "app-certificate" : "delegated",
    };
    render();
    try {
      const result = await N.connect({
        caseId: caseKey,
        service,
        tenantId,
        connection: connectionForPlan(),
        mail: settings.mail,
      });
      svc[service] = {
        ...svc[service],
        state: "ready",
        account: result.account,
        since: Date.now(),
        authentication: result.authentication,
      };
      remember();
    } catch (error) {
      if (svc[service].state === "connecting")
        svc[service] = {
          ...svc[service],
          state: "failed",
          error: error.message,
        };
      throw error;
    } finally {
      render();
    }
  }
  async function cancelSignIn(service) {
    if (!N) return;
    await N.cancelConnect({ service });
    svc[service] = { state: "cancelled", error: "Sign-in cancelled." };
    render();
  }
  async function disconnectAll(next = "connect") {
    if (busy) throw Error("Finish or stop the collection first.");
    if (N) {
      await N.disconnect();
      svc.graph = { state: "idle" };
      svc.exchange = { state: "idle" };
    } else {
      await G.signOut();
      svc.graph = { state: "idle" };
    }
    window.TriageContain?.reset?.();
    navigate({ step: next });
  }
  async function refreshSessions() {
    if (!N?.sessions) return;
    const summary = await N.sessions();
    if (!summary) {
      for (const key of Object.keys(svc))
        if (svc[key].state === "ready" || svc[key].state === "collecting")
          svc[key] = { state: "closed", error: "Session ended" };
      return;
    }
    caseKey = summary.caseId;
    for (const [key, s] of Object.entries(summary.services))
      svc[key] = {
        ...svc[key],
        state: s.state,
        account: s.account,
        error: s.error,
        authentication: s.authentication,
        since: s.since ? Date.parse(s.since) : svc[key].since,
      };
  }
  async function checkReadiness(force = false) {
    if (!N) return;
    if (readiness && !force) return readiness;
    if (force && !readinessTask) {
      readiness = null;
      if (route.step === "connect") render();
    }
    const task = (readinessTask ||= Promise.resolve().then(() =>
      N.preflight(),
    ));
    try {
      readiness = await task;
    } catch (error) {
      readiness = {
        ready: false,
        reason:
          error.message || "Desktop readiness could not be checked. Try again.",
      };
    } finally {
      if (readinessTask === task) readinessTask = null;
    }
    if (route.step === "connect") render();
    return readiness;
  }
  // ---------------------------------------------------------------- Scope
  function selectedSources() {
    const exch = N && svc.exchange.state === "ready";
    const allowed = (k) =>
      N ? !isExchange(k) || exch : graph.some((c) => c[0] === k);
    const list =
      settings.preset === "custom"
        ? settings.custom
        : settings.preset === "everything"
          ? PRESETS.everything
          : settings.preset === "standard"
            ? PRESETS.standard
            : PRESETS.quick;
    return list
      .filter(allowed)
      .filter((k) => !(k === "exchange" && settings.scope === "tenant"));
  }
  function viewScope() {
    const exch = N && svc.exchange.state === "ready";
    const q = settings.upn.trim().toLowerCase();
    const preset = (id, name, note, disabled, reason) =>
      `<label class="check" ${disabled ? `title="${esc(reason)}" style="opacity:.55"` : ""}><input type="radio" name="preset" value="${id}" ${settings.preset === id ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${name}<small>${note}</small></span></label>`;
    const presets = N
      ? preset(
          "quick",
          "Quick",
          "Graph core · " + PRESETS.quick.length + " sources",
        ) +
        preset(
          "standard",
          "Standard",
          "+ audit log, roles, devices, MFA, application identities, mailbox snapshot · " +
            PRESETS.standard.length +
            " sources",
          settings.scope === "tenant" || !exch,
          settings.scope === "tenant"
            ? "The mailbox snapshot needs one affected account"
            : "Sign in to Exchange Online on Connect",
        ) +
        preset(
          "everything",
          "Everything",
          "All " +
            PRESETS.everything.length +
            " sources · can take longer than an hour · mail content needs the option on Connect",
          !exch,
          "Sign in to Exchange Online on Connect",
        ) +
        preset("custom", "Custom", "Choose the sources yourself")
      : preset(
          "quick",
          "Quick",
          "Graph core · " + PRESETS.quick.length + " sources",
        ) +
        preset(
          "standard",
          "Standard",
          "All " +
            graph.length +
            " Microsoft Graph sources, including the Unified Audit Log",
        ) +
        preset("custom", "Custom", "Choose the Graph sources yourself");
    const list = N ? catalog : graph;
    const custom =
      settings.preset === "custom"
        ? `<div class="split-label"><span class="muted">${selectedSources().length} selected</span><div class="row-actions">${btn("sources-all", "Select all", "text-button")}${btn("sources-none", "Deselect all", "text-button")}</div></div>` +
          list
            .map(([k, name, , route$]) => {
              const disabled =
                (isExchange(k) && !exch) ||
                (k === "exchange" && settings.scope === "tenant");
              return `<label class="check" ${disabled ? 'style="opacity:.55"' : ""}><input type="checkbox" name="source" value="${k}" ${settings.custom.includes(k) && !disabled ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${esc(name)}<small>${
                k === "servicePrincipals"
                  ? "Tenant application context for grant resolution"
                  : k === "ual"
                    ? "Audit search may outlast the first hour; licenses and retention apply"
                    : k === "exchange"
                      ? disabled
                        ? settings.scope === "tenant"
                          ? "Needs one affected account"
                          : "Sign in to Exchange Online on Connect"
                        : "Forwarding, hidden rules, delegates, audit and folder permissions"
                      : isExchange(k)
                        ? disabled
                          ? "Sign in to Exchange Online on Connect"
                          : "PowerShell · Exchange Online"
                        : route$ === "Azure"
                          ? "PowerShell · needs Azure selected during connection setup"
                          : ["messages", "attachments"].includes(k)
                            ? "PowerShell · needs the email option on Connect"
                            : N
                              ? "PowerShell · Microsoft Graph"
                              : "Read-only · delegated permissions apply"
              }</small></span></label>`;
            })
            .join("")
        : "";
    const known = suggestions.find(
      (u) => u.userPrincipalName?.toLowerCase() === q,
    );
    const sugg =
      !N && settings.scope === "user" && q.length >= 2 && !known
        ? suggestions.slice(0, 5)
        : [];
    const accountHint =
      settings.scope === "tenant"
        ? `<p class="form-note account-hint">Accessible tenant evidence from the selected sources in ${esc(settings.tenant?.domain || "the connected tenant")}. Response always targets one account — you choose it on Respond.</p>`
        : known
          ? `<p class="form-note account-hint">✓ ${esc(known.displayName || known.userPrincipalName)} — found in ${esc(settings.tenant?.domain || "the connected tenant")}.</p>`
          : sugg.length
            ? `<section class="panel" style="margin:-8px 0 15px">${sugg.map((u) => `<button type="button" class="finding" data-action="pick-account" data-upn="${esc(u.userPrincipalName)}"><span class="badge">user</span><span><strong>${esc(u.userPrincipalName)}</strong><small>${esc(u.displayName || "")}</small></span><span class="arrow">↗</span></button>`).join("")}</section>`
            : `<p class="form-note account-hint">${N ? "The account is verified against the tenant when collection starts." : q.length >= 2 ? "No matching account found yet. Check the address before collecting." : "Start typing a name or address; the tenant's users are suggested."}</p>`;
    const planNote = openedPlan
      ? `<p class="notice">Opened plan ${esc(openedPlan.caseId.slice(0, 8))} · window ${esc(fmt(openedPlan.window.start))} — ${esc(fmt(openedPlan.window.end))}. Check the account and sources, then start.</p>`
      : "";
    const form = `<form id="scope-form" novalidate><div class="field-grid"><label class="field">Investigation scope<select name="scope"><option value="user" ${settings.scope === "user" ? "selected" : ""}>One affected account</option><option value="tenant" ${settings.scope === "tenant" ? "selected" : ""}>Tenant-wide review</option></select></label><label class="field">Lookback window<select name="days">${[1, 7, 30, 90, 180].map((d) => `<option value="${d}" ${settings.days == d ? "selected" : ""}>Last ${d} ${d === 1 ? "day" : "days"}</option>`).join("")}</select></label></div>
      <div class="quick-account-row"><label class="field">Account to check<input name="upn" value="${esc(settings.upn)}" placeholder="name@company.com" type="text" inputmode="email" autocomplete="off" spellcheck="false" ${settings.scope === "tenant" ? "disabled" : ""}></label>${btn("start-collection", "Start collection →", "primary", busy ? "disabled" : "")}</div>
      ${accountHint}${planNote}
      ${executionCard(N ? "powershell" : "browser-js", "ready", N ? "Collection method: PowerShell" : "Collection method: Browser JavaScript", N ? "Runs on this computer using the bundled PowerShell runtime. The services you signed in to on Connect are reused; no new sign-in." : "Runs in this browser using JavaScript and Microsoft Graph, with the sign-in from Connect.")}
      <div class="split-label"><h3>Evidence to collect</h3><span class="muted">${N ? (exch ? "Graph + Exchange" : "Graph · Exchange not signed in") : "Microsoft Graph"}</span></div><div class="presets">${presets}</div>${custom}
      <p class="form-note">Current-state checks are snapshots. A completed query covers the records Microsoft returned; it does not prove that the requested history was retained.</p>
      ${N ? `<div class="notice"><strong>Evidence folder</strong><p style="margin:6px 0 10px;overflow-wrap:anywhere">${esc(evidenceFolder || "Loading location…")}</p><div class="row-actions">${btn("evidence-folder", "Choose evidence folder…")}${btn("evidence-open", "Open folder")}</div><p class="form-note">New collections save here automatically. Saving the case includes your latest reviews and action log.</p></div>` : ""}
      <div class="row-actions section-gap">${stepBtn("connect", "← Connect", "text-button")}</div></form>`;
    return (
      head(
        stepEyebrow(3, "Scope"),
        "Who, how far back, how much.",
        "Choose the account, the window and an evidence preset. Nothing is read until you start.",
      ) +
      `<div class="grid-2">${panel("Investigation", `<div class="panel-body">${form}</div>`, N ? "PowerShell · reuses the Connect sign-ins" : "Read-only · browser collection")}${panel(
        "What happens next",
        `<div class="panel-body">${runStep(1, "Confirm the account", "A mistyped address is caught before any source is read.")}${runStep(2, "Collect and see the gaps", "Each source shows its returned records, errors and continuation state.")}${runStep(3, "Review in one workspace", "Findings open in a drawer with their source records; nothing jumps you to another page.")}${
          N
            ? ""
            : `<div class="notice">Need mailbox rules, forwarding or delegation? Continue in the desktop app: 1 · download, 2 · open, 3 · <em>Triage → Open collection plan…</em> and pick the plan you save here.</div>${btn("export-plan", "Save collection plan")}`
        }</div>`,
        "One case from first check to handover",
      )}</div>`
    );
  }
  let openedPlan = null;
  function readScopeForm() {
    const f = $("#scope-form");
    if (!f) return;
    settings.scope = f.elements.scope.value;
    settings.days = f.elements.days.value;
    settings.upn = f.elements.upn.value.trim();
    const preset = f.querySelector("input[name=preset]:checked")?.value;
    if (preset) settings.preset = preset;
    if (settings.preset === "custom")
      settings.custom = [
        ...f.querySelectorAll("input[name=source]:checked"),
      ].map((n) => n.value);
    remember();
  }
  async function lookupAccounts(query) {
    if (N || !G.account || query.length < 2 || query.includes(" ")) {
      suggestions = [];
      return;
    }
    const value = query.replace(/'/g, "''");
    try {
      const body = await G.gfetch(
        window.TRIAGE_AUTH.graphV1 +
          "/users?$top=6&$select=id,displayName,userPrincipalName&$filter=" +
          encodeURIComponent(
            `startswith(userPrincipalName,'${value}') or startswith(displayName,'${value}') or startswith(mail,'${value}')`,
          ),
      );
      suggestions = body?.value || [];
    } catch {
      suggestions = [];
    }
  }
  function makePlan() {
    readScopeForm();
    const sources = selectedSources();
    if (!sources.length) throw Error("Select at least one source.");
    const days = Number(settings.days);
    const values = {
      caseId: N ? caseKey : openedPlan?.caseId,
      tenantId: tenantForConnection() || (!N ? G.account?.tenantId : ""),
      scope: settings.scope,
      upn: settings.upn,
      start:
        openedPlan?.window?.start ||
        new Date(Date.now() - days * 864e5).toISOString(),
      end: openedPlan?.window?.end || new Date().toISOString(),
      sources,
    };
    const plan = M.plan(values, ev);
    plan.connection = connectionForPlan();
    if (
      settings.tenant?.domain &&
      settings.tenant.domain !== settings.tenant.tenantId
    )
      plan.tenantName = settings.tenant.domain;
    return plan;
  }
  // ---------------------------------------------------------------- coverage presentation
  function sourcePresentation(s) {
    const selected =
      Array.isArray(ev.selectedSources) && ev.selectedSources.includes(s.key);
    const state =
      s.state === "running" && !busy
        ? "interrupted"
        : s.state === "not-collected" && selected && busy
          ? "queued"
          : s.state === "not-collected" &&
              Array.isArray(ev.selectedSources) &&
              !selected
            ? "not-selected"
            : s.state;
    const styles = {
      complete: [
        "✓",
        "Complete",
        s.count ? "Ready to inspect" : "Completed; no records returned",
        3,
      ],
      running: ["", "Collecting", "Collecting evidence now", 0],
      queued: ["◷", "Waiting", "Waiting to start", 2],
      partial: [
        "!",
        "Partial",
        "Some evidence collected; collection is incomplete",
        1,
      ],
      failed: ["×", "Failed", "Collection failed; open for details", 1],
      unavailable: [
        "!",
        "Unavailable",
        "Source unavailable; open for details",
        1,
      ],
      cancelled: ["Ⅱ", "Cancelled", "Collection stopped before completion", 1],
      interrupted: [
        "!",
        "Interrupted",
        "Saved while collecting; completion is unverified",
        1,
      ],
      imported: [
        "↥",
        "Imported",
        "Imported evidence; collection coverage is unverified",
        3,
      ],
      "not-collected": [
        "—",
        "Not collected",
        "No collection result recorded",
        4,
      ],
      "not-selected": ["—", "Not selected", "Outside this collection plan", 5],
    };
    const [icon, statusLabel, description, priority] =
      styles[state] || styles["not-collected"];
    const count =
      s.count > 0 || state === "complete"
        ? recordCount(s.count) + (state === "running" ? " so far" : "")
        : state === "running"
          ? "Awaiting records"
          : "";
    return {
      ...s,
      displayState: state,
      icon,
      statusLabel,
      description,
      priority,
      countLabel: count,
    };
  }
  function collectionCoverage() {
    const all = E.coverage(ev).all.map(sourcePresentation);
    const known =
      Array.isArray(ev.selectedSources) && ev.selectedSources.length > 0;
    const scope = known
      ? all.filter((s) => ev.selectedSources.includes(s.key))
      : all;
    const complete = scope.filter((s) => s.displayState === "complete").length;
    const counts = scope.reduce((out, s) => {
      out[s.displayState] = (out[s.displayState] || 0) + 1;
      return out;
    }, {});
    return {
      all,
      scope,
      known,
      complete,
      counts,
      total: scope.length,
      gaps: scope.length - complete,
    };
  }
  function coverageSummary(c) {
    const percent = c.total ? Math.round((c.complete / c.total) * 100) : 0;
    const labels = {
      complete: ["✓", "complete"],
      running: ["↻", "collecting"],
      queued: ["◷", "waiting"],
      partial: ["!", "partial"],
      failed: ["×", "failed"],
      unavailable: ["!", "unavailable"],
      cancelled: ["Ⅱ", "cancelled"],
      interrupted: ["!", "interrupted"],
      imported: ["↥", "imported"],
      "not-collected": ["—", "not collected"],
      "not-selected": ["—", "not selected"],
    };
    const running = c.all.filter((s) => s.displayState === "running");
    return `<div class="coverage-summary"><div class="coverage-heading"><div><span class="coverage-eyebrow">${busy ? "Collection in progress" : "Collection results"}</span><p><strong>${c.complete}</strong> / ${c.total} ${c.known ? "selected " : ""}sources complete</p></div><span class="coverage-percent">${percent}%</span></div><div class="coverage-meter" role="progressbar" aria-label="Sources completely collected" aria-valuemin="0" aria-valuemax="${c.total || 1}" aria-valuenow="${c.complete}"><span style="width:${percent}%"></span></div><div class="coverage-legend">${Object.entries(
      labels,
    )
      .filter(([state]) => c.counts[state])
      .map(
        ([state, [icon, text]]) =>
          `<span class="coverage-key" data-state="${state}"><i aria-hidden="true">${icon}</i>${c.counts[state]} ${text}</span>`,
      )
      .join(
        "",
      )}</div>${busy ? `<p class="coverage-current" role="status">${cancelling ? "Cancelling collection; preserving returned evidence…" : running.length ? "Collecting now · " + running.map((s) => esc(s.label)).join(", ") : esc(collectionStatus || "Preparing collection…")}</p>` : analysisJob?.evidence === ev ? `<p class="coverage-current" role="status">Analyzing evidence with JavaScript…</p>` : ""}</div>`;
  }
  function sourceRows(limit, expandable = false, onlySelected = false) {
    let sources = E.coverage(ev).all.map(sourcePresentation);
    if (
      onlySelected &&
      Array.isArray(ev.selectedSources) &&
      ev.selectedSources.length
    )
      sources = sources.filter((s) => ev.selectedSources.includes(s.key));
    // Collect and the overview put active and incomplete sources first; Evidence keeps the catalogue order.
    if (!expandable || onlySelected)
      sources.sort((a, b) => a.priority - b.priority);
    return sources
      .slice(0, limit)
      .map((s) => {
        const expanded = expandable && route.s === s.key;
        return `<div class="source-group"><button type="button" id="source-${esc(s.key)}" class="source-row" data-state="${esc(s.displayState)}" data-action="${expandable ? "toggle-source" : "source"}" data-source="${esc(s.key)}" ${expandable ? `aria-expanded="${expanded}" aria-controls="source-records-${esc(s.key)}"` : ""}><span class="source-state-icon" aria-hidden="true">${s.icon}</span><span class="source-label"><strong>${esc(s.label)}</strong><small>${esc(s.description)} · ${esc(sourceScope(s.key))}</small></span><span class="source-result"><span class="source-status">${esc(s.statusLabel)}</span>${s.countLabel ? `<span class="source-count">${esc(s.countLabel)}</span>` : ""}</span><span class="source-arrow" aria-hidden="true">${expandable ? (expanded ? "−" : "+") : "›"}</span></button>${expanded ? sourceDetails(s.key) : ""}</div>`;
      })
      .join("");
  }
  function sourceDetails(key) {
    const records = ev.raw[key] || [],
      s = ev.manifest[key] || {},
      presentation = sourcePresentation({ ...s, key, count: records.length });
    const explanation = records.length
      ? "Select a record to inspect the original evidence."
      : presentation.displayState === "queued"
        ? "This source is waiting to start. No result is available yet."
        : presentation.displayState === "running"
          ? "Collection is in progress. No records have been returned yet."
          : presentation.displayState === "not-selected"
            ? "This source was not selected for this collection. It has no records to inspect."
            : s.state === "complete"
              ? "This query completed and returned no records. Check the collection window and available retention."
              : s.state === "not-collected" || !s.state
                ? "This source was not collected. It has no records to inspect."
                : "No records are available. The collection status and any error are shown below.";
    return `<div class="source-details" id="source-records-${key}" role="region" aria-labelledby="source-${key}"><div class="source-detail-head"><h3>${recordCount(records.length)}</h3><p class="subtitle">${esc(explanation)}</p></div>${key === "oauth" ? oauthScopeNote(false) : ""}${s.error ? '<div class="notice error">' + esc(s.error) + "</div>" : ""}<details class="source-metadata"><summary>Collection details</summary><p class="form-note">${esc(s.note || "No collection details recorded.")}<br>Started: ${esc(fmt(s.startedAt))}<br>Completed: ${esc(fmt(s.completedAt))}</p>${s.query ? '<pre class="raw">' + esc(s.query) + "</pre>" : ""}</details><div class="source-record-list">${records
      .slice(offset, offset + 40)
      .map(
        (r, i) =>
          `<button type="button" class="finding" data-action="record" data-ref="${key}:${offset + i + 1}"><span class="record-ref">${key}:${offset + i + 1}</span><span><strong>${esc(r.operation || r.Operation || r.activityDisplayName || r.appDisplayName || r.displayName || r.userPrincipalName || r.id || "Record " + (offset + i + 1))}</strong><small>${esc([r.userPrincipalName || r.UserId, fmt(r.createdDateTime || r.activityDateTime || r.capturedAt), r.ipAddress || r.ClientIP || r.auditData?.ClientIP].filter(Boolean).join(" · "))}${key === "oauth" ? " · " + esc(oauthRecordScope(r)) : ""}</small></span><span aria-hidden="true">↗</span></button>`,
      )
      .join(
        "",
      )}</div>${records.length > 40 ? paging(records.length) : ""}</div>`;
  }
  function paging(total) {
    return `<div class="page-size"><span>${total ? offset + 1 : 0}–${Math.min(offset + 40, total)} of ${total}</span><div class="row-actions">${btn("previous", "← Previous", "", offset ? "" : "disabled")}${btn("next", "Next →", "", offset + 40 < total ? "" : "disabled")}</div></div>`;
  }
  function mergeLog(first, second) {
    return [
      ...new Map(
        [...first, ...second].map((entry) => [entry.id, entry]),
      ).values(),
    ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  function collectionDetails() {
    const messages = N
      ? jobMessages
      : (ev.actionLog || [])
          .filter(
            (e) =>
              e.type.startsWith("collection-") || e.type === "source-result",
          )
          .map((e) =>
            [e.source && label(e.source), e.state, e.detail]
              .filter(Boolean)
              .join(" · "),
          );
    if (!messages.length) return "";
    return `<details class="panel collection-details section-gap" id="collection-details"><summary>Collection details <span>${N ? "PowerShell output" : "Source activity"}</span></summary><pre class="command">${esc(messages.slice(-80).join("\n"))}</pre></details>`;
  }
  // ---------------------------------------------------------------- Collect
  function sourceScope(key) {
    const context = ["servicePrincipals", "applications", "applicationPermissions", "conditionalAccess", "securityDefaults", "groups", "groupMembers", "licenses", "securityAlerts", "secureScore", "managedIdentity", "transportRules", "azureActivity", "azureDirectoryActivity"];
    if (context.includes(key)) return "Tenant context · " + (["managedIdentity", "securityAlerts", "azureActivity", "azureDirectoryActivity"].includes(key) ? "events" : "snapshot");
    if (key === "oauth") return ev.scope === "user" ? "Account grants + tenant consent" : "Tenant grants";
    const snapshot = ["users", "riskyUsers", "admins", "mfa", "devices", "exchange", "authenticationMethods", "userLicenses", "roleSchedules"].includes(key);
    return `${ev.scope === "user" ? "Account" : "Tenant"} ${snapshot ? "snapshot" : "events"}`;
  }
  function scopeSummary(c) {
    if (!c.known) return "Original source selection is unknown. Inspect each source for its scope, state and availability.";
    if (ev.scope !== "user") return "All accessible accounts are in scope; source access and retention can limit the results.";
    const context = c.scope.some(s => sourceScope(s.key).includes("Tenant context") || s.key === "oauth");
    return `Account evidence for ${ev.subject?.upn || "the selected account"}${context ? ", with tenant context from selected sources" : ""}. ${c.scope.some(s => s.key === "exchange") ? "Mailbox configuration is selected; inspect its result for availability." : "Mailbox configuration is not included in this plan."}`;
  }
  // The one statement that must never be small: which account or tenant is being collected,
  // over which window, with which sources, by whom. The case bar repeats it in one line.
  function collectionTarget(c) {
    const user = ev.scope === "user";
    const who = user ? ev.subject?.upn || "One account" : "Whole tenant";
    const tenant = ev.tenantName || ev.tenantId || "Unverified tenant";
    const tenantId =
      ev.tenantId && ev.tenantId !== ev.tenantName ? ev.tenantId : "";
    const days = windowDays(ev);
    const window_ = ev.window?.start
      ? fmt(ev.window.start) + " — " + fmt(ev.window.end)
      : "Collection window unverified";
    const method =
      ev.collectionMethod === "powershell"
        ? "PowerShell on this computer"
        : ev.collectionMethod === "browser-js"
          ? "Microsoft Graph in this browser"
          : ev.demo
            ? "Fictional sample"
            : "Imported evidence";
    const signedIn = (key) =>
      ["ready", "collecting"].includes(svc[key]?.state)
        ? " ✓"
        : " · not signed in";
    const operator = ev.demo
      ? "Sample analyst"
      : ev.collectorAccount ||
        (N ? svc.graph.account || svc.exchange.account : G.account?.username) ||
        (ev.imported ? "Not recorded in the case" : "Not signed in");
    const access = ev.demo
      ? "Nothing is real, nothing is changed"
      : ev.imported
        ? "From the imported case file"
        : N
          ? busy
            ? "Graph" + signedIn("graph") + " · Exchange" + signedIn("exchange")
            : "Delegated or application access · read-only"
          : "Microsoft Graph · delegated, read-only";
    const eyebrow = ev.demo
      ? "SAMPLE CASE"
      : ev.imported
        ? "IMPORTED CASE"
        : busy
          ? "COLLECTING FROM"
          : "COLLECTED FROM";
    const fact = (label, value, small) =>
      `<div><dt>${label}</dt><dd>${value}${small ? `<small>${small}</small>` : ""}</dd></div>`;
    return `<section class="collect-target" aria-label="Collection target"><div class="collect-target-head"><span class="big-symbol" aria-hidden="true">${user ? "⌕" : "◎"}</span><div><div class="eyebrow">${eyebrow}</div><h2>${user ? `${esc(who)} <span>in</span> ${esc(tenant)}` : `${who} <span>·</span> ${esc(tenant)}`}</h2><p>${esc(scopeSummary(c))} ${days} days · ${c.total} source${c.total === 1 ? "" : "s"} · ${esc(method)}.</p></div></div><dl class="collect-target-facts">${fact("Tenant", esc(tenant), esc(tenantId))}${fact("Requested window", days + " day" + (days === 1 ? "" : "s"), esc(window_))}${fact("Sources", c.total + (c.known ? " selected" : " catalogued · selection unknown"), esc(method))}${fact(ev.imported || ev.demo ? "Collected by" : "Signed in as", esc(operator), esc(access))}</dl></section>`;
  }
  function viewCollect() {
    if (!ev) return "";
    const done = !busy;
    const c = collectionCoverage();
    return (
      head(
        stepEyebrow(4, "Collect"),
        done
          ? analysisJob?.evidence === ev
            ? "Analyzing evidence."
            : "Collection finished."
          : mailboxJob
            ? "Checking the mailbox."
            : "Collecting evidence.",
        done
          ? "Review has the results. Incomplete sources stay visible as gaps."
          : "Keep this window open. Review opens by itself when collection ends.",
        busy
          ? btn(
              "cancel",
              cancelling ? "Stopping…" : "Stop collecting",
              "",
              cancelling ? "disabled" : "",
            )
          : stepBtn("review", "Open Review →", "primary", "overview"),
      ) +
      collectionTarget(c) +
      (N && !ev.imported && !ev.demo ? connectionRows(false) : "") +
      `<section class="panel collection-coverage section-gap"><div class="panel-head"><div><h2>Collection coverage</h2><p>Every selected source, its status and record count. Open a source to inspect the records that have arrived.</p></div></div>${coverageSummary(c)}${sourceRows(undefined, true, true)}<div class="coverage-footer">${c.total} sources selected · ${ev.collectionMethod === "powershell" ? "PowerShell on this computer" : ev.collectionMethod === "browser-js" ? "Microsoft Graph in this browser" : ev.demo ? "fictional sample" : "imported evidence"}<span>${busy ? "Stop keeps the records already returned; unfinished sources are marked cancelled." : c.known ? c.all.filter((s) => s.displayState === "not-selected").length + " sources not selected for this collection" : ""}</span></div></section>${collectionDetails()}`
    );
  }
  function refreshCollection() {
    // Background acquisition must not erase a runbook or note draft on another step.
    if (!["collect", "scope"].includes(route.step)) {
      renderChrome();
      return;
    }
    const scroll = window.scrollY,
      focused = document.activeElement?.id;
    const open = [...document.querySelectorAll("#main details")].map(
      (d) => d.open,
    );
    const outputScroll = $("#collection-details pre")?.scrollTop;
    render();
    document.querySelectorAll("#main details").forEach((d, i) => {
      d.open = !!open[i];
    });
    if (focused)
      document.getElementById(focused)?.focus({ preventScroll: true });
    if (outputScroll !== undefined && $("#collection-details pre"))
      $("#collection-details pre").scrollTop = outputScroll;
    window.scrollTo(0, scroll);
  }
  async function analyze() {
    if (!ev) return;
    const current = ev;
    const job = { evidence: current };
    analysisJob = job;
    renderChrome();
    try {
      const result = await TriageAnalysis.run(current, "tenant");
      if (ev === current && analysisJob === job) findings = result.findings;
    } finally {
      if (analysisJob === job) analysisJob = null;
      renderChrome();
    }
  }
  function finishCollection() {
    // Collection ended on the Collect step: Review opens by itself. Elsewhere the rail already says so.
    if (route.step === "collect" || route.step === "scope")
      navigate({ step: "review", tab: "overview", caseId: ev?.caseId }, true);
    else render();
  }
  // Web: Microsoft Graph in this browser.
  async function webCollect(resume = false) {
    if (N) throw Error("Use the desktop collection in the app.");
    if (LOCAL)
      throw Error(
        "Collect in the desktop app or on the triage website. This private browser window is a case viewer.",
      );
    if (busy) return;
    if (!G.account) throw Error("Sign in on Connect first.");
    if (!resume) readScopeForm();
    const sources = resume ? ev.selectedSources : selectedSources();
    if (!sources.length) throw Error("Select at least one source.");
    if (
      !resume &&
      settings.scope === "user" &&
      !/^[^\s@'<>]+@[^\s@'<>]+\.[^\s@'<>]+$/.test(settings.upn)
    )
      throw Error("Enter the affected account.");
    if (resume && (!ev?.live || ev.imported))
      throw Error("Only this live collection can be resumed.");
    if (resume && ev.tenantId && ev.tenantId !== G.account.tenantId)
      throw Error(
        "This case belongs to another tenant than the connected account. Sign in to the case tenant to resume.",
      );
    const days = resume ? windowDays(ev) : Number(settings.days);
    let stopped = null;
    if (!resume) {
      const current = M.init(
        E.create({
          live: true,
          tenantId: G.account.tenantId,
          tenantName:
            settings.tenant?.domain || G.account.username.split("@")[1],
          // The affected account is stated from the first render; the collector resolves its object ID.
          scope: settings.scope === "user" ? "user" : "tenant",
          subject:
            settings.scope === "user"
              ? { upn: settings.upn.trim() }
              : undefined,
          collectorAccount: G.account.username,
          days,
          window: {
            start: new Date(Date.now() - days * 864e5).toISOString(),
            end: new Date().toISOString(),
          },
          selectedSources: sources,
          collectionMethod: "browser-js",
        }),
      );
      openWorkspace(current);
    }
    busy = true;
    ev.collectionMethod = "browser-js";
    cancelling = false;
    jobMessages = [];
    collectionStatus = "Preparing collection…";
    controller = new AbortController();
    log(
      "collection-start",
      resume
        ? "Resumed incomplete web sources in this browser (JavaScript)."
        : "Started delegated Microsoft Graph collection in this browser (JavaScript).",
    );
    navigate({ step: "collect" }, resume);
    window.scrollTo(0, 0);
    try {
      await BETA_Collect.collect(
        days,
        sources.includes("ual"),
        (key, state, detail) => {
          collectionStatus = label(key) + " · " + state;
          if (state !== "running")
            log("source-result", detail, { source: key, state });
          refreshCollection();
        },
        {
          evidence: ev,
          resume,
          signal: controller.signal,
          upn: resume
            ? undefined
            : settings.scope === "user"
              ? settings.upn
              : undefined,
          sources,
        },
      );
    } catch (e) {
      stopped = e;
      throw e;
    } finally {
      busy = false;
      controller = null;
      log(
        "collection-end",
        stopped
          ? "Collection stopped: " + stopped.message
          : "Collection ended. Review all source states for incomplete evidence.",
      );
      await analyze();
      touch();
      finishCollection();
    }
  }
  // Desktop app: PowerShell on this computer, released against the Connect sessions.
  async function nativeCollect() {
    if (!N) return;
    if (busy) return;
    if (!connected()) throw Error("Sign in on Connect first.");
    const plan = makePlan();
    for (const key of plan.sources) {
      const need = isExchange(key) ? "exchange" : "graph";
      if (svc[need].state !== "ready")
        throw Error(
          (need === "graph" ? "Microsoft Graph" : "Exchange Online") +
            " is not signed in. Go back to Connect.",
        );
    }
    const current = M.init(
      E.create({
        caseId: plan.caseId,
        tenantId: plan.tenantId,
        tenantName: plan.tenantName || plan.tenantId,
        scope: plan.scope,
        subject: plan.scope === "user" ? { upn: plan.upn } : undefined,
        window: plan.window,
        selectedSources: plan.sources,
        collectionMethod: "powershell",
        live: false,
      }),
    );
    openWorkspace(current);
    busy = true;
    cancelling = false;
    jobMessages = [];
    collectionStatus = "Releasing the signed-in services…";
    for (const key of Object.keys(svc))
      if (
        svc[key].state === "ready" &&
        plan.sources.some((k) =>
          isExchange(k) ? key === "exchange" : key === "graph",
        )
      )
        svc[key] = { ...svc[key], state: "collecting" };
    navigate({ step: "collect" });
    window.scrollTo(0, 0);
    try {
      const result = M.init(await E.unpack(await N.collect(plan)));
      if (result.caseId !== ev.caseId || result.tenantId !== ev.tenantId)
        throw Error("Returned collection does not match the active case.");
      // The completed bundle supplies evidence; analyst work stays in this case.
      result.actionLog = mergeLog(result.actionLog, ev.actionLog);
      result.dispositions = { ...result.dispositions, ...ev.dispositions };
      result.tenantName = ev.tenantName;
      ev = result;
    } catch (error) {
      for (const key of plan.sources) {
        if (["running", "not-collected"].includes(ev.manifest[key].state))
          ev.manifest[key] = {
            ...ev.manifest[key],
            state: cancelling
              ? "cancelled"
              : ev.raw[key]?.length
                ? "partial"
                : "failed",
            error: error.message,
          };
      }
      log("collection-end", "Collection stopped: " + error.message);
      message(error.message, true);
    } finally {
      busy = false;
      clearTimeout(progressTimer);
      await refreshSessions().catch(() => {});
      await analyze();
      touch();
      finishCollection();
    }
  }
  function openWorkspace(current) {
    window.TriageContain?.reset?.();
    drafts.clear();
    referencePages.clear();
    ev = current;
    findings = [];
    offset = 0;
    filter = "";
    severity = "all";
    saveState = { at: "", dirty: false, error: "" };
    openedPlan = null;
  }
  // ---------------------------------------------------------------- Review
  function findingsRows(list) {
    return (
      list
        .map(
          (f) =>
            `<button type="button" class="finding" data-action="open-finding" data-finding="${esc(f.Id)}" ${route.f === f.Id ? 'aria-current="true" style="background:var(--soft)"' : ""}>${badge(f.Severity)}<span><strong>${esc(f.Title)}</strong><small>${esc(f.User || "Tenant context")} · ${esc(f.Analyzer)} · ${esc(f.Timestamp || "Current state")}${M.reviewState(ev, f) !== "unreviewed" ? " · " + esc(M.reviewState(ev, f)) : ""}</small></span><span class="arrow">↗</span></button>`,
        )
        .join("") ||
      (analysisJob?.evidence === ev
        ? empty(
            "Analyzing evidence…",
            "Findings appear when the background analysis of this case has finished.",
          )
        : empty(
            "No signals in these results",
            "Check source coverage before concluding the case is clear.",
          ))
    );
  }
  function oauthScopeNote(link = true) {
    if (!E.userScope(ev) || !ev.oauthGrants?.length) return "";
    const counts = E.oauthSummary(ev);
    const parts = [
      `${counts.user} user-specific ${counts.user === 1 ? "grant" : "grants"}`,
      `${counts.tenant} tenant-wide`,
      counts.other ? `${counts.other} for other accounts` : "",
      counts.unattributed
        ? `${counts.unattributed} with unverified user relationship`
        : "",
    ].filter(Boolean);
    return `<div class="oauth-scope-note"><div><strong>OAuth permissions · this account</strong><p>${esc(parts.join(" · "))}</p><p>Only grants linked to this account contribute OAuth findings. Tenant-wide consent alone does not show that this account used the app.</p></div>${link ? btn("source", "Inspect OAuth evidence →", "", 'data-source="oauth"') : ""}</div>`;
  }
  function oauthRecordScope(record) {
    const kind = E.oauthScope(ev, record);
    if (kind === "tenant") return "Tenant-wide consent · shared context";
    if (!E.userScope(ev)) return "Per-user consent";
    return {
      user: "Granted for this account",
      other: "Granted for another account",
      unattributed: "User relationship unverified",
    }[kind];
  }
  function filtered() {
    const q = filter.toLowerCase();
    return findings.filter(
      (f) =>
        (severity === "all" || f.Severity === severity) &&
        (route.state !== "unreviewed" ||
          ["unreviewed", "investigating"].includes(M.reviewState(ev, f))) &&
        [f.Title, f.User, f.Detail, f.Analyzer]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
  }
  function logRow(e) {
    return `<div class="log-row"><time>${esc(fmt(e.at || e.time))}<small>${esc(e.actor || "Recorded actor")}</small></time><div><strong>${esc(e.type || "Action")}${e.outcome ? " · " + esc(e.outcome) : ""}</strong><span>${esc(e.detail || e.message || "")}</span>${e.reference ? `<button type="button" class="text-button" data-action="record" data-ref="${esc(e.reference)}">Evidence: ${esc(e.reference)} →</button>` : ""}</div></div>`;
  }
  function partialNotice() {
    const c = collectionCoverage();
    if (!c.gaps || busy) return "";
    const gaps = c.scope.filter((s) => s.displayState !== "complete");
    return `<div class="notice evidence-gap"><div><strong>Evidence gaps remain</strong><span>${c.complete} / ${c.total} sources complete${c.known ? "" : " · original selection unknown"} · ${gaps.length} incomplete or not collected</span></div><div class="row-actions">${stepBtn("review", "Inspect gaps →", "text-button", "evidence")}${!N && ev.live && !ev.imported ? btn("resume", "Resume incomplete sources") : ""}</div></div>`;
  }
  function viewReview() {
    const tab = TABS.some((t) => t[0] === route.tab) ? route.tab : "overview";
    const drawer = route.f
      ? findingDrawer()
      : route.r
        ? recordDrawer(route.r, null)
        : "";
    const wrap = (inner) =>
      drawer
        ? `<div class="drawer-layout"><div>${inner}</div>${drawer}</div>`
        : inner;
    const respondButton = stepBtn(
      "respond",
      "Respond →",
      "text-button",
      "preserve",
    );
    if (tab === "overview") {
      const c = collectionCoverage(),
        high = findings.filter((f) =>
          ["Critical", "High"].includes(f.Severity),
        ).length,
        reviewed = M.reviewProgress(ev, findings).resolved,
        phases = M.phaseProgress(ev).resolved;
      return (
        head(
          stepEyebrow(5, "Review") + " · OVERVIEW",
          "The case, at a glance.",
          `${esc(ev.subject?.upn || ev.tenantName || "Unverified import")} · ${esc(ev.window ? fmt(ev.window.start) + " — " + fmt(ev.window.end) : "Collection window unverified")}`,
          respondButton,
        ) +
        (ev.demo
          ? '<div class="notice">Sample case · Fictional data for exploring the workflow. No live collection or tenant response has been performed.</div>'
          : "") +
        partialNotice() +
        oauthScopeNote() +
        `<div class="stats"><div class="stat attention"><span class="stat-label">PRIORITY SIGNALS</span><strong>${analysisJob?.evidence === ev ? "—" : high}</strong><small>${analysisJob?.evidence === ev ? "Analysis is running" : "High / critical · requires review"}</small></div><div class="stat"><span class="stat-label">EVIDENCE RECORDS</span><strong>${rows().toLocaleString()}</strong><small>Preserved in this case</small></div><div class="stat"><span class="stat-label">SOURCES COMPLETE</span><strong>${c.complete}<span class="muted"> / ${c.total}</span></strong><small>${c.gaps + " incomplete or not collected"}</small></div><div class="stat"><span class="stat-label">RESOLVED</span><strong>${reviewed}<span class="muted"> / ${findings.length}</span></strong><small>Confirmed or benign · with a reason</small></div></div><div class="grid-2">${panel("Signals to review", findingsRows(findings.slice(0, 6)), "Automated analysis · prioritize, inspect, decide", stepBtn("review", "View all →", "text-button", "findings"))}<section class="panel collection-coverage"><div class="panel-head"><div><h2>Collection coverage</h2><p>Open a source to inspect evidence.</p></div>${stepBtn("review", "All sources →", "text-button", "evidence")}</div>${coverageSummary(c)}${sourceRows(7)}<div class="coverage-footer">${c.all.length > 7 ? `Showing 7 of ${c.all.length} sources · incomplete results first` : "Select a source to inspect its evidence"}${c.known ? `<span>${c.all.filter((s) => s.displayState === "not-selected").length} sources not selected for this collection</span>` : ""}</div></section></div><div class="grid-even section-gap">${panel("Respond", `<div class="panel-body"><p class="subtitle">Confirm and preserve → Contain and record → Establish impact → Secure evidence → Hand over.</p><div class="progress"><div style="width:${phases * 20}%"></div></div>${stepBtn("respond", phases ? "Continue the runbook →" : "Start the first 60 minutes →", "primary", "preserve")}</div>`, "Guidance for decisions, not a deadline for collection")}${panel("Latest activity", (ev.actionLog || []).length ? ev.actionLog.slice(-3).reverse().map(logRow).join("") : empty("The case is open", "Collection and review decisions will appear here."), "One chronology across collection and response", stepBtn("handover", "Open action log →", "text-button"))}</div>`
      );
    }
    if (tab === "findings") {
      const list = filtered();
      return (
        head(
          stepEyebrow(5, "Review") + " · FINDINGS",
          "Turn signals into decisions.",
          "Review each finding against its source records. An automated signal is not confirmation of compromise.",
          respondButton,
        ) +
        partialNotice() +
        oauthScopeNote() +
        wrap(
          `<div class="filter-bar"><input id="finding-filter" aria-label="Search findings" placeholder="Search account, finding or detail…" value="${esc(filter)}"><select id="severity" aria-label="Filter severity">${["all", "Critical", "High", "Medium", "Low", "Info"].map((s) => `<option ${severity === s ? "selected" : ""}>${s}</option>`).join("")}</select>${route.state ? btn("clear-state-filter", "Outstanding only ✕") : ""}<span class="muted">${list.length} findings</span></div><section class="panel">${findingsRows(list.slice(offset, offset + 40))}${paging(list.length)}</section>`,
        )
      );
    }
    if (tab === "timeline") {
      const all = M.timeline(ev);
      return (
        head(
          stepEyebrow(5, "Review") + " · TIMELINE",
          "Reconstruct the sequence.",
          "Events across collected sources, ordered by their recorded time. Undated inventory remains available in Evidence.",
        ) +
        partialNotice() +
        wrap(
          `<section class="panel">${
            all
              .slice(offset, offset + 40)
              .map(
                (t) =>
                  `<div class="timeline-row"><time>${esc(fmt(t.time))}</time><div><strong>${esc(t.title)}</strong><small>${esc(t.user || t.key)}</small>${btn("record", esc(t.reference), "text-button", `data-ref="${esc(t.reference)}"`)}</div></div>`,
              )
              .join("") ||
            empty(
              "No dated records",
              "Import or collect sign-ins and audit events to build a timeline.",
            )
          }${paging(all.length)}</section>`,
        )
      );
    }
    return (
      head(
        stepEyebrow(5, "Review") + " · EVIDENCE",
        "Know what you have. See what is missing.",
        "Select an evidence source to open its records here. Each source keeps its collection status, errors and original evidence.",
        !busy && ev.live && !ev.imported && !N
          ? btn("resume", "Resume incomplete web sources")
          : "",
      ) +
      partialNotice() +
      wrap(
        `<section class="panel evidence-sources"><div class="panel-head"><div><h2>Evidence sources</h2><p>Click a source to inspect its records and collection details.</p></div>${badge("imported", recordCount(rows()))}</div>${sourceRows(undefined, true)}</section>`,
      )
    );
  }
  function recordFacts(r) {
    const a = typeof r.auditData === "object" ? r.auditData : r;
    const facts = {
      "Operation / event":
        r.operation ||
        r.Operation ||
        r.activityDisplayName ||
        r.subject ||
        r.Subject ||
        r.displayName,
      "Account / sender":
        r.userPrincipalName ||
        r.UserId ||
        r.SenderAddress ||
        r.from?.emailAddress?.address,
      "Time (UTC)": fmt(
        r.createdDateTime ||
          r.activityDateTime ||
          r.CreationTime ||
          r.Received ||
          r.receivedDateTime,
      ),
      "IP address": r.ipAddress || r.ClientIP || a.ClientIP,
      Application: r.appDisplayName || r.clientDisplayName,
      Result: r.result || r.ResultStatus || r.Status || r.status?.errorCode,
      "Target / recipients": r.ObjectId || r.RecipientAddress || r.toRecipients,
      "Details / changes":
        a.Parameters ||
        a.OperationProperties ||
        r.targetResources ||
        r.Description,
    };
    return `<dl class="evidence-facts">${Object.entries(facts)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(
        ([k, v]) =>
          `<dt>${esc(k)}</dt><dd>${esc(typeof v === "object" ? JSON.stringify(v, null, 2) : v)}</dd>`,
      )
      .join("")}</dl>`;
  }
  function findingSource(f) {
    return (
      {
        SignIns: "interactive",
        EntraSignInLogs: "interactive",
        EntraAuditLogs: "audits",
        DirectoryAudit: "audits",
        UAL: "ual",
        RiskyUsers: "riskyUsers",
        RiskyDetections: "riskDetections",
        OAuthPermissions: "oauth",
        Users: "users",
        Devices: "devices",
        Admins: "admins",
        MFA: "mfa",
        ExchangeSnapshot: "exchange",
      }[f.Analyzer] ||
      (E.CATALOG.some((c) => c[0] === f.Source) ? f.Source : "audits")
    );
  }
  function findingReferences(f) {
    const refs = [];
    const add = (v) => {
      if (
        typeof v === "string" &&
        /^[a-zA-Z]+:\d+$/.test(v) &&
        M.ref(ev, v) &&
        !refs.includes(v)
      )
        refs.push(v);
    };
    add(f.Reference);
    add(f.Evidence);
    for (const v of Array.isArray(f.References) ? f.References : []) add(v);
    return refs;
  }
  const drawerHead = (title) =>
    `<div class="dialog-head"><h2>${title}</h2>${btn("close-drawer", "✕ Close", "", 'aria-label="Close"')}</div>`;
  function findingDrawer() {
    const f = findings.find((x) => x.Id === route.f);
    if (!f)
      return `<aside class="panel drawer" aria-label="Finding">${drawerHead("Finding")}<div class="dialog-body"><p class="subtitle">${analysisJob?.evidence === ev ? "Analysis is still running." : "This finding is not in the current analysis."}</p></div></aside>`;
    if (route.r) return recordDrawer(route.r, f);
    const d = drafts.get("review:" + f.Id) || ev.dispositions[f.Id] || {};
    const key = findingSource(f),
      refs = findingReferences(f);
    const reference = d.reference ?? refs[0] ?? "";
    const first = Math.min(referencePages.get(f.Id) || 0, Math.max(0, refs.length - 1));
    const pageRefs = refs.slice(first, first + 10);
    const recordCard = r => {
      const record = M.ref(ev, r);
      return `<div class="primary-evidence"><div class="split-label"><strong>${esc(r)}</strong>${reference === r ? `<span class="muted">Attached reference</span>` : btn("attach-reference", "Attach reference", "text-button", `data-ref="${esc(r)}"`)}</div><button type="button" class="text-button" data-action="open-record" data-ref="${esc(r)}">Open original record →</button>${recordFacts(record)}</div>`;
    };
    const selectedReference = refs.includes(reference) ? reference : refs[0];
    const evidence = refs.length
      ? `<p class="form-note">${refs.length} supporting record${refs.length === 1 ? "" : "s"}. ${f.EvidenceWindow?.start ? "Requested window: " + esc(fmt(f.EvidenceWindow.start)) + " — " + esc(fmt(f.EvidenceWindow.end)) + "." : "Requested window not recorded."} Current snapshots do not establish historical state.</p>${recordCard(selectedReference)}${refs.length > 1 ? `<details class="supporting-set" ${referencePages.has(f.Id) ? "open" : ""}><summary>Browse all ${refs.length} supporting records</summary><div class="supporting-records">${pageRefs.map(r => {
          const record = M.ref(ev, r);
          return `<div class="supporting-record"><div><button type="button" class="text-button" data-action="open-record" data-ref="${esc(r)}"><strong>${esc(r)}</strong> →</button><small>${esc(record.operation || record.Operation || record.activityDisplayName || record.appDisplayName || record.displayName || record.userPrincipalName || "Source record")}</small></div>${btn("attach-reference", reference === r ? "Attached" : "Attach reference", "text-button", `data-ref="${esc(r)}"`)}</div>`;
        }).join("")}</div>${refs.length > 10 ? `<div class="page-size"><span>${first + 1}–${Math.min(first + 10, refs.length)} of ${refs.length}</span><div class="row-actions">${btn("reference-page", "← Previous records", "", `data-offset="${Math.max(0, first - 10)}" ${first ? "" : "disabled"}`)}${btn("reference-page", "Next records →", "", `data-offset="${first + 10}" ${first + 10 < refs.length ? "" : "disabled"}`)}</div></div>` : ""}</details>` : ""}`
      : `<div class="notice"><strong>Evidence link missing</strong><p>Locate a supporting record before confirming this finding. An automated signal does not establish compromise.</p>${btn("evidence-source", "Inspect " + esc(label(key)) + " →", "text-button", `data-source="${esc(key)}"`)}</div>`;
    return `<aside class="panel drawer" aria-label="Finding">${drawerHead("Evidence & decision")}<div class="dialog-body"><p>${badge(f.Severity)} ${badge(d.state || "unreviewed")}</p><h2 style="margin-top:10px">${esc(f.Title)}</h2><p class="subtitle">${esc(f.Detail)}</p><p class="muted">${esc(f.User || "Tenant context")} · ${esc(f.Analyzer)} · ${esc(f.Timestamp || "Current state")}<br>${esc(f.Confidence || "Signal requires analyst review")}</p><section class="finding-evidence" aria-label="Supporting evidence"><h3>Supporting evidence</h3>${evidence}</section><form id="review-form" data-id="${esc(f.Id)}" novalidate><p id="review-validation" class="dialog-notification" role="alert" hidden></p><label class="field">Review decision<select name="state">${["unreviewed", "investigating", "confirmed", "benign"].map(state => `<option ${d.state === state ? "selected" : ""}>${state}</option>`).join("")}</select></label><p class="form-note">Confirmed means the finding is supported by the cited evidence. It does not automatically confirm account compromise. Investigating remains outstanding work.</p><label class="field">Reason and supporting facts (required)<textarea name="note" required aria-describedby="review-note-error">${esc(d.note || "")}</textarea><span id="review-note-error" class="field-error" hidden></span></label><label class="field">Evidence reference<input name="reference" value="${esc(reference)}" placeholder="source:record number" aria-describedby="review-reference-help review-reference-error"><span id="review-reference-error" class="field-error" hidden></span></label><p id="review-reference-help" class="form-note">${refs.length ? "The supporting reference is attached automatically. Select Attach reference above to change it." : "Enter an existing case record reference. Required when confirming."}</p><div class="row-actions">${btn("review", "Save review", "primary")}${f.User || ev.subject?.upn ? btn("contain-account", "Review response plan →", "text-button", `data-upn="${esc(f.User || ev.subject?.upn)}"`) : ""}</div></form></div></aside>`;
  }

  function recordDrawer(ref, f) {
    const r = M.ref(ev, ref);
    if (!r)
      return `<aside class="panel drawer" aria-label="Evidence record">${drawerHead("Evidence · " + esc(ref))}<div class="dialog-body"><p class="subtitle">Evidence record not found in this case.</p></div></aside>`;
    return `<aside class="panel drawer" aria-label="Evidence record">${drawerHead("Evidence · " + esc(ref))}<div class="dialog-body">${f ? btn("back-to-finding", "← Back to the finding", "text-button") : ""}<p class="muted">Use <strong>${esc(ref)}</strong> when recording a review or a runbook outcome.</p>${recordFacts(r)}<details class="source-metadata"><summary>Original JSON</summary><pre class="raw">${esc(JSON.stringify(r, null, 2))}</pre></details></div></aside>`;
  }
  function validateReview(form, focus = false) {
    const errors = {
      note: form.elements.note.value.trim()
        ? ""
        : "Add your reason and supporting facts before saving.",
      reference:
        form.elements.state.value === "confirmed" &&
        !M.ref(ev, form.elements.reference.value.trim())
          ? "Confirmation needs an existing evidence reference. Copy it from a record in Evidence."
          : "",
    };
    form.dataset.validation = "true";
    for (const [name, text] of Object.entries(errors)) {
      const field = form.elements[name],
        error = $("#review-" + name + "-error");
      if (!error) continue;
      error.textContent = text;
      error.hidden = !text;
      if (text) field.setAttribute("aria-invalid", "true");
      else field.removeAttribute("aria-invalid");
    }
    const invalid = Object.keys(errors).filter((name) => errors[name]);
    const summary = $("#review-validation");
    if (summary) {
      summary.hidden = !invalid.length;
      summary.textContent = invalid.length
        ? "Review not saved. Complete the highlighted fields below."
        : "";
    }
    if (focus && invalid.length) form.elements[invalid[0]].focus();
    return invalid.length === 0;
  }
  // ---------------------------------------------------------------- Respond
  let responseSession = { state: "idle" }; // the account-check connection on Respond (app: one explicit window)
  let responseTarget = null; // { id, userPrincipalName } chosen for a tenant-wide case
  function responseReady() {
    return !!ev && window.TriageContain?.identity?.caseId === ev.caseId;
  }
  function responseUser() {
    if (responseTarget) return responseTarget;
    if (ev?.subject?.upn)
      return { id: ev.subject.objectId, userPrincipalName: ev.subject.upn };
    return null;
  }
  function viewRespond() {
    const phase = M.phases.some((p) => p.id === route.tab)
      ? route.tab
      : "preserve";
    const user = responseUser();
    const exported = (ev.actionLog || []).findLast(
      (e) => e.type === "case-exported",
    );
    const offer = responseOffer(user);
    return partialNotice() + TriageFirstHour.render({
      ev,
      phase,
      phases: M.phases,
      latest: M.latest,
      esc,
      btn,
      stepBtn,
      coverage: collectionCoverage(),
      logRow,
      mailbox: mailboxCard,
      connected: responseReady() && !window.TriageContain.preview,
      runbook: responseReady(),
      native: !!N,
      busy,
      target: user?.userPrincipalName || "",
      session: responseSession,
      offer,
      exported: exported ? fmt(exported.at) : "",
    });
  }
  // The web reuses the Connect sign-in silently; the desktop app has to open one Microsoft window.
  function responseAutoConnects() {
    return (
      !!ev &&
      !LOCAL &&
      (!!ev.demo || (!N && !!G.account && G.account.tenantId === ev.tenantId))
    );
  }
  function responseOffer(user) {
    if (responseReady() && !window.TriageContain.preview)
      return {
        kind: "connected",
        text:
          "✓ " +
          (N
            ? "Read-only checks connected on this computer"
            : ev.demo
              ? "Sample tenant — checks are simulated"
              : "Reuses your Connect sign-in") +
          (responseSession.account && responseSession.account !== "demo"
            ? " · " + responseSession.account
            : ""),
      };
    if (responseSession.state === "connecting")
      return {
        kind: "connecting",
        text: N ? "Waiting for you in your browser…" : "Connecting the checks…",
      };
    if (!user)
      return { kind: "account", text: "Choose the affected account first." };
    if (LOCAL)
      return {
        kind: "viewer",
        text: "This private viewer reads the case. Account checks and containment run in the desktop app or on the website.",
      };
    if (N)
      return {
        kind: "app",
        text:
          "Read-only checks against the account: methods, sessions, grants. Opening them shows one Microsoft window — nothing else in this flow does." +
          (responseSession.state === "failed"
            ? " Last attempt: " + responseSession.error
            : ""),
        label:
          responseSession.state === "failed"
            ? "Try again"
            : "Open account checks",
        action: "respond",
      };
    if (!G.account)
      return {
        kind: "signin",
        text: "Sign in on Connect to run the account checks; they reuse that sign-in without another window.",
        label: "Sign in on Connect",
        step: "connect",
      };
    if (G.account.tenantId !== ev.tenantId)
      return {
        kind: "tenant",
        text:
          "You are signed in to another tenant than this case (" +
          (ev.tenantName || ev.tenantId) +
          "). Sign in to the case tenant on Connect.",
        label: "Sign in on Connect",
        step: "connect",
      };
    return {
      kind: "auto",
      text:
        responseSession.state === "failed"
          ? responseSession.error
          : "Connecting the checks…",
      label: "Try again",
      action: "respond",
    };
  }
  // The shared runbook renders into #screen-contain; on Respond that node docks under the phase rows.
  function mountRunbook() {
    const node = $("#screen-contain");
    const phase = M.phases.some((p) => p.id === route.tab)
      ? route.tab
      : "preserve";
    const active = route.step === "respond" && !!ev;
    $("#main").classList.toggle("response-heading", active && responseReady());
    if (!active) {
      node.hidden = true;
      node.classList.remove("active");
      return;
    }
    const user = responseUser();
    if (user && !responseReady()) {
      if (
        responseAutoConnects() &&
        responseSession.state !== "connecting" &&
        responseSession.state !== "failed"
      ) {
        void connectResponse().catch((error) => message(error.message, true));
        if (!responseReady()) {
          node.hidden = true;
          node.classList.remove("active");
          return;
        }
      } else startRunbook(user, true);
    }
    if (responseReady()) {
      $("#hour-response-slot")?.append(node);
      node.hidden = false;
      node.classList.add("active");
      // The runbook survives navigation. Refresh its mailbox card so returning
      // from Connect reflects the current Exchange session and evidence.
      const mailbox = node.querySelector("#cs-rules");
      if (mailbox) {
        const open = mailbox.querySelector("details")?.open;
        mailbox.outerHTML = mailboxCard();
        if (open) node.querySelector("#cs-rules details").open = true;
      }
      TriageFirstHour.arrange(phase);
    } else {
      node.hidden = true;
      node.classList.remove("active");
    }
  }
  function startRunbook(user, preview) {
    window.TriageContain.start(user, {
      preview,
      demo: !!ev.demo,
      embedded: true,
      context: {
        evidence: window.TriageCase.subject(ev, user.userPrincipalName),
        findings: findings.filter(
          (f) => !f.User || f.User === user.userPrincipalName,
        ),
      },
    });
  }
  async function connectResponse() {
    if (!ev) throw Error("Open a case first.");
    if (LOCAL) {
      dialog(
        "Response and checks on this device",
        `<p>This private browser viewer is read-only. To run account checks or containment, open the case in the desktop app or on your trusted Triage website and connect to its tenant. Collection credentials are never forwarded to a browser.</p><div class="row-actions">${stepBtn("review", "Inspect collected evidence →", "", "evidence")}${btn("close-dialog", "Close")}</div>`,
      );
      return;
    }
    const user = responseUser();
    if (!user) {
      chooseAccount();
      return;
    }
    if (ev.demo) {
      startRunbook(user, false);
      responseSession = { state: "ready", account: "demo" };
      render();
      return;
    }
    responseSession = { state: "connecting", since: Date.now() };
    render();
    try {
      if (N)
        await G.connectNativeResponse({
          tenantId: ev.tenantId,
          caseId: ev.caseId,
          objectId: user.id,
          upn: user.userPrincipalName,
        });
      if (!G.account || G.account.tenantId !== ev.tenantId)
        throw Error(
          "Sign in to this case's tenant on Connect before responding.",
        );
      responseSession = { state: "ready", account: G.account.username };
      log(
        "response-connect",
        "Account checks connected for " +
          user.userPrincipalName +
          " (" +
          (N ? "PowerShell on this computer" : "Connect sign-in reused") +
          ").",
      );
      startRunbook(user, false);
    } catch (error) {
      responseSession = { state: "failed", error: error.message };
      throw error;
    } finally {
      render();
    }
  }
  function chooseAccount() {
    const users = (ev.users || []).filter((u) => u.userPrincipalName);
    dialog(
      "Choose the affected account",
      `<p>Response always targets one account, even in a tenant-wide investigation.</p>${
        users.length
          ? `<label class="field">Affected account<select id="response-user">${users.map((u) => `<option value="${esc(u.id || u.userPrincipalName)}">${esc(u.userPrincipalName)}</option>`).join("")}</select></label>`
          : `<label class="field">Affected account<input id="response-upn" placeholder="name@company.com" type="text" inputmode="email"></label><p class="form-note">The user inventory was not collected; enter the account exactly.</p>`
      }${btn("respond-user", "Open account workspace →", "primary")}`,
    );
  }
  function runbookPowerShell() {
    return (
      window.TriageContain?.mailboxPowerShell?.() ||
      "Choose an account to prepare the commands."
    );
  }
  function mailboxCard() {
    const upn = responseUser()?.userPrincipalName;
    const snapshots = (ev?.exchangeSnapshots || []).filter(
      (x) => !upn || x.upn?.toLowerCase() === upn.toLowerCase(),
    );
    const snapshot = snapshots.at(-1),
      parts = snapshot?.sources || [];
    const part = (k) => parts.find((x) => x.key === k),
      records = (k) => part(k)?.records || [];
    const rules = records("rules"),
      mb = records("mailbox")[0],
      forwarding = mb?.ForwardingSmtpAddress || mb?.ForwardingAddress;
    const rulesReady = part("rules")?.state === "complete",
      mailReady = part("mailbox")?.state === "complete";
    const risky = rules.filter(
      (r) =>
        r.Enabled !== false &&
        [r.ForwardTo, r.RedirectTo, r.ForwardAsAttachmentTo].some((x) =>
          Array.isArray(x) ? x.length : !!x,
        ),
    );
    return `<section class="panel hour-mailbox section-gap" id="cs-rules"><div class="panel-head"><div><h2>Mailbox rules, forwarding &amp; delegates</h2><p>${snapshot ? "Collected " + esc(fmt(snapshot.capturedAt)) : "No mailbox snapshot for this account"}</p></div>${badge(snapshot ? "imported" : "pending", snapshot ? "Evidence available" : "Not collected")}</div><div class="panel-body">${
      snapshot
        ? `<div class="notice">${rulesReady ? `${risky.length} enabled forwarding / redirect rule(s) to review.` : "Inbox-rule coverage is incomplete."} ${mailReady ? (forwarding ? "Mailbox forwarding is configured." : "Mailbox forwarding is off.") : "Mailbox-forwarding coverage is incomplete."}</div>${risky
            .slice(0, 8)
            .map(
              (r) =>
                `<div class="hour-rule"><h3>${esc(r.Name || r.Identity || "Inbox rule")}</h3><p>${esc(r.Description || "Inspect the original rule for exact conditions.")}</p><p>Destination: ${esc(JSON.stringify([r.ForwardTo, r.RedirectTo, r.ForwardAsAttachmentTo].flat().filter(Boolean)))}</p></div>`,
            )
            .join(
              "",
            )}<p class="form-note">Delegates: ${records("fullAccess").length} full-access record(s), ${records("sendAs").length} send-as record(s). ${parts.some((p) => p.state !== "complete") ? "Some commands did not complete; inspect source errors." : "Inspect original permissions to distinguish expected and unexpected access."}</p>`
        : `<p>Read hidden rules, forwarding, delegates and mailbox audit settings with the desktop app.</p>`
    }<div class="row-actions">${N ? btn("mailbox-collect", busy ? "Collecting…" : "Run local mailbox check", "primary", busy || svc.exchange.state !== "ready" ? "disabled" : "") : ""}${N && svc.exchange.state !== "ready" ? `<span class="form-note">Sign in to Exchange Online on Connect first.</span>` : ""}${!N ? btn("download-mac", "Needs the desktop app →") : ""}${snapshot ? btn("evidence-source", "Inspect original evidence →", "", 'data-source="exchange"') : ""}${btn("phase-note", "Record decision or follow-up")}</div><p class="form-note">Collection is read-only. Mailbox changes currently require the reviewed PowerShell steps below; record their actual outcome in this case.</p><details><summary>Manual Exchange response · PowerShell</summary><p class="form-note">Review the commands and target before running them. These steps run outside this workspace.</p><pre class="raw">${esc(runbookPowerShell())}</pre></details></div></section>`;
  }
  async function collectMailbox() {
    if (!N || busy) throw Error("Finish the current collection first.");
    const current = ev,
      target = responseUser();
    if (!target?.userPrincipalName)
      throw Error("Choose an affected account first.");
    if (svc.exchange.state !== "ready")
      throw Error("Sign in to Exchange Online on Connect first.");
    if (!caseKey) throw Error("Sign in on Connect first.");
    const plan = {
      schema: "limon.triage.plan",
      schemaVersion: 1,
      caseId: caseKey,
      tenantId: ev.tenantId,
      scope: "user",
      upn: target.userPrincipalName,
      sources: ["exchange"],
      window: ev.window || {
        start: new Date(Date.now() - 864e5).toISOString(),
        end: new Date().toISOString(),
      },
      connection: connectionForPlan(),
    };
    log(
      "collection-start",
      "Local mailbox check · " + target.userPrincipalName,
    );
    mailboxJob = plan.caseId;
    cancelling = false;
    busy = true;
    collectionStatus = "Releasing the Exchange Online session…";
    svc.exchange = { ...svc.exchange, state: "collecting" };
    renderChrome();
    try {
      const result = await E.unpack(await N.collect(plan));
      if (
        ev !== current ||
        result.tenantId !== current.tenantId ||
        result.subject?.upn?.toLowerCase() !==
          target.userPrincipalName.toLowerCase() ||
        (target.id &&
          result.subject?.objectId &&
          result.subject.objectId !== target.id)
      )
        throw Error(
          "Mailbox result does not match the selected account and tenant.",
        );
      E.setSource(
        ev,
        "exchange",
        [...(ev.raw.exchange || []), ...(result.raw.exchange || [])],
        {
          ...result.manifest.exchange,
          note: "Preserved mailbox acquisitions; inspect each snapshot and command state.",
        },
      );
      ev.selectedSources = Array.from(
        new Set([...(ev.selectedSources || []), "exchange"]),
      );
      log(
        "source-result",
        "Local mailbox check: " +
          result.manifest.exchange.state +
          " · " +
          target.userPrincipalName,
      );
      if (result.manifest.exchange.state !== "complete")
        message(
          result.manifest.exchange.error ||
            "Mailbox collection has gaps; inspect evidence.",
          true,
        );
    } catch (error) {
      log("collection-error", "Local mailbox check: " + error.message);
      throw error;
    } finally {
      mailboxJob = null;
      busy = false;
      await refreshSessions().catch(() => {});
      await analyze();
      touch();
      render();
      // The embedded runbook keeps its own copy of the mailbox card; refresh it in place.
      const card = document.getElementById("cs-rules");
      if (card && card.closest("#screen-contain"))
        card.outerHTML = mailboxCard();
      if (route.step === "respond")
        TriageFirstHour.arrange(
          M.phases.some((p) => p.id === route.tab) ? route.tab : "preserve",
        );
    }
  }
  function phaseNote() {
    const phase = M.phases.find((p) => p.id === route.tab) || M.phases[0];
    dialog(
      "Record a decision · " + phase.title,
      `<form id="outcome-form"><label class="field">Outcome<select name="outcome"><option value="in-progress">In progress</option><option value="verified">Reviewed by analyst</option><option value="exception">Needs follow-up</option><option value="pending">Pending</option></select></label><label class="field">Decision, reason and next owner<textarea name="detail" required></textarea></label><label class="field">Evidence reference<input name="reference" placeholder="e.g. exchange:1"></label><p class="form-note">An analyst review is not proof that a response action executed.</p>${btn("record-outcome", "Add to action log", "primary")}</form>`,
    );
    restoreDrafts();
  }
  document.addEventListener("triage:response-rendered", () => {
    if (route.step === "respond")
      TriageFirstHour.arrange(
        M.phases.some((p) => p.id === route.tab) ? route.tab : "preserve",
      );
  });
  document.addEventListener("triage:containment-log", (e) => {
    if (ev && e.detail.caseId === ev.caseId) {
      // A preview only shows the runbook; it is not a response event.
      if (window.TriageContain?.preview) return;
      M.append(
        ev,
        e.detail.step === "start" ? "response-connect" : "response-result",
        e.detail.action + ": " + e.detail.detail,
        e.detail.by,
        { state: e.detail.result, phase: route.tab || "contain" },
      );
      touch();
      if ($("#hour-events"))
        $("#hour-events").innerHTML = ev.actionLog
          .slice(-6)
          .reverse()
          .map(logRow)
          .join("");
    }
  });
  // The runbook engine calls back into the workspace for navigation and the account-check connection.
  window.TriageWorkspace = {
    mailboxCard,
    connect: () => connectResponse().catch((e) => message(e.message, true)),
  };
  window.TriageApp = {
    containSearch: () => {
      responseTarget = null;
      window.TriageContain?.reset?.();
      navigate({ step: "respond", tab: "contain" });
    },
    triageFor: () => navigate({ step: "review", tab: "evidence" }),
    showScreen: () => navigate({ step: "review", tab: "findings" }),
  };
  // ---------------------------------------------------------------- Hand over
  function viewHandover() {
    const progress = M.reviewProgress(ev, findings);
    const unreviewed = progress.outstanding;
    const phaseProgress = M.phaseProgress(ev);
    const phases = phaseProgress.resolved;
    const handover = M.handoverRecord(ev);
    const c = collectionCoverage(),
      gaps = c.scope.filter((s) => s.displayState !== "complete");
    const armed = !!window.TriageContain?.armed && responseReady();
    const exportedAt = (type) =>
      (ev.actionLog || []).findLast((e) => e.type === type);
    const check = (title, detail, action, mark) =>
      `<div class="hour-check"><div class="who"><span class="checkmark ${mark === "ok" ? "ok" : mark === "warn" ? "warn" : ""}">${mark === "ok" ? "✓" : mark === "warn" ? "!" : ""}</span><div><h3>${title}</h3><p>${detail}</p></div></div><div class="row-actions">${action || ""}</div></div>`;
    const exp = (name, sub, action, logType) => {
      const done = exportedAt(logType);
      return check(
        name,
        sub +
          (done
            ? ` · <span style="color:var(--green)">✓ ${N ? "saved" : "downloaded"} ${esc(fmt(done.at))}</span>`
            : ""),
        btn(
          action,
          done ? "Export again" : N ? "Save" : "Download",
          "",
        ),
        done ? "ok" : "",
      );
    };
    return (
      head(
        stepEyebrow(7, "Hand over"),
        "Every decision has a place.",
        "What the next owner gets, and what is still open. Sending happens outside this workspace.",
        btn("next-investigation", "Start next investigation →", "text-button"),
      ) +
      `<div class="grid-2"><div class="stack">${panel(
        "Handover checklist",
        `${check(`${findings.length} signals · ${progress.resolved} resolved`, unreviewed ? `${unreviewed} outstanding, including ${progress.investigating} investigating — retained in the handover.` : findings.length ? "Every current finding has a resolved decision and a reason." : "No signals were produced; inspect source coverage before drawing conclusions.", unreviewed ? btn("review-unreviewed", "Review them") : "", unreviewed || !findings.length ? "warn" : "ok")}${check(`First 60 minutes · ${phases} / 5 phases`, phases === 5 ? `Every phase has an analyst review or documented exception${phaseProgress.exceptions ? "; " + phaseProgress.exceptions + " need follow-up" : ""}; this does not verify action execution.` : "Pending and in-progress phases remain outstanding.", phases === 5 ? "" : stepBtn("respond", "Open Respond", "", "preserve"), phases === 5 && !phaseProgress.exceptions ? "ok" : "warn")}${check(gaps.length ? `${gaps.length} source${gaps.length > 1 ? "s" : ""} incomplete` : "Every selected source completed", gaps.length ? esc(gaps.map((g) => g.label).join(", ")) + " — recorded as gaps." : "Coverage is complete for the selected plan.", gaps.length ? stepBtn("review", "Inspect", "", "evidence") : "", gaps.length ? "warn" : "ok")}${check(armed ? "Containment is still armed" : "Containment not armed", armed ? "Disarm before handing over; the next owner arms their own session." : "No response action is armed in this workspace.", armed ? stepBtn("respond", "Open Respond", "", "contain") : "", armed ? "warn" : "ok")}`,
        "What the next owner needs to know",
      )}${panel("Record the handover", `<div class="panel-body">${handover ? `<div class="notice good"><strong>Handover recorded</strong><p>${esc(handover.recipient)} · ${esc(handover.channel)} · ${esc(fmt(handover.at))}</p><p>Analyst-authored record. Recipient acceptance is not verified.</p></div>` : `<div class="notice">${exportedAt("handover-exported") ? "Note exported · handover not recorded." : "Preparing or exporting files does not transfer ownership."}</div>`}<form id="handover-form"><label class="field">Next owner or team<input name="recipient" maxlength="500" required></label><label class="field">Channel or ticket reference<input name="channel" maxlength="500" placeholder="Incident ticket, call or approved channel" required></label><label class="field">What was handed over and the next action<textarea name="detail" required></textarea></label><p class="form-note">Record a handover made outside this workspace. Outstanding findings, phases and evidence gaps are included automatically. This sends no message.</p>${btn("record-handover", "Record handover", "primary", armed ? "disabled" : "")}</form></div>`, "Owner, time and outstanding work remain with the case")}${panel("Exports", `${exp("Case file", "JSON, integrity-checked · raw records, coverage, reviews, action log", "export", "case-exported")}${exp("Handover", "Markdown for the ticket · assessment, decisions, outstanding work", "handover", "handover-exported")}${exp("Action log", "CSV · every collection event, review and response result", "export-log", "log-exported")}`, "History is retained in the exported case")}<div class="row-actions">${stepBtn("respond", "← Respond", "text-button", "preserve")}</div></div>${panel(
        "Action log",
        `${(ev.actionLog || []).slice().reverse().map(logRow).join("") || empty("No recorded actions", "Add a note or record a runbook outcome.")}<form id="note-form" class="panel-body section-gap"><label class="field">Add a case note<textarea name="note" placeholder="Record the facts, owner and next action." required></textarea></label>${btn("add-note", "Add note")}<p class="form-note">Notes are analyst-authored records. Case hashes detect file changes; they do not authenticate the author or prove the outcome.</p></form>`,
        "Collection events, analyst reviews, response outcomes and notes in one chronology",
      )}</div>`
    );
  }
  // ---------------------------------------------------------------- Help
  function viewGuide() {
    return (
      head(
        "HELP",
        "How Triage works.",
        "Seven steps, one case. What each step needs, what it never does, and where the coverage limits are.",
      ) +
      `<div class="grid-2">${panel(
        "The seven steps",
        `<div class="panel-body">${runStep(1, "Start", "New investigation, open a case, or practise on the sample.")}${runStep(2, "Connect", "Connect required services. The web uses your browser session; the desktop app retains Graph and Exchange sessions until collection. Azure and response permissions can need an additional sign-in.")}${runStep(3, "Scope", "One account or the whole tenant, the window, and an evidence preset. A plan saved on the website opens in the app.")}${runStep(4, "Collect", "Progress and gaps on one screen. Stop keeps what was returned. Review opens by itself.")}${runStep(5, "Review", "Overview, findings, timeline and evidence. Findings and records open in a drawer; Back closes it.")}${runStep(6, "Respond", "The first 60 minutes in five phases. Arming containment asks for write permissions once, and says so first.")}${runStep(7, "Hand over", "Checklist, exports and the complete action log. Sending happens outside this workspace.")}</div>`,
      )}${panel(
        "Your evidence",
        `<div class="panel-body"><p class="subtitle">The case saves itself on this ${N ? "computer (evidence folder)" : "device (browser storage)"} while you work. Export a case file to move between the desktop app and the web viewer; import it on Start. Nothing is uploaded. Team upload is not configured in this beta.</p><div class="notice">Local validation does not establish live-tenant collection success. Native builds are development builds; signing and Windows acceptance are recorded separately in the validation guide.</div><p><a href="docs/USER-GUIDE.md" target="_blank" rel="noopener">User guide</a> · <a href="docs/COLLECTOR.md" target="_blank" rel="noopener">Collector and permission guide</a> · <a href="docs/VALIDATION.md" target="_blank" rel="noopener">Validation record</a></p><p class="muted">Collection design: <a href="https://github.com/invictus-ir/Microsoft-Extractor-Suite" target="_blank" rel="noopener">Microsoft-Extractor-Suite</a>. Analysis adaptations: <a href="https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite" target="_blank" rel="noopener">Microsoft-Analyzer-Suite</a>.</p><label class="check"><input type="checkbox" name="autosave" ${settings.autosave ? "checked" : ""}><span>Save the open case automatically on this ${N ? "computer" : "device"}<small>Turn off to keep a case only in this window until you save or export it.</small></span></label>${btn("clear-saved", "Remove every case saved on this " + (N ? "computer" : "device"), "text-button")}</div>`,
      )}</div>${whatsNew()}<div class="section-gap">${window.TriageCoverage.render(esc)}</div>`
    );
  }
  // What changed, by build: every change to the beta is visible here and in the footer.
  function whatsNew() {
    const entries = (window.BETA_CHANGELOG || []).slice(0, 6);
    if (!entries.length) return "";
    return panel(
      "What's new · build " + esc(window.BETA_BUILD),
      `<div class="panel-body">${entries
        .map(
          (e) =>
            `<section class="notice"><strong>Build ${esc(e.build)} · ${esc(e.date)} · ${esc(e.title)}</strong><ul>${(e.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>`,
        )
        .join(
          "",
        )}<p class="form-note">The badge in the sidebar and the footer show the build you are running; the full history is in <code>BETA/js/build.js</code>.</p></div>`,
      "Each build number is one committed change",
    );
  }
  // ---------------------------------------------------------------- render
  function render() {
    guard();
    renderChrome();
    // The runbook node must survive the main re-render.
    const responseNode = $("#screen-contain");
    if ($("#main").contains(responseNode)) $("#main").after(responseNode);
    const views = {
      start: viewStart,
      newcase: viewNewCase,
      connect: viewConnect,
      scope: viewScope,
      collect: viewCollect,
      review: viewReview,
      respond: viewRespond,
      handover: viewHandover,
      guide: viewGuide,
    };
    const view =
      route.step === "newcase" && !ev
        ? viewStart
        : views[route.step] || viewStart;
    $("#main").innerHTML = view();
    restoreDrafts();
    mountRunbook();
    document.title =
      "Triage · " +
      (STEPS.find((s) => s[0] === route.step)?.[1] ||
        (route.step === "guide" ? "Help" : "Start"));
    rememberRoute();
  }
  // ---------------------------------------------------------------- cases
  async function openCase(value, type = "imported", quiet = false) {
    if (busy)
      throw Error("Finish or stop the collection before opening another case.");
    const current = M.init(value);
    openWorkspace(current);
    jobMessages = [];
    collectionStatus = "";
    if (!quiet)
      log(
        "case-opened",
        type === "sample"
          ? "Opened fictional sample evidence."
          : "Opened evidence for local analysis.",
      );
    navigate({ step: "review", tab: "overview", caseId: current.caseId });
    await analyze();
    if (ev === current) {
      touch();
      render();
    }
  }
  async function importFiles(files) {
    if (busy)
      throw Error("Finish or stop the collection before opening another case.");
    if (!files.length) return;
    if ([...files].reduce((n, f) => n + f.size, 0) > 250 * 1024 * 1024)
      throw Error("Choose up to 250 MB of evidence per import.");
    closeDialog();
    await openCase(await BETA_Import.ingest(files));
  }
  function download(name, text, type = "application/json") {
    const blob = new Blob([text], { type }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function exportCase() {
    if (!ev) throw Error("Open a case first.");
    log("case-exported", "Prepared an integrity-checked case export.");
    const bundle = await E.bundle(ev);
    download("triage-" + ev.caseId + ".json", JSON.stringify(bundle, null, 2));
    render();
  }
  async function openCaseDialog() {
    const saved = N
      ? await N.listCases()
      : await TriageJournal.list().catch(() => []);
    saved.sort((x, y) => String(y.savedAt).localeCompare(String(x.savedAt)));
    dialog(
      "Open a case",
      `<div class="row-actions">${btn("import", "Choose a case file…", "primary")}<span class="form-note">Case files (.json) and supported raw exports (.csv, .jsonl). Integrity-checked before analysis.</span></div><h3 class="section-gap">Saved on this ${N ? "computer" : "device"}</h3>${
        saved
          .map(
            (c) =>
              `<div class="log-row"><time>${esc(fmt(c.savedAt))}</time><div><strong>${esc(c.subject || c.tenantName || c.caseId)}</strong><span>${esc(c.scope === "user" ? "One account" : "Whole tenant")} · ${esc(c.tenantName || "")} · ${esc(c.caseId.slice(0, 8))}</span><div class="row-actions">${btn("load-case", "Open", "primary", `data-case-id="${esc(c.caseId)}"`)}${btn("remove-case", "Remove", "text-button", `data-case-id="${esc(c.caseId)}"`)}</div></div></div>`,
          )
          .join("") ||
        '<p class="form-note">No saved cases yet. A case saves itself while you work.</p>'
      }`,
    );
  }
  async function loadSavedCase(id) {
    const b = N ? await N.loadCase(id) : await TriageJournal.open(id);
    if (!b)
      throw Error(
        "That saved case is no longer on this " +
          (N ? "computer" : "device") +
          ".",
      );
    closeDialog();
    await openCase(await E.unpack(b), "saved", true);
    saveState = { at: b.exportedAt || "", dirty: false, error: "" };
    renderCasebar();
  }
  async function finishAndReset(next = "start") {
    if (busy) throw Error("Finish or stop the collection first.");
    if (ev && !ev.demo && !LOCAL && settings.autosave) {
      clearTimeout(saveTimer);
      await autosave();
    }
    window.TriageContain?.reset?.();
    drafts.clear();
    ev = null;
    findings = [];
    jobMessages = [];
    collectionStatus = "";
    responseTarget = null;
    responseSession = { state: "idle" };
    saveState = { at: "", dirty: false, error: "" };
    settings.upn = "";
    openedPlan = null;
    caseKey = null;
    try {
      sessionStorage.removeItem(ROUTE_KEY);
    } catch {}
    closeDialog();
    navigate({ step: next });
  }
  async function startInvestigation() {
    if (ev) {
      navigate({ step: "newcase" });
      return;
    }
    if (N && !caseKey) caseKey = crypto.randomUUID();
    navigate({ step: connected() ? "scope" : "connect" });
  }
  // ---------------------------------------------------------------- actions
  async function handle(action, target) {
    if (N && action.startsWith("customer-")) {
      try {
        await customerAction(action, target);
      } catch (error) {
        const alert = $("#customer-error");
        if (alert) {
          alert.hidden = false;
          alert.textContent = error.message;
        } else throw error;
      }
      return;
    }
    switch (action) {
      case "new-investigation":
        await startInvestigation();
        break;
      case "open-case":
        await openCaseDialog();
        break;
      case "import":
        $("#import-files").click();
        break;
      case "demo":
        if (busy) throw Error("Finish collection before opening a sample.");
        closeDialog();
        await openCase(
          E.ensure({
            ...BETA_Demo.evidence(),
            tenantName: "Contoso · demonstration",
            tenantId: "demo",
            window: {
              start: "2026-07-01T00:00:00Z",
              end: "2026-07-31T23:59:59Z",
            },
          }),
          "sample",
        );
        break;
      case "load-case":
        await loadSavedCase(target.dataset.caseId);
        break;
      case "remove-case":
        if (N) await N.clearCase(target.dataset.caseId);
        else await TriageJournal.remove(target.dataset.caseId);
        if (lastSaved?.caseId === target.dataset.caseId) lastSaved = null;
        message(
          "Saved case removed from this " + (N ? "computer" : "device") + ".",
        );
        await openCaseDialog();
        break;
      case "clear-saved":
        if (N) await N.clearCase();
        else await TriageJournal.clear();
        lastSaved = null;
        message(
          "Saved cases removed from this " +
            (N ? "computer" : "device") +
            ". The open case remains in this window.",
        );
        break;
      case "new":
        if (busy)
          throw Error("Finish collection before starting another case.");
        navigate({ step: "newcase" });
        break;
      case "confirm-new":
        await finishAndReset(
          N || connected() ? (connected() ? "scope" : "connect") : "connect",
        );
        if (N && !caseKey) caseKey = crypto.randomUUID();
        if (connected())
          message("Previous case saved. Ready for a new investigation.");
        break;
      case "next-investigation":
        await finishAndReset("start");
        break;
      case "export":
        await exportCase();
        break;
      case "save":
        await saveNow();
        message(
          N
            ? "Case saved to " + evidenceFolder + "/saved-cases"
            : "Case saved on this device (one file per case; earlier saved cases are kept).",
        );
        break;
      case "evidence-folder": {
        saveDrafts();
        const result = await N.chooseEvidenceFolder();
        evidenceFolder = result.folder;
        if (!result.cancelled && ev) await saveNow();
        render();
        if (!result.cancelled)
          message(
            "Evidence folder: " +
              evidenceFolder +
              (ev
                ? ". Current case saved there."
                : ". New collections will save here."),
          );
        break;
      }
      case "evidence-open":
        await N.openEvidenceFolder();
        break;
      case "browser-view":
        if (!ev) throw Error("Open or collect a case first.");
        await N.openBrowser(await E.bundle(ev));
        message(
          "Opened a private local viewer. Keep the app running while reviewing.",
        );
        break;
      case "download-mac":
      case "download-win": {
        const file =
          action === "download-mac"
            ? "Triage-macOS-arm64.zip"
            : "Triage-Windows-x64.zip";
        const url = "downloads/" + file;
        const response = await fetch(url, { method: "HEAD" });
        if (!response.ok)
          throw Error(
            "This deployment has no packaged download yet. See the collector build guide.",
          );
        const a = document.createElement("a");
        a.href = url;
        a.download = file;
        a.click();
        break;
      }
      case "app-help":
        dialog(
          "macOS · blocked on first launch?",
          `<p>If macOS blocks the Triage download because of quarantine, move the extracted <strong>Triage.app</strong> to <strong>Applications</strong>, then run in Terminal:</p><pre class="command"><code>xattr -dr com.apple.quarantine "/Applications/Triage.app"
open "/Applications/Triage.app"</code></pre><p class="form-note">This removes only the app's download-quarantine flag. macOS builds are locally signed development builds, not Apple-notarized; Windows builds are unsigned. You can also use <a href="https://support.apple.com/en-us/102445" target="_blank" rel="noopener">Privacy &amp; Security → Open Anyway</a> when available.</p>`,
        );
        break;
      case "help":
        closeDialog();
        navigate({ step: "guide" });
        break;
      case "signin":
        if (LOCAL) {
          navigate({ step: "guide" });
          break;
        }
        if (connected())
          confirmDialog(
            "Disconnect?",
            `<p class="subtitle">Signs out of ${esc(N ? svc.graph.account || svc.exchange.account || "the desktop sessions" : G.account?.username || "")}. An open case stays saved; collecting again means signing in again on Connect.</p>`,
            "Disconnect",
            "disconnect-confirm",
          );
        else navigate({ step: "connect" });
        break;
      case "disconnect-confirm":
        closeDialog();
        await disconnectAll("connect");
        break;
      case "disconnect":
        await disconnectAll("connect");
        break;
      case "resolve-tenant":
        settings.domain = $("[name=domain]")?.value ?? settings.domain;
        await resolveTenant();
        break;
      case "signin-service":
        await signInService(target.dataset.service);
        break;
      case "cancel-signin":
        await cancelSignIn(target.dataset.service);
        break;
      case "signout-service":
        if (busy) throw Error("Finish or stop the collection first.");
        await N.cancelConnect({ service: target.dataset.service });
        svc[target.dataset.service] = { state: "idle" };
        render();
        break;
      case "preflight":
        await checkReadiness(true);
        break;
      case "pick-account":
        settings.upn = target.dataset.upn;
        suggestions = suggestions.filter(
          (u) => u.userPrincipalName === settings.upn,
        );
        remember();
        render();
        break;
      case "sources-all":
      case "sources-none":
        for (const input of document.querySelectorAll(
          "#scope-form input[name=source]:not(:disabled)",
        ))
          input.checked = action === "sources-all";
        readScopeForm();
        render();
        break;
      case "start-collection":
        // A new collection opens a new case; say so when one is already open (it stays saved).
        if (ev && !busy) {
          readScopeForm();
          confirmDialog(
            "Start a new collection?",
            `<p class="subtitle">The open case <strong>${esc(ev.subject?.upn || ev.tenantName || ev.caseId.slice(0, 8))}</strong> ${ev.demo ? "is the sample and will be discarded" : "stays saved on this " + (N ? "computer" : "device") + " under Open a case"}. The new collection opens as its own case.</p>`,
            "Start collection",
            "start-collection-confirm",
            "primary",
          );
          break;
        }
        if (N) await nativeCollect();
        else await webCollect();
        break;
      case "start-collection-confirm":
        closeDialog();
        if (ev && !ev.demo && !LOCAL && settings.autosave) {
          clearTimeout(saveTimer);
          await autosave();
        }
        if (N) await nativeCollect();
        else await webCollect();
        break;
      case "resume":
        await webCollect(true);
        break;
      case "export-plan": {
        const plan = makePlan();
        download(
          "triage-plan-" + plan.caseId + ".json",
          JSON.stringify(plan, null, 2),
        );
        log("plan-exported", "Prepared a desktop collection plan.");
        message(
          "Collection plan saved. In the desktop app: Triage → Open collection plan…",
        );
        break;
      }
      case "cancel":
        if (!busy) break;
        cancelling = true;
        collectionStatus =
          "Cancelling collection; preserving returned evidence…";
        refreshCollection();
        if (N) await N.cancel();
        else controller?.abort();
        message("Cancellation requested. Collected evidence is retained.");
        break;
      case "source":
      case "evidence-source":
        if (busy) {
          message("Records open in Review when collection ends.");
          break;
        }
        closeDialog();
        offset = 0;
        navigate({
          step: "review",
          tab: "evidence",
          s: target.dataset.source,
          caseId: ev?.caseId,
        });
        $("#source-" + target.dataset.source)?.scrollIntoView({
          block: "start",
        });
        break;
      case "toggle-source":
        offset = 0;
        navigate(
          {
            ...route,
            s: route.s === target.dataset.source ? "" : target.dataset.source,
            r: "",
          },
          true,
        );
        break;
      case "open-finding":
        saveDrafts();
        navigate({
          ...route,
          step: "review",
          tab: "findings",
          f: target.dataset.finding,
          r: "",
        });
        if (matchMedia("(max-width: 900px)").matches) $(".drawer")?.scrollIntoView({ block: "start" });
        break;
      case "attach-reference": {
        const form = $("#review-form");
        if (form && M.ref(ev, target.dataset.ref)) {
          form.elements.reference.value = target.dataset.ref;
          saveDrafts();
          render();
          message("Supporting evidence reference attached.");
        }
        break;
      }
      case "reference-page":
        saveDrafts();
        referencePages.set(route.f, Math.max(0, Number(target.dataset.offset) || 0));
        render();
        break;
      case "toggle-steps":
        stepsOpen = !stepsOpen;
        renderRail();
        break;
      case "open-record":
        closeDialog();
        navigate({
          ...route,
          step: "review",
          tab: route.step === "review" ? route.tab : "evidence",
          r: target.dataset.ref,
        });
        break;
      case "record": {
        if (route.step === "review") {
          navigate({ ...route, r: target.dataset.ref });
          break;
        }
        const r = M.ref(ev, target.dataset.ref);
        if (!r) throw Error("Evidence record not found.");
        dialog(
          "Evidence · " + target.dataset.ref,
          `<p class="muted">Use <strong>${esc(target.dataset.ref)}</strong> when recording a review or runbook outcome.</p>${recordFacts(r)}<details><summary>Original JSON</summary><pre class="raw">${esc(JSON.stringify(r, null, 2))}</pre></details>`,
        );
        break;
      }
      case "back-to-finding":
        navigate({ ...route, r: "" });
        break;
      case "close-drawer":
        saveDrafts();
        navigate({ ...route, f: "", r: "" });
        break;
      case "clear-state-filter":
        navigate({ ...route, state: "" });
        break;
      case "contain-account": {
        const upn = target.dataset.upn;
        if (ev.subject?.upn?.toLowerCase() !== upn.toLowerCase()) {
          const u = (ev.users || []).find(
            (x) => x.userPrincipalName?.toLowerCase() === upn.toLowerCase(),
          );
          responseTarget = { id: u?.id || "", userPrincipalName: upn };
          window.TriageContain?.reset?.();
        }
        saveDrafts();
        navigate({ step: "respond", tab: "contain", caseId: ev.caseId });
        break;
      }
      case "previous":
        offset = Math.max(0, offset - 40);
        render();
        break;
      case "next":
        offset += 40;
        render();
        break;
      case "review": {
        const f = $("#review-form");
        if (!validateReview(f, true)) break;
        M.review(
          ev,
          f.dataset.id,
          f.elements.state.value,
          f.elements.note.value,
          f.elements.reference.value.trim(),
          actor(),
        );
        drafts.delete("review:" + f.dataset.id);
        touch();
        render();
        message("Finding review recorded.");
        break;
      }
      case "respond":
        await connectResponse();
        break;
      case "choose-account":
        chooseAccount();
        break;
      case "respond-user": {
        const select = $("#response-user"),
          typed = $("#response-upn")?.value.trim();
        const u = select
          ? (ev.users || []).find(
              (x) => (x.id || x.userPrincipalName) === select.value,
            )
          : typed
            ? { id: "", userPrincipalName: typed }
            : null;
        if (!u?.userPrincipalName) throw Error("Select an account.");
        responseTarget = {
          id: u.id || "",
          userPrincipalName: u.userPrincipalName,
        };
        window.TriageContain?.reset?.();
        log("note", "Affected account for response: " + u.userPrincipalName);
        closeDialog();
        navigate({
          step: "respond",
          tab: route.step === "respond" ? route.tab : "contain",
          caseId: ev.caseId,
        });
        break;
      }
      case "mailbox-collect":
        await collectMailbox();
        break;
      case "phase-note":
        phaseNote();
        break;
      case "record-outcome": {
        const f = $("#outcome-form");
        M.outcome(
          ev,
          M.phases.some((p) => p.id === route.tab) ? route.tab : "preserve",
          f.elements.outcome.value,
          f.elements.detail.value,
          f.elements.reference.value.trim(),
          actor(),
        );
        drafts.delete(draftKey("outcome-form"));
        touch();
        closeDialog();
        render();
        message("Outcome added to the action log.");
        break;
      }
      case "record-handover": {
        if (busy) throw Error("Finish or stop collection before recording a handover.");
        if (window.TriageContain?.armed && responseReady()) throw Error("Disarm containment before recording the handover.");
        const form = $("#handover-form");
        if (!form.reportValidity()) break;
        const reviews = M.reviewProgress(ev, findings), phases = M.phaseProgress(ev);
        M.recordHandover(ev, form.elements.recipient.value, form.elements.channel.value,
          `${form.elements.detail.value.trim()} Outstanding at handover: ${reviews.outstanding} findings, ${collectionCoverage().gaps} evidence gaps, ${phases.total - phases.resolved} unresolved response phases; ${phases.exceptions} phase exceptions need follow-up.`, actor());
        drafts.delete(draftKey("handover-form"));
        touch();
        render();
        message("Handover recorded. No message was sent; recipient acceptance is not verified.");
        break;
      }
      case "add-note": {
        const text = $("#note-form").elements.note.value.trim();
        if (!text) throw Error("Write the note first.");
        log("note", text);
        drafts.delete(draftKey("note-form"));
        render();
        message("Case note recorded.");
        break;
      }
      case "export-log":
        log("log-exported", "Exported the action log as CSV.");
        download(
          "triage-action-log-" + ev.caseId.slice(0, 8) + ".csv",
          M.csv(ev),
          "text/csv;charset=utf-8",
        );
        render();
        break;
      case "handover":
        log("handover-exported", "Exported the Markdown handover.");
        download(
          "triage-handover-" + ev.caseId.slice(0, 8) + ".md",
          M.handover(ev, findings),
          "text/markdown",
        );
        render();
        break;
      case "review-unreviewed":
        navigate({
          step: "review",
          tab: "findings",
          state: "unreviewed",
          caseId: ev.caseId,
        });
        break;
      case "close-dialog":
        closeDialog();
        break;
    }
  }
  // A running collection lives only in this page: warn before a reload/close abandons it.
  // Warn only when leaving would lose something: a running collection, or a change not yet saved.
  window.addEventListener("beforeunload", (e) => {
    const unsaved =
      !!ev && !ev.demo && !LOCAL && (saveState.dirty || !settings.autosave);
    if (!busy && !unsaved) return;
    e.preventDefault();
    e.returnValue = "";
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (
      !b ||
      (b.closest("#screen-contain") && !b.dataset.action && !b.dataset.step)
    )
      return;
    if (b.dataset.action || b.dataset.step) e.preventDefault();
    try {
      if (b.dataset.step) {
        if (b.getAttribute("aria-disabled") === "true") {
          message(b.title || "Not available yet.");
          return;
        }
        saveDrafts();
        readScopeForm();
        offset = 0;
        const step = b.dataset.step;
        stepsOpen = false;
        const tab =
          b.dataset.tab ||
          (step === "review"
            ? "overview"
            : step === "respond"
              ? "preserve"
              : "");
        if (step === "start" && ev && !busy) navigate({ step: "start" });
        else navigate({ step, tab, caseId: ev?.caseId });
        return;
      }
      if (b.dataset.action) await handle(b.dataset.action, b);
    } catch (error) {
      message(error.message, true);
    }
  });
  document.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (stepsOpen) {
      stepsOpen = false;
      renderRail();
      $("#workflow-toggle")?.focus();
      return;
    }
    if ($("#detail").open || $("#confirmModal")?.classList.contains("open"))
      return;
    if (route.f || route.r) {
      e.preventDefault();
      saveDrafts();
      navigate({ ...route, f: "", r: "" });
    }
  });
  document.addEventListener("change", (e) => {
    const reviewForm = e.target.closest("#review-form");
    if (reviewForm)
      drafts.set(
        "review:" + reviewForm.dataset.id,
        Object.fromEntries(new FormData(reviewForm)),
      );
    if (reviewForm?.dataset.validation) validateReview(reviewForm);
    if (e.target.name === "connection") {
      settings.signAs = e.target.value;
      settings.tenant = null;
      remember();
      render();
    }
    if (e.target.name === "tenantMode") {
      settings.tenantMode = e.target.value;
      remember();
      render();
    }
    if (e.target.name === "mail") {
      settings.mail = e.target.checked;
      remember();
    }
    if (e.target.name === "autosave") {
      settings.autosave = e.target.checked;
      remember();
      if (settings.autosave) touch();
      renderCasebar();
    }
    if (e.target.closest("#scope-form")) {
      readScopeForm();
      if (["scope", "preset", "source"].includes(e.target.name)) render();
    }
    if (e.target.id === "severity") {
      severity = e.target.value;
      offset = 0;
      render();
    }
  });
  document.addEventListener("input", (e) => {
    const reviewForm = e.target.closest("#review-form");
    if (reviewForm)
      drafts.set(
        "review:" + reviewForm.dataset.id,
        Object.fromEntries(new FormData(reviewForm)),
      );
    if (reviewForm?.dataset.validation) validateReview(reviewForm);
    if (e.target.name === "domain") {
      settings.domain = e.target.value;
      remember();
      // An edited domain is no longer the resolved tenant: the sign-in buttons wait for a new lookup.
      if (
        settings.tenant &&
        settings.tenant.domain !== settings.domain.trim().toLowerCase()
      ) {
        settings.tenant = null;
        const position = e.target.selectionStart;
        render();
        const again = $("[name=domain]");
        again?.focus();
        try {
          again?.setSelectionRange(position, position);
        } catch {}
      }
    }
    if (e.target.matches("#scope-form [name=upn]")) {
      settings.upn = e.target.value.trim();
      remember();
      clearTimeout(lookupTimer);
      lookupTimer = setTimeout(async () => {
        const q = settings.upn.toLowerCase();
        await lookupAccounts(q);
        if (
          route.step === "scope" &&
          $("#scope-form [name=upn]")?.value.trim().toLowerCase() === q
        ) {
          const input = $("#scope-form [name=upn]");
          const position = input.selectionStart;
          render();
          const again = $("#scope-form [name=upn]");
          again?.focus();
          try {
            again?.setSelectionRange(position, position);
          } catch {}
        }
      }, 350);
    }
    if (e.target.id === "finding-filter") {
      filter = e.target.value;
      offset = 0;
      const position = e.target.selectionStart;
      render();
      const input = $("#finding-filter");
      input.focus();
      input.setSelectionRange(position, position);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[name=domain]")) {
      e.preventDefault();
      handle("resolve-tenant", e.target).catch((error) =>
        message(error.message, true),
      );
    }
  });
  $("#import-files").addEventListener("change", async (e) => {
    try {
      await importFiles(e.target.files);
    } catch (error) {
      message(error.message, true);
    } finally {
      e.target.value = "";
    }
  });
  setInterval(() => {
    for (const el of document.querySelectorAll("[data-elapsed]")) {
      const key = el.dataset.elapsed;
      const since =
        key === "response" ? responseSession.since : svc[key]?.since;
      if (since) el.textContent = elapsed(since);
    }
  }, 1000);
  // ---------------------------------------------------------------- customer profiles (desktop)
  function profileForm(values = {}) {
    certificateChoice = null;
    dialog(
      "Existing customer registration",
      `<form id="customer-form"><p class="subtitle">Use the IDs from Connect-Customer or import the wizard’s profile.json. Choose the PFX separately. For separate service certificates, create separate profiles and collect the relevant service.</p><p class="dialog-notification" id="customer-error" role="alert" hidden></p>${[
        ["name", "Customer name"],
        ["tenantId", "Tenant ID"],
        ["graphAppId", "Graph application ID (optional)"],
        ["exchangeAppId", "Exchange application ID (optional)"],
        ["organization", "Original Exchange domain · tenant.onmicrosoft.com"],
      ]
        .map(
          ([key, text]) =>
            `<label class="field">${text}<input name="${key}" value="${esc(values[key] || "")}" maxlength="254"></label>`,
        )
        .join(
          "",
        )}<div class="row-actions">${btn("customer-import", "Import registration IDs")}${btn("customer-certificate", "Choose PFX certificate")}</div><p id="certificate-selection" class="form-note">No certificate selected</p><label class="field">PFX password<input name="password" type="password" autocomplete="new-password" maxlength="4096"></label><p class="form-note">The private certificate and password are encrypted using this computer’s operating-system protection. They are never included in evidence, exports or collection plans.</p>${btn("customer-save", "Validate certificate & save", "primary")}</form>`,
    );
  }
  async function customerAction(action, target) {
    if (action === "customer-manage") {
      customerProfiles = await N.profiles();
      dialog(
        "Customer connections",
        `<p class="subtitle">Local PowerShell connections · choose a customer certificate or keep delegated passkey sign-in.</p><div class="row-actions">${btn("customer-add", "Use existing registration", "primary")}${btn("customer-wizard", "Create registrations…")}</div>${customerProfiles.map((p) => `<section class="notice"><strong>${esc(p.name)}</strong><p>${esc(p.tenantId)}<br>Certificate expires ${esc(fmt(p.certificate.expiresAt))}<br>Graph: ${esc(p.graphAppId || "Not configured")}<br>Exchange: ${esc(p.exchangeAppId || "Not configured")}</p>${btn("customer-remove", "Remove local profile", "text-button", `data-id="${esc(p.id)}"`)}</section>`).join("") || '<p class="form-note">No saved customer profiles yet.</p>'}`,
      );
    } else if (action === "customer-add") profileForm();
    else if (action === "customer-import") {
      const value = await N.importProfile();
      if (value) profileForm(value);
    } else if (action === "customer-certificate") {
      const value = await N.chooseCertificate();
      if (value) {
        certificateChoice = value;
        $("#certificate-selection").textContent = value.name;
      }
    } else if (action === "customer-remove") {
      await N.removeProfile(target.dataset.id);
      if (settings.signAs === target.dataset.id) settings.signAs = "delegated";
      remember();
      await customerAction("customer-manage");
      render();
    } else if (action === "customer-save") {
      const f = $("#customer-form"),
        data = Object.fromEntries(new FormData(f));
      data.certificateToken = certificateChoice?.token;
      target.disabled = true;
      try {
        const saved = await N.saveProfile(data);
        customerProfiles = await N.profiles();
        settings.signAs = saved.id;
        settings.tenant = null;
        remember();
        closeDialog();
        render();
        message(
          "Customer certificate validated and saved locally. Sign in on Connect to verify service permissions.",
        );
      } finally {
        f.elements.password.value = "";
        data.password = "";
        target.disabled = false;
      }
    } else if (action === "customer-wizard") {
      dialog(
        "Create customer registrations · 1 of 2",
        `<form id="registration-form"><p class="subtitle">Prepare a setup folder to run in PowerShell. Nothing is created in Microsoft 365 from this screen.</p><label class="field">Customer name<input name="name" maxlength="100"></label><label class="field">Tenant ID<input name="tenantId" value="${esc(settings.tenant?.tenantId || "")}"></label><label class="field">Original Exchange domain<input name="organization" placeholder="customer.onmicrosoft.com"></label><label class="check"><input type="checkbox" name="exchange" checked><span>Include Exchange mailbox collection</span></label>${btn("customer-preview", "Review permissions →", "primary")}</form>`,
      );
    } else if (action === "customer-preview") {
      const f = $("#registration-form"),
        values = Object.fromEntries(new FormData(f));
      values.exchange = f.elements.exchange.checked;
      if (!values.name.trim() || !GUID.test(values.tenantId))
        throw Error("Enter a customer name and tenant ID");
      const permissions = [
        "User.Read.All",
        "AuditLog.Read.All",
        "Directory.Read.All",
        "RoleManagement.Read.Directory",
        "IdentityRiskyUser.Read.All",
        "IdentityRiskEvent.Read.All",
        "AuditLogsQuery.Read.All",
        "UserAuthenticationMethod.Read.All",
        "Policy.Read.All",
        "Application.Read.All",
        "GroupMember.Read.All",
        "LicenseAssignment.Read.All",
        "SecurityAlert.Read.All",
        "SecurityEvents.Read.All",
        "Mail.Read",
      ];
      dialog(
        "Create customer registrations · 2 of 2",
        `<p class="subtitle"><strong>${esc(values.name)}</strong> · ${esc(values.tenantId)}</p><h3>Graph · application permissions</h3><ul>${permissions.map((p) => `<li>${p}</li>`).join("")}</ul>${values.exchange ? "<h3>Exchange · application permissions</h3><p>Exchange.ManageAsApp + a separate, reviewed Exchange role script for the reviewed read commands used by Triage. Scope: all mailboxes in this tenant.</p>" : ""}<p class="notice">The script creates new single-tenant apps and a one-year, password-protected certificate. The setup operator signs in, reviews the permissions and types the tenant ID before creation and consent. Bootstrap scopes: Application.ReadWrite.All and AppRoleAssignment.ReadWrite.All. Those write permissions are not assigned to the collector.</p><p class="form-note">No existing registration is modified. Partial failures retain an object-ID log. Retain the PFX password in your password manager. Import the resulting profile and PFX into Triage afterward.</p>${btn("customer-export-kit", "Save setup folder", "primary")}`,
      );
      $("#detail-content")._registrationValues = values;
    } else if (action === "customer-export-kit") {
      const result = await N.registrationKit(
        $("#detail-content")._registrationValues,
      );
      if (result)
        dialog(
          "Registration setup ready",
          `<p>Saved locally: <strong>${esc(result.folder)}</strong></p><ol><li>Review settings.json and New-TriageRegistrations.ps1.</li><li>Run this command in PowerShell. Sign in with your passkey, approve the displayed tenant and choose a PFX password.</li><li>If Exchange is selected, review and run the generated Exchange-RBAC.ps1 with the same ModuleRoot argument.</li><li>Import profile.json, choose customer.pfx, and enter the PFX password.</li></ol><pre class="command">${esc(result.command)}</pre><p class="notice">The files are ready; no cloud registrations have been created yet.</p>${btn("customer-add", "Import the completed registration", "primary")}`,
        );
    }
  }
  // ---------------------------------------------------------------- desktop progress
  if (N) {
    N.onProgress((value) => {
      if (
        value.type === "connection" &&
        ["graph", "exchange"].includes(value.mode)
      ) {
        // Rows on Connect and Collect follow the retained PowerShell sessions.
        const previous = svc[value.mode] || {};
        svc[value.mode] = {
          ...previous,
          state: value.state,
          account: value.account || previous.account || "",
          error:
            value.error ||
            (["failed", "expired", "cancelled", "closed"].includes(value.state)
              ? previous.error
              : ""),
          since: value.state === "ready" ? Date.now() : previous.since,
        };
        if (ev && busy && value.caseId === ev.caseId && value.actionLog)
          ev.actionLog = mergeLog(ev.actionLog, value.actionLog);
        if (!busy) {
          if (route.step === "connect" || route.step === "scope") render();
          else renderChrome();
          return;
        }
      }
      if (!busy && value.type === "status") {
        const m = /^(Microsoft Graph|Exchange Online): (.*)$/.exec(
          value.text || "",
        );
        if (m) {
          const key = m[1] === "Microsoft Graph" ? "graph" : "exchange";
          if (svc[key].state === "connecting") {
            svc[key].stage = m[2];
            const line = document.querySelector(
              `.service-connection[data-service="${key}"] small.wait`,
            );
            if (line)
              line.innerHTML = `<span class="spin"></span>${esc(m[2])} <span data-elapsed="${key}">${elapsed(svc[key].since)}</span>`;
          }
        }
        return;
      }
      if (!busy || !ev) return;
      if (mailboxJob && value.caseId === mailboxJob) {
        if (value.type === "status") collectionStatus = value.text;
        if (value.type === "error") message(value.text, true);
        renderChrome();
        return;
      }
      if (value.caseId !== ev.caseId) return;
      if (value.type === "error") {
        message(value.text, true);
        jobMessages.push(String(value.text || ""));
      } else if (value.type === "message" || value.type === "status") {
        jobMessages.push(String(value.text || ""));
        if (value.type === "status") collectionStatus = value.text;
      } else if (
        value.type === "source" &&
        ev.selectedSources.includes(value.source)
      ) {
        E.setSource(ev, value.source, value.records, value.manifest);
        if (value.collectorAccount)
          ev.collectorAccount = value.collectorAccount;
        if (value.subject) ev.subject = value.subject;
        ev.actionLog = mergeLog(ev.actionLog, value.actionLog || []);
        collectionStatus = "Preparing the next source…";
        const detail =
          label(value.source) +
          " · " +
          value.manifest.state +
          " · " +
          recordCount(ev.raw[value.source].length);
        if (jobMessages.at(-1) !== detail) jobMessages.push(detail);
      }
      jobMessages = jobMessages.slice(-80);
      clearTimeout(progressTimer);
      progressTimer = setTimeout(refreshCollection, 100);
    });
    N.onPlan((plan) => {
      if (busy) {
        message("Finish collection before opening another plan.", true);
        return;
      }
      settings.scope = plan.scope;
      settings.upn = plan.upn;
      settings.days = String(
        Math.max(
          1,
          Math.round(
            (Date.parse(plan.window.end) - Date.parse(plan.window.start)) /
              864e5,
          ),
        ),
      );
      settings.signAs =
        plan.connection?.mode === "app"
          ? plan.connection.profileId
          : "delegated";
      settings.preset = "custom";
      settings.custom = plan.sources.slice();
      settings.domain = plan.tenantName || plan.tenantId;
      settings.tenant = {
        tenantId: plan.tenantId,
        domain: (plan.tenantName || plan.tenantId).toLowerCase(),
      };
      remember();
      openedPlan = { caseId: plan.caseId, window: plan.window };
      caseKey = plan.caseId;
      if (ev && !ev.demo) {
        message(
          "Plan opened. Finish the current case, then start a new investigation to use it.",
          true,
        );
        return;
      }
      ev = null;
      navigate({ step: connected() ? "scope" : "connect" });
      message(
        "Collection plan opened. " +
          (connected()
            ? "Check the account and window, then start."
            : "Sign in first; Scope is filled from the plan."),
      );
    });
  }
  // ---------------------------------------------------------------- boot
  // The build number comes from build.js, so the badge and footer can never lag a bump.
  if (window.BETA_BUILD) {
    const badge = $(".brand .beta");
    if (badge) badge.textContent = "BETA " + window.BETA_BUILD;
    const footer = $("footer [data-action=help]");
    if (footer) footer.textContent = "Build " + window.BETA_BUILD + " · Guide";
  }
  render();
  if (N?.evidenceFolder)
    N.evidenceFolder()
      .then((v) => {
        evidenceFolder = v.folder;
        if (route.step === "scope") render();
      })
      .catch((e) => message(e.message, true));
  if (N?.profiles)
    N.profiles()
      .then((values) => {
        customerProfiles = values;
        if (route.step === "connect") render();
      })
      .catch((e) => message(e.message, true));
  if (N?.listCases)
    N.listCases()
      .then((list) => {
        list.sort((x, y) => String(y.savedAt).localeCompare(String(x.savedAt)));
        lastSaved = list[0] || null;
        if (route.step === "start" && !ev) render();
      })
      .catch(() => {});
  if (N) {
    if (!settings.guideSeen) {
      settings.guideSeen = true;
      remember();
    }
    refreshSessions()
      .then(() => render())
      .catch(() => {});
  }
  if (!N && !LOCAL)
    G.init()
      .then(() => {
        if (G.account) {
          svc.graph = {
            state: "ready",
            account: G.account.username,
            since: Date.now(),
          };
          if (!settings.tenant || settings.tenantMode === "org")
            settings.tenant = {
              tenantId: G.account.tenantId,
              domain: G.account.username.split("@")[1] || "",
            };
        }
        render();
      })
      .catch((e) => message("Sign-in is unavailable: " + e.message, true));
  // Reload lands on the same case and screen when the case was saved on this device.
  (async () => {
    try {
      if (LOCAL) return;
      const wanted = wantedRoute;
      const fromHash = /^#\/case\/([0-9a-f-]{36})\//i.exec(initialHash)?.[1];
      const caseId = wanted?.caseId || fromHash;
      if (!caseId || !GUID.test(caseId) || ev) return;
      const b = N ? await N.loadCase(caseId) : await TriageJournal.open(caseId);
      if (!b || ev) return;
      await openCase(await E.unpack(b), "saved", true);
      saveState = { at: b.exportedAt || "", dirty: false, error: "" };
      const hash = wanted?.caseId === caseId ? wanted.hash : initialHash;
      if (hash && hash !== location.hash) {
        history.replaceState(null, "", hash);
        route = parseRoute();
      }
      render();
    } catch (error) {
      message(
        "The previous case could not be reopened: " + error.message,
        true,
      );
    } finally {
      restoring = false;
      rememberRoute();
    }
  })();
  if (LOCAL)
    fetch("../case.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error("Local case unavailable");
        return r.json();
      })
      .then(E.unpack)
      .then((v) => openCase(v, "imported", true))
      .catch((e) => message(e.message, true));
})();
