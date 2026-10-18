"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  vm = require("node:vm");
const KEYS = [
  "interactive",
  "nonInteractive",
  "audits",
  "riskyUsers",
  "riskDetections",
  "users",
  "servicePrincipals",
  "oauth",
  "devices",
  "admins",
  "mfa",
  "ual",
  "exchange",
];
KEYS.push(
  ...[
    "managedIdentity",
    "applications",
    "applicationPermissions",
    "authenticationMethods",
    "conditionalAccess",
    "securityDefaults",
    "groups",
    "groupMembers",
    "licenses",
    "userLicenses",
    "roleSchedules",
    "securityAlerts",
    "secureScore",
    "messages",
    "attachments",
    "transportRules",
    "messageTrace",
    "adminAudit",
    "mailboxAudit",
    "azureActivity",
    "azureDirectoryActivity",
  ],
);
const EXCHANGE_KEYS = [
  "exchange",
  "transportRules",
  "messageTrace",
  "adminAudit",
  "mailboxAudit",
];
const isExchange = (key) => EXCHANGE_KEYS.includes(key);
const GUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function validatePlan(p) {
  if (!p || p.schema !== "limon.triage.plan" || p.schemaVersion !== 1)
    throw Error("Unsupported collection plan");
  if (!GUID.test(p.tenantId) || !GUID.test(p.caseId))
    throw Error("Invalid tenant or case ID");
  if (!["user", "tenant"].includes(p.scope)) throw Error("Invalid scope");
  if (
    p.scope === "user" &&
    !/^[^\s@'<>]+@[^\s@'<>]+\.[^\s@'<>]+$/.test(p.upn || "")
  )
    throw Error("Invalid affected account");
  if (typeof p.upn !== "string" || p.upn.length > 254)
    throw Error("Invalid account");
  if (
    p.tenantName !== undefined &&
    (typeof p.tenantName !== "string" || p.tenantName.length > 200)
  )
    throw Error("Invalid tenant name");
  if (p.scope === "tenant" && p.upn)
    throw Error("Tenant scope cannot carry a subject");
  if (
    !Array.isArray(p.sources) ||
    !p.sources.length ||
    p.sources.some((k) => !KEYS.includes(k)) ||
    new Set(p.sources).size !== p.sources.length
  )
    throw Error("Unsupported evidence source");
  const start = Date.parse(p.window?.start),
    end = Date.parse(p.window?.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 180 * 864e5 ||
    end > Date.now() + 300000
  )
    throw Error("Invalid collection window");
  if (
    p.connection &&
    (!["delegated", "app"].includes(p.connection.mode) ||
      (p.connection.mode === "app" && !GUID.test(p.connection.profileId)))
  )
    throw Error("Invalid connection profile");
  return {
    ...(p.connection
      ? {
          connection:
            p.connection.mode === "app"
              ? { mode: "app", profileId: p.connection.profileId }
              : { mode: "delegated" },
        }
      : {}),
    schema: p.schema,
    schemaVersion: 1,
    caseId: p.caseId,
    tenantId: p.tenantId.toLowerCase(),
    ...(p.tenantName ? { tenantName: p.tenantName } : {}),
    scope: p.scope,
    upn: p.upn,
    window: {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    },
    sources: p.sources.slice(),
  };
}
function evidenceAPI(site) {
  const context = {
    window: { BETA_BUILD: 33 },
    crypto: crypto.webcrypto,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(site, "BETA/js/evidence.js"), "utf8"),
    context,
  );
  return context.window.BETA_Evidence;
}
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .filter((k) => v[k] !== undefined)
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
function hash(v) {
  return crypto.createHash("sha256").update(canonical(v)).digest("hex");
}
function atomicJson(file, value) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
// Progress is backed by the current attempt's atomic files, never stdout counts.
function readCheckpoint(root, plan, mode, key) {
  if (
    !KEYS.includes(key) ||
    !plan.sources.includes(key) ||
    !["graph", "exchange"].includes(mode) ||
    isExchange(key) !== (mode === "exchange")
  )
    throw Error("Unexpected collection source");
  const contextFile = path.join(root, mode + "-context.json");
  if (!fs.existsSync(contextFile)) return null;
  const context = JSON.parse(fs.readFileSync(contextFile, "utf8"));
  if (context.tenantId?.toLowerCase() !== plan.tenantId.toLowerCase())
    throw Error("Collection context tenant mismatch");
  const file = path.join(root, key + ".json");
  const checkpoint = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : null;
  if (
    checkpoint &&
    (!Array.isArray(checkpoint.records) ||
      ![
        "running",
        "complete",
        "partial",
        "failed",
        "unavailable",
        "cancelled",
      ].includes(checkpoint.manifest?.state))
  )
    throw Error("Invalid collection checkpoint");
  return { context, checkpoint };
}
function allowedFile(url, root) {
  const decoded = decodeURIComponent(new URL(url, "http://localhost").pathname);
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const parts = decoded.split("/").filter(Boolean);
  if (
    parts.some((p) => p.startsWith(".")) ||
    !["BETA", "js", "assets", "vendor", "index.html"].includes(parts[0])
  )
    return null;
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep)) return null;
  if (!/\.(html|js|css|svg|png|ico|md|woff2)$/.test(file)) return null;
  return file;
}
module.exports = {
  KEYS,
  isExchange,
  validatePlan,
  evidenceAPI,
  canonical,
  hash,
  atomicJson,
  readCheckpoint,
  allowedFile,
};
