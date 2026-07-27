// Graph + MSAL plumbing. Read-only by default; the containment screen has to
// ask for write scopes explicitly (elevate()). Everything stays in this tab.
(function () {
  const A = window.TRIAGE_AUTH;
  let msalApp = null;
  let account = null;
  let elevated = false;   // true once the containment (write) scopes are held

  function app() {
    if (!msalApp) {
      msalApp = new msal.PublicClientApplication({
        auth: {
          clientId: A.clientId,
          authority: A.authority,
          redirectUri: window.location.origin + window.location.pathname
        },
        cache: { cacheLocation: "sessionStorage" }
      });
    }
    return msalApp;
  }

  async function init() {
    await app().initialize();
    const res = await app().handleRedirectPromise();
    if (res && res.account) account = res.account;
    if (!account) {
      const all = app().getAllAccounts();
      if (all.length) account = all[0];
    }
    return account;
  }

  async function signIn() {
    const res = await app().loginPopup({ scopes: A.scopes });
    account = res.account;
    return account;
  }

  async function signOut() {
    const acc = account;
    account = null;
    elevated = false;
    try { await app().logoutPopup({ account: acc }); } catch (e) { /* user closed popup */ }
  }

  // Drop any cached MSAL session WITHOUT a network round-trip, so a page
  // reload returns to the login screen (forensic hygiene: no silent restore).
  // MSAL keeps its tokens/accounts in sessionStorage; we clear the app's cache
  // if the SDK exposes it, then sweep any leftover keys as a version-proof
  // fallback. Nothing here revokes tenant consent - it only forgets this tab.
  async function forgetSession() {
    try { if (msalApp && typeof msalApp.clearCache === "function") await msalApp.clearCache(); }
    catch (e) { /* older SDK - fall through to the manual sweep */ }
    try {
      const cid = A.clientId;
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && (/msal|login\.(windows|microsoftonline)/i.test(k) || (cid && k.indexOf(cid) !== -1)))
          sessionStorage.removeItem(k);
      }
    } catch (e) { /* private mode / storage disabled */ }
    account = null;
    elevated = false;
  }

  async function token(scopes) {
    const req = { scopes: scopes || A.scopes, account: account };
    try {
      return (await app().acquireTokenSilent(req)).accessToken;
    } catch (e) {
      return (await app().acquireTokenPopup(req)).accessToken;
    }
  }

  // Step up to the containment (write) scopes. Silent if the tenant already
  // consented, otherwise a popup - which is the deliberate "I am about to
  // change something" moment. Read-only triage never calls this.
  async function elevate() {
    await token(A.containScopes);
    elevated = true;
    return true;
  }

  async function gfetch(url, opts) {
    const t = await token(opts && opts.scopes);
    const r = await fetch(url, Object.assign({
      headers: Object.assign({ Authorization: "Bearer " + t, "Content-Type": "application/json" },
        (opts && opts.headers) || {})
    }, opts || {}));
    if (r.status === 204) return null;
    const body = await r.json().catch(function () { return null; });
    if (!r.ok) {
      const msg = (body && body.error && (body.error.code + ": " + body.error.message)) || ("HTTP " + r.status);
      const err = new Error(msg);
      err.status = r.status;
      throw err;
    }
    return body;
  }

  // Follow @odata.nextLink; cap pages to keep the tab responsive.
  async function gall(url, maxPages) {
    const out = [];
    let next = url, pages = 0;
    while (next && pages < (maxPages || 20)) {
      const body = await gfetch(next);
      if (body && body.value) out.push.apply(out, body.value);
      else if (body) out.push(body);
      next = body && body["@odata.nextLink"];
      pages++;
    }
    return out;
  }

  // ---- Unified Audit Log via the async audit query API (v1.0) ----
  // POST /security/auditLog/queries -> poll -> GET records
  async function ualQuery(upn, startIso, endIso, onStatus) {
    const base = A.graphV1 + "/security/auditLog/queries";
    const job = await gfetch(base, {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "#microsoft.graph.security.auditLogQuery",
        displayName: "LimonTriage " + upn + " " + new Date().toISOString(),
        filterStartDateTime: startIso,
        filterEndDateTime: endIso,
        userPrincipalNames: [upn]
      })
    });
    const id = job.id;
    let status = job.status || "notStarted";
    let waited = 0;
    while (status !== "succeeded") {
      if (status === "failed" || status === "cancelled") throw new Error("Audit log query " + status);
      if (waited > 600000) throw new Error("Audit log query timed out (10 min)");
      const wait = waited < 60000 ? 5000 : 15000;
      await new Promise(function (res) { setTimeout(res, wait); });
      waited += wait;
      const j = await gfetch(base + "/" + id);
      status = j.status;
      if (onStatus) onStatus(status, Math.round(waited / 1000));
    }
    return gall(base + "/" + id + "/records?$top=500", 60);
  }

  // Write helper: every containment call goes through here so the write scopes
  // are requested in one place and nothing can mutate the tenant by accident.
  function gwrite(url, method, body) {
    return gfetch(url, {
      method: method,
      scopes: A.containScopes,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  window.TriageGraph = {
    init: init, signIn: signIn, signOut: signOut, forgetSession: forgetSession,
    get account() { return account; },
    get elevated() { return elevated; },
    elevate: elevate, token: token,
    gfetch: gfetch, gall: gall, gwrite: gwrite, ualQuery: ualQuery
  };
})();
