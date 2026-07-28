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
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    if (id !== "screen-whatsnew" && id !== "screen-help") lastScreen = id;
    window.scrollTo(0, 0);
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
  $("logoHome").addEventListener("click", function () { showScreen(homeScreen()); });
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
    $("demoBanner").style.display = demoMode ? "" : "none";
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
  $("modeTriageBtn").addEventListener("click", function () { openSearch("triage"); });
  $("modeContainBtn").addEventListener("click", function () { openSearch("contain"); });
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
  $("signOutBtn").addEventListener("click", async function () {
    if (!demoMode) await G.signOut();
    demoMode = false;
    $("whoBox").style.display = "none";
    $("signOutBtn").style.display = "none";
    showScreen("screen-login");
  });
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
      suggestions = await searchUsers(q);
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
    const ev = { upn: upn, days: days, demo: false, skipped: [], signIns: [], ualRecords: [],
      oauthGrants: [], riskyUsers: [], riskDetections: [], directoryAudits: [],
      authMethods: { loaded: false, methods: [] }, user: {} };
    const start = new Date(Date.now() - days * 864e5).toISOString();
    const end = new Date().toISOString();
    const uq = "'" + upn.replace(/'/g, "''") + "'";

    async function step(key, fn, optional) {
      setStep(key, "run");
      try {
        await fn();
        setStep(key, "ok");
      } catch (e) {
        setStep(key, optional ? "skip" : "fail", (e.message || "").slice(0, 90));
        ev.skipped.push(key);
      }
    }

    await step("profile", async function () {
      ev.user = await G.gfetch(A.graphV1 + "/users/" + encodeURIComponent(upn) +
        "?$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastPasswordChangeDateTime,jobTitle,department,onPremisesSyncEnabled");
    });
    const uid = ev.user.id;

    await step("signins", async function () {
      ev.signIns = await G.gall(A.graphBase + "/auditLogs/signIns?$top=500&$filter=" +
        encodeURIComponent("userPrincipalName eq " + uq + " and createdDateTime ge " + start), 20);
      setStep("signins", "ok", ev.signIns.length + " events");
    });

    await step("audits", async function () {
      ev.directoryAudits = await G.gall(A.graphV1 + "/auditLogs/directoryAudits?$top=500&$filter=" +
        encodeURIComponent("activityDateTime ge " + start + " and initiatedBy/user/userPrincipalName eq " + uq), 6);
      setStep("audits", "ok", ev.directoryAudits.length + " events");
    }, true);

    await step("risky", async function () {
      ev.riskyUsers = await G.gall(A.graphV1 + "/identityProtection/riskyUsers?$filter=" +
        encodeURIComponent("userPrincipalName eq " + uq), 2);
      ev.riskDetections = await G.gall(A.graphV1 + "/identityProtection/riskDetections?$filter=" +
        encodeURIComponent("userPrincipalName eq " + uq), 4);
    }, true);

    await step("mfa", async function () {
      const m = await G.gall(A.graphV1 + "/users/" + uid + "/authentication/methods", 2);
      ev.authMethods = { loaded: true, methods: m };
      setStep("mfa", "ok", m.length + " method(s)");
    }, true);

    await step("oauth", async function () {
      const grants = await G.gall(A.graphV1 + "/users/" + uid + "/oauth2PermissionGrants", 4);
      // resolve app names
      const spIds = Array.from(new Set(grants.map(function (g) { return g.clientId; }))).slice(0, 40);
      const names = {};
      for (const id of spIds) {
        try {
          const sp = await G.gfetch(A.graphV1 + "/servicePrincipals/" + id + "?$select=displayName,appId");
          names[id] = sp.displayName;
        } catch (e) { names[id] = id; }
      }
      ev.oauthGrants = grants.map(function (g) {
        return { appName: names[g.clientId], clientId: g.clientId, scope: g.scope,
          consentType: g.consentType, createdDateTime: null };
      });
      setStep("oauth", "ok", grants.length + " grant(s)");
    }, true);

    if (withUal) {
      await step("ual", async function () {
        const recs = await G.ualQuery(upn, start, end, function (status, sec) {
          setStep("ual", "run", status + " · " + sec + "s");
        });
        ev.ualRecords = recs.map(function (r) {
          return { createdDateTime: r.createdDateTime, operation: r.operation,
            userPrincipalName: r.userPrincipalName, auditData: r.auditData || {} };
        });
        setStep("ual", "ok", ev.ualRecords.length + " events");
      }, true);
    } else {
      setStep("ual", "skip", "disabled");
      ev.skipped.push("ual");
    }
    return ev;
  }

  async function startTriage() {
    const upn = (selectedUser && selectedUser.userPrincipalName) || upnInput.value.trim();
    if (!upn) return;
    const days = parseInt($("daysSel").value, 10);
    const withUal = $("ualChk").checked;
    $("progTitle").textContent = "Collecting evidence for " + upn + "…";
    stepUi();
    showScreen("screen-progress");
    let ev;
    if (demoMode) {
      ev = window.TriageDemo.evidenceFor(upn);
      ev.days = days;
      // animate the steps for the demo
      for (const s of STEPS) {
        setStep(s[0], "run");
        await new Promise(function (r) { setTimeout(r, 180); });
        setStep(s[0], "ok");
      }
    } else {
      ev = await collect(upn, days, withUal);
    }
    showEvidence(ev);
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
      } catch (e) { /* UPN alone is a valid Graph key - carry on */ }
    }
    openContain(user);
  }
  function openContain(user) {
    const same = lastEvidence && lastEvidence.upn &&
      lastEvidence.upn.toLowerCase() === String(user.userPrincipalName || "").toLowerCase();
    window.TriageContain.start(user, {
      demo: demoMode,
      context: same ? { evidence: lastEvidence, findings: lastFindings } : null
    });
    showScreen("screen-contain");
  }
  $("containFromReportBtn").addEventListener("click", function () {
    const u = (selectedUser && lastEvidence && selectedUser.userPrincipalName === lastEvidence.upn)
      ? selectedUser : { userPrincipalName: (lastEvidence && lastEvidence.upn) || "" };
    if (!u.userPrincipalName) return;
    openContain(u);
  });

  // Analyze an evidence object and render the report. Shared by live triage,
  // the demo, and the imported-evidence viewer (js/import.js).
  function showEvidence(ev) {
    const findings = window.TriageDetections.analyze(ev);
    lastEvidence = ev; lastFindings = findings;
    window.TriageReport.show(ev, findings);
    // Imported evidence has no live tenant behind it - containment would have
    // nothing to act on, so the hand-off button only shows for a live/demo run.
    $("containFromReportBtn").style.display = ev.imported ? "none" : "";
    showScreen("screen-report");
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
  (async function () {
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
