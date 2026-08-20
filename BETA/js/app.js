// BETA app orchestration: sign-in, tenant-wide live scan / import, report.
// ENCA-style tabs keep each tool where it was when you switch away.
(function () {
  const G = window.TriageGraph, A = window.TRIAGE_AUTH;
  let demoMode = false;
  let lastResult = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- ENCA-style tool tabs ----------
  const TOOL_TABS = [["scan", "🔎 Live scan"], ["import", "📥 Import"]];
  let openTabs = [], activeTab = null;
  const toolScreen = { scan: "screen-config", import: "screen-import" };
  function toolFor(id) {
    if (id === "screen-config" || id === "screen-progress" || id === "screen-report") return "scan";
    if (id === "screen-import") return "import";
    return null;
  }
  function tabLabel(t) { const h = TOOL_TABS.filter(function (x) { return x[0] === t; })[0]; return h ? h[1] : t; }
  function renderTabs() {
    const signedIn = (G && G.account) || demoMode;
    const home = '<button class="toolnav-btn home ' + (activeTab ? "" : "active") + '" data-navhome title="Home">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.2 9.4V20.4h13.6V9.4"/><path d="M9.6 20.4v-6.2h4.8v6.2"/></svg></button>';
    const tabs = openTabs.map(function (t) {
      return '<span class="toolnav-tab ' + (t === activeTab ? "active" : "") + '"><button class="toolnav-btn" data-nav="' + t + '">' + esc(tabLabel(t)) + '</button><button class="toolnav-x" data-close="' + t + '" title="Close tab">&times;</button></span>';
    }).join("");
    const add = '<button class="toolnav-btn add" data-navadd title="Open a tool in a new tab">＋</button>';
    $("toolNav").innerHTML = '<div class="toolnav-inner">' + home + tabs + add + "</div>";
    $("toolNav").style.display = signedIn && openTabs.length ? "block" : "none";
  }
  function resumeTool(t) { showScreen(toolScreen[t]); }
  function closeTab(t) {
    const i = openTabs.indexOf(t); if (i < 0) return;
    openTabs.splice(i, 1);
    if (activeTab === t) { const next = openTabs[i] || openTabs[i - 1] || null; if (next) resumeTool(next); else showScreen(homeScreen()); }
    else renderTabs();
  }
  function openTool(t) { if (openTabs.indexOf(t) >= 0) return resumeTool(t); showScreen(toolScreen[t]); }
  function openAddMenu(anchor) {
    closeAddMenu();
    const menu = document.createElement("div"); menu.className = "toolnav-menu"; menu.id = "toolAddMenu";
    menu.innerHTML = TOOL_TABS.map(function (x) { const o = openTabs.indexOf(x[0]) >= 0; return '<button data-nav="' + x[0] + '" class="' + (o ? "open" : "") + '">' + esc(x[1]) + (o ? " <span class='mini'>&middot; open</span>" : "") + "</button>"; }).join("");
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect(); menu.style.top = (r.bottom + 4) + "px"; menu.style.left = Math.min(r.left, window.innerWidth - 280) + "px";
    menu.addEventListener("click", function (e) { const b = e.target.closest("[data-nav]"); if (!b) return; closeAddMenu(); openTool(b.getAttribute("data-nav")); });
    setTimeout(function () { document.addEventListener("click", closeAddMenu, { once: true }); }, 0);
  }
  function closeAddMenu() { const m = $("toolAddMenu"); if (m) m.remove(); }
  $("toolNav").addEventListener("click", function (e) {
    if (e.target.closest("[data-navhome]")) return showScreen(homeScreen());
    if (e.target.closest("[data-navadd]")) return openAddMenu(e.target.closest("[data-navadd]"));
    const x = e.target.closest("[data-close]"); if (x) { e.stopPropagation(); return closeTab(x.getAttribute("data-close")); }
    const b = e.target.closest("[data-nav]"); if (b) resumeTool(b.getAttribute("data-nav"));
  });

  // ---------- screens ----------
  const screenScroll = {}; let shownScreen = null;
  function showScreen(id) {
    if (shownScreen && shownScreen !== id) screenScroll[shownScreen] = window.scrollY;
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    const t = toolFor(id);
    if (t) { if (openTabs.indexOf(t) < 0) openTabs.push(t); activeTab = t; toolScreen[t] = id; } else activeTab = null;
    renderTabs();
    const changed = shownScreen !== id; shownScreen = id;
    if (changed) window.scrollTo(0, screenScroll[id] || 0);
  }
  function homeScreen() { return (G.account || demoMode) ? "screen-mode" : "screen-login"; }

  // ---------- chrome ----------
  $("buildStampFoot").textContent = "BETA build " + window.BETA_BUILD + " · " + window.BETA_BUILD_DATE;
  $("themeBtn").addEventListener("click", function () {
    const r = document.documentElement;
    const dark = r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    r.setAttribute("data-theme", dark ? "light" : "dark");
  });
  $("logoHome").addEventListener("click", function () { showScreen(homeScreen()); });
  $("homeBtn").addEventListener("click", function () { showScreen(homeScreen()); });
  $("helpBtn").addEventListener("click", function () { showScreen("screen-help"); });
  $("helpBack").addEventListener("click", function () { showScreen(homeScreen()); });
  $("prodLink").addEventListener("click", function (e) { e.preventDefault(); window.location.href = "../index.html"; });
  $("consentLink").addEventListener("click", function (e) { e.preventDefault(); window.open(A.adminConsentUrl(), "_blank"); });

  function afterSignIn(name, tenant) {
    $("whoBox").style.display = ""; $("whoName").textContent = name; $("whoTenant").textContent = tenant || "";
    $("signOutBtn").style.display = ""; $("homeBtn").style.display = "";
    $("demoBanner").style.display = demoMode ? "" : "none";
    $("demoPill").style.display = demoMode ? "" : "none";
    // You never signed in to the demo, so "Sign out" reads as a no-op.
    $("signOutBtn").textContent = demoMode ? "Exit demo" : "Sign out";
    $("signOutBtn").title = demoMode ? "Leave the simulated tenant and go back to the sign-in screen" : "";
    showScreen("screen-mode");
  }
  $("signInBtn").addEventListener("click", async function () {
    try { const acc = await G.signIn(); demoMode = false; afterSignIn(acc.name || acc.username, acc.username.split("@")[1]); }
    catch (e) { if (e && /interaction_in_progress|user_cancelled/i.test(String(e.errorCode || e.message))) return; alert("Sign-in failed: " + (e.message || e)); }
  });
  $("demoBtn").addEventListener("click", function () { demoMode = true; afterSignIn("Demo analyst", "contoso-demo.com"); });
  // One way out, shared by the header button and the banner's "Leave demo".
  async function endSession() {
    if (!demoMode) await G.signOut();
    const wasDemo = demoMode; demoMode = false;
    $("whoBox").style.display = "none"; $("signOutBtn").style.display = "none"; $("homeBtn").style.display = "none";
    $("demoBanner").style.display = "none"; $("demoPill").style.display = "none";
    $("signOutBtn").textContent = "Sign out"; $("signOutBtn").title = "";
    // Otherwise ?demo=1 drops you back into the simulated tenant on refresh.
    if (wasDemo && /[?&]demo=1/.test(location.search)) {
      const url = new URL(location.href);
      url.searchParams.delete("demo");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    openTabs = []; activeTab = null; showScreen("screen-login");
  }
  $("signOutBtn").addEventListener("click", endSession);
  $("demoExitBtn").addEventListener("click", endSession);

  // ---------- mode choice ----------
  $("modeScanBtn").addEventListener("click", function () { openTool("scan"); });
  $("modeImportBtn").addEventListener("click", function () { openTool("import"); });
  $("configBack").addEventListener("click", function () { showScreen("screen-mode"); });
  $("importBack").addEventListener("click", function () { showScreen("screen-mode"); });

  // ---------- live scan ----------
  let scanning = false;
  function stepUi() {
    $("betaStepList").innerHTML = window.BETA_Collect.STEPS.map(function (s) {
      return '<li id="bstep-' + s[0] + '"><span class="st muted">•</span><span>' + esc(s[1]) + '</span><span class="note" id="bnote-' + s[0] + '"></span></li>';
    }).join("");
  }
  function setStep(key, state, note) {
    const el = $("bstep-" + key); if (!el) return;
    const st = el.querySelector(".st");
    const map = { run: ["…", "run"], ok: ["✓", "ok"], skip: ["–", "skip"], fail: ["✕", "fail"] };
    st.textContent = map[state][0]; st.className = "st " + map[state][1];
    if (note !== undefined) $("bnote-" + key).textContent = note;
  }
  $("startScanBtn").addEventListener("click", async function () {
    if (scanning) return;
    const days = parseInt($("betaDaysSel").value, 10);
    const withUal = $("betaUalChk").checked;
    stepUi();
    $("betaProgTitle").textContent = demoMode ? "Analyzing the demo tenant…" : "Collecting tenant-wide evidence…";
    showScreen("screen-progress");
    let ev;
    scanning = true;
    try {
      if (demoMode) {
        ev = window.BETA_Demo.evidence(); ev.days = days;
        for (const s of window.BETA_Collect.STEPS) { setStep(s[0], "run"); await new Promise(function (r) { setTimeout(r, 160); }); setStep(s[0], ev.skipped && ev.skipped.indexOf(s[0]) >= 0 ? "skip" : "ok"); }
      } else {
        ev = await window.BETA_Collect.collect(days, withUal, setStep);
      }
    } finally { scanning = false; }
    analyzeAndShow(ev);
  });

  // ---------- import ----------
  const drop = $("betaDrop"), fileInput = $("betaFile");
  $("betaBrowse").addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () { if (fileInput.files.length) handleFiles(fileInput.files); });
  ["dragover", "dragenter"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  function handleFiles(files) {
    $("betaImportStatus").textContent = "Parsing " + files.length + " file(s)…";
    window.BETA_Import.ingest(files, function (ev) {
      $("betaImportStatus").innerHTML = "Parsed: " + ev.sources.map(function (s) {
        return '<span class="pill">' + esc(s.file) + " → " + esc(s.kind) + " (" + s.rows + ")</span>";
      }).join(" ");
      analyzeAndShow(ev);
    }, function (n, total, name) { $("betaImportStatus").textContent = "Parsing " + n + "/" + total + ": " + name; });
  }

  function analyzeAndShow(ev) {
    const res = window.BETA_Analyzers.analyze(ev);
    lastResult = res;
    window.BETA_Report.show(ev, res);
    // Report belongs to whichever tool was active; if imported, it's the import tab's.
    if (ev.imported) toolScreen.import = "screen-report";
    showScreen("screen-report");
  }
  window.BETA_Report.bind();
  $("betaNewScan").addEventListener("click", function () { showScreen("screen-mode"); });

  // ---------- boot ----------
  (async function () {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") { demoMode = true; afterSignIn("Demo analyst", "contoso-demo.com"); return; }
    if (A.clientId.indexOf("00000000") !== 0) {
      try { await G.init(); await G.forgetSession(); } catch (e) { /* stay on login */ }
    }
    showScreen("screen-login");
  })();
})();
