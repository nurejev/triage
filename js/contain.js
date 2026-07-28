// ======================================================================
//  Containment - the "first 60 minutes" runbook, executed live.
//
//  Structure and ordering follow Tiago S. Carvalho's Microsoft 365 IR
//  runbook (First 60 Minutes After a Compromised Account, 2026):
//    revoke sessions -> disable -> reset password -> authentication
//    methods -> inbox rules & forwarding -> OAuth grants,
//  then blast-radius mapping, evidence preservation and communication.
//
//  This is the ONLY file in the app that writes to a tenant. Every mutating
//  call goes through TriageGraph.gwrite(), which uses the containment scopes
//  the analyst has to arm explicitly first. Every action - executed or ticked
//  off by hand - lands in an exportable, timestamped action log.
// ======================================================================
(function () {
  const G = window.TriageGraph, A = window.TRIAGE_AUTH;

  let target = null;    // { id, userPrincipalName, displayName }
  let demo = false;
  let armed = false;
  let ctx = null;       // triage evidence+findings for this user, when we have it
  let log = [];
  let st = {};          // step key -> { status, note }
  let checks = {};      // checklist item id -> true
  let tempPwd = "";
  let confirmCb = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function nowIso() { return new Date().toISOString(); }
  function hhmm(iso) { return iso.slice(11, 19) + "Z"; }
  function who() {
    const a = G.account;
    return (a && (a.username || a.name)) || (demo ? "demo analyst" : "unknown");
  }

  // ---------------------------------------------------------------- log ---
  function logAdd(step, action, result, detail) {
    log.push({ ts: nowIso(), step: step, action: action, result: result,
      detail: detail || "", target: target ? target.userPrincipalName : "", by: who(), demo: demo });
    renderLog();
    return log[log.length - 1];
  }
  function setStatus(key, status, note) {
    st[key] = { status: status, note: note || "" };
    const el = $("cs-" + key);
    if (el) {
      el.className = "cstep " + status;
      const p = el.querySelector(".cs-pill");
      if (p) {
        p.className = "cs-pill " + status;
        p.textContent = { pending: "not done", running: "running…", done: "done",
          failed: "failed", skipped: "skipped", manual: "manual" }[status] || status;
      }
      const n = el.querySelector(".cs-note");
      if (n) n.textContent = note || "";
    }
  }

  // ------------------------------------------------------------ helpers ---
  function genPassword() {
    const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*?-_=+"];
    const all = sets.join("");
    const n = 20;
    const buf = new Uint32Array(n);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    const out = sets.map(function (s, i) { return s.charAt(buf[i] % s.length); });
    for (let i = sets.length; i < n; i++) out.push(all.charAt(buf[i] % all.length));
    // Fisher-Yates with the same entropy pool
    for (let i = out.length - 1; i > 0; i--) {
      const j = buf[i] % (i + 1);
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.join("");
  }
  function copyText(s, btn) {
    const done = function () {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = old; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(done, function () { fallback(s); done(); });
    } else { fallback(s); done(); }
    function fallback(v) {
      const ta = document.createElement("textarea");
      ta.value = v; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
  }
  function download(name, mime, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // -------------------------------------------------------- confirm modal --
  function confirmAction(title, body, okLabel, cb) {
    $("cfTitle").textContent = title;
    $("cfBody").innerHTML = body;
    $("cfOk").textContent = okLabel;
    $("confirmModal").classList.add("open");
    confirmCb = cb;
  }
  function closeConfirm(run) {
    $("confirmModal").classList.remove("open");
    const cb = confirmCb; confirmCb = null;
    if (run && cb) cb();
  }

  // ====================================================================
  //  Step definitions - order is deliberate, see the runbook.
  // ====================================================================
  const STEPS = [
    {
      key: "preserve", n: 0, kind: "gate",
      title: "Preserve the evidence before you change anything",
      why: "Remediation destroys evidence. The inbox rule you delete, the OAuth grant you revoke and " +
           "the sign-in session you kill are all artefacts somebody will ask about later. Export first, " +
           "then contain. Running triage on this account (or importing an extraction) gives you the " +
           "sign-in and audit evidence in one JSON.",
      ps: null
    },
    {
      key: "revoke", n: 1, kind: "action",
      title: "Revoke sign-in sessions",
      why: "First, because most compromises in 2025-2026 are token theft, not password theft. This " +
           "invalidates the refresh tokens, so the stolen session cannot be renewed. Access tokens " +
           "already issued stay valid until they expire (roughly an hour, less with Continuous Access " +
           "Evaluation) - which is why this is the first step and not the only one.",
      btn: "Revoke sessions now",
      confirm: "All of this account's refresh tokens are invalidated. The user is signed out of every " +
               "client and will have to sign in again.",
      ps: 'Connect-MgGraph -Scopes "User.RevokeSessions.All","User.ReadWrite.All",' +
          '"UserAuthenticationMethod.ReadWrite.All","DelegatedPermissionGrant.ReadWrite.All"\n' +
          "Revoke-MgUserSignInSession -UserId {UPN}",
      run: async function () {
        if (demo) { await sleep(600); return "refresh tokens invalidated (simulated)"; }
        await G.gwrite(A.graphV1 + "/users/" + encodeURIComponent(target.id || target.userPrincipalName) +
          "/revokeSignInSessions", "POST", {});
        return "refresh tokens invalidated";
      }
    },
    {
      key: "disable", n: 2, kind: "action",
      title: "Disable the account",
      why: "Disable, never delete - deletion destroys the audit trail and is painful to undo. Disabling " +
           "blocks new sign-ins and closes the access-token window for CAE-capable workloads. Re-enable " +
           "only when containment is verified and the blast-radius list is finished, not when the user " +
           "complains.",
      btn: "Disable account",
      confirm: "The account is blocked from signing in. Anything running as this user - including " +
               "legitimate business processes - stops. This is reversible.",
      ps: "Update-MgUser -UserId {UPN} -AccountEnabled:$false",
      run: async function () {
        if (demo) { await sleep(500); return "accountEnabled = false (simulated)"; }
        await G.gwrite(A.graphV1 + "/users/" + encodeURIComponent(target.id || target.userPrincipalName),
          "PATCH", { accountEnabled: false });
        return "accountEnabled = false";
      },
      extra: { label: "Re-enable account", danger: true,
        confirm: "Only re-enable once containment is verified: sessions revoked, password reset, " +
                 "authentication methods clean, OAuth grants reviewed and the blast-radius list finished.",
        run: async function () {
          if (demo) { await sleep(400); return "accountEnabled = true (simulated)"; }
          await G.gwrite(A.graphV1 + "/users/" + encodeURIComponent(target.id || target.userPrincipalName),
            "PATCH", { accountEnabled: true });
          return "accountEnabled = true";
        } }
    },
    {
      key: "password", n: 3, kind: "password",
      title: "Reset the password",
      why: "A throwaway password that breaks the attacker's hold - not the one the user types tomorrow. " +
           "It is generated in this browser tab, shown once, and never sent anywhere but Microsoft Graph. " +
           "The user sets their own through your controlled process when the account is re-enabled.",
      btn: "Generate & set a temporary password",
      confirm: "The current password stops working immediately. The user must change the temporary " +
               "password at next sign-in. Copy it before you leave this screen - it is shown once.",
      ps: "$passwordProfile = @{ ForceChangePasswordNextSignIn = $true; Password = $tempPwd }\n" +
          "Update-MgUser -UserId {UPN} -PasswordProfile $passwordProfile",
      run: async function () {
        const pwd = genPassword();
        if (demo) { await sleep(500); tempPwd = pwd; return "temporary password set (simulated)"; }
        await G.gwrite(A.graphV1 + "/users/" + encodeURIComponent(target.id || target.userPrincipalName),
          "PATCH", { passwordProfile: { forceChangePasswordNextSignIn: true, password: pwd } });
        tempPwd = pwd;
        return "temporary password set, change required at next sign-in";
      }
    },
    {
      key: "methods", n: 4, kind: "methods",
      title: "Review and strip authentication methods",
      why: "The step most people skip. If the attacker registered their own phone number, authenticator " +
           "or passkey during their working window, the password reset hands the account straight back " +
           "to them through self-service reset. List everything and remove what the user does not " +
           "recognise. A method that is set as the default has to be replaced before it can be removed.",
      btn: "Load authentication methods",
      ps: "Get-MgUserAuthenticationMethod -UserId {UPN} | Select-Object Id, AdditionalProperties\n" +
          "Remove-MgUserAuthenticationPhoneMethod -UserId {UPN} -PhoneAuthenticationMethodId <id>\n" +
          "# also: Remove-MgUserAuthenticationMicrosoftAuthenticatorMethod / -Fido2Method /\n" +
          "#       -TemporaryAccessPassMethod / -SoftwareOathMethod / -EmailMethod"
    },
    {
      key: "rules", n: 5, kind: "rules",
      title: "Inbox rules, mailbox forwarding and delegates",
      btn: "Load rules, forwarding and delegates",
      why: "The single most common persistence artefact. Microsoft does not let a browser touch another " +
           "user's mailbox settings, so this step runs through the Exchange containment backend when one " +
           "is deployed, and falls back to copy-paste PowerShell when it is not. Screenshot or export the " +
           "rule before you delete it: the Description field does not preserve the exact conditions, and " +
           "legal will ask.",
      ps: "# no PowerShell on this machine? the companion container has it all:\n" +
          "#   docker run --rm -it -v \"$PWD/evidence:/evidence\" ghcr.io/nurejev/triage-pwsh:latest\n" +
          "Connect-ExchangeOnline -UserPrincipalName admin@tenant.com   # in the container: -Device\n\n" +
          "# Inbox rules - look for anything created in the incident window\n" +
          "Get-InboxRule -Mailbox {UPN} | Format-List Name,Description,Enabled,RedirectTo,MoveToFolder,DeleteMessage\n\n" +
          "# Mailbox-level forwarding (a different surface to inbox rules)\n" +
          "Get-Mailbox {UPN} | Select-Object Identity,ForwardingAddress,ForwardingSmtpAddress,DeliverToMailboxAndForward\n\n" +
          "# Delegates\n" +
          "Get-MailboxPermission -Identity {UPN} | Where-Object { $_.User -notlike 'NT AUTHORITY\\SELF' -and $_.IsInherited -eq $false }\n\n" +
          "# --- after exporting the evidence ---\n" +
          "Remove-InboxRule -Mailbox {UPN} -Identity '<rule name>'\n" +
          "Set-Mailbox {UPN} -ForwardingAddress $null -ForwardingSmtpAddress $null -DeliverToMailboxAndForward $false"
    },
    {
      key: "oauth", n: 6, kind: "oauth",
      title: "Revoke OAuth consent grants",
      why: "The silent one. A malicious application holding Mail.ReadWrite plus offline_access does not " +
           "need the password or the session - revoking sessions does not touch it. Removing the grant " +
           "stops new tokens being issued; tokens already issued live until they expire. Tenant-wide " +
           "(admin-consented) grants do not show up in this per-user list - check Enterprise " +
           "applications as well.",
      btn: "Load OAuth grants",
      ps: "$userId = (Get-MgUser -Filter \"userPrincipalName eq '{UPN}'\").Id\n" +
          "Get-MgUserOAuth2PermissionGrant -UserId $userId | Select-Object Id,ClientId,Scope,ResourceId\n" +
          "Remove-MgOauth2PermissionGrant -OAuth2PermissionGrantId <grantId>"
    }
  ];

  // Scopes that make an OAuth grant worth a second look.
  const RISKY_SCOPES = ["mail.read", "mail.readwrite", "mail.send", "mailboxsettings.readwrite",
    "files.read.all", "files.readwrite.all", "sites.readwrite.all", "offline_access",
    "directory.readwrite.all", "user.readwrite.all", "application.readwrite.all"];

  // ---- blast radius: the fifteen checks ----------------------------------
  // The definitions and the code that answers each one live in js/blast.js;
  // this file owns rendering, the action log and the evidence exports.
  const BLAST = (window.TriageBlast ? window.TriageBlast.checks : []).map(function (c) {
    return [c.title, c.where, c.what];
  });
  let blastResults = {};   // check key -> { summary, count, rows, raw, caveat }
  let blastDays = 30;      // window the checks query over

  const EVIDENCE = [
    ["Sign-in log export (JSON)", "Entra sign-in logs filtered to the user. JSON, not CSV - CSV truncates the nested fields. Retention is licence-dependent (7 days Free, 30 days P1/P2)."],
    ["Unified Audit Log search", "Purview Audit filtered to the user. Save the CSV export and the search ID for reproducibility."],
    ["Defender XDR incident evidence", "Incident timeline, alert detail and entity graph; the incidents API where JSON detail is needed."],
    ["Identity Protection risk detections", "Each event's JSON payload: location, device, application, risk reason."],
    ["Inbox rule body screenshot", "Before deleting. The PowerShell Description field does not preserve the exact conditions."],
    ["OAuth grant detail", "App ID, display name, scopes, consent timestamp, consent type. Screenshot the enterprise app page too."],
    ["MailItemsAccessed query", "Its own export - it answers whether access was a bind (specific message) or a sync (bulk)."],
    ["Communication log", "Timestamped: who was notified, when, on what channel, what they were told."]
  ];

  const COMMS = [
    ["The user - out of band", "Phone or in person. Never the mailbox or Teams you suspect is compromised. Twenty seconds: suspicious activity, access temporarily restricted, call me back on this number, ignore anything claiming to be IT in the meantime."],
    ["The manager", "They support the user and make the operational calls - and they hand you context you do not have (\"she screen-shared with a vendor last Tuesday\")."],
    ["Security lead / CISO", "One paragraph, calibrated for thirty seconds: one user compromised, suspected vector, containment in progress, blast radius under way, evidence preserved, regulatory assessment pending."],
    ["DPO / privacy lead", "The moment there is reasonable suspicion of personal data exposure. GDPR Art. 33 is 72 hours from awareness - you surface the facts, they decide whether the clock starts."],
    ["Leadership", "Per the standing protocol. Do not improvise the leadership call - say the facts, no more and no less."]
  ];

  // ====================================================================
  //  Rendering
  // ====================================================================
  function psFor(s) {
    return s.ps ? s.ps.replace(/\{UPN\}/g, target ? target.userPrincipalName : "user@tenant.com") : "";
  }

  function stepCard(s) {
    const stat = (st[s.key] && st[s.key].status) || (s.kind === "manual" || s.kind === "gate" ? "manual" : "pending");
    const flag = flagFor(s.key);
    let body = "";

    if (s.kind === "gate") {
      body = '<div class="cs-actions">' +
        '<button class="btn small" data-act="goTriage">Run triage on this account first</button>' +
        '<button class="btn small" data-act="exportEvidence"' + (ctx ? "" : " disabled") + '>Export triage evidence JSON</button>' +
        '<label class="cs-check"><input type="checkbox" data-tick="preserve"' +
        (checks.preserve ? " checked" : "") + "> Evidence exported and attached to the ticket</label></div>";
    } else if (s.kind === "action" || s.kind === "password") {
      body = '<div class="cs-actions"><button class="btn primary" data-act="run" data-key="' + s.key + '"' +
        (armed ? "" : " disabled") + ">" + esc(s.btn) + "</button>" +
        (s.extra ? '<button class="btn" data-act="extra" data-key="' + s.key + '"' +
          (armed ? "" : " disabled") + ">" + esc(s.extra.label) + "</button>" : "") +
        '<label class="cs-check"><input type="checkbox" data-tick="' + s.key + '-skip"' +
        (checks[s.key + "-skip"] ? " checked" : "") + "> Deliberately skipped</label></div>" +
        '<div class="cs-out" id="out-' + s.key + '"></div>';
    } else if (s.kind === "rules") {
      const B = window.TriageBackend;
      const live = demo || (B && B.available());
      body = '<div class="cs-actions">' +
        (live ? '<button class="btn primary" data-act="load" data-key="rules">' + esc(s.btn) + "</button>"
              : '<span class="mini muted">No Exchange backend for this tenant - use the PowerShell below, ' +
                "then tick the box.</span>") +
        '<label class="cs-check"><input type="checkbox" data-tick="rules"' +
        (checks.rules ? " checked" : "") + "> Checked and cleaned</label></div>" +
        '<div class="cs-out" id="out-rules"></div>';
    } else if (s.kind === "methods" || s.kind === "oauth") {
      body = '<div class="cs-actions"><button class="btn primary" data-act="load" data-key="' + s.key + '">' +
        esc(s.btn) + "</button>" +
        '<label class="cs-check"><input type="checkbox" data-tick="' + s.key + '-done"' +
        (checks[s.key + "-done"] ? " checked" : "") + "> Reviewed, nothing else to remove</label></div>" +
        '<div class="cs-out" id="out-' + s.key + '"></div>';
    } else { // manual
      body = '<div class="cs-actions"><label class="cs-check"><input type="checkbox" data-tick="' + s.key + '"' +
        (checks[s.key] ? " checked" : "") + "> Checked and cleaned in Exchange Online</label></div>";
    }

    return '<div class="card cstep ' + stat + '" id="cs-' + s.key + '">' +
      '<div class="cs-head"><span class="cs-n">' + s.n + "</span>" +
      "<h2>" + esc(s.title) + "</h2>" +
      (flag ? '<span class="cs-flag" title="' + esc(flag) + '">flagged by triage</span>' : "") +
      '<span class="hspacer"></span><span class="cs-pill ' + stat + '">' +
      ({ pending: "not done", done: "done", failed: "failed", skipped: "skipped", manual: "manual" }[stat] || stat) +
      "</span></div>" +
      '<p class="muted cs-why">' + esc(s.why) + "</p>" +
      '<div class="cs-note mini"></div>' +
      body +
      (s.ps ? '<details class="cs-ps"><summary>PowerShell equivalent</summary>' +
        '<pre class="code"><code>' + esc(psFor(s)) + "</code></pre>" +
        '<button class="btn small" data-act="copyps" data-key="' + s.key + '">Copy</button></details>' : "") +
      "</div>";
  }

  // Does the triage report say something about this step?
  function flagFor(key) {
    if (!ctx || !ctx.findings) return "";
    const f = ctx.findings;
    const hit = function (re) {
      const m = f.filter(function (x) { return re.test((x.Category || "") + " " + (x.Title || "")); });
      return m.length ? m.length + " finding(s): " + m[0].Title : "";
    };
    if (key === "methods") return hit(/mfa|authentication method/i);
    if (key === "oauth") return hit(/oauth|consent|application/i);
    if (key === "rules") return hit(/inbox rule|forward/i);
    if (key === "revoke") return hit(/sign-in|impossible travel|brute|legacy|risk/i);
    return "";
  }

  // ---- blast radius: runnable cards --------------------------------------
  // Each check answers itself where an API allows it. Running one ticks it;
  // exporting it also ticks the evidence item it satisfies, so the evidence
  // list reflects what you have actually preserved rather than what you
  // remembered to tick.
  function blastDoneCount() {
    return (window.TriageBlast ? window.TriageBlast.checks : [])
      .filter(function (c) { return checks["blast-" + (c.n - 1)]; }).length;
  }
  function blastCard() {
    const B = window.TriageBlast;
    if (!B) return "";
    const ualReady = B.ualAvailable({ demo: demo, evidence: ctx && ctx.evidence });
    return '<div class="card"><div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">' +
      '<h2 style="margin:0">Blast radius — the fifteen checks</h2>' +
      '<span class="mini muted" id="blastDone">' + blastDoneCount() + " of 15 done</span>" +
      '<span class="hspacer" style="margin-left:auto"></span>' +
      '<label class="mini muted">Window <select id="blastDays">' +
      [7, 30, 90].map(function (d) {
        return '<option value="' + d + '"' + (d === blastDays ? " selected" : "") + ">" + d + " days</option>";
      }).join("") + "</select></label>" +
      '<button class="btn small primary" data-act="blastAll">Run all checks</button>' +
      '<button class="btn small lemon" data-act="blastExportAll">Export all evidence</button></div>' +
      '<p class="muted mini">Containment without mapping is a false sense of security. Work the list to the ' +
      "end even when you are sure you found the persistence on item 4 — the second mechanism is usually a " +
      "Power Automate flow or an OAuth grant found on the third pass. Each check that can answer itself does; " +
      "exporting one preserves it as evidence and ticks the matching item below.</p>" +
      (ualReady ? "" :
        '<div class="banner warn mini" id="ualBanner">Checks 6, 7 and 8 read the Unified Audit Log, which is ' +
        "not in memory for this account. Run triage with the audit log enabled, or " +
        '<a href="#" data-act="loadUal">query it now</a> — Microsoft runs it asynchronously and it can take ' +
        "several minutes.<span id=\"ualStatus\"></span></div>") +
      '<div class="cl-grid blast">' + B.checks.map(blastItem).join("") + "</div></div>";
  }
  function blastItem(c) {
    const r = blastResults[c.key];
    const done = !!checks["blast-" + (c.n - 1)];
    const manual = c.mode === "manual";
    return '<div class="cl-item blast' + (done ? " on" : "") + (r && r.failed ? " failed" : "") +
      '" id="bl-' + c.key + '">' +
      '<label class="bl-head"><input type="checkbox" data-tick="blast-' + (c.n - 1) + '"' +
      (done ? " checked" : "") + "><span><b>" + c.n + ". " + esc(c.title) + "</b>" +
      '<span class="cl-where">' + esc(c.where) + "</span></span></label>" +
      '<div class="cl-what">' + esc(c.what) + "</div>" +
      (r ? blastResult(c, r) : "") +
      '<div class="bl-actions">' +
      (manual
        ? '<span class="mini muted">No API — check it in the portal.</span>'
        : '<button class="btn small" data-act="blastRun" data-key="' + c.key + '">' +
          (r ? "Re-run" : "Run check") + "</button>") +
      (r && !r.failed ? '<button class="btn small lemon" data-act="blastExport" data-key="' + c.key +
        '">Export</button>' : "") +
      (manual && c.ps ? '<button class="btn small" data-act="blastPs" data-key="' + c.key +
        '">Copy PowerShell</button>' : "") +
      "</div>" +
      (manual && c.why ? '<div class="mini muted bl-why">' + esc(c.why) + "</div>" : "") +
      "</div>";
  }
  function blastResult(c, r) {
    if (r.running) return '<div class="bl-res mini muted">Running…</div>';
    if (r.failed) return '<div class="bl-res mini" style="color:var(--sev-critical)">' + esc(r.summary) + "</div>";
    return '<div class="bl-res"><div class="bl-sum mini' + (r.alert ? " hot" : "") + '">' + esc(r.summary) + "</div>" +
      (r.rows && r.rows.length
        ? '<table class="bl-tbl">' + r.rows.slice(0, 8).map(function (row) {
            return "<tr><td>" + esc(row[0]) + "</td><td>" + esc(String(row[1] == null ? "" : row[1])) + "</td></tr>";
          }).join("") + "</table>" +
          (r.rows.length > 8 ? '<div class="mini muted">+' + (r.rows.length - 8) + " more in the export</div>" : "")
        : "") +
      (r.caveat ? '<div class="mini muted bl-caveat">' + esc(r.caveat) + "</div>" : "") + "</div>";
  }

  function blastCtx() {
    return { target: target, demo: demo, days: blastDays,
      evidence: ctx && ctx.evidence,
      // Reuse the mailbox already loaded in step 5 rather than asking the
      // backend twice; in demo mode fall back to the staged one.
      mailbox: mailbox || (demo ? demoM2() : null), grants: null };
  }
  async function blastRun(key, quiet) {
    const c = window.TriageBlast.checks.filter(function (x) { return x.key === key; })[0];
    if (!c || !c.run) return;
    blastResults[key] = { running: true };
    refreshBlast();
    try {
      const res = await c.run(blastCtx());
      blastResults[key] = res;
      checks["blast-" + (c.n - 1)] = true;
      if (!quiet) logAdd("blast", "Ran blast-radius check " + c.n + " · " + c.title, "ok", res.summary);
    } catch (e) {
      blastResults[key] = { failed: true, summary: (e && e.message) || String(e) };
      logAdd("blast", "Blast-radius check " + c.n + " · " + c.title + " failed", "fail", (e && e.message) || String(e));
    }
    refreshBlast();
  }
  async function blastAll() {
    const list = window.TriageBlast.checks.filter(function (c) { return !!c.run; });
    logAdd("blast", "Running all blast-radius checks", "note", list.length + " automated checks over " + blastDays + " days");
    for (const c of list) await blastRun(c.key, true);
    const done = list.filter(function (c) { return blastResults[c.key] && !blastResults[c.key].failed; });
    const hot = done.filter(function (c) { return blastResults[c.key].alert; });
    logAdd("blast", "Blast-radius sweep complete", hot.length ? "ok" : "ok",
      done.length + "/" + list.length + " answered" +
      (hot.length ? " · flagged: " + hot.map(function (c) { return c.n + " " + c.title; }).join("; ") : " · nothing flagged"));
  }
  function blastExport(key) {
    const c = window.TriageBlast.checks.filter(function (x) { return x.key === key; })[0];
    const r = blastResults[key];
    if (!c || !r || r.failed) return;
    download("LimonContainment-blast" + c.n + "-" + c.key + "-" + (target.userPrincipalName || "user") +
      "-" + stamp() + ".json", "application/json", JSON.stringify({
        check: c.n, title: c.title, mailbox: target.userPrincipalName, windowDays: blastDays,
        captured: nowIso(), by: who(), demo: demo,
        tool: "Limon-IT M365 Triage build " + window.TRIAGE_BUILD,
        summary: r.summary, caveat: r.caveat || "", count: r.count, detail: r.rows, raw: r.raw
      }, null, 1));
    logAdd("blast", "Exported evidence for check " + c.n + " · " + c.title, "ok", r.summary);
    tickEvidence(c);
  }
  function blastExportAll() {
    const B = window.TriageBlast;
    const bundle = { mailbox: target.userPrincipalName, windowDays: blastDays, captured: nowIso(),
      by: who(), demo: demo, tool: "Limon-IT M365 Triage build " + window.TRIAGE_BUILD, checks: [] };
    B.checks.forEach(function (c) {
      const r = blastResults[c.key];
      bundle.checks.push({ check: c.n, title: c.title, mode: c.mode,
        status: r ? (r.failed ? "failed" : "answered") : (c.run ? "not run" : "manual"),
        summary: r ? r.summary : "", caveat: (r && r.caveat) || "", count: r ? r.count : null,
        detail: r ? r.rows : null, raw: r ? r.raw : null });
      if (r && !r.failed) tickEvidence(c, true);
    });
    download("LimonContainment-blastradius-" + (target.userPrincipalName || "user") + "-" + stamp() + ".json",
      "application/json", JSON.stringify(bundle, null, 1));
    const answered = bundle.checks.filter(function (c) { return c.status === "answered"; }).length;
    logAdd("blast", "Exported the blast-radius bundle", "ok", answered + " of 15 checks answered");
    refreshBlast();
    renderChecklistTicks();
  }
  // Exporting a check preserves the evidence that check produces, so tick the
  // matching item on the evidence list rather than making the analyst do it.
  function tickEvidence(c, silent) {
    if (c.evid === undefined) return;
    const id = "evid-" + c.evid;
    if (checks[id]) return;
    checks[id] = true;
    if (!silent) logAdd("checklist", "Ticked: evidence · " + EVIDENCE[c.evid][0], "note", "exported from check " + c.n);
    renderChecklistTicks();
  }
  // Re-sync checkbox DOM state without re-rendering the whole screen.
  function renderChecklistTicks() {
    document.querySelectorAll("#containBody [data-tick]").forEach(function (el) {
      const on = !!checks[el.getAttribute("data-tick")];
      el.checked = on;
      const item = el.closest(".cl-item");
      if (item) item.classList.toggle("on", on);
    });
  }
  function refreshBlast() {
    const grid = document.querySelector("#containBody .cl-grid.blast");
    if (!grid) return;
    grid.innerHTML = window.TriageBlast.checks.map(blastItem).join("");
    const lbl = $("blastDone");
    if (lbl) lbl.textContent = blastDoneCount() + " of 15 done";
    bind();
  }

  function checklistCard(id, title, intro, rows, cols) {
    return '<div class="card"><h2>' + esc(title) + "</h2>" +
      '<p class="muted mini">' + intro + "</p>" +
      '<div class="cl-grid">' + rows.map(function (r, i) {
        const cid = id + "-" + i;
        return '<label class="cl-item' + (checks[cid] ? " on" : "") + '" data-cl="' + cid + '">' +
          '<input type="checkbox" data-tick="' + cid + '"' + (checks[cid] ? " checked" : "") + ">" +
          "<span><b>" + (cols === 3 ? (i + 1) + ". " : "") + esc(r[0]) + "</b>" +
          (cols === 3 ? '<span class="cl-where">' + esc(r[1]) + "</span>" : "") +
          '<span class="cl-what">' + esc(r[cols === 3 ? 2 : 1]) + "</span></span></label>";
      }).join("") + "</div></div>";
  }

  function renderLog() {
    const el = $("clogRows");
    if (!el) return;
    el.innerHTML = log.length ? log.slice().reverse().map(function (e) {
      return "<tr><td class=\"num mini\">" + esc(hhmm(e.ts)) + "</td>" +
        "<td>" + esc(e.action) + '<div class="muted mini">' + esc(e.detail) + "</div></td>" +
        '<td><span class="lg-' + e.result + '">' + esc(e.result) + "</span></td></tr>";
    }).join("") : '<tr><td colspan="3" class="muted mini">Nothing logged yet.</td></tr>';
    const c = $("clogCount");
    if (c) c.textContent = log.length + " entr" + (log.length === 1 ? "y" : "ies");
  }

  // One honest line about the Exchange backend: present and usable, present
  // but for another tenant, or absent (in which case the mailbox step is
  // PowerShell). Nobody should have to guess mid-incident.
  function backendLine() {
    const B = window.TriageBackend;
    if (demo) return '<p class="mini muted" style="margin:8px 0 0">Exchange backend: simulated for the demo - ' +
      "inbox rules, forwarding and delegates are staged, not real.</p>";
    if (!B || !B.configured()) return '<p class="mini muted" style="margin:8px 0 0">Exchange backend: not deployed. ' +
      "Everything works except clearing inbox rules, forwarding and delegates from here - that step gives you " +
      "prefilled PowerShell instead.</p>";
    if (B.available()) {
      const h = B.health || {};
      return '<p class="mini" style="margin:8px 0 0;color:var(--good)">Exchange backend: connected to <b>' +
        esc(h.organization || h.tenantId || "") + "</b>. Inbox rules, mailbox forwarding and delegates can be " +
        "read and cleared from this screen.</p>";
    }
    const h = B.health;
    return '<p class="mini" style="margin:8px 0 0;color:var(--sev-medium)">Exchange backend: ' +
      (h && h.mismatch ? esc(h.mismatch)
        : h ? "deployed for tenant " + esc(h.organization || h.tenantId) + ", which is not the tenant you are signed into"
            : "configured but not reachable") +
      ". The mailbox step falls back to PowerShell.</p>";
  }

  function render() {
    const u = target || {};
    $("containHead").innerHTML =
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">' +
      "<div><h1>Containment · " + esc(u.userPrincipalName || "") + "</h1>" +
      '<span class="mini muted">' + esc(u.displayName || "") +
      (ctx ? " · triage evidence loaded" : " · no triage evidence in this session") +
      (demo ? " · DEMO - nothing is really changed" : "") + "</span></div>" +
      '<span class="hspacer" style="margin-left:auto"></span>' +
      '<div class="exportrow">' +
      '<button class="btn small" data-act="newSearch">← Other account</button>' +
      '<button class="btn small" data-act="dlLogCsv">Action log CSV</button>' +
      '<button class="btn small lemon" data-act="dlLogMd">Handover report</button>' +
      "</div></div>";

    let h = "";

    // --- arming card
    h += '<div class="card arm ' + (armed ? "on" : "off") + '" id="armCard">' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
      "<div><h2 style=\"margin:0 0 2px\">" + (armed ? "Containment armed" : "Containment is not armed") + "</h2>" +
      '<span class="mini muted">' + (armed
        ? "This tab holds delegated write permissions for " + esc(u.userPrincipalName || "this account") +
          ". Actions below take effect immediately in your tenant."
        : (demo ? "Demo tenant - arm it to walk the runbook with simulated results."
                : "Triage signed you in read-only. Arming requests the containment scopes " +
                  "(revoke sessions, user read/write, authentication methods, delegated permission grants). " +
                  "An administrator consents once per tenant.")) + "</span></div>" +
      '<span class="hspacer" style="margin-left:auto"></span>' +
      (armed ? '<span class="cs-pill done">write access held</span>'
             : '<button class="btn primary" data-act="arm">Arm containment</button>') +
      "</div>" + backendLine() + "</div>";

    // --- triage context
    if (ctx && ctx.findings) {
      const c = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
      ctx.findings.forEach(function (f) { c[f.Severity] = (c[f.Severity] || 0) + 1; });
      const top = ctx.findings.filter(function (f) { return f.Severity === "Critical" || f.Severity === "High"; }).slice(0, 6);
      h += '<div class="card"><h2>What triage found on this account</h2>' +
        '<p class="mini muted">' + c.Critical + " critical · " + c.High + " high · " + c.Medium +
        " medium · " + c.Low + " low, over " + (ctx.evidence && ctx.evidence.days === 1 ? "the last 24 hours"
          : "the last " + ((ctx.evidence && ctx.evidence.days) || "?") + " days") +
        ". Steps that match a finding are marked <em>flagged by triage</em> below.</p>" +
        (top.length ? "<ul class=\"helplist mini\">" + top.map(function (f) {
          return "<li><b>" + esc(f.Severity) + "</b> — " + esc(f.Title) + "</li>";
        }).join("") + "</ul>" : '<p class="mini muted">No critical or high findings - contain anyway if you have another reason to.</p>') +
        '<button class="btn small" data-act="backReport">Back to the report</button></div>';
    }

    // --- the runbook
    h += '<div class="card" style="background:var(--soft)"><h2>The first 60 minutes</h2>' +
      '<p class="mini muted" style="margin:0">Twelve-minute windows: <b>0-12</b> triage and confirmation · ' +
      "<b>12-24</b> containment (the numbered steps below) · <b>24-36</b> blast radius · " +
      "<b>36-48</b> evidence · <b>48-60</b> communication. The order of the containment steps is not " +
      "arbitrary: resetting the password before revoking sessions leaves the attacker a window to add " +
      "a recovery method with the token they already hold, and walk back in through the reset you " +
      "just did.</p></div>";

    h += STEPS.map(stepCard).join("");

    h += blastCard();

    h += checklistCard("evid", "Evidence to preserve",
      "The exports are what survive the remediation. This folder is what forensics, audit and — if it " +
      "goes that far — the regulator will work from.", EVIDENCE, 2);

    h += checklistCard("comm", "Communication",
      "Do not talk to the compromised user on the compromised channel. The IR engineer surfaces facts; " +
      "the DPO, legal and leadership decide what is notifiable.", COMMS, 2);

    h += '<div class="card"><div style="display:flex;align-items:baseline;gap:10px"><h2 style="margin:0">Action log</h2>' +
      '<span class="mini muted" id="clogCount"></span><span class="hspacer" style="margin-left:auto"></span>' +
      '<button class="btn small" data-act="dlLogCsv">CSV</button>' +
      '<button class="btn small" data-act="dlLogMd">Markdown</button></div>' +
      '<p class="mini muted">Every executed action and every box ticked, timestamped in UTC and stamped with the ' +
      "signed-in operator. Attach it to the ticket — it is the timeline somebody will ask you for.</p>" +
      '<table class="ftable"><thead><tr><th style="width:90px">Time (UTC)</th><th>Action</th>' +
      '<th style="width:80px">Result</th></tr></thead><tbody id="clogRows"></tbody></table></div>';

    $("containBody").innerHTML = h;
    bind();
    renderLog();
    STEPS.forEach(function (s) {
      if (st[s.key]) setStatus(s.key, st[s.key].status, st[s.key].note);
    });
  }

  // ====================================================================
  //  Wiring
  // ====================================================================
  function bind() {
    const root = $("screen-contain");
    // Idempotent: refreshBlast() re-runs this after re-rendering one grid, and
    // double-bound buttons would fire their action twice.
    root.querySelectorAll("[data-act]").forEach(function (el) {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("click", function (e) {
        e.preventDefault();
        onAct(el.getAttribute("data-act"), el.getAttribute("data-key"), el);
      });
    });
    const ds = $("blastDays");
    if (ds && !ds.dataset.bound) {
      ds.dataset.bound = "1";
      ds.addEventListener("change", function () {
        blastDays = parseInt(ds.value, 10);
        blastResults = {};
        window.TriageBlast.reset();
        logAdd("blast", "Blast-radius window set to " + blastDays + " days", "note", "previous results cleared");
        refreshBlast();
      });
    }
    root.querySelectorAll("[data-tick]").forEach(function (el) {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("change", function () {
        const id = el.getAttribute("data-tick");
        checks[id] = el.checked;
        const item = el.closest(".cl-item");
        if (item) item.classList.toggle("on", el.checked);
        const label = labelForTick(id);
        logAdd("checklist", (el.checked ? "Ticked: " : "Un-ticked: ") + label, "note", "");
        if (/-skip$/.test(id)) setStatus(id.replace(/-skip$/, ""), el.checked ? "skipped" : "pending",
          el.checked ? "deliberately skipped" : "");
        if (/-done$/.test(id) && el.checked) setStatus(id.replace(/-done$/, ""), "done", "reviewed by hand");
      });
    });
  }
  function labelForTick(id) {
    const m = /^(blast|evid|comm)-(\d+)$/.exec(id);
    if (m) {
      const src = { blast: BLAST, evid: EVIDENCE, comm: COMMS }[m[1]];
      return (m[1] === "blast" ? "blast radius " + (+m[2] + 1) + " · " : m[1] === "evid" ? "evidence · " : "communication · ") +
        src[+m[2]][0];
    }
    const base = id.replace(/-(skip|done)$/, "");
    const s = STEPS.filter(function (x) { return x.key === base; })[0];
    return (s ? s.title : id) + (/-skip$/.test(id) ? " (skipped)" : /-done$/.test(id) ? " (reviewed)" : "");
  }

  function onAct(act, key, el) {
    const step = STEPS.filter(function (s) { return s.key === key; })[0];
    if (act === "arm") return arm();
    if (act === "newSearch") return window.TriageApp.containSearch();
    if (act === "goTriage") return window.TriageApp.triageFor(target);
    if (act === "backReport") return window.TriageApp.showScreen("screen-report");
    if (act === "exportEvidence") return exportEvidence();
    if (act === "dlLogCsv") return exportLogCsv();
    if (act === "dlLogMd") return exportLogMd();
    if (act === "copyps") return copyText(psFor(step), el);
    if (act === "copypwd") return copyText(tempPwd, el);
    if (act === "run") return runStep(step, false);
    if (act === "extra") return runStep(step, true);
    if (act === "load") return key === "methods" ? loadMethods() : key === "rules" ? loadMailbox() : loadGrants();
    if (act === "delmethod") return delMethod(el.getAttribute("data-id"), el.getAttribute("data-path"), el.getAttribute("data-label"));
    if (act === "delgrant") return delGrant(el.getAttribute("data-id"), el.getAttribute("data-label"));
    if (act === "delrule") return delRule(el.getAttribute("data-id"), el.getAttribute("data-label"));
    if (act === "disrule") return disRule(el.getAttribute("data-id"), el.getAttribute("data-label"));
    if (act === "clearfwd") return clearForwarding();
    if (act === "deldeleg") return delDelegate(el.getAttribute("data-id"));
    if (act === "dlrules") return exportMailboxEvidence();
    if (act === "blastRun") return blastRun(key);
    if (act === "blastAll") return blastAll();
    if (act === "blastExport") return blastExport(key);
    if (act === "blastExportAll") return blastExportAll();
    if (act === "blastPs") {
      const c = window.TriageBlast.checks.filter(function (x) { return x.key === key; })[0];
      return copyText(c.ps.replace(/\{UPN\}/g, target.userPrincipalName), el);
    }
    if (act === "loadUal") return loadUalNow();
  }

  // The Unified Audit Log query Microsoft runs asynchronously - minutes, not
  // seconds. Never implicit: the analyst asks for it, and gets a status while
  // it runs.
  async function loadUalNow() {
    const s = $("ualStatus");
    if (s) s.textContent = " · starting…";
    logAdd("blast", "Started a Unified Audit Log query", "note", "window " + blastDays + " days");
    try {
      await window.TriageBlast.loadUal(blastCtx(), function (status, sec) {
        if (s) s.textContent = " · " + status + " (" + sec + "s)";
      });
      logAdd("blast", "Unified Audit Log query finished", "ok", "checks 6, 7 and 8 can now run");
      const b = $("ualBanner");
      if (b) b.remove();
      for (const k of ["mailitems", "spo", "teams"]) await blastRun(k, true);
    } catch (e) {
      if (s) s.textContent = " · failed: " + ((e && e.message) || e);
      logAdd("blast", "Unified Audit Log query failed", "fail", (e && e.message) || String(e));
    }
  }

  async function arm() {
    if (demo) {
      armed = true;
      logAdd("arm", "Containment armed (demo tenant)", "note", "no real permissions requested");
      render();
      return;
    }
    try {
      await G.elevate();
      armed = true;
      logAdd("arm", "Containment armed", "ok", "write scopes granted to this tab: " + A.containScopes.join(", "));
      // Separate consent for the Exchange backend, so arming Graph containment
      // in a tenant without a backend never prompts for something unusable.
      const B = window.TriageBackend;
      if (B && B.available()) {
        try {
          await G.token([B.scope()]);
          logAdd("arm", "Exchange backend authorised", "ok", B.scope());
        } catch (e2) {
          logAdd("arm", "Exchange backend not authorised", "fail",
            String((e2 && (e2.errorCode || e2.message)) || e2));
        }
      }
      render();
    } catch (e) {
      const msg = String((e && (e.errorCode || e.message)) || e);
      if (/interaction_in_progress|user_cancelled|popup_window_error/i.test(msg)) return;
      logAdd("arm", "Arming containment failed", "fail", msg);
      alert("Could not get write permissions: " + msg +
        "\n\nAn administrator may need to grant consent once for this tenant (the consent link is on the sign-in screen).");
    }
  }

  function runStep(step, isExtra) {
    const spec = isExtra ? step.extra : step;
    if (!armed) return;
    confirmAction(
      (isExtra ? spec.label : step.title) + " — " + target.userPrincipalName,
      "<p>" + esc(spec.confirm || "") + "</p>" +
      (demo ? '<p class="mini muted">Demo tenant: nothing is actually changed.</p>'
            : '<p class="mini"><b>This takes effect immediately in ' +
              esc((G.account && G.account.username || "").split("@")[1] || "your tenant") + ".</b></p>"),
      isExtra ? spec.label : (step.btn || "Run"),
      async function () {
        setStatus(step.key, "running");
        const btns = document.querySelectorAll('#cs-' + step.key + ' [data-act="run"],#cs-' + step.key + ' [data-act="extra"]');
        btns.forEach(function (b) { b.disabled = true; });
        try {
          const note = await spec.run();
          setStatus(step.key, isExtra ? "pending" : "done", note);
          logAdd(step.key, (isExtra ? spec.label : step.title), "ok", note);
          if (step.key === "password") showPassword();
        } catch (e) {
          const msg = (e && e.message) || String(e);
          setStatus(step.key, "failed", msg);
          logAdd(step.key, (isExtra ? spec.label : step.title), "fail", msg);
        }
        btns.forEach(function (b) { b.disabled = false; });
      });
  }

  function showPassword() {
    const out = $("out-password");
    if (!out) return;
    out.innerHTML = '<div class="pwdbox"><span class="mini muted">Temporary password — shown once, ' +
      "not stored anywhere. Hand it over on the same out-of-band channel you used to reach the user.</span>" +
      '<div class="pwdrow"><code id="pwdVal">' + esc(tempPwd) + "</code>" +
      '<button class="btn small" data-act="copypwd">Copy</button></div></div>';
    out.querySelectorAll("[data-act]").forEach(function (el) {
      el.addEventListener("click", function () { onAct(el.getAttribute("data-act"), null, el); });
    });
  }

  // ------------------------------------------------- authentication methods --
  const METHOD_MAP = {
    "#microsoft.graph.phoneAuthenticationMethod": { path: "phoneMethods", label: "Phone" },
    "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod": { path: "microsoftAuthenticatorMethods", label: "Microsoft Authenticator" },
    "#microsoft.graph.fido2AuthenticationMethod": { path: "fido2Methods", label: "FIDO2 / passkey" },
    "#microsoft.graph.softwareOathAuthenticationMethod": { path: "softwareOathMethods", label: "Software OATH token" },
    "#microsoft.graph.temporaryAccessPassAuthenticationMethod": { path: "temporaryAccessPassMethods", label: "Temporary Access Pass" },
    "#microsoft.graph.emailAuthenticationMethod": { path: "emailMethods", label: "Email (SSPR)" },
    "#microsoft.graph.windowsHelloForBusinessAuthenticationMethod": { path: "windowsHelloForBusinessMethods", label: "Windows Hello for Business" },
    "#microsoft.graph.passwordlessMicrosoftAuthenticatorAuthenticationMethod": { path: "passwordlessMicrosoftAuthenticatorMethods", label: "Passwordless Authenticator" },
    "#microsoft.graph.platformCredentialAuthenticationMethod": { path: "platformCredentialMethods", label: "Platform credential" },
    "#microsoft.graph.passwordAuthenticationMethod": { path: null, label: "Password" }
  };

  function methodDetail(m) {
    return m.phoneNumber || m.emailAddress || m.displayName || m.deviceTag || m.model ||
      (m.lifetimeInMinutes ? "TAP, " + m.lifetimeInMinutes + " min" : "") || "—";
  }

  async function loadMethods() {
    const out = $("out-methods");
    out.innerHTML = '<p class="mini muted">Loading…</p>';
    try {
      let methods;
      if (demo) {
        await sleep(400);
        methods = demoMethods();
      } else {
        const b = await G.gfetch(A.graphV1 + "/users/" +
          encodeURIComponent(target.id || target.userPrincipalName) + "/authentication/methods");
        methods = (b && b.value) || [];
      }
      renderMethods(methods);
      logAdd("methods", "Listed authentication methods", "ok", methods.length + " method(s)");
    } catch (e) {
      out.innerHTML = '<p class="mini" style="color:var(--sev-critical)">' + esc(e.message || String(e)) + "</p>";
      logAdd("methods", "Listing authentication methods failed", "fail", e.message || String(e));
    }
  }
  function renderMethods(methods) {
    const out = $("out-methods");
    if (!methods.length) {
      out.innerHTML = '<p class="mini muted">No authentication methods registered — which is itself a finding: ' +
        "the account has no strong method, or the attacker removed them.</p>";
      return;
    }
    out.innerHTML = '<table class="ftable"><thead><tr><th>Method</th><th>Detail</th>' +
      '<th style="width:150px">Registered</th><th style="width:90px"></th></tr></thead><tbody>' +
      methods.map(function (m) {
        const meta = METHOD_MAP[m["@odata.type"]] || { path: null, label: (m["@odata.type"] || "unknown").replace("#microsoft.graph.", "") };
        const created = (m.createdDateTime || "").slice(0, 10);
        return "<tr><td><b>" + esc(meta.label) + "</b></td><td>" + esc(methodDetail(m)) +
          '<div class="muted mini">' + esc(m.id || "") + "</div></td>" +
          '<td class="mini num">' + esc(created || "—") + "</td><td>" +
          (meta.path && armed
            ? '<button class="btn small danger" data-act="delmethod" data-id="' + esc(m.id) +
              '" data-path="' + meta.path + '" data-label="' + esc(meta.label + " · " + methodDetail(m)) + '">Remove</button>'
            : '<span class="mini muted">' + (meta.path ? "arm first" : "not removable") + "</span>") +
          "</td></tr>";
      }).join("") + "</tbody></table>" +
      '<p class="mini muted">Remove what the user does not recognise — an attacker-registered phone or ' +
      "authenticator survives the password reset. A method that is the account's default has to be " +
      "replaced before Graph will let it go.</p>";
    out.querySelectorAll("[data-act]").forEach(function (el) {
      el.addEventListener("click", function () { onAct(el.getAttribute("data-act"), null, el); });
    });
  }
  function delMethod(id, path, label) {
    confirmAction("Remove authentication method", "<p>Remove <b>" + esc(label) + "</b> from " +
      esc(target.userPrincipalName) + "?</p><p class=\"mini muted\">Screenshot it first if it is attacker-added " +
      "evidence — this cannot be undone.</p>", "Remove method", async function () {
      try {
        if (demo) { await sleep(350); demoDropMethod(id); }
        else await G.gwrite(A.graphV1 + "/users/" + encodeURIComponent(target.id || target.userPrincipalName) +
          "/authentication/" + path + "/" + encodeURIComponent(id), "DELETE");
        logAdd("methods", "Removed authentication method", "ok", label);
        setStatus("methods", "done", "method removed");
        loadMethods();
      } catch (e) {
        logAdd("methods", "Removing authentication method failed", "fail", label + " — " + (e.message || e));
        alert("Could not remove the method: " + (e.message || e));
      }
    });
  }

  // ------------------------------------- inbox rules / forwarding / delegates --
  // Everything in this block goes through the Exchange containment backend
  // (see backend/server.js): the browser cannot reach another user's mailbox
  // settings, and no credential that could is ever shipped to the browser.
  let mailbox = null;   // { rules, forwarding, delegates }

  async function loadMailbox() {
    const out = $("out-rules");
    out.innerHTML = '<p class="mini muted">Asking the Exchange backend…</p>';
    try {
      if (demo) {
        await sleep(600);
        mailbox = demoMailbox();
      } else {
        const B = window.TriageBackend;
        const [r, f, d] = await Promise.all([
          B.rulesList(target.userPrincipalName),
          B.forwardingGet(target.userPrincipalName),
          B.delegatesList(target.userPrincipalName)
        ]);
        mailbox = { rules: r.rules || [], forwarding: f, delegates: d.delegates || [] };
      }
      renderMailbox();
      logAdd("rules", "Read mailbox rules, forwarding and delegates", "ok",
        mailbox.rules.length + " rule(s), " + mailbox.delegates.length + " delegate(s)" +
        (fwdActive() ? ", forwarding ACTIVE" : ", no forwarding"));
    } catch (e) {
      out.innerHTML = '<p class="mini" style="color:var(--sev-critical)">' + esc(e.message || String(e)) +
        '</p><p class="mini muted">Use the PowerShell below instead - the commands are prefilled with this mailbox.</p>';
      logAdd("rules", "Reading mailbox settings failed", "fail", e.message || String(e));
    }
  }
  function fwdActive() {
    const f = mailbox && mailbox.forwarding;
    return !!(f && (f.forwardingAddress || f.forwardingSmtpAddress));
  }
  // A rule worth looking at twice: it forwards/redirects out, or hides mail.
  function ruleSuspicious(r) {
    return (r.forwardTo || []).length || (r.redirectTo || []).length ||
      (r.forwardAsAttachment || []).length || r.deleteMessage ||
      /deleted items|rss|junk|archive|conversation history/i.test(r.moveToFolder || "") ||
      (r.markAsRead && r.stopProcessingRules) || /^[.\s_-]{1,3}$/.test(r.name || "");
  }
  function renderMailbox() {
    const out = $("out-rules");
    const f = mailbox.forwarding || {};
    let h = "";

    h += '<h3>Mailbox forwarding</h3>';
    if (fwdActive()) {
      h += '<p class="mini" style="color:var(--sev-critical)"><b>Forwarding is active.</b> ' +
        (f.forwardingSmtpAddress ? "ForwardingSmtpAddress: <code>" + esc(f.forwardingSmtpAddress) + "</code> " : "") +
        (f.forwardingAddress ? "ForwardingAddress: <code>" + esc(f.forwardingAddress) + "</code> " : "") +
        (f.deliverToMailboxAndForward ? "(copy kept in the mailbox - the user sees nothing missing)" : "(mail is not kept locally)") +
        "</p>" + (armed ? '<button class="btn danger small" data-act="clearfwd">Clear forwarding</button>'
                        : '<span class="mini muted">Arm containment to clear it.</span>');
    } else {
      h += '<p class="mini muted">No mailbox-level forwarding configured.</p>';
    }

    h += '<h3 style="margin-top:16px">Inbox rules <span class="mini muted">(' + mailbox.rules.length + ")</span></h3>";
    if (!mailbox.rules.length) {
      h += '<p class="mini muted">No inbox rules on this mailbox.</p>';
    } else {
      h += '<table class="ftable"><thead><tr><th>Rule</th><th>What it does</th>' +
        '<th style="width:70px">State</th><th style="width:150px"></th></tr></thead><tbody>' +
        mailbox.rules.map(function (r) {
          const bad = ruleSuspicious(r);
          const acts = [];
          if ((r.forwardTo || []).length) acts.push("forwards to " + r.forwardTo.join(", "));
          if ((r.redirectTo || []).length) acts.push("redirects to " + r.redirectTo.join(", "));
          if ((r.forwardAsAttachment || []).length) acts.push("forwards as attachment to " + r.forwardAsAttachment.join(", "));
          if (r.moveToFolder) acts.push("moves to " + r.moveToFolder);
          if (r.deleteMessage) acts.push("deletes the message");
          if (r.markAsRead) acts.push("marks as read");
          if (r.stopProcessingRules) acts.push("stops processing further rules");
          const cond = [];
          if ((r.from || []).length) cond.push("from " + r.from.join(", "));
          if ((r.subjectContains || []).length) cond.push("subject contains " + r.subjectContains.join(", "));
          if ((r.bodyContains || []).length) cond.push("body contains " + r.bodyContains.join(", "));
          const label = (r.name || "(unnamed)") + " · " + (acts.join("; ") || "no visible action");
          return '<tr><td><b>' + esc(r.name || "(unnamed)") + "</b>" +
            (bad ? ' <span class="cs-flag">suspicious</span>' : "") +
            '<div class="muted mini">' + esc(r.id) + "</div></td>" +
            "<td class=\"mini\">" + esc(acts.join("; ") || "—") +
            (cond.length ? '<div class="muted">when ' + esc(cond.join(" or ")) + "</div>" : "") + "</td>" +
            '<td class="mini">' + (r.enabled ? "enabled" : "disabled") + "</td><td>" +
            (armed
              ? (r.enabled ? '<button class="btn small" data-act="disrule" data-id="' + esc(r.id) +
                  '" data-label="' + esc(label) + '">Disable</button> ' : "") +
                '<button class="btn small danger" data-act="delrule" data-id="' + esc(r.id) +
                '" data-label="' + esc(label) + '">Delete</button>'
              : '<span class="mini muted">arm first</span>') + "</td></tr>";
        }).join("") + "</tbody></table>" +
        '<p class="mini muted">Disable preserves the rule as evidence and stops it working; delete removes it. ' +
        "Export the JSON below before deleting - it is the only copy of the exact conditions.</p>";
    }

    h += '<h3 style="margin-top:16px">Delegates <span class="mini muted">(' + mailbox.delegates.length + ")</span></h3>";
    if (!mailbox.delegates.length) {
      h += '<p class="mini muted">No explicit non-inherited mailbox permissions.</p>';
    } else {
      h += '<table class="ftable"><thead><tr><th>User</th><th>Rights</th><th style="width:90px"></th></tr></thead><tbody>' +
        mailbox.delegates.map(function (d) {
          return "<tr><td>" + esc(d.user) + "</td><td class=\"mini\">" + esc((d.accessRights || []).join(", ")) +
            (d.deny ? " (deny)" : "") + "</td><td>" +
            (armed && /FullAccess/i.test((d.accessRights || []).join(","))
              ? '<button class="btn small danger" data-act="deldeleg" data-id="' + esc(d.user) + '">Remove</button>'
              : '<span class="mini muted">' + (armed ? "manual" : "arm first") + "</span>") + "</td></tr>";
        }).join("") + "</tbody></table>";
    }

    h += '<div class="cs-actions" style="margin-top:14px">' +
      '<button class="btn small lemon" data-act="dlrules">Export mailbox evidence JSON</button>' +
      '<button class="btn small" data-act="load" data-key="rules">Reload</button></div>';

    out.innerHTML = h;
    out.querySelectorAll("[data-act]").forEach(function (el) {
      el.addEventListener("click", function () { onAct(el.getAttribute("data-act"), el.getAttribute("data-key"), el); });
    });
  }
  function mailboxAction(title, warning, okLabel, fn, logLabel) {
    if (!armed) return;
    confirmAction(title, "<p>" + warning + "</p>" +
      (demo ? '<p class="mini muted">Demo tenant: nothing is actually changed.</p>'
            : '<p class="mini"><b>This changes the mailbox immediately.</b> Export the evidence JSON first if you have not.</p>'),
      okLabel, async function () {
        try {
          const note = await fn();
          logAdd("rules", logLabel, "ok", note || "");
          setStatus("rules", "done", note || "");
          loadMailbox();
        } catch (e) {
          logAdd("rules", logLabel + " failed", "fail", e.message || String(e));
          alert("Exchange refused the change: " + (e.message || e));
        }
      });
  }
  function delRule(id, label) {
    mailboxAction("Delete inbox rule", "Delete <b>" + esc(label) + "</b> from " +
      esc(target.userPrincipalName) + "? The rule and its exact conditions are gone for good.",
      "Delete rule", async function () {
        if (demo) { await sleep(350); demoM2().rules = demoM2().rules.filter(r => r.id !== id); return label; }
        await window.TriageBackend.rulesRemove(target.userPrincipalName, id);
        return label;
      }, "Deleted inbox rule");
  }
  function disRule(id, label) {
    mailboxAction("Disable inbox rule", "Disable <b>" + esc(label) + "</b>? It stops working but stays " +
      "on the mailbox as evidence - the safer choice while the investigation is open.",
      "Disable rule", async function () {
        if (demo) { await sleep(300); demoM2().rules.forEach(r => { if (r.id === id) r.enabled = false; }); return label; }
        await window.TriageBackend.rulesDisable(target.userPrincipalName, id);
        return label;
      }, "Disabled inbox rule");
  }
  function clearForwarding() {
    const f = mailbox.forwarding || {};
    mailboxAction("Clear mailbox forwarding",
      "Remove forwarding to <b>" + esc(f.forwardingSmtpAddress || f.forwardingAddress || "") + "</b> from " +
      esc(target.userPrincipalName) + "?", "Clear forwarding", async function () {
        if (demo) { await sleep(350); const m = demoM2(); const was = m.forwarding.forwardingSmtpAddress;
          m.forwarding = { forwardingAddress: "", forwardingSmtpAddress: "", deliverToMailboxAndForward: false }; return "was " + was; }
        const r = await window.TriageBackend.forwardingClear(target.userPrincipalName);
        return "was " + (r.previousForwardingSmtpAddress || r.previousForwardingAddress || "unset");
      }, "Cleared mailbox forwarding");
  }
  function delDelegate(user) {
    mailboxAction("Remove mailbox delegate", "Remove FullAccess for <b>" + esc(user) + "</b> on " +
      esc(target.userPrincipalName) + "?", "Remove delegate", async function () {
        if (demo) { await sleep(300); const m = demoM2(); m.delegates = m.delegates.filter(d => d.user !== user); return user; }
        await window.TriageBackend.delegatesRemove(target.userPrincipalName, user);
        return user;
      }, "Removed mailbox delegate");
  }
  function exportMailboxEvidence() {
    download("LimonContainment-mailbox-" + (target.userPrincipalName || "user") + "-" + stamp() + ".json",
      "application/json", JSON.stringify({
        mailbox: target.userPrincipalName, captured: nowIso(), by: who(), demo: demo,
        tool: "Limon-IT M365 Triage build " + window.TRIAGE_BUILD,
        forwarding: mailbox.forwarding, inboxRules: mailbox.rules, delegates: mailbox.delegates
      }, null, 1));
    logAdd("rules", "Exported mailbox evidence JSON", "ok",
      mailbox.rules.length + " rule(s) captured before remediation");
  }

  // ------------------------------------------------------------ OAuth grants --
  async function loadGrants() {
    const out = $("out-oauth");
    out.innerHTML = '<p class="mini muted">Loading…</p>';
    try {
      let grants;
      if (demo) {
        await sleep(400);
        grants = demoGrants();
      } else {
        grants = await G.gall(A.graphV1 + "/users/" +
          encodeURIComponent(target.id || target.userPrincipalName) + "/oauth2PermissionGrants", 4);
        for (const g of grants) {
          try {
            const sp = await G.gfetch(A.graphV1 + "/servicePrincipals/" + g.clientId + "?$select=displayName,appId,verifiedPublisher");
            g.appName = sp.displayName;
            g.publisher = (sp.verifiedPublisher && sp.verifiedPublisher.displayName) || "";
          } catch (e) { g.appName = g.clientId; }
        }
      }
      renderGrants(grants);
      logAdd("oauth", "Listed OAuth permission grants", "ok", grants.length + " grant(s)");
    } catch (e) {
      out.innerHTML = '<p class="mini" style="color:var(--sev-critical)">' + esc(e.message || String(e)) + "</p>";
      logAdd("oauth", "Listing OAuth grants failed", "fail", e.message || String(e));
    }
  }
  function renderGrants(grants) {
    const out = $("out-oauth");
    if (!grants.length) {
      out.innerHTML = '<p class="mini muted">No user-specific delegated grants. Tenant-wide (admin-consented) ' +
        "grants are not listed here — check Entra &gt; Enterprise applications for those.</p>";
      return;
    }
    out.innerHTML = '<table class="ftable"><thead><tr><th>Application</th><th>Scopes</th>' +
      '<th style="width:100px">Consent</th><th style="width:90px"></th></tr></thead><tbody>' +
      grants.map(function (g) {
        const scopes = (g.scope || "").trim().split(/\s+/).filter(Boolean);
        const risky = scopes.filter(function (s) { return RISKY_SCOPES.indexOf(s.toLowerCase()) >= 0; });
        const tenantWide = g.consentType === "AllPrincipals";
        return "<tr><td><b>" + esc(g.appName || g.clientId) + "</b>" +
          (g.publisher ? '<div class="muted mini">verified publisher: ' + esc(g.publisher) + "</div>"
                       : '<div class="mini" style="color:var(--sev-medium)">no verified publisher</div>') + "</td>" +
          "<td class=\"mini\">" + scopes.map(function (s) {
            return risky.indexOf(s) >= 0 ? '<span class="scope risky">' + esc(s) + "</span>"
                                         : '<span class="scope">' + esc(s) + "</span>";
          }).join(" ") + "</td>" +
          '<td class="mini">' + (tenantWide ? '<b style="color:var(--sev-high)">tenant-wide</b>' : "this user") + "</td>" +
          "<td>" + (armed
            ? '<button class="btn small danger" data-act="delgrant" data-id="' + esc(g.id) +
              '" data-label="' + esc((g.appName || g.clientId) + " · " + (g.scope || "")) + '">Revoke</button>'
            : '<span class="mini muted">arm first</span>') + "</td></tr>";
      }).join("") + "</tbody></table>" +
      '<p class="mini muted">Mail.ReadWrite, Files.ReadWrite.All and offline_access together is the OAuth ' +
      "consent-phishing pattern. Revoking stops new tokens under the grant; tokens already issued live " +
      "until they expire. A <b>tenant-wide</b> grant affects every user — check what breaks before revoking.</p>";
    out.querySelectorAll("[data-act]").forEach(function (el) {
      el.addEventListener("click", function () { onAct(el.getAttribute("data-act"), null, el); });
    });
  }
  function delGrant(id, label) {
    confirmAction("Revoke OAuth grant", "<p>Revoke <b>" + esc(label) + "</b>?</p>" +
      '<p class="mini muted">Export the grant detail first (app ID, scopes, consent timestamp) — it is ' +
      "evidence. If this is a tenant-wide grant it affects every user of that application.</p>",
      "Revoke grant", async function () {
        try {
          if (demo) { await sleep(350); demoDropGrant(id); }
          else await G.gwrite(A.graphV1 + "/oauth2PermissionGrants/" + encodeURIComponent(id), "DELETE");
          logAdd("oauth", "Revoked OAuth permission grant", "ok", label);
          setStatus("oauth", "done", "grant revoked");
          loadGrants();
        } catch (e) {
          logAdd("oauth", "Revoking OAuth grant failed", "fail", label + " — " + (e.message || e));
          alert("Could not revoke the grant: " + (e.message || e));
        }
      });
  }

  // ------------------------------------------------------------------ demo --
  let demoM = null, demoG = null;
  function demoMethods() {
    if (!demoM) demoM = [
      { "@odata.type": "#microsoft.graph.passwordAuthenticationMethod", id: "28c10230-6103-485e-b985-444c60001490" },
      { "@odata.type": "#microsoft.graph.phoneAuthenticationMethod", id: "3179e48a-750b-4051-897c-87b9720928f7",
        phoneNumber: "+234 807 555 0142", createdDateTime: "2026-07-15T03:18:00Z" },
      { "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod", id: "a1b2c3d4-1111-2222-3333-444455556666",
        displayName: "SM-G991B", deviceTag: "SoftwareTokenActivated", createdDateTime: "2026-07-15T03:19:00Z" }
    ];
    return demoM;
  }
  function demoDropMethod(id) { demoM = demoMethods().filter(function (m) { return m.id !== id; }); }
  function demoGrants() {
    if (!demoG) demoG = [
      { id: "grant-1", clientId: "6b1f0d11-2222-4a4a-9c9c-aaaa00000001", appName: "eM Reader Pro",
        publisher: "", consentType: "Principal",
        scope: "Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite offline_access" },
      { id: "grant-2", clientId: "0000000c-0000-0000-c000-000000000000", appName: "Microsoft App Access Panel",
        publisher: "Microsoft", consentType: "AllPrincipals", scope: "User.Read" }
    ];
    return demoG;
  }
  function demoDropGrant(id) { demoG = demoGrants().filter(function (g) { return g.id !== id; }); }
  // Staged mailbox for the demo BEC: the classic hiding rule plus forwarding.
  let demoMB = null;
  function demoM2() {
    if (!demoMB) demoMB = {
      rules: [
        { id: "AAMkAD...RuleA", name: ".", enabled: true, priority: 1,
          forwardTo: ["collector-inbox@gmail-mail.top"], redirectTo: [], forwardAsAttachment: [],
          moveToFolder: "RSS Feeds", deleteMessage: false, markAsRead: true, stopProcessingRules: true,
          from: [], subjectContains: ["invoice", "IBAN", "payment"], bodyContains: [] },
        { id: "AAMkAD...RuleB", name: "Newsletters", enabled: true, priority: 2,
          forwardTo: [], redirectTo: [], forwardAsAttachment: [], moveToFolder: "Newsletters",
          deleteMessage: false, markAsRead: false, stopProcessingRules: false,
          from: ["news@vendor.example"], subjectContains: [], bodyContains: [] }
      ],
      forwarding: { forwardingAddress: "", forwardingSmtpAddress: "collector-inbox@gmail-mail.top",
        deliverToMailboxAndForward: true },
      delegates: [{ user: "sales.kim@contoso-demo.com", accessRights: ["FullAccess"], deny: false }]
    };
    return demoMB;
  }
  function demoMailbox() { return demoM2(); }

  // --------------------------------------------------------------- exports --
  function exportEvidence() {
    if (!ctx) return;
    const copy = Object.assign({}, ctx.evidence, { findings: ctx.findings,
      generated: nowIso(), tool: "Limon-IT M365 Triage build " + window.TRIAGE_BUILD });
    download("LimonTriage-evidence-" + (target.userPrincipalName || "user") + "-" + stamp() + ".json",
      "application/json", JSON.stringify(copy, null, 1));
    checks.preserve = true;
    logAdd("preserve", "Exported triage evidence JSON", "ok", "");
    const cb = document.querySelector('[data-tick="preserve"]');
    if (cb) cb.checked = true;
  }
  function exportLogCsv() {
    const cols = ["ts", "step", "action", "result", "detail", "target", "by", "demo"];
    const lines = [cols.join(",")];
    log.forEach(function (e) {
      lines.push(cols.map(function (c) {
        return '"' + String(e[c] == null ? "" : e[c]).replace(/"/g, '""') + '"';
      }).join(","));
    });
    download("LimonContainment-" + (target.userPrincipalName || "user") + "-" + stamp() + ".csv",
      "text/csv;charset=utf-8", "﻿" + lines.join("\r\n"));
  }
  function exportLogMd() {
    const done = STEPS.filter(function (s) { return st[s.key] && st[s.key].status === "done"; });
    const open = STEPS.filter(function (s) { return !st[s.key] || (st[s.key].status !== "done" && st[s.key].status !== "skipped"); });
    const cl = function (id, title, rows) {
      const ticked = rows.map(function (r, i) { return checks[id + "-" + i] ? r[0] : null; }).filter(Boolean);
      const miss = rows.map(function (r, i) { return checks[id + "-" + i] ? null : r[0]; }).filter(Boolean);
      return "### " + title + " (" + ticked.length + "/" + rows.length + ")\n\n" +
        (ticked.length ? ticked.map(function (t) { return "- [x] " + t; }).join("\n") + "\n" : "") +
        (miss.length ? miss.map(function (t) { return "- [ ] " + t; }).join("\n") + "\n" : "") + "\n";
    };
    const md = "# Containment handover — " + (target.userPrincipalName || "") + "\n\n" +
      "- **Account:** " + (target.userPrincipalName || "") + (target.displayName ? " (" + target.displayName + ")" : "") + "\n" +
      "- **Operator:** " + who() + "\n" +
      "- **Started:** " + (log.length ? log[0].ts : nowIso()) + "\n" +
      "- **Generated:** " + nowIso() + "\n" +
      "- **Tool:** Limon-IT M365 Triage build " + window.TRIAGE_BUILD + (demo ? " — **DEMO DATA, nothing was changed**" : "") + "\n\n" +
      (ctx && ctx.findings ? "## Triage summary\n\n" + ctx.findings.filter(function (f) {
        return f.Severity === "Critical" || f.Severity === "High";
      }).map(function (f) { return "- **" + f.Severity + "** " + f.Title + " — " + f.Detail; }).join("\n") + "\n\n" : "") +
      "## Containment steps\n\n" + STEPS.map(function (s) {
        const state = (st[s.key] && st[s.key].status) || "not done";
        return "- [" + (state === "done" ? "x" : " ") + "] **" + s.n + ". " + s.title + "** — " + state +
          (st[s.key] && st[s.key].note ? " (" + st[s.key].note + ")" : "");
      }).join("\n") + "\n\n" +
      // Blast radius gets its own section: what each check actually found is
      // more useful to the next person than a row of ticks.
      "### Blast radius (" + window.TriageBlast.checks.filter(function (c) { return checks["blast-" + (c.n - 1)]; }).length +
        "/15)\n\n" + window.TriageBlast.checks.map(function (c) {
        const r = blastResults[c.key];
        const box = checks["blast-" + (c.n - 1)] ? "x" : " ";
        const state = r ? (r.failed ? "FAILED: " + r.summary : r.summary)
          : (c.run ? "not run" : "manual - check in the portal");
        return "- [" + box + "] **" + c.n + ". " + c.title + "** — " + (r && r.alert ? "**FLAGGED** " : "") +
          String(state).replace(/\|/g, "/") +
          (r && r.caveat ? "\n  - _" + r.caveat + "_" : "");
      }).join("\n") + "\n\n" +
      cl("evid", "Evidence preserved", EVIDENCE) + cl("comm", "Communication", COMMS) +
      "## Action log\n\n| Time (UTC) | Step | Action | Result | Detail |\n|---|---|---|---|---|\n" +
      log.map(function (e) {
        return "| " + e.ts + " | " + e.step + " | " + e.action.replace(/\|/g, "/") + " | " + e.result +
          " | " + String(e.detail).replace(/\|/g, "/") + " |";
      }).join("\n") + "\n\n" +
      (open.length ? "## Still open\n\n" + open.map(function (s) { return "- " + s.n + ". " + s.title; }).join("\n") + "\n\n" : "") +
      "---\n_" + done.length + " of " + (STEPS.length - 1) + " containment steps executed. " +
      "Indicators, not verdicts — verify before acting._\n";
    download("LimonContainment-" + (target.userPrincipalName || "user") + "-" + stamp() + ".md",
      "text/markdown;charset=utf-8", md);
  }

  // ====================================================================
  //  Entry point
  // ====================================================================
  function start(user, opts) {
    opts = opts || {};
    // Probe once per session; render again if the answer changes the screen.
    if (window.TriageBackend && !opts.demo) {
      window.TriageBackend.probe().then(function () {
        if ($("screen-contain").classList.contains("active")) render();
      });
    }
    const same = target && user && target.userPrincipalName === user.userPrincipalName;
    if (!same) {
      log = []; st = {}; checks = {}; tempPwd = "";
      demoM = null; demoG = null; demoMB = null; mailbox = null;
      blastResults = {};
      const d = (opts.context && opts.context.evidence && opts.context.evidence.days) || 30;
      blastDays = [7, 30, 90].indexOf(d) >= 0 ? d : 30;   // the 24h triage window is too short to map with
      if (window.TriageBlast) window.TriageBlast.reset();
    }
    target = user;
    demo = !!opts.demo;
    ctx = opts.context || null;
    armed = armed && same && (demo || G.elevated);
    if (!same) logAdd("start", "Containment opened for " + user.userPrincipalName, "note",
      ctx ? "triage evidence in context" : "no triage evidence in this session");
    render();
    window.scrollTo(0, 0);
  }

  // This file is loaded at the end of <body>, so the modal is already parsed.
  $("cfOk").addEventListener("click", function () { closeConfirm(true); });
  $("cfCancel").addEventListener("click", function () { closeConfirm(false); });
  $("confirmModal").addEventListener("click", function (e) {
    if (e.target.id === "confirmModal") closeConfirm(false);
  });

  window.TriageContain = { start: start, get target() { return target; } };
})();
