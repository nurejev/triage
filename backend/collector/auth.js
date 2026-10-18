"use strict";
const crypto = require("node:crypto");
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
function createVerifier(cfg, fetchKeys) {
  let cache = { keys: [], at: 0 },
    refreshing = null,
    lastMiss = 0;
  async function refresh() {
    if (!refreshing)
      refreshing = fetchKeys()
        .then((j) => {
          if (!Array.isArray(j.keys)) throw Error("Invalid signing keys");
          cache = { keys: j.keys, at: Date.now() };
        })
        .finally(() => {
          refreshing = null;
        });
    await refreshing;
  }
  return async function verify(token) {
    if (typeof token !== "string" || token.length > 20000)
      throw httpError(401, "Invalid bearer token");
    const p = token.split(".");
    if (p.length !== 3) throw httpError(401, "Invalid bearer token");
    let h, b;
    try {
      h = JSON.parse(Buffer.from(p[0], "base64url"));
      b = JSON.parse(Buffer.from(p[1], "base64url"));
    } catch (e) {
      throw httpError(401, "Invalid bearer token");
    }
    if (
      h.alg !== "RS256" ||
      typeof h.kid !== "string" ||
      !b ||
      Array.isArray(b)
    )
      throw httpError(401, "Invalid token header");
    if (Date.now() - cache.at > 3600000) await refresh();
    let key = cache.keys.find((k) => k.kid === h.kid && k.kty === "RSA");
    if (!key && Date.now() - lastMiss > 30000) {
      lastMiss = Date.now();
      await refresh();
      key = cache.keys.find((k) => k.kid === h.kid && k.kty === "RSA");
    }
    if (
      !key ||
      !crypto.verify(
        "RSA-SHA256",
        Buffer.from(p[0] + "." + p[1]),
        crypto.createPublicKey({
          key: { kty: "RSA", n: key.n, e: key.e },
          format: "jwk",
        }),
        Buffer.from(p[2], "base64url"),
      )
    )
      throw httpError(401, "Invalid token signature");
    const now = Math.floor(Date.now() / 1000);
    if (typeof b.exp !== "number" || b.exp < now || (b.nbf && b.nbf > now + 60))
      throw httpError(401, "Token expired or not yet valid");
    if (
      b.ver !== "2.0" ||
      b.iss !== "https://login.microsoftonline.com/" + cfg.tenantId + "/v2.0" ||
      b.tid !== cfg.tenantId
    )
      throw httpError(403, "Wrong token tenant or issuer");
    if (b.aud !== cfg.appId || b.azp !== cfg.spaAppId)
      throw httpError(403, "Wrong token audience or client");
    if (
      !String(b.scp || "")
        .split(" ")
        .includes(cfg.scope || "Collect.Exchange") ||
      !Array.isArray(b.roles) ||
      !b.roles.some(r => (cfg.roles || ["Triage.Collector"]).includes(r))
    )
      throw httpError(
        403,
        "Required API scope and assigned application role are missing",
      );
    if (
      !/^[\da-f-]{36}$/i.test(b.oid || "") ||
      !cfg.allowedUsers.includes(b.oid.toLowerCase())
    )
      throw httpError(403, "This analyst is not on the collector allowlist");
    return {
      roles: b.roles,
      upn: b.preferred_username || b.upn || b.oid,
      oid: b.oid.toLowerCase(),
      tenantId: b.tid,
      name: b.name || b.preferred_username || b.oid,
    };
  };
}
module.exports = { createVerifier, httpError };
