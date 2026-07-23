// Graph + MSAL plumbing. Everything read-only; everything stays in this tab.
(function () {
  const A = window.TRIAGE_AUTH;
  let msalApp = null;
  let account = null;

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
    try { await app().logoutPopup({ account: acc }); } catch (e) { /* user closed popup */ }
  }

  async function token(scopes) {
    const req = { scopes: scopes || A.scopes, account: account };
    try {
      return (await app().acquireTokenSilent(req)).accessToken;
    } catch (e) {
      return (await app().acquireTokenPopup(req)).accessToken;
    }
  }

  async function gfetch(url, opts) {
    const t = await token();
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

  window.TriageGraph = {
    init: init, signIn: signIn, signOut: signOut,
    get account() { return account; },
    gfetch: gfetch, gall: gall, ualQuery: ualQuery
  };
})();
