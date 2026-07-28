// ======================================================================
//  Limon-IT M365 Triage - Exchange containment backend
//
//  WHY THIS EXISTS
//  Microsoft does not let a browser change another user's inbox rules,
//  mailbox forwarding or delegates: those need either Exchange Online
//  PowerShell or app-only permissions, and app-only means a credential
//  that can never live in a public SPA. This service is that credential
//  holder - the smallest possible one.
//
//  THE TRUST MODEL, IN ONE PARAGRAPH
//  The browser sends an access token minted for THIS service (audience
//  api://<backend app>, scope Contain.Exchange), not a Graph token. The
//  service verifies that token cryptographically against Microsoft's
//  keys, then exchanges it on-behalf-of the caller for a Graph token and
//  asks Microsoft "who is this and what directory roles do they hold?".
//  Only if the caller genuinely holds an incident-response role does the
//  service use its own app-only Exchange permission to perform the one
//  requested action on the one named mailbox. Every request is written to
//  an append-only audit log. There is no client secret: the service
//  authenticates to Microsoft with a certificate that never leaves the
//  container.
//
//  DELIBERATELY ZERO npm DEPENDENCIES. Everything below uses only Node's
//  standard library, so the supply chain you audit is this file.
// ======================================================================
"use strict";
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// ---------------------------------------------------------------- config ---
const CFG = {
  port: +(process.env.PORT || 8081),
  tenantId: req("TENANT_ID"),                 // one backend serves exactly one tenant
  organization: req("ORGANIZATION"),          // e.g. contoso.onmicrosoft.com (for EXO)
  appId: req("BACKEND_APP_ID"),               // this service's app registration
  spaAppId: req("SPA_APP_ID"),                // the Triage SPA - the only accepted caller
  apiScope: process.env.API_SCOPE || "Contain.Exchange",
  certPem: process.env.CERT_PEM || "/certs/backend.crt",
  keyPem: process.env.KEY_PEM || "/certs/backend.key",
  pfx: process.env.CERT_PFX || "/certs/backend.pfx",
  pfxPassword: process.env.CERT_PFX_PASSWORD || "",
  // Directory roles (template IDs) that may use this service. Defaults to the
  // roles that can already do all of this by hand in Exchange or Entra, so the
  // service grants nobody any power they did not already have.
  requiredRoles: (process.env.REQUIRED_ROLES ||
    [
      "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
      "29232cdf-9323-42fd-ade2-1d097af3e4de", // Exchange Administrator
      "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
      "e8611ab8-c189-46e8-94e1-60213ab1f814"  // Privileged Role Administrator
    ].join(",")).split(",").map(s => s.trim()).filter(Boolean),
  // Mailboxes this service refuses to touch no matter who asks - put your
  // break-glass accounts here.
  protectedUpns: (process.env.PROTECTED_UPNS || "").toLowerCase()
    .split(",").map(s => s.trim()).filter(Boolean),
  auditFile: process.env.AUDIT_FILE || "/var/log/triage/audit.jsonl",
  maxConcurrentPwsh: +(process.env.MAX_CONCURRENT || 2),
  ratePerMinute: +(process.env.RATE_PER_MINUTE || 30),
  pwshTimeoutMs: +(process.env.PWSH_TIMEOUT_MS || 120000)
};
function req(name) {
  const v = process.env[name];
  if (!v) { console.error("[fatal] missing required env var " + name); process.exit(2); }
  return v;
}

// ----------------------------------------------------------------- audit ---
// Append-only JSON lines, also echoed to stdout so `docker logs` has it.
// Never contains tokens, passwords or mailbox content - only who did what.
function audit(rec) {
  const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, rec));
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(CFG.auditFile), { recursive: true });
    fs.appendFileSync(CFG.auditFile, line + "\n");
  } catch (e) { console.error("[audit] cannot write " + CFG.auditFile + ": " + e.message); }
}

// ------------------------------------------------------------ tiny https ---
function httpsJson(url, opts, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: (opts && opts.method) || "GET",
      headers: Object.assign({ "Accept": "application/json" }, (opts && opts.headers) || {})
    }, function (res) {
      let d = "";
      res.on("data", c => { d += c; });
      res.on("end", function () {
        let parsed = null;
        try { parsed = JSON.parse(d); } catch (e) { /* non-JSON error body */ }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);
        const msg = (parsed && (parsed.error_description || (parsed.error && parsed.error.message))) ||
          ("HTTP " + res.statusCode);
        const err = new Error(msg);
        err.status = res.statusCode;
        reject(err);
      });
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

