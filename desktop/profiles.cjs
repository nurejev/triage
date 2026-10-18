"use strict";
const {isExchange} = require("./core.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { atomicJson } = require("./core.cjs");
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateProfile(input) {
  const p = {};
  for (const key of [
    "name",
    "tenantId",
    "graphAppId",
    "exchangeAppId",
    "organization",
  ]) {
    p[key] = String(input?.[key] || "").trim();
    if (p[key].length > 254) throw Error("Profile field is too long");
  }
  if (!p.name || /[\x00-\x1f]/.test(p.name))
    throw Error("Enter a customer name");
  if (!GUID.test(p.tenantId)) throw Error("Enter the customer tenant ID");
  p.tenantId = p.tenantId.toLowerCase();
  for (const key of ["graphAppId", "exchangeAppId"]) {
    if (p[key] && !GUID.test(p[key]))
      throw Error("Enter valid application IDs");
    p[key] = p[key].toLowerCase();
  }
  if (!p.graphAppId && !p.exchangeAppId)
    throw Error("Enter a Graph or Exchange application ID");
  if (
    p.exchangeAppId &&
    !/^[a-z0-9][a-z0-9-]*\.onmicrosoft\.com$/i.test(p.organization)
  )
    throw Error(
      "Exchange requires the customer’s original tenant.onmicrosoft.com domain",
    );
  return p;
}
// Profiles are encrypted with an app-local AES-256-GCM key kept in the user-data folder (mode 0600).
// The OS keychain (Electron safeStorage) is deliberately not used: with an ad-hoc or dev signature macOS
// asks for the login keychain password on every build and every read. Anyone who can read the key file
// can read the profiles, so the protection is file permissions + disk encryption — the same level as the
// SDK token caches next to it. `legacy` is only used to migrate profiles saved by 0.22 (one last prompt).
function localCipher(directory) {
  const keyFile = path.join(directory, "profile-key");
  let key;
  if (fs.existsSync(keyFile)) key = Buffer.from(fs.readFileSync(keyFile, "utf8").trim(), "base64");
  if (!key || key.length !== 32) {
    key = crypto.randomBytes(32);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(keyFile, key.toString("base64"), { mode: 0o600 });
  }
  return {
    encrypt(text) {
      const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
      return "v2:" + Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
    },
    decrypt(value) {
      const raw = Buffer.from(String(value).slice(3), "base64");
      const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
    },
  };
}
function createStore(directory, legacy) {
  const file = path.join(directory, "customer-profiles.json");
  const cipher = localCipher(directory);
  const read = () =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const secure = () => {};
  return {
    list: () => read().map(({ secret, ...metadata }) => metadata),
    save(input, credential, certificate) {
      const p = validateProfile(input);
      secure();
      if (!credential?.pfx || typeof credential.password !== "string")
        throw Error("Select a certificate and enter its password");
      if (
        !certificate?.thumbprint ||
        !Number.isFinite(Date.parse(certificate.expiresAt)) ||
        Date.parse(certificate.expiresAt) <= Date.now()
      )
        throw Error("Certificate is not valid");
      const item = {
        ...p,
        id: crypto.randomUUID(),
        certificate,
        secret: cipher.encrypt(JSON.stringify(credential)),
      };
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      atomicJson(file, [...read(), item]);
      const { secret, ...metadata } = item;
      return metadata;
    },
    // Edit the IDs/domain of a saved profile; the encrypted certificate is kept unless a new one is given.
    update(id, input) {
      const items = read(), index = items.findIndex((p) => p.id === id);
      if (index < 0) throw Error("Customer profile is not on this computer.");
      const p = validateProfile(input);
      items[index] = { ...items[index], ...p, id };
      atomicJson(file, items);
      const { secret, ...metadata } = items[index];
      return metadata;
    },
    remove(id) {
      atomicJson(
        file,
        read().filter((p) => p.id !== id),
      );
    },
    resolve(id, tenantId, sources) {
      secure();
      const p = read().find((p) => p.id === id);
      if (!p)
        throw Error(
          "Customer profile is not on this computer. Select or add a local profile.",
        );
      validateProfile(p);
      if (p.tenantId !== tenantId.toLowerCase())
        throw Error("Customer profile and investigation tenant differ");
      if (sources.some((k) => !isExchange(k)) && !p.graphAppId)
        throw Error("This profile has no Graph registration");
      if (sources.some(isExchange) && !p.exchangeAppId)
        throw Error("This profile has no Exchange registration");
      if (
        !Number.isFinite(Date.parse(p.certificate?.expiresAt)) ||
        Date.parse(p.certificate.expiresAt) <= Date.now()
      )
        throw Error(
          "Customer certificate has expired. Add a renewed certificate profile.",
        );
      let secret;
      if (String(p.secret).startsWith("v2:")) secret = JSON.parse(cipher.decrypt(p.secret));
      else {
        // Profile saved by 0.22 with the OS keychain: decrypt once, re-save with the local key.
        if (!legacy?.isEncryptionAvailable?.())
          throw Error("This profile was saved by an earlier version and cannot be read. Remove it and add the certificate again.");
        secret = JSON.parse(legacy.decryptString(Buffer.from(p.secret, "base64")));
        const items = read(), i = items.findIndex((x) => x.id === id);
        if (i >= 0) { items[i].secret = cipher.encrypt(JSON.stringify(secret)); atomicJson(file, items); }
      }
      return {
        tenantId: p.tenantId,
        graphAppId: p.graphAppId,
        exchangeAppId: p.exchangeAppId,
        organization: p.organization,
        ...secret,
      };
    },
  };
}
const GRAPH_PERMISSIONS = [
  "User.Read.All",
  "AuditLog.Read.All",
  "Directory.Read.All",
  "RoleManagement.Read.Directory",
  "IdentityRiskyUser.Read.All",
  "IdentityRiskEvent.Read.All",
  "AuditLogsQuery.Read.All",
        "UserAuthenticationMethod.Read.All",
        "Policy.Read.All",
        "Application.Read.All",
        "GroupMember.Read.All",
        "LicenseAssignment.Read.All",
        "SecurityAlert.Read.All",
        "SecurityEvents.Read.All",
        "Mail.Read",

];
function wizardSettings(input) {
  const p = validateProfile({
    ...input,
    graphAppId: "00000000-0000-0000-0000-000000000001",
    exchangeAppId: input?.exchange
      ? "00000000-0000-0000-0000-000000000001"
      : "",
  });
  return {
    schema: "limon.triage.registration",
    schemaVersion: 1,
    name: p.name,
    tenantId: p.tenantId,
    organization: p.organization,
    exchange: input.exchange === true,
    graphPermissions: GRAPH_PERMISSIONS.slice(),
    exchangePermissions:
      input.exchange === true ? ["Exchange.ManageAsApp"] : [],
  };
}
function redact(text, secrets = []) {
  let value = String(text || "");
  for (const s of secrets) if (s) value = value.split(s).join("[redacted]");
  return value
    .replace(
      /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[redacted token]",
    )
    .slice(-5000);
}
module.exports = {
  validateProfile,
  createStore,
  wizardSettings,
  GRAPH_PERMISSIONS,
  redact,
};
