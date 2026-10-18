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
  let caseContext = null, queue = Promise.resolve();

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
    const version=window.TriageCase.generation;
    const bound={...caseContext};
    if(!bound.objectId || !bound.caseId || bound.tenantId !== G.account?.tenantId) throw Error("Resolve the case and target before requesting Exchange access.");
    if(/\/(remove|clear|disable)$/.test(pathName) && !window.TriageContain?.armed) throw Error('Containment must be armed');
    const operationId=crypto.randomUUID();
    const token = await G.token([scope()]);
    window.TriageCase.assert(version);
    const r = await fetch(base() + pathName, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      signal:window.TriageCase.signal,
      body: JSON.stringify({...body,...bound,operationId})
    });
    const j = await r.json().catch(function () { return null; });
    if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status));
    window.TriageCase.assert(version);
    return j;
  }

  const execute=call;
  call=function(path,body){const version=window.TriageCase.generation;const job=queue.then(()=>{window.TriageCase.assert(version);return execute(path,body);});queue=job.catch(()=>{});return job;};
  window.TriageBackend = {
    bindCase(value){caseContext={...value};},
    configured: configured,
    probe: probe,
    available: available,
    get health() { return health; },
    scope: scope,
    mailboxSnapshot: function(upn){return call("/exo/snapshot",{upn});},
    rulesList: function (upn) { return call("/exo/rules/list", { upn: upn }); },
    rulesRemove: function (upn, ruleId) { return call("/exo/rules/remove", { upn: upn, ruleId: ruleId }); },
    rulesDisable: function (upn, ruleId) { return call("/exo/rules/disable", { upn: upn, ruleId: ruleId }); },
    forwardingGet: function (upn) { return call("/exo/forwarding/get", { upn: upn }); },
    forwardingClear: function (upn) { return call("/exo/forwarding/clear", { upn: upn }); },
    delegatesList: function (upn) { return call("/exo/delegates/list", { upn: upn }); },
    delegatesRemove: function (upn, d) { return call("/exo/delegates/remove", { upn: upn, delegate: d }); }
  };
})();