// ------------------------------------------------------- JWT verification ---
// Microsoft's signing keys, cached for an hour. A token whose kid we cannot
// find is rejected - we never skip signature verification.
let jwks = { keys: [], fetched: 0 };
async function signingKey(kid) {
  if (Date.now() - jwks.fetched > 3600000) {
    const j = await httpsJson("https://login.microsoftonline.com/" + CFG.tenantId + "/discovery/v2.0/keys");
    jwks = { keys: (j && j.keys) || [], fetched: Date.now() };
  }
  const k = jwks.keys.filter(x => x.kid === kid)[0];
  if (!k) throw httpErr(401, "unknown token signing key");
  return crypto.createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: "jwk" });
}
function b64u(s) { return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }

async function verifyCallerToken(bearer) {
  const parts = String(bearer || "").split(".");
  if (parts.length !== 3) throw httpErr(401, "malformed bearer token");
  let head, body;
  try {
    head = JSON.parse(b64u(parts[0]).toString("utf8"));
    body = JSON.parse(b64u(parts[1]).toString("utf8"));
  } catch (e) { throw httpErr(401, "malformed bearer token"); }
  if (!head || !body || typeof head !== "object" || typeof body !== "object")
    throw httpErr(401, "malformed bearer token");

  if (head.alg !== "RS256") throw httpErr(401, "unexpected token algorithm " + head.alg);
  const key = await signingKey(head.kid);
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]),
    key, b64u(parts[2]));
  if (!ok) throw httpErr(401, "token signature does not verify");

  const now = Math.floor(Date.now() / 1000);
  if (!body.exp || body.exp < now - 60) throw httpErr(401, "token expired");
  if (body.nbf && body.nbf > now + 60) throw httpErr(401, "token not yet valid");

  // Issued by our tenant...
  if (body.tid !== CFG.tenantId) throw httpErr(403, "token from another tenant");
  if (!/^https:\/\/(sts\.windows\.net|login\.microsoftonline\.com)\//.test(body.iss || ""))
    throw httpErr(401, "unexpected issuer");
  // ...for THIS service (not a Graph token replayed at us)...
  const audOk = body.aud === CFG.appId || body.aud === "api://" + CFG.appId;
  if (!audOk) throw httpErr(401, "token audience is not this service");
  // ...by the Triage SPA and nothing else...
  const callerApp = body.azp || body.appid;
  if (callerApp !== CFG.spaAppId) throw httpErr(403, "token was issued to a different application");
  // ...with a user behind it (never app-only), holding our scope.
  if (!body.oid || !(body.preferred_username || body.upn)) throw httpErr(403, "not a delegated user token");
  const scopes = String(body.scp || "").split(/\s+/);
  if (scopes.indexOf(CFG.apiScope) === -1) throw httpErr(403, "token is missing scope " + CFG.apiScope);

  return { oid: body.oid, upn: body.preferred_username || body.upn, name: body.name || "",
    assertion: bearer, jti: body.uti || body.jti || "" };
}

