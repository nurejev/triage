// Graph + MSAL plumbing. Read-only by default; the containment screen has to
// ask for write scopes explicitly (elevate()). Everything stays in this tab.
(function () {
  const A = window.TRIAGE_AUTH;
  let msalApp = null;
  let account = null;
  let elevated = false; // true once the containment (write) scopes are held
  // The Connect step pins the tenant before sign-in: "My organisation" leaves it null
  // (the /organizations authority), a customer domain resolves to its tenant ID first,
  // because a partner account signs in to its own tenant unless the authority names another.
  let tenant = null;
  const GUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function authority() {
    return tenant ? "https://login.microsoftonline.com/" + tenant : A.authority;
  }
  function setTenant(id) {
    tenant = GUID.test(id || "") ? id.toLowerCase() : null;
    return tenant;
  }
  // Resolves a domain to its tenant ID through Microsoft's public OpenID configuration.
  // Nothing signs in here; the lookup only reads the issuer.
  async function resolveTenant(domain) {
    const d = String(domain || "")
      .trim()
      .toLowerCase();
    if (GUID.test(d)) return { tenantId: d, domain: d };
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d))
      throw Error(
        "Enter a domain such as customer.onmicrosoft.com or contoso.com",
      );
    const r = await fetch(
      "https://login.microsoftonline.com/" +
        encodeURIComponent(d) +
        "/v2.0/.well-known/openid-configuration",
    );
    if (!r.ok)
      throw Error(
        r.status === 400
          ? "Microsoft has no tenant for " + d + ". Check the domain."
          : "Tenant lookup failed (HTTP " + r.status + ")",
      );
    const body = await r.json();
    const m =
      /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0$/i.exec(
        body.issuer || "",
      );
    if (!m) throw Error("Tenant lookup returned an unexpected issuer");
    return { tenantId: m[1].toLowerCase(), domain: d };
  }

  // The BETA lives under /BETA/, but the app registration only has the site
  // ROOT as a redirect URI - the one the main Triage app uses. Reuse it instead
  // of registering /BETA/index.html: with popup sign-in the reply page is just
  // bounced off and closed, so it never has to be the page we started from.
  // Override with TRIAGE_AUTH.redirectUri if a deployment registers its own.
  function redirectUri() {
    return A.redirectUri || window.location.origin + "/";
  }
  function app() {
    if (!msalApp) {
      msalApp = new msal.PublicClientApplication({
        auth: {
          clientId: A.clientId,
          authority: A.authority,
          redirectUri: redirectUri(),
        },
        cache: { cacheLocation: "sessionStorage" },
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
    const res = await app().loginPopup({
      scopes: A.scopes,
      authority: authority(),
    });
    if (tenant && res.account?.tenantId?.toLowerCase() !== tenant) {
      try {
        await app().logoutPopup({ account: res.account });
      } catch (e) {
        /* popup closed */
      }
      throw Error(
        "The sign-in landed in a different tenant than the one you chose. Check the domain and sign in again.",
      );
    }
    account = res.account;
    return account;
  }

  async function signOut() {
    const acc = account;
    account = null;
    elevated = false;
    try {
      await app().logoutPopup({ account: acc });
    } catch (e) {
      /* user closed popup */
    }
  }

  // Drop any cached MSAL session WITHOUT a network round-trip, so a page
  // reload returns to the login screen (forensic hygiene: no silent restore).
  // MSAL keeps its tokens/accounts in sessionStorage; we clear the app's cache
  // if the SDK exposes it, then sweep any leftover keys as a version-proof
  // fallback. Nothing here revokes tenant consent - it only forgets this tab.
  async function forgetSession() {
    try {
      if (msalApp && typeof msalApp.clearCache === "function")
        await msalApp.clearCache();
    } catch (e) {
      /* older SDK - fall through to the manual sweep */
    }
    try {
      const cid = A.clientId;
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (
          k &&
          (/msal|login\.(windows|microsoftonline)/i.test(k) ||
            (cid && k.indexOf(cid) !== -1))
        )
          sessionStorage.removeItem(k);
      }
    } catch (e) {
      /* private mode / storage disabled */
    }
    account = null;
    elevated = false;
  }

  async function token(scopes) {
    const captured = account;
    if (!captured) throw new Error("Sign in first");
    const req = {
      scopes: scopes || A.scopes,
      account: captured,
      authority: authority(),
    };
    try {
      return (await app().acquireTokenSilent(req)).accessToken;
    } catch (e) {
      if (account !== captured) throw new Error("Session changed");
      const result = await app().acquireTokenPopup(req);
      // The popup lets the operator pick any account; a token for another account or
      // tenant must never be used under this case's tenant header.
      if (
        result.account?.homeAccountId !== captured.homeAccountId ||
        result.account?.tenantId !== captured.tenantId
      )
        throw new Error(
          "The popup signed in a different account or tenant. Sign out and sign in again with the case account.",
        );
      return result.accessToken;
    }
  }

  // Step up to the containment (write) scopes. Silent if the tenant already
  // consented, otherwise a popup - which is the deliberate "I am about to
  // change something" moment. Read-only triage never calls this.
  async function elevate() {
    if (!window.triageNative) await token(A.containScopes);
    else if (!account) throw Error("Connect the response account first");
    elevated = true;
    return true;
  }

  function checkUrl(url) {
    const u = new URL(url);
    if (
      u.origin !== "https://graph.microsoft.com" ||
      u.username ||
      u.password ||
      !/^\/(v1\.0|beta)\//.test(u.pathname)
    )
      throw new Error("Untrusted Graph continuation URL");
    return u.href;
  }
  function aborted(signal) {
    if (signal && signal.aborted)
      throw new DOMException("Collection cancelled", "AbortError");
  }
  function delay(ms, signal) {
    aborted(signal);
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(t);
        reject(new DOMException("Collection cancelled", "AbortError"));
      };
      const t = setTimeout(() => {
        if (signal) signal.removeEventListener("abort", stop);
        resolve();
      }, ms);
      if (signal) signal.addEventListener("abort", stop, { once: true });
    });
  }
  async function gfetch(url, opts = {}) {
    checkUrl(url);
    if (window.TriageCase?.signal)
      opts = {
        ...opts,
        signal: opts.signal
          ? AbortSignal.any([opts.signal, window.TriageCase.signal])
          : window.TriageCase.signal,
      };
    aborted(opts.signal);
    const caseVersion = window.TriageCase?.generation;
    if (window.triageNative) {
      const value = await window.triageNative.responseRequest({
        url,
        method: opts.method || "GET",
        body: opts.body,
      });
      window.TriageCase?.assert(caseVersion);
      return value;
    }
    const t = await token(opts.scopes);
    window.TriageCase?.assert(caseVersion);
    aborted(opts.signal);
    const { scopes, ...request } = opts;
    for (let attempt = 0; attempt < 4; attempt++) {
      window.TriageCase?.assert(caseVersion);
      const r = await fetch(url, {
        ...request,
        headers: {
          ...opts.headers,
          Authorization: "Bearer " + t,
          "Content-Type": "application/json",
        },
      });
      if (
        [429, 503, 504].includes(r.status) &&
        (!opts.method || opts.method === "GET") &&
        attempt < 3
      ) {
        const raw = r.headers.get("Retry-After");
        const seconds =
          raw && /^\d+$/.test(raw)
            ? Number(raw)
            : raw
              ? Math.max(0, (Date.parse(raw) - Date.now()) / 1000)
              : 2 ** attempt;
        await delay(
          Math.min(60000, Math.max(1000, (seconds || 1) * 1000)),
          opts.signal,
        );
        continue;
      }
      window.TriageCase?.assert(caseVersion);
      if (r.status === 204) return null;
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const e = new Error(body?.error?.message || "HTTP " + r.status);
        e.status = r.status;
        throw e;
      }
      return body;
    }
  }
  async function pages(url, opts = {}) {
    const records = (opts.records || []).slice();
    let next = url,
      count = 0;
    const startedPages = opts.pages || 0;
    try {
      while (next && count < (opts.maxPages || 25)) {
        aborted(opts.signal);
        const body = await gfetch(checkUrl(next), { signal: opts.signal });
        if (!body || !Array.isArray(body.value))
          throw new Error("Graph returned an invalid collection");
        records.push(...body.value);
        next = body["@odata.nextLink"] || null;
        count++;
        if (next) checkUrl(next);
        if (opts.onPage)
          opts.onPage({ records, pages: startedPages + count, nextLink: next });
      }
      return {
        records,
        state: next ? "partial" : "complete",
        nextLink: next,
        pages: startedPages + count,
        error: next ? "More pages are available. Resume collection." : "",
      };
    } catch (e) {
      return {
        records,
        state:
          e.name === "AbortError"
            ? "cancelled"
            : records.length
              ? "partial"
              : e.status === 403
                ? "unavailable"
                : "failed",
        nextLink: next,
        pages: startedPages + count,
        error: e.message,
      };
    }
  }
  async function gall(url, maxPages, opts = {}) {
    const r = await pages(url, { ...opts, maxPages });
    if (r.state !== "complete") {
      const e = new Error(r.error);
      e.collection = r;
      throw e;
    }
    return r.records;
  }
  async function ualQueryTenant(startIso, endIso, onStatus, opts = {}) {
    const base = A.graphV1 + "/security/auditLog/queries";
    let id = opts.queryId;
    if (!id) {
      const job = await gfetch(base, {
        method: "POST",
        signal: opts.signal,
        body: JSON.stringify({
          displayName: "Triage beta " + startIso,
          filterStartDateTime: startIso,
          filterEndDateTime: endIso,
          ...(opts.userPrincipalNames
            ? { userPrincipalNameFilters: opts.userPrincipalNames }
            : {}),
          // Actions performed *on* the account by an admin are logged under the admin's UPN;
          // the object-ID filter catches those as well.
          ...(opts.objectIds ? { objectIdFilters: opts.objectIds } : {}),
        }),
      });
      id = job.id;
      if (!/^[a-zA-Z0-9-]+$/.test(id || ""))
        throw Error("Invalid audit query ID");
      if (opts.onQuery) opts.onQuery(id);
    }
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Error("Invalid audit query ID");
    let waited = 0;
    while (waited < 600000) {
      const job = await gfetch(base + "/" + id, { signal: opts.signal });
      if (onStatus) onStatus(job.status, Math.round(waited / 1000));
      if (job.status === "succeeded")
        return {
          ...(await pages(
            opts.nextLink || base + "/" + id + "/records?$top=1000",
            opts,
          )),
          queryId: id,
        };
      if (["failed", "cancelled"].includes(job.status))
        throw Error("Audit query " + job.status);
      await delay(5000, opts.signal);
      waited += 5000;
    }
    return {
      records: opts.records || [],
      state: "partial",
      queryId: id,
      pages: opts.pages || 0,
      error: "Query is still running. Resume to check it again.",
    };
  }

  // Write helper: every containment call goes through here so the write scopes
  // are requested in one place and nothing can mutate the tenant by accident.
  // Per-account UAL search used by the containment blast-radius checks (js/blast.js).
  async function ualQuery(upn, startIso, endIso, onStatus) {
    const r = await ualQueryTenant(startIso, endIso, onStatus || (() => {}), {
      userPrincipalNames: [upn],
      maxPages: 100,
    });
    if (r.state === "failed" || r.state === "unavailable")
      throw Object.assign(Error(r.error || "Audit search failed"), {
        collection: r,
      });
    return r.records;
  }
  async function gwrite(url, method, body) {
    if (!elevated || !window.TriageContain?.armed)
      throw Error("Containment must be armed");
    const C = window.TriageCase;
    const identity = { ...window.TriageContain.identity },
      version = C.generation;
    if (!identity.objectId || identity.tenantId !== account?.tenantId)
      throw Error("Unverified action identity");
    const path = new URL(checkUrl(url)).pathname;
    if (
      path.includes("/users/") &&
      !path.startsWith(
        "/v1.0/users/" + encodeURIComponent(identity.objectId) + "/",
      ) &&
      path !== "/v1.0/users/" + encodeURIComponent(identity.objectId)
    )
      throw Error("Action targets a different account");
    const intent = {
      operationId: crypto.randomUUID(),
      preservation: window.TriageContain.preservation,
      ...identity,
      method,
      path,
      analystId: account.localAccountId || account.username,
    };
    await window.TriageJournal.append({ ...intent, state: "intent" });
    C.assert(version);
    try {
      const result = await gfetch(url, {
        method,
        scopes: A.containScopes,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await window.TriageJournal.append({
        ...intent,
        state: "accepted-verification-pending",
      });
      C.assert(version);
      return result;
    } catch (e) {
      try {
        await window.TriageJournal.append({
          ...intent,
          state: "failed-or-uncertain",
          error: e.message,
        });
      } catch {
        /* Intent remains durable. Do not resend automatically. */
      }
      throw e;
    }
  }

  window.TriageGraph = {
    connectNativeResponse: async (context) => {
      account = await window.triageNative.responseConnect(context);
      elevated = false;
      return account;
    },
    init: init,
    setTenant: setTenant,
    resolveTenant: resolveTenant,
    get tenant() {
      return tenant;
    },
    signIn: signIn,
    signOut: signOut,
    forgetSession: forgetSession,
    get account() {
      return account;
    },
    get elevated() {
      return elevated;
    },
    elevate: elevate,
    token: token,
    gfetch: gfetch,
    gall: gall,
    pages: pages,
    delay: delay,
    gwrite: gwrite,
    ualQueryTenant: ualQueryTenant,
    ualQuery: ualQuery,
  };
})();
