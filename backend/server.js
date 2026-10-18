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
//  service verifies exact signed claims, an explicit Triage.Reader/Responder
//  app-role assignment, analyst and canonical mailbox allowlists, and an
//  operation allowlist. Mutation is separately disabled by default. Each
//  admitted request has a durable intent/outcome record. Exchange credentials
//  and Exchange-side permissions are independent of the browser's authority.
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
const Policy = require("./policy");
const {createVerifier} = require("./collector/auth");

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
  allowedUsers: (process.env.ALLOWED_ANALYST_IDS || '').toLowerCase().split(',').filter(Boolean),
  allowedMailboxes: (process.env.ALLOWED_MAILBOX_IDS || '').toLowerCase().split(',').filter(Boolean),
  protectedIds: (process.env.PROTECTED_MAILBOX_IDS || '').toLowerCase().split(',').filter(Boolean),
  allowedOperations: (process.env.ALLOWED_OPERATIONS || '/api/exo/snapshot,/api/exo/rules/list,/api/exo/forwarding/get,/api/exo/delegates/list').split(',').filter(Boolean),
  enableMutations: process.env.ENABLE_MUTATIONS === 'true',
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
function audit(rec) { Policy.audit(CFG.auditFile,rec); }

// ------------------------------------------------------------ tiny https ---
function httpsJson(url, opts, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: (opts && opts.method) || "GET",
      headers: Object.assign({ "Accept": "application/json" }, (opts && opts.headers) || {})
    }, function (res) {
      let d = "";
      res.on("data", c => { d += c; if(d.length>2000000){r.destroy();reject(httpErr(502,"Microsoft response too large"));} });
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
    r.setTimeout(30000,()=>r.destroy(Error("Microsoft request timed out")));
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function httpErr(status,msg){return Object.assign(Error(msg),{status});}
const verifyCallerToken = createVerifier({...CFG,scope:CFG.apiScope,roles:['Triage.Reader','Triage.Responder']},()=>httpsJson('https://login.microsoftonline.com/'+CFG.tenantId+'/discovery/v2.0/keys'));

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
const pending = [];
function exo(action, args) {
  if (running >= CFG.maxConcurrentPwsh) {
    if(pending.length >= 20) return Promise.reject(httpErr(503,"Backend queue full"));
    return new Promise((resolve,reject)=>pending.push(()=>exo(action,args).then(resolve,reject)));
  }
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
    let out = "", err = "", finished=false;
    function release(){if(finished)return;finished=true;running--;const next=pending.shift();if(next)next();}
    const timer = setTimeout(function () { p.kill("SIGKILL"); }, CFG.pwshTimeoutMs);
    p.stdout.on("data", c => { out += c; if(out.length>8000000)p.kill("SIGKILL"); });
    p.stderr.on("data", c => { err += c; if(err.length>100000)p.kill("SIGKILL"); });
    p.on("close", function (code) {
      clearTimeout(timer);
      release();
      if (code !== 0) return reject(httpErr(502, "Exchange operation failed: " +
        (err.trim() || out.trim() || "exit " + code).slice(0, 400)));
      try {
        const j = JSON.parse(out || "null");
        if (j && j.error) return reject(httpErr(502, String(j.error).slice(0, 400)));
        resolve(j);
      } catch (e) { reject(httpErr(502, "unparseable response from Exchange helper")); }
    });
    p.on("error", function (e) { clearTimeout(timer); release(); reject(httpErr(500, e.message)); });
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
  "POST /api/exo/snapshot": async b=>exo("snapshot",{Upn:upnArg(b.upn),ObjectId:b.objectId}),
  "POST /api/exo/rules/list": async function (b) {
    return { rules: await exo("rules-list", { Upn: upnArg(b.upn), ObjectId:b.objectId }) };
  },
  "POST /api/exo/rules/remove": async function (b) {
    return await exo("rules-remove", { Upn: upnArg(b.upn), ObjectId:b.objectId, RuleId: idArg(b.ruleId, "rule id") });
  },
  "POST /api/exo/rules/disable": async function (b) {
    return await exo("rules-disable", { Upn: upnArg(b.upn), ObjectId:b.objectId, RuleId: idArg(b.ruleId, "rule id") });
  },
  "POST /api/exo/forwarding/get": async function (b) {
    return await exo("forwarding-get", { Upn: upnArg(b.upn), ObjectId:b.objectId });
  },
  "POST /api/exo/forwarding/clear": async function (b) {
    return await exo("forwarding-clear", { Upn: upnArg(b.upn), ObjectId:b.objectId });
  },
  "POST /api/exo/delegates/list": async function (b) {
    return { delegates: await exo("delegates-list", { Upn: upnArg(b.upn), ObjectId:b.objectId }) };
  },
  "POST /api/exo/delegates/remove": async function (b) {
    return await exo("delegates-remove", { Upn: upnArg(b.upn), ObjectId:b.objectId, Delegate: upnArg(b.delegate) });
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
      capabilities: CFG.allowedOperations.filter(p=>CFG.enableMutations || !/\/(remove|clear|disable)$/.test(p)).map(p=>p.replace("/api/exo/", "").replaceAll("/", "-")), mutationsEnabled:CFG.enableMutations
    });
  }

  const handler = ROUTES[key];
  if (!handler) return send(res, 404, { error: "no such endpoint" });

  let caller = null, body = {}, operationId=crypto.randomUUID();
  try {
    const auth = req.headers.authorization || "";
    if (!/^Bearer /i.test(auth)) throw httpErr(401, "missing bearer token");
    caller = await verifyCallerToken(auth.slice(7).trim());
    rateLimit(caller.oid);
    body = await readBody(req);
    Policy.authorize(CFG,caller,body,key.split(" ")[1]);
    Policy.bindCase(path.join(path.dirname(CFG.auditFile),"cases"),caller,body);
    if(MUTATING.test(key)) operationId=body.operationId;
    audit({event:"action.intent",operationId,caseId:body.caseId,objectId:body.objectId,tenantId:body.tenantId,callerOid:caller.oid,route:key});
    if(MUTATING.test(key)){operationId=body.operationId;Policy.reserve(path.join(path.dirname(CFG.auditFile),"operations"),operationId,{caseId:body.caseId,objectId:body.objectId,route:key});}
    const started = Date.now();
    const result = await handler(body);

    audit({ event: MUTATING.test(key) ? "action.change" : "action.read", route: key,
      caller: caller.upn, callerOid: caller.oid, callerRoles: caller.roles, operationId, caseId:body.caseId, objectId:body.objectId,
      target: body.upn || "", detail: body.ruleId || body.delegate || "",
      result: "ok", ms: Date.now() - started });
    send(res, 200, Object.assign({ ok: true, operationId, status:MUTATING.test(key)?"accepted-verification-pending":"complete" }, result));
  } catch (e) {
    const status = e.status || 500;
    try { audit({ operationId,caseId:body.caseId,objectId:body.objectId,target:body.upn, event: status === 401 || status === 403 ? "auth.deny" : "action.fail", route: key,
      caller: (caller && caller.upn) || "-", result: "fail", status: status,
      message: String(e.message || e).slice(0, 400) }); } catch(auditError) { console.error("Audit failure; operation outcome may be uncertain",operationId); }
    // Callers get the reason, never a stack trace.
    send(res, status, { error: String(e.message || "internal error").slice(0, 400) });
  }
});

server.listen(CFG.port, function () {
  audit({ event: "start", tenantId: CFG.tenantId, organization: CFG.organization,
    appId: CFG.appId, spaAppId: CFG.spaAppId, apiScope: CFG.apiScope,
    allowedAnalysts: CFG.allowedUsers.length, protectedUpns: CFG.protectedUpns.length });
  console.log("[triage-backend] listening on :" + CFG.port + " for tenant " + CFG.tenantId);
});
