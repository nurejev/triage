// ======================================================================
//  Client for the Exchange containment backend.
//
//  The backend is optional. When it is not deployed, probe() simply
//  reports unavailable and the containment runbook keeps the inbox-rules
//  step as copy-paste PowerShell.
//
//  Note the token: we ask MSAL for a token whose AUDIENCE is the backend
//  (api://<backendAppId>/Contain.Exchange), never the Graph token. A Graph
//  token replayed at the backend is rejected, and this token is useless
//  against Graph. Least privilege in both directions.
// ======================================================================
(function () {
  const G = window.TriageGraph;
  const CFG = window.TRIAGE_CONFIG || {};
  let health = null;      // cached /api/health result
  let probed = false;

  function configured() { return !!CFG.backendAppId; }
  function scope() { return "api://" + CFG.backendAppId + "/" + (health && health.apiScope || "Contain.Exchange"); }
  function base() { return (CFG.backendBase || "/api").replace(/\/$/, ""); }

  // Is a backend reachable, and does it serve the tenant we are signed into?
  // A backend for a different tenant is treated as absent - it could not act
  // on this tenant anyway, and we would rather say so than fail mid-incident.
  async function probe() {
    if (probed) return health;
    probed = true;
    if (!configured()) { health = null; return null; }
    try {
      const r = await fetch(base() + "/health", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      health = await r.json();
      if (health && health.appId && health.appId !== CFG.backendAppId) {
        health = { mismatch: "The backend serves a different application registration than this page is configured for." };
      }
    } catch (e) {
      health = null;
    }
    return health;
  }
  function tenantMatches() {
    const acc = G.account;
    if (!health || health.mismatch) return false;
    if (!acc) return false;
    const tid = (acc.idTokenClaims && acc.idTokenClaims.tid) || acc.tenantId;
    return !tid || !health.tenantId || tid === health.tenantId;
  }
  function available() { return !!(health && !health.mismatch && tenantMatches()); }

  async function call(pathName, body) {
    if (!available()) throw new Error("No Exchange backend is available for this tenant.");
    const token = await G.token([scope()]);
    const r = await fetch(base() + pathName, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(function () { return null; });
    if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status));
    return j;
  }

  window.TriageBackend = {
    configured: configured,
    probe: probe,
    available: available,
    get health() { return health; },
    scope: scope,
    rulesList: function (upn) { return call("/exo/rules/list", { upn: upn }); },
    rulesRemove: function (upn, ruleId) { return call("/exo/rules/remove", { upn: upn, ruleId: ruleId }); },
    rulesDisable: function (upn, ruleId) { return call("/exo/rules/disable", { upn: upn, ruleId: ruleId }); },
    forwardingGet: function (upn) { return call("/exo/forwarding/get", { upn: upn }); },
    forwardingClear: function (upn) { return call("/exo/forwarding/clear", { upn: upn }); },
    delegatesList: function (upn) { return call("/exo/delegates/list", { upn: upn }); },
    delegatesRemove: function (upn, d) { return call("/exo/delegates/remove", { upn: upn, delegate: d }); }
  };
})();