// ------------------------------------------- client assertion (certificate) --
// We authenticate to Microsoft with the certificate, so no client secret
// exists anywhere in this deployment.
let assertionCache = { jwt: "", exp: 0 };
function clientAssertion() {
  const now = Math.floor(Date.now() / 1000);
  if (assertionCache.jwt && assertionCache.exp - 120 > now) return assertionCache.jwt;
  const certPem = fs.readFileSync(CFG.certPem, "utf8");
  const der = Buffer.from(certPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  const x5t = crypto.createHash("sha1").update(der).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const enc = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = enc({ alg: "RS256", typ: "JWT", x5t: x5t });
  const payload = enc({
    aud: "https://login.microsoftonline.com/" + CFG.tenantId + "/oauth2/v2.0/token",
    iss: CFG.appId, sub: CFG.appId, jti: crypto.randomUUID(),
    nbf: now - 30, exp: now + 600
  });
  const sig = crypto.sign("RSA-SHA256", Buffer.from(header + "." + payload),
    fs.readFileSync(CFG.keyPem, "utf8")).toString("base64url");
  assertionCache = { jwt: header + "." + payload + "." + sig, exp: now + 600 };
  return assertionCache.jwt;
}

// --------------------------------------------------- on-behalf-of exchange ---
// Turn the caller's token for us into a Graph token that IS the caller. This
// is how we ask Microsoft who they are - and it fails if the caller's session
// has been revoked in the meantime, which is exactly what we want.
async function oboGraphToken(assertion) {
  const form = new URLSearchParams({
    client_id: CFG.appId,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion(),
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: assertion,
    scope: "https://graph.microsoft.com/.default",
    requested_token_use: "on_behalf_of"
  }).toString();
  const t = await httpsJson("https://login.microsoftonline.com/" + CFG.tenantId + "/oauth2/v2.0/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(form) } }, form);
  return t.access_token;
}

// ------------------------------------------------- caller role enforcement ---
const roleCache = new Map(); // oid -> { roles, at }
async function assertCallerAuthorized(caller) {
  const hit = roleCache.get(caller.oid);
  if (hit && Date.now() - hit.at < 300000) {
    if (!hit.ok) throw httpErr(403, "caller holds none of the required directory roles");
    return hit.roles;
  }
  const gt = await oboGraphToken(caller.assertion);
  const body = await httpsJson(
    "https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.directoryRole" +
    "?$select=roleTemplateId,displayName",
    { headers: { Authorization: "Bearer " + gt } });
  const held = ((body && body.value) || []).map(r => ({ id: r.roleTemplateId, name: r.displayName }));
  const match = held.filter(r => CFG.requiredRoles.indexOf(r.id) >= 0);
  roleCache.set(caller.oid, { ok: match.length > 0, roles: match.map(r => r.name), at: Date.now() });
  if (!match.length) {
    audit({ event: "authz.deny", caller: caller.upn, callerOid: caller.oid,
      reason: "no required role", held: held.map(r => r.name) });
    throw httpErr(403, "caller holds none of the required directory roles");
  }
  return match.map(r => r.name);
}

// ----------------------------------------------------------- rate limiting ---
const buckets = new Map();
function rateLimit(key) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, since: now };
  if (now - b.since > 60000) { b.n = 0; b.since = now; }
  b.n++;
  buckets.set(key, b);
  if (b.n > CFG.ratePerMinute) throw httpErr(429, "rate limit exceeded");
}

