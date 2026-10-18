"use strict";
const { isExchange, KEYS } = require("./core.cjs");
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  nativeTheme,
  safeStorage,
} = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const {
  validatePlan,
  evidenceAPI,
  atomicJson,
  readCheckpoint,
  allowedFile,
} = require("./core.cjs");
const { createStore, wizardSettings, redact } = require("./profiles.cjs");
const profileStore = () => createStore(app.getPath("userData"), safeStorage);
function preferences() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(app.getPath("userData"), "preferences.json"),
        "utf8",
      ),
    );
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}
function evidenceRoot() {
  return preferences().evidenceFolder || app.getPath("userData");
}
function checkEvidenceRoot(folder = evidenceRoot()) {
  if (!fs.statSync(folder).isDirectory())
    throw Error(
      "Evidence folder is unavailable. Choose an accessible folder before collecting.",
    );
  const probe = path.join(folder, ".triage-write-" + crypto.randomUUID());
  fs.writeFileSync(probe, "", { flag: "wx", mode: 0o600 });
  fs.unlinkSync(probe);
  return folder;
}
const chosenCertificates = new Map();
// Decrypted customer credentials for this app session only (never sent to the renderer).
const credentialCache = new Map();
let profileSaving = false;
const responseChildren = new Set();
let win,
  server,
  origin,
  active = null,
  privateCase = null,
  privateToken = null,
  privateExpires = 0;
const site = app.isPackaged
  ? path.join(process.resourcesPath, "site")
  : path.resolve(__dirname, "..");
const runtime = app.isPackaged
  ? path.join(process.resourcesPath, "runtime")
  : path.join(__dirname, "runtime", process.platform + "-" + process.arch);
const ps = path.join(
  runtime,
  "powershell",
  process.platform === "win32" ? "pwsh.exe" : "pwsh",
);
const modules = path.join(runtime, "modules"),
  E = evidenceAPI(site);
const executableScripts = app.isPackaged
  ? path.join(process.resourcesPath, "collector")
  : path.join(__dirname, "collector");
const env = () => ({
  ...process.env,
  PSModulePath: [modules, path.join(path.dirname(ps), "Modules")].join(
    path.delimiter,
  ),
  POWERSHELL_TELEMETRY_OPTOUT: "1",
  POWERSHELL_UPDATECHECK: "Off",
});
const emit = (value) => {
  if (win && !win.isDestroyed()) win.webContents.send("triage:progress", value);
};
function trusted(event) {
  // The page routes with the URL fragment (#/connect, #/case/…); the document itself never changes.
  if (
    event.sender !== win?.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    String(event.senderFrame.url).split("#")[0] !== origin + "/BETA/index.html"
  )
    throw Error("Untrusted application frame");
}
function runScript(
  script,
  args,
  onLine,
  track = false,
  onProgress = emit,
  onStart,
) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ps,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-File",
        path.join(executableScripts, script),
        ...args,
      ],
      { env: env(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const owner = track ? active : null;
    if (owner) owner.children.add(child);
    child.stdin.on("error", () => {}); // An exited/cancelled worker cannot accept the release signal.
    onStart?.(child);
    let all = "",
      pending = "",
      stderrPending = "",
      settled = false,
      progressError = null;
    const processLines = (text, isErr = false) => {
      let buffer = (isErr ? stderrPending : pending) + text;
      const lines = buffer.split(/\r?\n/);
      if (isErr) stderrPending = lines.pop();
      else pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith("TRIAGE_PROGRESS:")) {
          try {
            if (!progressError) onProgress(JSON.parse(line.slice(16)));
          } catch (error) {
            progressError = error;
            child.kill();
          }
        } else {
          all = (all + line + "\n").slice(-30000);
          onLine?.(line);
        }
      }
    };
    child.stdout.on("data", (b) => processLines(b.toString()));
    child.stderr.on("data", (b) => processLines(b.toString(), true));
    child.on("error", (e) => {
      settled = true;
      owner?.children.delete(child);
      reject(Error("PowerShell could not start: " + e.message));
    });
    child.on("close", (code) => {
      if (settled) return;
      processLines("\n");
      processLines("\n", true);
      owner?.children.delete(child);
      if (progressError) return reject(progressError);
      resolve({ code, output: all });
    });
  });
}
async function preflight() {
  if (!fs.existsSync(ps))
    return {
      ready: false,
      reason:
        "Bundled PowerShell is missing. Build the runtime with npm run desktop:runtime.",
      platform: process.platform,
      arch: process.arch,
    };
  let readiness;
  for (const probe of [
    "Microsoft.Graph.Authentication",
    "ExchangeOnlineManagement",
  ]) {
    const r = await runScript("preflight.ps1", [
      "-ModuleRoot",
      modules,
      "-ProbeModule",
      probe,
    ]);
    try {
      readiness = JSON.parse(r.output);
      if (!readiness.ready) return readiness;
    } catch {
      return {
        ready: false,
        reason: r.output || "PowerShell readiness check failed",
      };
    }
  }
  return readiness;
}
const GUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const COLLECTOR = "Triage desktop 0.34.0";
const CONNECT_TIMEOUT = 600000; // browser sign-in and callback
const SESSION_IDLE = 30 * 60000; // a signed-in worker that never collects
const serviceName = (mode) =>
  mode === "graph" ? "Microsoft Graph" : "Exchange Online";
