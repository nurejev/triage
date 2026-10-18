// App orchestration: screens, sign-in, UPN search, collection pipeline.
(function () {
  const G = window.TriageGraph, A = window.TRIAGE_AUTH;
  let demoMode = false;
  let selectedUser = null;   // {id, userPrincipalName, displayName}
  let lastScreen = "screen-login";
  let mode = "triage";       // "triage" | "contain" - what the shared search screen starts
  let lastEvidence = null;   // evidence + findings of the most recent report, for containment context
  let lastFindings = null;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  // ---------- ENCA-style tool tabs ----------
  // A tab exists only for a tool you have opened; switching tabs resumes the
  // tool exactly where it was - mid-scan, mid-runbook, mid-report - instead of
  // restarting it at its first screen. Screens stay in the DOM the whole time,
  // so nothing running (a collection, a UAL query) is ever interrupted.
  const TOOL_TABS = [
    ["triage", "🔎 Triage"],
    ["contain", "🛡 Containment"],
    ["extract", "📤 Full extraction"],
    ["import", "📥 Import evidence"]
  ];
  let openTabs = [], activeTab = null;
  // The screen each tool is currently on - where its tab resumes to.
  const toolScreen = { triage: "screen-search", contain: "screen-search",
    extract: "screen-extract", import: "screen-import" };
  function toolFor(id) {
    if (id === "screen-progress" || id === "screen-report") return "triage";
    if (id === "screen-search") return mode === "contain" ? "contain" : "triage";
    if (id === "screen-contain") return "contain";
    if (id === "screen-extract") return "extract";
    if (id === "screen-import") return "import";
    return null;
  }
  function tabLabel(t) {
    const hit = TOOL_TABS.filter(function (x) { return x[0] === t; })[0];
    return hit ? hit[1] : t;
  }
  function renderTabs() {
    const signedIn = (G && G.account) || demoMode;
    const home = '<button class="toolnav-btn home ' + (activeTab ? "" : "active") + '" data-navhome title="Home" aria-label="Home">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.2 9.4V20.4h13.6V9.4"/><path d="M9.6 20.4v-6.2h4.8v6.2"/></svg></button>';
    const tabs = openTabs.map(function (t) {
      return '<span class="toolnav-tab ' + (t === activeTab ? "active" : "") + '">' +
        '<button class="toolnav-btn" data-nav="' + t + '">' + esc(tabLabel(t)) + "</button>" +
        '<button class="toolnav-x" data-close="' + t + '" title="Close tab">&times;</button></span>';
    }).join("");
    const add = '<button class="toolnav-btn add" data-navadd title="Open a tool in a new tab">＋</button>';
    const closeAll = openTabs.length > 1 ? '<button class="toolnav-btn" data-navcloseall title="Close all tabs">✕ all</button>' : "";
    $("toolNav").innerHTML = '<div class="toolnav-inner">' + home + tabs + add + closeAll + "</div>";
    // the bar only appears once signed in and a tool is open
    $("toolNav").style.display = signedIn && openTabs.length ? "block" : "none";
  }
  function resumeTool(t) {
    // The shared search screen belongs to whichever mode last used it, so
    // resuming there has to restore that mode's wording first.
    if (toolScreen[t] === "screen-search") setMode(t === "contain" ? "contain" : "triage");
    showScreen(toolScreen[t]);
  }
  function closeTab(t) {
    const i = openTabs.indexOf(t);
    if (i < 0) return;
    openTabs.splice(i, 1);
    if (activeTab === t) {
      const next = openTabs[i] || openTabs[i - 1] || null;   // neighbour, else last
      if (next) resumeTool(next);
      else showScreen(homeScreen());
    } else renderTabs();
  }
  function openTool(t) {
    if (openTabs.indexOf(t) >= 0) return resumeTool(t);
    if (t === "triage" || t === "contain") return openSearch(t);
    showScreen(toolScreen[t]);
  }
  function openAddMenu(anchor) {
    closeAddMenu();
    const menu = document.createElement("div");
    menu.className = "toolnav-menu"; menu.id = "toolAddMenu";
    menu.innerHTML = TOOL_TABS.map(function (x) {
      const open = openTabs.indexOf(x[0]) >= 0;
      return '<button data-nav="' + x[0] + '" class="' + (open ? "open" : "") + '">' + esc(x[1]) +
        (open ? " <span class='mini'>&middot; open</span>" : "") + "</button>";
    }).join("");
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + "px";
    menu.style.left = Math.min(r.left, window.innerWidth - 280) + "px";
    menu.addEventListener("click", function (e) {
      const b = e.target.closest("[data-nav]");
      if (!b) return;
      closeAddMenu(); openTool(b.getAttribute("data-nav"));
    });
    setTimeout(function () { document.addEventListener("click", closeAddMenu, { once: true }); }, 0);
  }
  function closeAddMenu() { const m = $("toolAddMenu"); if (m) m.remove(); }
  $("toolNav").addEventListener("click", function (e) {
    if (e.target.closest("[data-navhome]")) return showScreen(homeScreen());
    if (e.target.closest("[data-navcloseall]")) {
      openTabs = []; activeTab = null; renderTabs();
      return showScreen(homeScreen());
    }
    if (e.target.closest("[data-navadd]")) return openAddMenu(e.target.closest("[data-navadd]"));
    const x = e.target.closest("[data-close]");
    if (x) { e.stopPropagation(); return closeTab(x.getAttribute("data-close")); }
    const b = e.target.closest("[data-nav]");
    if (b) resumeTool(b.getAttribute("data-nav"));
  });

  // Per-screen scroll memory (ENCA-style): the position of the screen you
  // leave is saved and restored when you come back; a screen you have not
  // visited yet starts at the top.
  const screenScroll = {};
  let shownScreen = null;
  function showScreen(id) {
    if (shownScreen && shownScreen !== id) screenScroll[shownScreen] = window.scrollY;
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    if (id !== "screen-whatsnew" && id !== "screen-help") lastScreen = id;
    // Register/activate the owning tool's tab, and remember this screen as the
    // place its tab resumes to.
    const t = toolFor(id);
    if (t) {
      if (openTabs.indexOf(t) < 0) openTabs.push(t);
      activeTab = t;
      toolScreen[t] = id;
    } else activeTab = null;
    renderTabs();
    const changed = shownScreen !== id;
    shownScreen = id;
    if (changed) window.scrollTo(0, screenScroll[id] || 0);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- chrome: build stamp, theme, what's new ----------
  $("buildStampFoot").textContent = "build " + window.TRIAGE_BUILD + " · " + window.TRIAGE_BUILD_DATE;
  $("brandHost").textContent = window.location.hostname || "triage.limon-it.nl";
  $("themeBtn").addEventListener("click", function () {
    const r = document.documentElement;
    const dark = r.getAttribute("data-theme") === "dark" ||
      (!r.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    r.setAttribute("data-theme", dark ? "light" : "dark");
  });
  // ---------- What's new / changelog (ENCA-style) ----------
  // The overlay appears once per release: we remember the build the person
  // acknowledged and show everything newer than that. First-time visitors
  // just get the newest release, not the whole history.
  const CL_KEY = "triage-seen-build";
  const CL_LATEST = window.TRIAGE_CHANGELOG_LATEST || 0;
  function clSeen() { try { return +localStorage.getItem(CL_KEY) || 0; } catch (e) { return 0; } }
  function clMarkSeen() { try { localStorage.setItem(CL_KEY, String(CL_LATEST)); } catch (e) { /* private mode */ } }
  const CL_KIND = { new: "New", improved: "Improved", fixed: "Fixed" };
  function clEntries(rel) {
    const order = { new: 0, improved: 1, fixed: 2 };
    const items = rel.items || (rel.changes || []).map(function (c) { return { kind: "new", tool: "", text: c }; });
    return items.slice().sort(function (a, b) { return (order[a.kind] || 0) - (order[b.kind] || 0); })
      .map(function (i) {
        return '<li class="cl-i"><span class="cl-k ' + i.kind + '">' + (CL_KIND[i.kind] || i.kind) + "</span>" +
          "<span>" + (i.tool ? "<b>" + esc(i.tool) + "</b> — " : "") + esc(i.text) + "</span></li>";
      }).join("");
  }
  function clRelease(rel) {
    return '<div class="cl-rel"><div class="cl-h"><b>' + esc(rel.title || ("Build " + rel.build)) + "</b>" +
      '<span class="mini muted">build ' + rel.build + " · " + esc(rel.date) + "</span></div>" +
      '<ul class="cl-list">' + clEntries(rel) + "</ul></div>";
  }
  function openChangelog() {
    $("wnList").innerHTML = window.TRIAGE_CHANGELOG.map(clRelease).join("") ||
      '<p class="mini">No changelog entries yet.</p>';
    showScreen("screen-whatsnew");
    clMarkSeen();
  }
  $("whatsNewBtn").addEventListener("click", openChangelog);
  // Called once signed in (or demo entered), so it never covers the sign-in screen.
  function maybeShowWhatsNew() {
    if (!window.TRIAGE_CHANGELOG || !window.TRIAGE_CHANGELOG.length) return;
    const seen = clSeen();
    if (seen >= CL_LATEST) return;
    const fresh = seen ? window.TRIAGE_CHANGELOG.filter(function (r) { return r.build > seen; }) : [];
    const rels = fresh.length ? fresh : [window.TRIAGE_CHANGELOG[0]];
    const n = rels.reduce(function (s2, r) { return s2 + (r.items ? r.items.length : (r.changes || []).length); }, 0);
    $("newSub").innerHTML = seen
      ? n + " change" + (n === 1 ? "" : "s") + " since you were last here (build " + seen + " → " + CL_LATEST + ")."
      : "Here's what the tool can do as of build " + CL_LATEST + ".";
    $("newBody").innerHTML = rels.map(clRelease).join("");
    $("newModal").classList.add("open");
  }
  function closeWhatsNew() { clMarkSeen(); $("newModal").classList.remove("open"); }
  $("newClose").addEventListener("click", closeWhatsNew);
  $("newModal").addEventListener("click", function (e) { if (e.target.id === "newModal") closeWhatsNew(); });
  $("newFull").addEventListener("click", function () { closeWhatsNew(); openChangelog(); });
  $("wnBack").addEventListener("click", function () { showScreen(lastScreen); });
  function openHelp(e) { if (e) e.preventDefault(); showScreen("screen-help"); }
  $("helpBtn").addEventListener("click", openHelp);
  $("helpLink").addEventListener("click", openHelp);
  $("helpBack").addEventListener("click", function () { showScreen(lastScreen); });
  function homeScreen() { return G.account || demoMode ? "screen-mode" : "screen-login"; }
  function goHome() { showScreen(homeScreen()); }
  // The logo has always been a home link; the button says so out loud, because
  // mid-incident nobody goes hunting for an affordance.
  $("logoHome").addEventListener("click", goHome);
  $("homeBtn").addEventListener("click", goHome);
  // Full-extraction guide + Extractor-Suite output importer (reachable signed-in or not).
  $("extractBtn").addEventListener("click", function () { showScreen("screen-extract"); });
  $("importOpen").addEventListener("click", function (e) { e.preventDefault(); showScreen("screen-import"); });
  $("extractImportCta").addEventListener("click", function () { showScreen("screen-import"); });
  $("extractImportInline").addEventListener("click", function (e) { e.preventDefault(); showScreen("screen-import"); });
  $("extractBack").addEventListener("click", function () { showScreen(homeScreen()); });
  $("importBack").addEventListener("click", function () { showScreen(homeScreen()); });
  $("consentLink").addEventListener("click", function (e) {
    e.preventDefault();
    window.open(A.adminConsentUrl(), "_blank");
  });

  // ---------- auth ----------
  function afterSignIn(name, tenant) {
    $("whoBox").style.display = "";
    $("whoName").textContent = name;
    $("whoTenant").textContent = tenant || "";
    $("signOutBtn").style.display = "";
    $("homeBtn").style.display = "";
    $("demoBanner").style.display = demoMode ? "" : "none";
    $("demoPill").style.display = demoMode ? "" : "none";
    // You never signed in to the demo, so "Sign out" reads as a no-op and people
    // hunt for a way back to the login screen that is already right there.
    $("signOutBtn").textContent = demoMode ? "Exit demo" : "Sign out";
    $("signOutBtn").title = demoMode
      ? "Leave the simulated tenant and go back to the sign-in screen"
      : "";
    showScreen("screen-mode");
    maybeShowWhatsNew();
  }

  // ---------- mode choice: triage (read-only) vs containment (writes) ----------
  // Both funnel into the same UPN search, so containment always works off the
  // account the analyst already looked up.
  function setMode(m) {
    mode = m;
    const contain = m === "contain";
    $("searchTitle").textContent = contain ? "Which account do we contain?" : "Who do we investigate?";
    $("searchLead").textContent = contain
      ? "The same search as triage. Pick the account you are containing - the runbook opens with that account, and with the triage findings if you already ran them."
      : "Start typing a name or UPN. Pick the account you suspect is compromised.";
    $("triageOpts").style.display = contain ? "none" : "";
    $("searchHint").style.display = contain ? "" : "none";
    $("startBtn").textContent = contain ? "Open containment runbook" : "Start triage";
    $("startBtn").className = "btn " + (contain ? "danger" : "primary");
  }
  function openSearch(m) {
    setMode(m);
    showScreen("screen-search");
    $("upnInput").focus();
  }
  // Resume the tool where it was if its tab is already open (a scan in flight,
  // a report on screen, a runbook mid-step) - only a first open starts at search.
  $("modeTriageBtn").addEventListener("click", function () { openTool("triage"); });
  $("modeContainBtn").addEventListener("click", function () { openTool("contain"); });
  $("searchBackBtn").addEventListener("click", function () { showScreen("screen-mode"); });
  $("signInBtn").addEventListener("click", async function () {
    if (A.clientId.indexOf("00000000") === 0) {
      alert("This instance is not configured yet: set the app registration client ID in js/authConfig.js (see README).");
      return;
    }
    try {
      const acc = await G.signIn();
      demoMode = false;
      afterSignIn(acc.name || acc.username, acc.username.split("@")[1]);
    } catch (e) {
      if (e && /interaction_in_progress|user_cancelled/i.test(String(e.errorCode || e.message))) return;
      alert("Sign-in failed: " + (e.message || e));
    }
  });
  // One way out, shared by the header button and the banner's "Leave demo".
  // Leaving the demo and signing out land in the same place - the login screen
  // with nothing carried over - so they are the same code path.
  async function endSession() {
    window.TriageCase.reset();
    window.TriageContain.reset();
    document.body.inert = true;
    try { if (!demoMode) await G.signOut(); await G.forgetSession(); }
    finally { location.replace(location.pathname); }

  }
  $("signOutBtn").addEventListener("click", endSession);
  $("demoExitBtn").addEventListener("click", endSession);
  $("demoBtn").addEventListener("click", function () {
    demoMode = true;
    afterSignIn("Demo analyst", "contoso-demo.com");
  });

  // ---------- UPN search with typeahead ----------
  let suggTimer = null, suggSel = -1, suggestions = [];
  const upnInput = $("upnInput"), suggBox = $("upnSugg");

  function renderSugg() {
    if (!suggestions.length) { suggBox.style.display = "none"; return; }
    suggBox.innerHTML = suggestions.map(function (u, i) {
      return '<div data-i="' + i + '" class="' + (i === suggSel ? "sel" : "") + '"><span class="u">' +
        esc(u.displayName || "") + '</span> <span class="muted mini">' + esc(u.userPrincipalName) + "</span></div>";
    }).join("");
    suggBox.style.display = "";
    suggBox.querySelectorAll("div").forEach(function (d) {
      d.addEventListener("mousedown", function (e) {
        e.preventDefault();
        pick(suggestions[parseInt(d.getAttribute("data-i"), 10)]);
      });
    });
  }
  function pick(u) {
    selectedUser = u;
    upnInput.value = u.userPrincipalName;
    suggestions = []; renderSugg();
    $("startBtn").disabled = false;
  }
  async function searchUsers(q) {
    if (demoMode) return window.TriageDemo.search(q);
    const esc2 = q.replace(/'/g, "''");
    try {
      const body = await G.gfetch(A.graphV1 + "/users?$top=8&$select=id,displayName,userPrincipalName&$filter=" +
        encodeURIComponent("startswith(userPrincipalName,'" + esc2 + "') or startswith(displayName,'" + esc2 + "') or startswith(mail,'" + esc2 + "')"));
      return body.value || [];
    } catch (e) { return []; }
  }
  upnInput.addEventListener("input", function () {
    selectedUser = null;
    $("startBtn").disabled = true;
    const q = upnInput.value.trim();
    clearTimeout(suggTimer);
    if (q.length < 2) { suggestions = []; renderSugg(); return; }
    suggTimer = setTimeout(async function () {
      const version = window.TriageCase.generation;
      const found = await searchUsers(q);
      if (version !== window.TriageCase.generation || q !== upnInput.value.trim()) return;
      suggestions = found;
      suggSel = -1;
      renderSugg();
      // Typed the whole UPN without touching the list? Select it anyway, so the
      // rest of the app gets the display name and object id rather than just a
      // string - the containment templates address the person by name.
      if (!selectedUser) {
        const exact = suggestions.find(function (u) { return u.userPrincipalName.toLowerCase() === q.toLowerCase(); });
        if (exact) pick(exact);
      }
    }, 250);
  });
  upnInput.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { suggSel = Math.min(suggSel + 1, suggestions.length - 1); renderSugg(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { suggSel = Math.max(suggSel - 1, 0); renderSugg(); e.preventDefault(); }
    else if (e.key === "Enter") {
      if (suggSel >= 0 && suggestions[suggSel]) pick(suggestions[suggSel]);
      else if (suggestions.length === 1) pick(suggestions[0]);
      else if (!$("startBtn").disabled) startSelected();
      e.preventDefault();
    } else if (e.key === "Escape") { suggestions = []; renderSugg(); }
  });
  function startSelected() { return mode === "contain" ? startContain() : startTriage(); }
  upnInput.addEventListener("blur", function () { setTimeout(function () { suggestions = []; renderSugg(); }, 150); });

  // ---------- collection pipeline ----------
  const STEPS = [
    ["profile", "User profile"],
    ["signins", "Sign-in logs"],
    ["audits", "Directory audit events"],
    ["risky", "Identity Protection (risky user + detections)"],
    ["mfa", "Authentication methods (MFA)"],
    ["oauth", "OAuth permission grants"],
    ["ual", "Unified Audit Log (async query)"]
  ];
  function stepUi() {
    $("stepList").innerHTML = STEPS.map(function (s) {
      return '<li id="step-' + s[0] + '"><span class="st muted">•</span><span>' + esc(s[1]) +
        '</span><span class="note" id="note-' + s[0] + '"></span></li>';
    }).join("");
  }
  function setStep(key, state, note) {
    const el = $("step-" + key);
    if (!el) return;
    const st = el.querySelector(".st");
    const map = { run: ["…", "run"], ok: ["✓", "ok"], skip: ["–", "skip"], fail: ["✕", "fail"] };
    st.textContent = map[state][0];
    st.className = "st " + map[state][1];
    if (note !== undefined) $("note-" + key).textContent = note;
  }

  async function collect(upn, days, withUal) {
    const C = window.TriageCase, version = C.generation;
    const end = new Date().toISOString(), start = new Date(Date.now()-days*864e5).toISOString();
    const ev=C.ensure({upn,days,demo:false,tenantId:G.account?.tenantId,window:{start,end},skipped:[],signIns:[],ualRecords:[],oauthGrants:[],riskyUsers:[],riskDetections:[],directoryAudits:[],authMethods:{loaded:false,methods:[]},user:{}});
    C.current=ev;
    let activeSource='';
    async function all(url,cap){const result=await G.pages(url,cap);const {records,...meta}=result;const m=ev.manifest[activeSource];m.queries ||= [];m.queries.push(meta);m.pages=(m.pages||0)+result.pages;
      if(result.state!=='complete')throw Object.assign(Error(result.error||'Page limit reached'),{collection:meta,records});return records;}
    const uq="'"+upn.replace(/'/g,"''")+"'";
    async function step(key,fn) {
      C.assert(version); activeSource=key; setStep(key,'run');
      ev.manifest[key]={state:'running',window:{start,end},startedAt:new Date().toISOString()};
      try { await fn(); C.assert(version); ev.manifest[key].state='complete'; setStep(key,'ok'); }
      catch(e) {
        if(e.name==='AbortError') throw e;
        Object.assign(ev.manifest[key],e.collection || {},{state:e.collection?.state || (e.status===403?'unavailable':'failed'),error:e.message});
        delete ev.manifest[key].records;
        const field={signins:'signIns',audits:'directoryAudits',ual:'ualRecords',oauth:'oauthGrants'}[key];
        if(field && e.records) ev[field]=e.records;
        ev.skipped.push(key); setStep(key,'fail',ev.manifest[key].state+': '+e.message);
      }
      ev.manifest[key].completedAt=new Date().toISOString();
      const field={signins:'signIns',audits:'directoryAudits',ual:'ualRecords',oauth:'oauthGrants'}[key];
      if(field){const rows=ev[field];ev.manifest[key].count=rows.length;const dates=rows.map(r=>r.createdDateTime||r.activityDateTime).filter(Boolean).sort();ev.manifest[key].observedRange={start:dates[0]||null,end:dates.at(-1)||null};}
    }
    await step('profile',async()=>{ev.user=await G.gfetch(A.graphV1+'/users/'+encodeURIComponent(upn)+'?$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastPasswordChangeDateTime,jobTitle,department,onPremisesSyncEnabled');});
    const uid=ev.user.id;
    await step('signins',async()=>{
      const result=await G.pages(A.graphBase+'/auditLogs/signIns?$top=500&$filter='+encodeURIComponent('userPrincipalName eq '+uq+' and createdDateTime ge '+start+' and createdDateTime le '+end+" and signInEventTypes/any(t:t eq 'interactiveUser' or t eq 'nonInteractiveUser')"),20);
      ev.signIns=result.records; Object.assign(ev.manifest.signins,result); delete ev.manifest.signins.records;
      if(result.state!=='complete') throw Object.assign(Error(result.error || 'Page limit reached; coverage is partial'),{collection:result,records:result.records});
      setStep('signins','ok',result.records.length+' events');
    });
    await step('audits',async()=>{
      if(!uid) throw Error('Canonical user ID is unavailable');
      const common='activityDateTime ge '+start+' and activityDateTime le '+end;
      const actor=await G.pages(A.graphV1+'/auditLogs/directoryAudits?$top=500&$filter='+encodeURIComponent(common+' and initiatedBy/user/userPrincipalName eq '+uq),6);
      const target=await G.pages(A.graphV1+'/auditLogs/directoryAudits?$top=500&$filter='+encodeURIComponent(common+" and targetResources/any(t:t/id eq '"+uid+"')"),6);
      const seen=new Set(); ev.directoryAudits=[...actor.records,...target.records].filter(r=>{const k=r.id || JSON.stringify(r);if(seen.has(k))return false;seen.add(k);return true;});
      ev.manifest.audits.queries=[actor,target].map(({records,...metadata})=>metadata);
      if(actor.state!=='complete'||target.state!=='complete') throw Object.assign(Error('Actor/target audit coverage is incomplete'),{collection:{state:'partial'},records:ev.directoryAudits});
    });
    await step('risky',async()=>{
      ev.riskyUsers=await all(A.graphV1+'/identityProtection/riskyUsers?$filter='+encodeURIComponent('userPrincipalName eq '+uq),2);
      ev.riskDetections=await all(A.graphV1+'/identityProtection/riskDetections?$filter='+encodeURIComponent('userPrincipalName eq '+uq+' and detectedDateTime ge '+start+' and detectedDateTime le '+end),4);
    });
    await step('mfa',async()=>{if(!uid)throw Error('Canonical user ID is unavailable');ev.authMethods={loaded:true,methods:await all(A.graphV1+'/users/'+uid+'/authentication/methods',2)};});
    await step('oauth',async()=>{
      if(!uid)throw Error('Canonical user ID is unavailable');
      ev.oauthGrants=await all(A.graphV1+'/users/'+uid+'/oauth2PermissionGrants',4);
      for(const grant of ev.oauthGrants){
        grant.principalUpn=upn;
        try {const sp=await G.gfetch(A.graphV1+'/servicePrincipals/'+grant.clientId+'?$select=displayName,appId');grant.appName=sp.displayName;grant.appId=sp.appId;}
        catch(e){if(e.name==='AbortError')throw e;grant.appName=grant.clientId;}
      }
    });
    if(withUal) await step('ual',async()=>{
      const recs=await G.ualQuery(upn,start,end,(status,sec)=>{C.assert(version);setStep('ual','run',status+' · '+sec+'s');},meta=>Object.assign(ev.manifest.ual,meta));
      ev.ualRecords=recs.map(r=>({...r,auditData:r.auditData || {}}));
    }); else {ev.manifest.ual={state:'not-collected',window:{start,end},note:'Not selected'};ev.skipped.push('ual');setStep('ual','skip','not selected');}
    return ev;
  }

  let scanning = false;   // a collect in flight - switching tabs never touches it
  async function startTriage() {
    const upn = (selectedUser && selectedUser.userPrincipalName) || upnInput.value.trim();
    if (!upn) return;
    if (scanning && !confirm("A scan is still running. Start a new one anyway? The running scan's progress will be discarded.")) return;
    window.TriageContain.reset();
    window.TriageCase.reset();
    const version = window.TriageCase.generation;
    const days = parseInt($("daysSel").value, 10);
    const withUal = $("ualChk").checked;
    $("progTitle").textContent = "Collecting evidence for " + upn + "…";
    stepUi();
    showScreen("screen-progress");
    let ev;
    scanning = true;
    try {
      if (demoMode) {
        ev = window.TriageDemo.evidenceFor(upn);
        ev.days = days;
        // animate the steps for the demo
        for (const s of STEPS) {
          setStep(s[0], "run");
          await new Promise(function (r) { setTimeout(r, 180); });
          window.TriageCase.assert(version);
          setStep(s[0], "ok");
        }
      } else {
        ev = await collect(upn, days, withUal);
      }
    } catch(e) { if(e.name !== 'AbortError') alert(e.message); return; }
    finally { if(version === window.TriageCase.generation) scanning = false; }
    if(version !== window.TriageCase.generation) return;
    showEvidence(ev);
  }
  const progressActions=document.createElement('div');progressActions.className='actions';
  progressActions.innerHTML='<button class="btn" id="reviewCollected">Review collected evidence</button><button class="btn" id="cancelQuick">Cancel collection</button>';
  $('screen-progress').append(progressActions);
  $('reviewCollected').onclick=()=>{const ev=window.TriageCase.current;if(ev){window.TriageReport.show(ev,window.TriageDetections.analyze(ev));lastEvidence=ev;showScreen('screen-report');$('containFromReportBtn').style.display='none';}};
  $('cancelQuick').onclick=()=>{const ev=window.TriageCase.current;window.TriageCase.reset();scanning=false;if(ev){for(const m of Object.values(ev.manifest))if(m.state==='running')m.state='cancelled';showEvidence(ev);}};
  async function resumePages() {
    const ev=lastEvidence;
    if(scanning || !ev || ev.imported || ev.demo || ev.tenantId !== G.account?.tenantId) return;
    window.TriageContain.reset();window.TriageCase.reset();window.TriageCase.current=ev;
    const version=window.TriageCase.generation;scanning=true;
    try {
      for(const [key,m] of Object.entries(ev.manifest)) {
        const field={signins:'signIns',audits:'directoryAudits',ual:'ualRecords',oauth:'oauthGrants'}[key];
        if(!field)continue;
        const queries=m.queries || [m];
        for(const q of queries) {
          if(!q.nextLink)continue;
          const result=await G.pages(q.nextLink,20);window.TriageCase.assert(version);
          const seen=new Set();ev[field]=[...ev[field],...result.records].filter(r=>{const id=r.id||JSON.stringify(r);if(seen.has(id))return false;seen.add(id);return true;});
          const {records,...metadata}=result;Object.assign(q,metadata,{pages:(q.pages||0)+result.pages});
        }
        m.state=queries.every(q=>q.state==='complete')?'complete':'partial';m.count=ev[field].length;
      }
      showEvidence(ev);
    }catch(e){if(e.name!=='AbortError')alert(e.message);}
    finally{if(version===window.TriageCase.generation)scanning=false;}
  }
  // ---------- containment ----------
  // Runs off exactly the same search as triage: whatever account is selected
  // here is the account the runbook opens on, together with its findings when
  // triage has already run in this session.
  async function startContain() {
    const upn = (selectedUser && selectedUser.userPrincipalName) || upnInput.value.trim();
    if (!upn) return;
    let user = (selectedUser && selectedUser.userPrincipalName.toLowerCase() === upn.toLowerCase())
      ? selectedUser : { userPrincipalName: upn };
    if (!demoMode && !user.id) {
      try {
        user = await G.gfetch(A.graphV1 + "/users/" + encodeURIComponent(upn) +
          "?$select=id,displayName,userPrincipalName,accountEnabled");
      } catch (e) { alert('Cannot resolve the target account: '+e.message); return; }
    }
    openContain(user);
  }
  function openContain(user) {
    const same = lastEvidence && (demoMode || (lastEvidence.tenantId === G.account?.tenantId && lastEvidence.user?.id === user.id)) && lastEvidence.upn &&
      lastEvidence.upn.toLowerCase() === String(user.userPrincipalName || "").toLowerCase();
    window.TriageContain.start(user, {
      demo: demoMode,
      context: same ? { evidence: lastEvidence, findings: lastFindings } : null
    });
    showScreen("screen-contain");
  }
  $("containFromReportBtn").addEventListener("click", async function () {
    if (lastEvidence?.imported) {
      try {
        const expected = {...lastEvidence.subject, tenantId:lastEvidence.tenantId, caseId:lastEvidence.caseId};
        if (!G.account) await G.signIn();
        if (!expected.tenantId || expected.tenantId !== G.account?.tenantId) throw Error("Sign in to the verified case tenant before responding.");
        const resolved = await G.gfetch(A.graphV1+"/users/"+encodeURIComponent(expected.upn)+"?$select=id,userPrincipalName,displayName,accountEnabled");
        if (!expected.objectId || resolved.id !== expected.objectId || lastEvidence.caseId !== expected.caseId) throw Error("The imported subject identity cannot be verified. Run a new quick check.");
        demoMode=false; openContain(resolved);
      } catch(e) { alert(e.message); }
      return;
    }
    const u = (selectedUser && lastEvidence && selectedUser.userPrincipalName === lastEvidence.upn)
      ? selectedUser : { userPrincipalName: (lastEvidence && lastEvidence.upn) || "" };
    if (!u.userPrincipalName) return;
    openContain({...u,...(lastEvidence?.user || {})});
  });

  // Analyze an evidence object and render the report. Shared by live triage,
  // the demo, and the imported-evidence viewer (js/import.js).
  function showEvidence(ev, analyzed) {
    if (window.TriageCase.current !== ev) { window.TriageContain.reset(); window.TriageCase.reset(); }
    window.TriageCase.ensure(ev);
    window.TriageCase.current = ev;
    if(!analyzed && window.TriageAnalysis.count(ev)>10000){
      const version=window.TriageCase.generation;$('progTitle').textContent='Analyzing the case in the background…';showScreen('screen-progress');$('containFromReportBtn').style.display='none';
      window.TriageAnalysis.run(ev,'quick',window.TriageCase.signal).then(findings=>{if(version===window.TriageCase.generation)showEvidence(ev,findings);}).catch(e=>{if(e.name!=='AbortError')alert(e.message);});return;
    }
    const findings = analyzed || window.TriageDetections.analyze(ev);
    lastEvidence = ev; lastFindings = findings;
    window.TriageReport.show(ev, findings);
    let resume=$('resumeQuick');
    if(!resume){resume=document.createElement('button');resume.id='resumeQuick';resume.className='btn';resume.textContent='Continue remaining pages';resume.onclick=resumePages;$('repMeta').after(resume);}
    resume.hidden=!!ev.imported || !!ev.demo || !Object.values(ev.manifest).some(m=>m.nextLink || m.queries?.some(q=>q.nextLink));
    // Imported evidence has no live tenant behind it - containment would have
    // nothing to act on, so the hand-off button only shows for a live/demo run.
    $("containFromReportBtn").style.display = ev.imported && (!ev.tenantId || !ev.user?.id) ? "none" : "";
    $("containFromReportBtn").textContent = ev.imported ? "Verify identity to respond" : "Contain this account";
    // A scan can finish while the analyst is on another tab. Don't yank them
    // over - the report quietly becomes where the Triage tab resumes.
    const watching = !shownScreen || shownScreen === "screen-import" || toolFor(shownScreen) === "triage";
    if (watching) showScreen("screen-report");
    else {
      if (openTabs.indexOf("triage") < 0) openTabs.push("triage");
      toolScreen.triage = "screen-report";
      renderTabs();
    }
  }
  $("startBtn").addEventListener("click", startSelected);
  $("newSearchBtn").addEventListener("click", function () {
    upnInput.value = ""; selectedUser = null; $("startBtn").disabled = true;
    openSearch("triage");
  });

  // ---------- public API (used by js/import.js and js/contain.js) ----------
  window.TriageApp = {
    showEvidence: showEvidence,
    showScreen: showScreen,
    home: function () { showScreen(homeScreen()); },
    containSearch: function () {
      upnInput.value = ""; selectedUser = null; $("startBtn").disabled = true;
      openSearch("contain");
    },
    // "Run triage on this account first", from inside the containment runbook.
    triageFor: function (user) {
      selectedUser = user;
      upnInput.value = user.userPrincipalName;
      $("startBtn").disabled = false;
      setMode("triage");
      startTriage();
    }
  };

  // ---------- boot ----------
  window.TriageApp.ready = (async function () {
    const params = new URLSearchParams(window.location.search);

    // Deep link: /?demo=1 jumps straight into the simulated tenant, so the demo
    // can be linked or targeted on its own (survives refresh while the flag stays).
    if (params.get("demo") === "1") {
      demoMode = true;
      afterSignIn("Demo analyst", "contoso-demo.com");
      return;
    }

    // Forensic hygiene: a hard refresh always returns to the login screen. We
    // still initialise MSAL (so the next sign-in works) but drop any cached
    // session instead of silently restoring it.
    if (A.clientId.indexOf("00000000") !== 0) {
      try {
        await G.init();
        await G.forgetSession();
      } catch (e) { /* stay on login */ }
    }
    showScreen("screen-login");
  })();
})();
