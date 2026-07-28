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
      key: "rules", n: 5, kind: "manual",
      title: "Inbox rules, mailbox forwarding and delegates",
      why: "The single most common persistence artefact - and the one Graph cannot reach with delegated " +
           "permissions on somebody else's mailbox. Run these in Exchange Online PowerShell. Screenshot " +
           "the rule body before you delete it: the Description field does not preserve the exact " +
           "conditions, and legal will ask. No PowerShell at hand? " +
           "docker run --rm -it ghcr.io/nurejev/triage-pwsh:latest has the module preinstalled " +
           "(sign in with Connect-ExchangeOnline -Device).",
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

  // ---- blast radius: the fifteen checks ---------------------------------
  const BLAST = [
    ["Sign-in logs (interactive)", "Entra > Sign-in logs > Interactive", "Atypical travel, anonymous IPs, out-of-hours sign-ins, new user agents, failures followed by one success."],
    ["Sign-in logs (non-interactive / SP)", "Entra > Sign-in logs > Non-interactive, Service principal", "Tokens used by apps the user consented to; service principal activity tied to the user."],
    ["Risky users / risky sign-ins", "Entra ID Protection", "Risk detections in the last 30 days - including the medium ones below the auto-block threshold."],
    ["Inbox rules", "Exchange Online PowerShell / Outlook", "Anything created in the incident window: redirect, move to Deleted Items, mark as read, external forward."],
    ["Mailbox forwarding", "Exchange Online: Get-Mailbox", "ForwardingAddress and ForwardingSmtpAddress - the SMTP field can point externally while the other is empty."],
    ["Mailbox audit - MailItemsAccessed", "Purview Audit (Unified Audit Log)", "Bulk read patterns; message IDs accessed in tight windows. This is the exfiltration signal."],
    ["SharePoint & OneDrive activity", "Purview Audit: FileDownloaded, FileSyncDownloadedFull, FileAccessedExtended", "Sites the user never touched, volume downloads, sync from unusual devices."],
    ["Teams activity", "Purview Audit: Teams activities", "Chats with external tenants, files shared in 1:1 chats, channel posts during the window."],
    ["OAuth consent grants", "Entra > Enterprise applications > User consent", "Recently consented apps; Mail.ReadWrite / Files.ReadWrite.All / offline_access is the phishing pattern."],
    ["Power Automate flows", "Power Platform admin centre > Flows by owner", "The most overlooked exfiltration channel. Flows that mail externally or write to SharePoint."],
    ["Power Apps owned", "Power Platform admin centre > Apps by owner", "Quick sweep for any account that has touched Power Platform."],
    ["Group membership changes", "Entra > Audit logs > 'Member Added'", "Privileged groups, distribution lists with mailbox access, sensitive Teams."],
    ["Service principals the user could edit", "Entra > Audit logs > service principal actions", "New credentials added to an existing service principal during the window - admin-level persistence."],
    ["New user creation", "Entra > Audit logs > 'Add user'", "If the account could create users, this is where the second account is hiding."],
    ["Conditional Access policy edits", "Entra > Audit logs > 'Update conditional access policy'", "If the account held Security or CA Administrator: was a policy edited or disabled?"]
  ];

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
      "</div></div>";

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

    h += checklistCard("blast", "Blast radius — the fifteen checks",
      "Containment without mapping is a false sense of security. Work the list to the end even when you " +
      "are sure you found the persistence on item 4 — the second mechanism is usually a Power Automate " +
      "flow or an OAuth grant found on the third pass.", BLAST, 3);

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
    root.querySelectorAll("[data-act]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        onAct(el.getAttribute("data-act"), el.getAttribute("data-key"), el);
      });
    });
    root.querySelectorAll("[data-tick]").forEach(function (el) {
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
    if (act === "load") return key === "methods" ? loadMethods() : loadGrants();
    if (act === "delmethod") return delMethod(el.getAttribute("data-id"), el.getAttribute("data-path"), el.getAttribute("data-label"));
    if (act === "delgrant") return delGrant(el.getAttribute("data-id"), el.getAttribute("data-label"));
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
      cl("blast", "Blast radius", BLAST) + cl("evid", "Evidence preserved", EVIDENCE) + cl("comm", "Communication", COMMS) +
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
    const same = target && user && target.userPrincipalName === user.userPrincipalName;
    if (!same) { log = []; st = {}; checks = {}; tempPwd = ""; demoM = null; demoG = null; }
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