// Connect requests the read permissions of every source a service can collect, so Scope can
// pick any of them later without a second sign-in. Mail content is the one opt-in.
const connectSources = (mode, mail) =>
  KEYS.filter(
    (k) =>
      isExchange(k) === (mode === "exchange") &&
      (mail || !["messages", "attachments"].includes(k)),
  );
// The Connect step: one case, one attempt folder, one plan file and up to two retained
// PowerShell workers (Graph, Exchange) that hold their sign-in until Collect releases them.
let link = null;
const describeSession = (session) => ({
  caseId: link?.caseId,
  service: session.mode,
  state: session.state,
  account: session.account,
  tenantId: link?.tenantId,
  authentication: session.credential ? "app-certificate" : "delegated",
  since: session.since || "",
  error: session.result?.error || "",
});
function sessionsSummary() {
  if (!link) return null;
  const services = {};
  for (const [mode, session] of link.sessions)
    services[mode] = describeSession(session);
  return {
    caseId: link.caseId,
    tenantId: link.tenantId,
    connection: link.connection,
    mail: link.mail,
    services,
  };
}
function stopSession(session, reason, state) {
  if (!session || session.ended || session.released) return;
  session.ended = state;
  session.endReason = reason;
  clearTimeout(session.idle);
  if (session.child) stopChildren({ children: new Set([session.child]) });
}
function closeLink(reason = "Connection closed") {
  if (!link) return;
  for (const session of link.sessions.values())
    stopSession(session, reason, "closed");
  link = null;
}
function readContext(mode) {
  const file = path.join(link.root, mode + "-context.json");
  if (!fs.existsSync(file))
    throw Error("Connection has no verified tenant/account context");
  const context = JSON.parse(fs.readFileSync(file, "utf8"));
  if (context.tenantId?.toLowerCase() !== link.tenantId || !context.account)
    throw Error("Connection has no verified tenant/account context");
  const credential = link.credential;
  if (
    credential &&
    (context.authType !== "AppOnly" ||
      context.appId !==
        (mode === "graph" ? credential.graphAppId : credential.exchangeAppId))
  )
    throw Error(
      `Application identity does not match the customer profile (${mode}: session ${context.authType} ${context.appId || "-"}, profile ${mode === "graph" ? credential.graphAppId : credential.exchangeAppId})`,
    );
  return context;
}
async function connectService(input) {
  const service = input?.service;
  if (!["graph", "exchange"].includes(service)) throw Error("Unknown service");
  if (!GUID.test(input.caseId || "") || !GUID.test(input.tenantId || ""))
    throw Error("Invalid case or tenant ID");
  if (active) throw Error("Finish or cancel the running collection first");
  const tenantId = input.tenantId.toLowerCase();
  const connection =
    input.connection?.mode === "app"
      ? { mode: "app", profileId: input.connection.profileId }
      : { mode: "delegated" };
  if (connection.mode === "app" && !GUID.test(connection.profileId || ""))
    throw Error("Invalid connection profile");
  const mail = !!input.mail;
  if (
    link &&
    (link.caseId !== input.caseId ||
      link.tenantId !== tenantId ||
      JSON.stringify(link.connection) !== JSON.stringify(connection) ||
      link.mail !== mail)
  )
    closeLink("Connection replaced");
  if (link?.sessions.get(service) && !link.sessions.get(service).ended) {
    const existing = link.sessions.get(service);
    if (existing.connected) return describeSession(existing);
    throw Error(serviceName(service) + " is already connecting");
  }
  let credential = null;
  if (connection.mode === "app") {
    const cached = credentialCache.get(connection.profileId);
    if (cached && cached.tenantId === tenantId) credential = cached;
    else {
      credential = profileStore().resolve(
        connection.profileId,
        tenantId,
        connectSources(service, false),
      );
      credentialCache.set(connection.profileId, credential);
    }
    if (service === "graph" && !credential.graphAppId)
      throw Error("This profile has no Graph registration");
    if (service === "exchange" && !credential.exchangeAppId)
      throw Error("This profile has no Exchange registration");
  }
  if (!link) {
    const check = await preflight();
    if (!check.ready)
      throw Error(check.reason || "Desktop prerequisites are missing");
    const root = path.join(
      checkEvidenceRoot(),
      "cases",
      input.caseId,
      crypto.randomUUID(),
    );
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    link = {
      caseId: input.caseId,
      tenantId,
      connection,
      mail,
      root,
      planFile: path.join(root, "plan.json"),
      sessions: new Map(),
      events: [],
      runtime: check,
      credential,
    };
  }
  link.credential = credential;
  // The connection plan pins the tenant and lists every source the connection may serve;
  // Collect rewrites it with the affected account, window and chosen sources before release.
  const plan = validatePlan({
    schema: "limon.triage.plan",
    schemaVersion: 1,
    caseId: link.caseId,
    tenantId,
    scope: "tenant",
    upn: "",
    window: {
      start: new Date(Date.now() - 30 * 864e5).toISOString(),
      end: new Date().toISOString(),
    },
    sources: [
      ...connectSources("graph", mail),
      ...connectSources("exchange", mail),
    ],
    connection,
  });
  atomicJson(link.planFile, plan);
  const clean = (text) =>
    redact(text, credential ? [credential.password, credential.pfx] : []);
  const session = {
    mode: service,
    credential,
    state: "connecting",
    connected: false,
    released: false,
    ended: null,
    child: null,
    account: "",
    since: "",
    stage: "Loading connection module",
    started: Date.now(),
    result: null,
  };
  link.sessions.set(service, session);
  const owner = link;
  const send = (value) => emit({ ...value, caseId: owner.caseId });
  const status = (text) => send({ type: "status", text });
  const connection$ = (state, extra = {}) => {
    session.state = state;
    if (["ready", "failed", "expired"].includes(state))
      owner.events.push({
        at: new Date().toISOString(),
        type: "connection-" + state,
        detail:
          serviceName(service) +
          (state === "ready"
            ? " connected on the Connect step."
            : state === "expired"
              ? " sign-in expired before collection; its sources remain gaps unless you sign in again."
              : " could not connect; selected sources remain gaps."),
        extra: {
          service,
          account: session.account,
          authentication: credential ? "app-certificate" : "delegated",
        },
      });
    send({
      type: "connection",
      mode: service,
      state,
      account: session.account,
      since: session.since,
      ...extra,
    });
  };
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  connection$("connecting");
  status(
    credential
      ? "Connecting with the customer application and certificate. No browser sign-in is required."
      : service === "graph"
        ? "Sign in to Microsoft 365 in the browser window that opens. Microsoft may ask for consent or MFA."
        : "Sign in to Exchange Online in the browser window that opens (Sign-in options → Face, fingerprint, PIN or security key). Use the same account as Microsoft Graph.",
  );
  session.done = runScript(
    "collect.ps1",
    [
      "-PlanPath",
      owner.planFile,
      "-OutputDirectory",
      owner.root,
      "-Mode",
      service,
      "-ModuleRoot",
      modules,
      "-WaitForCollection",
      ...(credential ? ["-AppCredential"] : []),
    ],
    (text) => send({ type: "message", text: clean(text) }),
    false,
    (progress) => {
      if (progress.type === "connection-stage") {
        session.stage = clean(progress.stage);
        status(serviceName(service) + ": " + session.stage);
        return;
      }
      if (progress.type === "connected") {
        if (session.connected || progress.mode !== service)
          throw Error("Invalid connection handshake");
        const context = link === owner ? readContext(service) : null;
        if (!context) throw Error("Connection closed during sign-in");
        session.connected = true;
        session.account = context.account;
        session.since = new Date().toISOString();
        clearTimeout(session.timer);
        clearInterval(session.heartbeat);
        session.idle = setTimeout(() => {
          session.expired = true;
          stopSession(
            session,
            "Sign-in expired after 30 minutes without collecting. Sign in again.",
            "expired",
          );
        }, SESSION_IDLE);
        session.idle.unref?.();
        connection$("ready");
        resolveReady(true);
        return;
      }
      if (!session.released)
        throw Error("Collection began before connection setup completed");
      session.onSource?.(progress);
    },
    (child) => {
      session.child = child;
      if (credential) child.stdin.write(JSON.stringify(credential) + "\n");
      session.heartbeat = setInterval(
        () =>
          status(
            `${serviceName(service)}: ${session.stage} · ${Math.round((Date.now() - session.started) / 1000)} seconds. You can cancel and retry.`,
          ),
        20000,
      );
      session.timer = setTimeout(() => {
        session.timeout = `${serviceName(service)} sign-in stopped after 10 minutes at: ${session.stage}. No password fallback was used. Check the Microsoft sign-in result, browser callback, network and tenant policy; then sign in again or use an approved certificate profile.`;
        stopSession(session, session.timeout, "failed");
      }, CONNECT_TIMEOUT);
    },
  )
    .catch((error) => ({ code: 1, error: error.message }))
    .then((result) => {
      clearTimeout(session.timer);
      clearInterval(session.heartbeat);
      clearTimeout(session.idle);
      if (result.code !== 0 || session.timeout || !session.connected)
        result.error =
          session.endReason ||
          session.timeout ||
          clean(result.error || result.output) ||
          `Connection failed at ${session.stage}`;
      session.result = result;
      if (!session.released) {
        session.ended ||= "failed";
        if (session.ended !== "closed" || link === owner)
          connection$(session.ended, { error: result.error });
      }
      resolveReady(false);
      return result;
    });
  if (!(await ready))
    throw Error(
      session.result?.error || serviceName(service) + " could not connect.",
    );
  return describeSession(session);
}
function cancelConnect(input) {
  const session = link?.sessions.get(input?.service);
  if (!session || session.ended || session.released)
    return { cancelled: false };
  stopSession(session, "Sign-in cancelled.", "cancelled");
  return { cancelled: true };
}
async function collect(plan) {
  if (active) throw Error("A collection is already running");
  const p = validatePlan(plan);
  if (!link || link.caseId !== p.caseId)
    throw Error("Sign in on the Connect step before collecting");
  if (link.tenantId !== p.tenantId)
    throw Error("The plan tenant differs from the connected tenant");
  const requested = p.connection || { mode: "delegated" };
  if (JSON.stringify(requested) !== JSON.stringify(link.connection))
    throw Error("The plan connection differs from the signed-in connection");
  active = { children: new Set(), cancelled: false };
  try {
    return await acquire(p);
  } finally {
    active = null;
    closeLink("Collection finished");
  }
}
async function acquire(p) {
  const owner = link,
    root = owner.root,
    credential = owner.credential;
  const clean = (text) =>
    redact(text, credential ? [credential.password, credential.pfx] : []);
  const send = (value) => emit({ ...value, caseId: p.caseId });
  // The full plan replaces the connection plan; each released worker reads it again.
  atomicJson(owner.planFile, p);
  const ev = E.create({
    caseId: p.caseId,
    tenantId: p.tenantId,
    tenantName: p.tenantName || p.tenantId,
    scope: p.scope,
    subject: p.scope === "user" ? { upn: p.upn } : undefined,
    window: p.window,
    selectedSources: p.sources,
    live: false,
    collector: COLLECTOR,
    collectionMethod: "powershell",
    runtime: owner.runtime,
    actionLog: [],
  });
  const entry = (type, detail, extra = {}, at = new Date().toISOString()) =>
    ev.actionLog.push({
      id: crypto.randomUUID(),
      at,
      actor: ev.collectorAccount || "Desktop collector",
      caseId: p.caseId,
      tenantId: p.tenantId,
      subject: p.upn || "Tenant",
      type,
      detail,
      ...extra,
    });
  for (const e of owner.events) entry(e.type, e.detail, e.extra, e.at);
  entry(
    "collection-start",
    credential
      ? "Started application + certificate collection with PowerShell on this computer."
      : "Started fixed read-only delegated collection with PowerShell on this computer.",
  );
  const loggedResults = new Set();
  const publish = (key) => {
    const state = ev.manifest[key].state;
    const signature = JSON.stringify([
      key,
      state,
      ev.raw[key]?.length,
      ev.manifest[key].error,
    ]);
    if (
      !["running", "not-collected"].includes(state) &&
      !loggedResults.has(signature)
    ) {
      entry(
        "source-result",
        ev.manifest[key].error ||
          `${ev.raw[key]?.length || 0} records returned.`,
        { source: key, state },
      );
      loggedResults.add(signature);
    }
    send({
      type: "source",
      source: key,
      records: ev.raw[key] || [],
      manifest: ev.manifest[key],
      collectorAccount: ev.collectorAccount,
      subject: ev.subject,
      actionLog: ev.actionLog,
    });
  };
  const read = (mode, key) => {
    const saved = readCheckpoint(root, p, mode, key);
    if (saved) {
      if (
        credential &&
        (saved.context.authType !== "AppOnly" ||
          saved.context.appId !==
            (mode === "graph"
              ? credential.graphAppId
              : credential.exchangeAppId))
      )
        throw Error(
          `Application identity does not match the customer profile (${mode}: session ${saved.context.authType} ${saved.context.appId || "-"}, profile ${mode === "graph" ? credential.graphAppId : credential.exchangeAppId})`,
        );
      ev.collectorAccount = saved.context.account;
      if (saved.context.objectId)
        ev.subject = {
          upn: saved.context.upn,
          objectId: saved.context.objectId,
        };
    }
    return saved;
  };
  const connection = (mode, state, extra = {}) => {
    const session = owner.sessions.get(mode);
    if (session) session.state = state;
    send({
      type: "connection",
      mode,
      state,
      account: session?.account || "",
      actionLog: ev.actionLog,
      ...extra,
    });
  };
  const released = [];
  try {
    send({ type: "phase", phase: "collecting" });
    send({ type: "status", text: "Collecting from the signed-in services…" });
    // Release every connected worker at once: the mailbox snapshot need not wait for the
    // audit-log query to finish paging. A signed-in service without selected sources is closed.
    for (const [mode, session] of owner.sessions) {
      const keys = p.sources.filter((k) =>
        mode === "exchange" ? isExchange(k) : !isExchange(k),
      );
      if (!session.connected || session.ended || session.released) continue;
      if (!keys.length) {
        stopSession(session, "No sources selected for this service", "closed");
        continue;
      }
      session.released = true;
      clearTimeout(session.idle);
      active.children.add(session.child);
      session.onSource = (progress) => {
        const saved = read(mode, progress.source);
        if (!saved) return;
        if (saved.checkpoint)
          E.setSource(
            ev,
            progress.source,
            saved.checkpoint.records,
            saved.checkpoint.manifest,
          );
        else if (progress.state === "running")
          E.setSource(ev, progress.source, [], { state: "running" });
        publish(progress.source);
      };
      released.push(session);
      connection(mode, "collecting");
      session.child.stdin.end("collect\n");
    }
    for (const mode of ["graph", "exchange"]) {
      const keys = p.sources.filter((k) =>
        mode === "exchange" ? isExchange(k) : !isExchange(k),
      );
      if (!keys.length) continue;
      const session = released.find((s) => s.mode === mode);
      const result = session
        ? await session.done
        : {
            code: 1,
            error:
              serviceName(mode) +
              " is not signed in. Go back to Connect and sign in, then collect again.",
          };
      for (const key of keys) {
        // Invalid identity contexts must not turn a failed sign-in into accepted evidence.
        let saved = null;
        try {
          if (session) saved = read(mode, key);
        } catch {
          /* report a gap below */
        }
        if (saved?.checkpoint) {
          const source = saved.checkpoint;
          E.setSource(ev, key, source.records, {
            ...source.manifest,
            state:
              source.manifest.state === "running"
                ? active.cancelled
                  ? "cancelled"
                  : "partial"
                : source.manifest.state,
          });
        } else
          E.setSource(ev, key, [], {
            state: active.cancelled ? "cancelled" : "failed",
            error:
              result.error ||
              (result.code
                ? "Connection or collection process failed. Review the local collection attempt."
                : "No source output produced."),
          });
        publish(key);
      }
      if (session && result.code && !active.cancelled)
        send({
          type: "error",
          text:
            clean(result.error || "") ||
            serviceName(mode) + " collection failed.",
        });
      connection(
        mode,
        active.cancelled ? "cancelled" : session ? "closed" : "failed",
        session ? {} : { error: result.error },
      );
    }
    const graph = owner.sessions.get("graph"),
      exchange = owner.sessions.get("exchange");
    if (graph?.released && exchange?.released) {
      // Both workers resolved the affected account independently; they must agree.
      try {
        const g = readContext("graph"),
          x = readContext("exchange");
        if (
          g.objectId &&
          x.objectId &&
          g.objectId.toLowerCase() !== x.objectId.toLowerCase()
        )
          throw Error(
            "Graph and Exchange resolved different accounts for " + p.upn,
          );
      } catch (error) {
        entry("collection-warning", error.message);
        send({ type: "error", text: error.message });
      }
    }
    entry(
      "collection-end",
      active.cancelled
        ? "Collection cancelled; completed checkpoints preserved."
        : "Collection ended; inspect coverage for incomplete sources.",
    );
    const bundle = await E.bundle(ev);
    atomicJson(path.join(root, "case.json"), bundle);
    return bundle;
  } finally {
    stopChildren(active);
    await Promise.allSettled(released.map((s) => s.done));
  }
}
function stopChildren(job) {
  for (const child of job?.children || []) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      }, 2000).unref();
    }
  }
}
function cancel() {
  if (!active) return { cancelled: false };
  active.cancelled = true;
  stopChildren(active);
  return { cancelled: true };
}
async function startServer() {
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".md": "text/plain",
    ".woff2": "font/woff2",
  };
  server = http.createServer((req, res) => {
    try {
      if (
        req.headers.host !== new URL(origin).host ||
        !["GET", "HEAD"].includes(req.method)
      ) {
        res.writeHead(403).end();
        return;
      }
      const parsed = new URL(req.url, origin);
      let route = parsed.pathname;
      if (privateToken && Date.now() > privateExpires) {
        privateToken = null;
        privateCase = null;
      }
      const isPrivate =
        privateToken && route.startsWith("/view/" + privateToken + "/");
      if (isPrivate) {
        route = route.slice(("/view/" + privateToken).length);
        if (route === "/case.json") {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(req.method === "HEAD" ? "" : JSON.stringify(privateCase));
          return;
        }
      }
      const file = allowedFile(route, site);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      // No cross-origin fetch, framing or remote script access from local evidence pages.
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com; worker-src 'self'; font-src 'self'; frame-src https://login.microsoftonline.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
      });
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(400).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
}
app.whenReady().then(async () => {
  const preferencesFile = path.join(
    app.getPath("userData"),
    "preferences.json",
  );
  let theme = "system";
  try {
    const saved = JSON.parse(fs.readFileSync(preferencesFile, "utf8")).theme;
    if (["system", "light", "dark"].includes(saved)) theme = saved;
  } catch {}
  await startServer();
  win = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 800,
    minHeight: 650,
    title: "Triage · Limon-IT",
    backgroundColor:
      theme === "dark" ||
      (theme === "system" && nativeTheme.shouldUseDarkColors)
        ? "#0f1512"
        : "#f2f7f3",
    webPreferences: {
      additionalArguments: ["--triage-theme=" + theme],
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const u = new URL(url);
    if (
      u.protocol === "https:" &&
      ["learn.microsoft.com", "github.com", "limon-it.nl"].includes(u.hostname)
    )
      shell.openExternal(url);
    else if (u.origin === origin && u.pathname.startsWith("/BETA/docs/"))
      shell.openExternal(url);
    return { action: "deny" };
  });
  // The page never navigates legitimately; a reload would drop the renderer's case state
  // while a PowerShell job kept running in main.
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  const savedCaseFile = path.join(
    app.getPath("userData"),
    "selected-case.json",
  );
  let responseContext = null,
    responseBusy = false,
    responseWriteBusy = false;
  let responseSession = null;
  const closeResponseSession = (reason = "Response connection closed") => {
    const session = responseSession;
    responseSession = null;
    if (!session) return;
    clearTimeout(session.idle);
    clearTimeout(session.timer);
    session.pending?.reject(Error(reason));
    session.pending = null;
    if (session.child) stopChildren({ children: new Set([session.child]) });
  };
  const responseWorker = (request) =>
    new Promise((resolve, reject) => {
      if (!responseSession) {
        const session = { pending: null, child: null };
        responseSession = session;
        session.done = runScript(
          "response.ps1",
          ["-ModuleRoot", modules],
          (line) => {
            if (!line.startsWith("TRIAGE_RESPONSE:")) return;
            const pending = session.pending;
            if (!pending) return;
            clearTimeout(session.timer);
            session.pending = null;
            try {
              const result = JSON.parse(line.slice(16));
              if (result.ok) pending.resolve(result.value);
              else pending.reject(Error(result.error || "Response failed"));
            } catch (error) {
              pending.reject(error);
            }
            session.idle = setTimeout(
              () => {
                if (responseSession === session)
                  closeResponseSession("Response session expired; reconnect");
              },
              15 * 60 * 1000,
            );
            session.idle.unref();
          },
          false,
          () => {},
          (child) => {
            session.child = child;
            responseChildren.add(child);
          },
        );
        const ended = () => {
          responseChildren.delete(session.child);
          clearTimeout(session.timer);
          clearTimeout(session.idle);
          session.pending?.reject(
            Error("Response session ended; reconnect before retrying"),
          );
          session.pending = null;
          if (responseSession === session) {
            responseSession = null;
            responseContext = null;
          }
        };
        session.done.then(ended, ended);
      }
      const session = responseSession;
      if (session.pending)
        return reject(Error("A response request is already running"));
      clearTimeout(session.idle);
      session.pending = { resolve, reject };
      session.timer = setTimeout(
        () =>
          closeResponseSession(
            "Response timed out; verify account state before retrying any change",
          ),
        10 * 60 * 1000,
      );
      session.child.stdin.write(JSON.stringify(request) + "\n");
    });
  ipcMain.handle("triage:response-connect", async (event, input) => {
    trusted(event);
    if (active || responseBusy)
      throw Error("Finish the current operation first");
    const c = require("./response.cjs").validateContext(input);
    closeResponseSession();
    responseContext = null;
    responseBusy = true;
    try {
      const r = await responseWorker({ ...c, connect: true });
      responseContext = {
        ...c,
        operator: r.account.username,
        expires: Date.now() + 15 * 60 * 1000,
      };
      return r.account;
    } finally {
      responseBusy = false;
    }
  });
  ipcMain.handle("triage:response-request", async (event, input) => {
    trusted(event);
    if (active || responseBusy)
      throw Error("Finish the current operation first");
    if (
      !responseContext ||
      !responseSession ||
      Date.now() > responseContext.expires
    ) {
      closeResponseSession();
      responseContext = null;
      throw Error("Response session expired; reconnect the account");
    }
    const request = require("./response.cjs").validateRequest(
      responseContext,
      input,
    );
    responseBusy = true;
    responseWriteBusy = request.write;
    const ledger = path.join(app.getPath("userData"), "response-journal.jsonl");
    const append = (state, detail = "") =>
      fs.appendFileSync(
        ledger,
        JSON.stringify({
          at: new Date().toISOString(),
          caseId: request.caseId,
          tenantId: request.tenantId,
          objectId: request.objectId,
          operator: responseContext.operator,
          method: request.method,
          path: new URL(request.url).pathname,
          state,
          detail,
        }) + "\n",
        { mode: 0o600 },
      );
    try {
      if (request.write) {
        const answer = await dialog.showMessageBox(win, {
          type: "warning",
          buttons: ["Cancel", "Execute approved action"],
          defaultId: 0,
          cancelId: 0,
          title: "Confirm account response",
          message: request.method + " " + new URL(request.url).pathname,
          detail:
            "Tenant: " +
            request.tenantId +
            "\nAccount: " +
            request.upn +
            "\nOperator: " +
            responseContext.operator +
            "\nThis changes Microsoft 365. The action will be recorded.",
        });
        if (answer.response !== 1) throw Error("Response cancelled");
        append("intent");
      }
      const value = await responseWorker({
        ...request,
        operator: responseContext.operator,
      });
      if (request.write) append("accepted");
      return value;
    } catch (error) {
      const secret = request.body?.passwordProfile?.password;
      const message = redact(
        secret
          ? String(error.message).split(secret).join("[redacted]")
          : error.message,
      );
      if (request.write) append("failed-or-uncertain", message);
      throw Error(message);
    } finally {
      responseBusy = false;
      responseWriteBusy = false;
    }
  });
  ipcMain.handle("triage:profiles", (event) => {
    trusted(event);
    return profileStore().list();
  });
  ipcMain.handle("triage:choose-certificate", async (event) => {
    trusted(event);
    const selected = await dialog.showOpenDialog(win, {
      title: "Choose customer PFX certificate",
      properties: ["openFile"],
      filters: [
        { name: "Certificate with private key", extensions: ["pfx", "p12"] },
      ],
    });
    if (selected.canceled) return null;
    const file = selected.filePaths[0];
    if (fs.statSync(file).size > 1024 * 1024)
      throw Error("Certificate file is too large");
    const token = crypto.randomUUID();
    chosenCertificates.clear();
    chosenCertificates.set(token, file);
    return { token, name: path.basename(file) };
  });
  ipcMain.handle("triage:save-profile", async (event, input) => {
    trusted(event);
    if (active || profileSaving)
      throw Error("Finish the current operation first");
    if (typeof input?.password !== "string" || input.password.length > 4096)
      throw Error("Invalid certificate password");
    const file = chosenCertificates.get(input.certificateToken);
    if (!file) throw Error("Choose a PFX certificate first");
    profileSaving = true;
    try {
      if (fs.statSync(file).size > 1024 * 1024)
        throw Error("Certificate file is too large");
      const credential = {
        pfx: fs.readFileSync(file).toString("base64"),
        password: input.password,
      };
      const result = await runScript(
        "check-certificate.ps1",
        [],
        null,
        false,
        () => {},
        (child) => child.stdin.end(JSON.stringify(credential) + "\n"),
      );
      if (result.code)
        throw Error(
          "Certificate validation failed. Check the password, private key and expiry.",
        );
      const saved = profileStore().save(
        input,
        credential,
        JSON.parse(result.output),
      );
      chosenCertificates.clear();
      return saved;
    } finally {
      profileSaving = false;
    }
  });
  ipcMain.handle("triage:update-profile", (event, input) => {
    trusted(event);
    if (active || profileSaving)
      throw Error("Finish the current operation first");
    if (typeof input?.id !== "string") throw Error("Choose a profile to edit");
    credentialCache.delete(input.id);
    return profileStore().update(input.id, input);
  });
  ipcMain.handle("triage:remove-profile", (event, id) => {
    trusted(event);
    if (active) throw Error("Finish collection first");
    credentialCache.delete(id);
    profileStore().remove(id);
    return { removed: true };
  });
  ipcMain.handle("triage:import-profile", async (event) => {
    trusted(event);
    const chosen = await dialog.showOpenDialog(win, {
      title: "Import registration result (IDs only)",
      properties: ["openFile"],
      filters: [{ name: "Customer profile", extensions: ["json"] }],
    });
    if (chosen.canceled) return null;
    if (fs.statSync(chosen.filePaths[0]).size > 1024 * 1024)
      throw Error("Profile file is too large");
    const value = JSON.parse(fs.readFileSync(chosen.filePaths[0], "utf8"));
    const { validateProfile } = require("./profiles.cjs");
    return validateProfile({
      name: value.name || value.DisplayName,
      tenantId: value.tenantId || value.TenantId,
      graphAppId: value.graphAppId || value.GraphAppId,
      exchangeAppId: value.exchangeAppId || value.ExchangeAppId,
      organization: value.organization || value.Organization,
    });
  });
  ipcMain.handle("triage:registration-kit", async (event, input) => {
    trusted(event);
    if (active) throw Error("Finish collection first");
    const settings = wizardSettings(input);
    const selected = await dialog.showOpenDialog(win, {
      title: "Save registration setup folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (selected.canceled) return null;
    const folder = path.join(
      selected.filePaths[0],
      "Triage-setup-" + crypto.randomUUID().slice(0, 8),
    );
    fs.mkdirSync(folder, { mode: 0o700 });
    atomicJson(path.join(folder, "settings.json"), settings);
    fs.copyFileSync(
      path.join(executableScripts, "New-TriageRegistrations.ps1"),
      path.join(folder, "New-TriageRegistrations.ps1"),
    );
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const command = `& ${quote(ps)} -NoProfile -File ${quote(path.join(folder, "New-TriageRegistrations.ps1"))} -ModuleRoot ${quote(modules)}`;
    fs.writeFileSync(
      path.join(folder, "README.txt"),
      "Triage customer registration setup\n\n" +
        command +
        "\n\nReview settings.json and the script first. The script previews permissions, checks the signed-in tenant and asks you to type that tenant ID before cloud changes. It creates new apps only, generates a password-protected PFX, requests consent and writes a profile with IDs only. Enter a unique PFX password when prompted. Import profile.json and choose customer.pfx in Triage afterward. If Exchange is selected, a separate Exchange-RBAC.ps1 is generated for review and execution by your Exchange role administrator. Keep this folder private. A failure leaves registration-state.json for investigation and does not delete cloud objects.\n",
      { mode: 0o600 },
    );
    return { folder, command, settings };
  });
  ipcMain.handle("triage:set-theme", (event, value) => {
    trusted(event);
    if (!["system", "light", "dark"].includes(value))
      throw Error("Unsupported theme preference");
    atomicJson(preferencesFile, { ...preferences(), theme: value });
    return { saved: true };
  });
  ipcMain.handle("triage:evidence-folder", (event) => {
    trusted(event);
    return { folder: evidenceRoot() };
  });
  ipcMain.handle("triage:choose-evidence-folder", async (event) => {
    trusted(event);
    if (active)
      throw Error("Stop collection before changing the evidence folder.");
    const result = await dialog.showOpenDialog(win, {
      title: "Choose evidence folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0])
      return { folder: evidenceRoot(), cancelled: true };
    if (active)
      throw Error("Stop collection before changing the evidence folder.");
    const folder = checkEvidenceRoot(result.filePaths[0]);
    atomicJson(preferencesFile, { ...preferences(), evidenceFolder: folder });
    return { folder };
  });
  ipcMain.handle("triage:open-evidence-folder", async (event) => {
    trusted(event);
    const error = await shell.openPath(evidenceRoot());
    if (error) throw Error(error);
  });
  // One file per case under saved-cases/, plus selected-case.json pointing at the last save.
  const savedCasesDir = path.join(app.getPath("userData"), "saved-cases");
  const caseFile = (id) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error("Invalid case ID");
    return path.join(savedCasesDir, id + ".json");
  };
  ipcMain.handle("triage:save-case", async (event, bundle) => {
    trusted(event);
    if (Buffer.byteLength(JSON.stringify(bundle)) > 250 * 1024 * 1024)
      throw Error("Case is too large");
    await E.unpack(bundle);
    const id = bundle.evidence.caseId;
    const destination = path.join(checkEvidenceRoot(), "saved-cases");
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    // Keep the private case library working across destination changes.
    atomicJson(path.join(destination, id + ".json"), bundle);
    fs.mkdirSync(savedCasesDir, { recursive: true, mode: 0o700 });
    atomicJson(caseFile(id), bundle);
    atomicJson(savedCaseFile, {
      caseId: id,
      savedAt: new Date().toISOString(),
    });
    return { saved: true, caseId: id };
  });
  ipcMain.handle("triage:list-cases", (event) => {
    trusted(event);
    if (!fs.existsSync(savedCasesDir)) return [];
    return fs
      .readdirSync(savedCasesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const b = JSON.parse(
            fs.readFileSync(path.join(savedCasesDir, f), "utf8"),
          );
          return {
            caseId: b.evidence?.caseId || f.slice(0, -5),
            savedAt: b.exportedAt || "",
            tenantName: b.evidence?.tenantName || "",
            subject: b.evidence?.subject?.upn || "",
            scope: b.evidence?.scope || "",
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  });
  ipcMain.handle("triage:load-case", async (event, caseId) => {
    trusted(event);
    let file;
    if (caseId) file = caseFile(caseId);
    else if (fs.existsSync(savedCaseFile)) {
      const pointer = JSON.parse(fs.readFileSync(savedCaseFile, "utf8"));
      // Pre-0.23 builds stored the whole bundle in selected-case.json.
      if (pointer.schema === "limon.triage.evidence") {
        await E.unpack(pointer);
        return pointer;
      }
      file = pointer.caseId ? caseFile(pointer.caseId) : null;
    }
    if (!file || !fs.existsSync(file)) return null;
    const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
    await E.unpack(bundle);
    return bundle;
  });
  ipcMain.handle("triage:clear-case", (event, caseId) => {
    trusted(event);
    if (caseId) fs.rmSync(caseFile(caseId), { force: true });
    else {
      fs.rmSync(savedCasesDir, { recursive: true, force: true });
      fs.rmSync(savedCaseFile, { force: true });
    }
    return { cleared: true };
  });
  ipcMain.handle("triage:disconnect", async (event) => {
    trusted(event);
    if (active || responseBusy)
      throw Error("Finish or cancel the running operation first");
    responseContext = null;
    closeResponseSession();
    closeLink("Signed out");
    credentialCache.clear();
    const r = await runScript(
      "disconnect.ps1",
      ["-ModuleRoot", modules],
      null,
      false,
      () => {},
    );
    let result = { disconnected: r.code === 0 };
    try {
      result = JSON.parse(r.output.trim().split("\n").pop());
    } catch {}
    return result;
  });
  ipcMain.handle("triage:preflight", (event) => {
    trusted(event);
    return preflight();
  });
  ipcMain.handle("triage:connect", (event, input) => {
    trusted(event);
    return connectService(input);
  });
  ipcMain.handle("triage:cancel-connect", (event, input) => {
    trusted(event);
    return cancelConnect(input);
  });
  ipcMain.handle("triage:sessions", (event) => {
    trusted(event);
    return sessionsSummary();
  });
  ipcMain.handle("triage:collect", (event, p) => {
    trusted(event);
    return collect(p);
  });
  ipcMain.handle("triage:cancel", (event) => {
    trusted(event);
    if (!responseWriteBusy) {
      closeResponseSession(
        "Scanning stopped; reconnect before running more checks",
      );
      responseContext = null;
    }
    return cancel();
  });
  ipcMain.handle("triage:browser", async (event, b) => {
    trusted(event);
    if (Buffer.byteLength(JSON.stringify(b)) > 250 * 1024 * 1024)
      throw Error("Case is too large");
    await E.unpack(b);
    privateCase = b;
    privateToken = crypto.randomBytes(32).toString("hex");
    privateExpires = Date.now() + 15 * 60000; // the handoff link is not a permanent share
    await shell.openExternal(
      origin + "/view/" + privateToken + "/BETA/index.html?localCase=1",
    );
    return { opened: true };
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Triage",
        submenu: [
          {
            label: "Open collection plan…",
            click: async () => {
              const selected = await dialog.showOpenDialog(win, {
                filters: [{ name: "Triage plan", extensions: ["json"] }],
                properties: ["openFile"],
              });
              if (selected.canceled) return;
              try {
                const p = validatePlan(
                  JSON.parse(fs.readFileSync(selected.filePaths[0], "utf8")),
                );
                win.webContents.send("triage:plan", p);
              } catch (e) {
                dialog.showErrorBox("Cannot open plan", e.message);
              }
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
    ]),
  );
  await win.loadURL(origin + "/BETA/index.html");
  if (process.argv.includes("--smoke-test")) {
    const result = await preflight();
    console.log(
      JSON.stringify({ loaded: !win.webContents.isDestroyed(), ...result }),
    );
    app.exit(result.ready ? 0 : 1);
  }
});
app.on("before-quit", () => {
  for (const child of responseChildren) child.kill();
  credentialCache.clear();
  cancel();
  closeLink("Application closing");
  server?.close();
});
app.on("window-all-closed", () => app.quit());
