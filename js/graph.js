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
          redirectUri: A.redirectUri || window.location.origin + window.location.pathname
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
    C?.reset();
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
    const expected=account, version=C.generation;
    if(!expected) throw Error('Sign in first');
    const req={scopes:scopes || A.scopes,account:expected};let response;
    try {response=await app().acquireTokenSilent(req);}
    catch(e){C.assert(version);response=await app().acquireTokenPopup(req);}
    C.assert(version);
    if(response.account?.homeAccountId !== expected.homeAccountId || response.account?.tenantId !== expected.tenantId) throw Error('Authentication returned a different account or tenant');
    return response.accessToken;
  }

  // Step up to the containment (write) scopes. Silent if the tenant already
  // consented, otherwise a popup - which is the deliberate "I am about to
  // change something" moment. Read-only triage never calls this.
  async function elevate() {
    const version = C?.generation;
    await token(A.containScopes);
    C?.assert(version);
    elevated = true;
    return true;
  }

  const C = window.TriageCase;
  function trusted(url) {
    const u = new URL(url);
    if (u.origin !== 'https://graph.microsoft.com' || !/^\/(v1\.0|beta)\//.test(u.pathname) || u.username || u.password) throw Error('Untrusted Graph URL');
    return u.href;
  }
  async function gfetch(url, opts = {}) {
    trusted(url);
    const version = C?.generation;
    const signal = C?.signal;
    const t = await token(opts.scopes);
    C?.assert(version);
    const method = opts.method || 'GET';
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, {...opts, signal: AbortSignal.any([signal || new AbortController().signal, opts.signal || new AbortController().signal, AbortSignal.timeout(60000)]),
        headers: {...opts.headers, Authorization:'Bearer '+t,'Content-Type':'application/json'}});
      C?.assert(version);
      if (method === 'GET' && [429,503,504].includes(r.status) && attempt < 3) {
        const delay = Math.min(30000, Math.max(1000, Number(r.headers.get('Retry-After'))*1000 || 1000*2**attempt));
        await new Promise(resolve=>setTimeout(resolve,delay)); C?.assert(version); continue;
      }
      if (r.status === 204) return null;
      const body = await r.json().catch(()=>null);
      if (!r.ok) throw Object.assign(Error(body?.error?.message || 'HTTP '+r.status),{status:r.status});
      C?.assert(version); return body;
    }
  }
  async function pages(url, maxPages = 20) {
    const records = [], startedAt = new Date().toISOString();
    let nextLink=url, count=0;
    try {
      while(nextLink && count < maxPages) {
        const body = await gfetch(nextLink);
        if(!Array.isArray(body?.value)) throw Error('Graph returned an invalid collection envelope');
        records.push(...body.value);
        count++; nextLink=body?.['@odata.nextLink'] || null;
        if(nextLink) trusted(nextLink);
      }
      return {records,state:nextLink?'partial':'complete',nextLink,pages:count,query:url,startedAt,completedAt:new Date().toISOString()};
    } catch(e) {
      if(e.name === 'AbortError') throw e;
      return {records,state:records.length?'partial':e.status===403?'unavailable':'failed',nextLink,pages:count,query:url,startedAt,error:e.message};
    }
  }
  async function gall(url,maxPages) {
    const result=await pages(url,maxPages);
    if(result.state !== 'complete') throw Object.assign(Error(result.error || 'Partial collection: continuation remains'),{records:result.records,collection:result});
    return result.records;
  }

  // ---- Unified Audit Log via the async audit query API (v1.0) ----
  // POST /security/auditLog/queries -> poll -> GET records
  async function ualQuery(upn, startIso, endIso, onStatus, onCollection) {
    const base = A.graphV1 + "/security/auditLog/queries";
    const job = await gfetch(base, {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "#microsoft.graph.security.auditLogQuery",
        displayName: "LimonTriage " + upn + " " + new Date().toISOString(),
        filterStartDateTime: startIso,
        filterEndDateTime: endIso,
        // MUST be userPrincipalNameFilters. The API silently ignores unknown
        // members, so a misnamed property does not error - it returns the whole
        // tenant's audit log for the window, which then gets rendered under this
        // one UPN. See auditLogQuery resource type for the exact property names.
        userPrincipalNameFilters: [upn]
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
    const result=await pages(base+"/"+id+"/records?$top=500",60);
    const {records,...metadata}=result;if(onCollection)onCollection({...metadata,queryId:id});
    if(result.state!=='complete')throw Object.assign(Error(result.error||'Audit records are partial'),{records,collection:{...metadata,queryId:id}});
    return records;
  }

  // Write helper: every containment call goes through here so the write scopes
  // are requested in one place and nothing can mutate the tenant by accident.
  async function gwrite(url, method, body) {
    if (!elevated || !window.TriageContain?.armed) throw Error('Containment must be armed');
    const identity={...window.TriageContain.identity}, version=C.generation;
    if(!identity.objectId || identity.tenantId !== account?.tenantId) throw Error('Unverified action identity');
    const path=new URL(trusted(url)).pathname;
    if(path.includes('/users/') && !path.startsWith('/v1.0/users/'+encodeURIComponent(identity.objectId)+'/') && path!=='/v1.0/users/'+encodeURIComponent(identity.objectId)) throw Error('Action targets a different account');
    const intent={operationId:crypto.randomUUID(),preservation:window.TriageContain.preservation,...identity,method,path,analystId:account.localAccountId};
    await window.TriageJournal.append({...intent,state:'intent'}); C.assert(version);
    try {
      const result=await gfetch(url,{method,scopes:A.containScopes,body:body===undefined?undefined:JSON.stringify(body)});
      await window.TriageJournal.append({...intent,state:'accepted-verification-pending'}); C.assert(version);
      return result;
    } catch(e) {
      try {await window.TriageJournal.append({...intent,state:'failed-or-uncertain',error:e.message});} catch { /* Intent remains durable. Do not resend automatically. */ }
      throw e;
    }
  }

  window.TriageGraph = {
    init: init, signIn: signIn, signOut: signOut, forgetSession: forgetSession,
    get account() { return account; },
    get elevated() { return elevated; },
    elevate: elevate, token: token, pages: pages,
    gfetch: gfetch, gall: gall, gwrite: gwrite, ualQuery: ualQuery
  };
})();