// ------------------------------------------------------------ pwsh bridge ---
// One PowerShell process per action, arguments passed as argv (never
// interpolated into a command string), input validated before we get here.
let running = 0;
function exo(action, args) {
  if (running >= CFG.maxConcurrentPwsh) return Promise.reject(httpErr(503, "backend busy, retry shortly"));
  running++;
  return new Promise(function (resolve, reject) {
    const argv = ["-NoLogo", "-NonInteractive", "-File", "/opt/triage/exo.ps1",
      "-Action", action,
      "-AppId", CFG.appId, "-Organization", CFG.organization,
      "-PfxPath", CFG.pfx, "-PfxPassword", CFG.pfxPassword];
    Object.keys(args || {}).forEach(function (k) {
      if (args[k] !== undefined && args[k] !== null && args[k] !== "") argv.push("-" + k, String(args[k]));
    });
    const p = spawn("pwsh", argv, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(function () { p.kill("SIGKILL"); }, CFG.pwshTimeoutMs);
    p.stdout.on("data", c => { out += c; });
    p.stderr.on("data", c => { err += c; });
    p.on("close", function (code) {
      clearTimeout(timer);
      running--;
      if (code !== 0) return reject(httpErr(502, "Exchange operation failed: " +
        (err.trim() || out.trim() || "exit " + code).slice(0, 400)));
      try {
        const j = JSON.parse(out || "null");
        if (j && j.error) return reject(httpErr(502, String(j.error).slice(0, 400)));
        resolve(j);
      } catch (e) { reject(httpErr(502, "unparseable response from Exchange helper")); }
    });
    p.on("error", function (e) { clearTimeout(timer); running--; reject(httpErr(500, e.message)); });
  });
}

// --------------------------------------------------------------- validation --
const UPN_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function upnArg(v) {
  const s = String(v || "").trim();
  if (!UPN_RE.test(s) || s.length > 320) throw httpErr(400, "invalid mailbox address");
  if (CFG.protectedUpns.indexOf(s.toLowerCase()) >= 0) throw httpErr(403, "this mailbox is protected from automated changes");
  return s;
}
function idArg(v, label) {
  const s = String(v == null ? "" : v).trim();
  // Exchange rule identities and names: no newlines, no quotes, bounded length.
  if (!s || s.length > 256 || /[\r\n"'`;|&$]/.test(s)) throw httpErr(400, "invalid " + label);
  return s;
}

// ------------------------------------------------------------------- routes --
const ROUTES = {
  "POST /api/exo/rules/list": async function (b) {
    return { rules: await exo("rules-list", { Upn: upnArg(b.upn) }) };
  },
  "POST /api/exo/rules/remove": async function (b) {
    return await exo("rules-remove", { Upn: upnArg(b.upn), RuleId: idArg(b.ruleId, "rule id") });
  },
  "POST /api/exo/rules/disable": async function (b) {
    return await exo("rules-disable", { Upn: upnArg(b.upn), RuleId: idArg(b.ruleId, "rule id") });
  },
  "POST /api/exo/forwarding/get": async function (b) {
    return await exo("forwarding-get", { Upn: upnArg(b.upn) });
  },
  "POST /api/exo/forwarding/clear": async function (b) {
    return await exo("forwarding-clear", { Upn: upnArg(b.upn) });
  },
  "POST /api/exo/delegates/list": async function (b) {
    return { delegates: await exo("delegates-list", { Upn: upnArg(b.upn) }) };
  },
  "POST /api/exo/delegates/remove": async function (b) {
    return await exo("delegates-remove", { Upn: upnArg(b.upn), Delegate: upnArg(b.delegate) });
  }
};
// Actions that change something - these get the loudest audit entries.
const MUTATING = /\/(remove|clear|disable)$/;

// ------------------------------------------------------------------ server --
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}
function readBody(req) {
  return new Promise(function (resolve, reject) {
    let d = "", n = 0;
    req.on("data", function (c) {
      n += c.length;
      if (n > 64 * 1024) { reject(httpErr(413, "request too large")); req.destroy(); return; }
      d += c;
    });
    req.on("end", function () {
      if (!d) return resolve({});
      try { resolve(JSON.parse(d)); } catch (e) { reject(httpErr(400, "body is not JSON")); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async function (req, res) {
  const key = req.method + " " + (req.url || "").split("?")[0];

  // Unauthenticated: lets the SPA discover whether a backend is present and
  // which tenant it serves. Deliberately reveals nothing else.
  if (key === "GET /api/health") {
    return send(res, 200, {
      ok: true, service: "triage-exo-backend", tenantId: CFG.tenantId,
      organization: CFG.organization, appId: CFG.appId, apiScope: CFG.apiScope,
      capabilities: ["rules-list", "rules-remove", "rules-disable",
        "forwarding-get", "forwarding-clear", "delegates-list", "delegates-remove"]
    });
  }

  const handler = ROUTES[key];
  if (!handler) return send(res, 404, { error: "no such endpoint" });

  let caller = null;
  try {
    const auth = req.headers.authorization || "";
    if (!/^Bearer /i.test(auth)) throw httpErr(401, "missing bearer token");
    caller = await verifyCallerToken(auth.slice(7).trim());
    rateLimit(caller.oid);
    const roles = await assertCallerAuthorized(caller);

    const body = await readBody(req);
    const started = Date.now();
    const result = await handler(body);

    audit({ event: MUTATING.test(key) ? "action.change" : "action.read", route: key,
      caller: caller.upn, callerOid: caller.oid, callerRoles: roles,
      target: body.upn || "", detail: body.ruleId || body.delegate || "",
      result: "ok", ms: Date.now() - started });
    send(res, 200, Object.assign({ ok: true }, result));
  } catch (e) {
    const status = e.status || 500;
    audit({ event: status === 401 || status === 403 ? "auth.deny" : "action.fail", route: key,
      caller: (caller && caller.upn) || "-", result: "fail", status: status,
      message: String(e.message || e).slice(0, 400) });
    // Callers get the reason, never a stack trace.
    send(res, status, { error: String(e.message || "internal error").slice(0, 400) });
  }
});

server.listen(CFG.port, function () {
  audit({ event: "start", tenantId: CFG.tenantId, organization: CFG.organization,
    appId: CFG.appId, spaAppId: CFG.spaAppId, apiScope: CFG.apiScope,
    requiredRoles: CFG.requiredRoles.length, protectedUpns: CFG.protectedUpns.length });
  console.log("[triage-backend] listening on :" + CFG.port + " for tenant " + CFG.tenantId);
});
