// Versioned evidence contract shared by collection, import, analysis and export.
(function () {
  "use strict";
  const CATALOG = [
    ["interactive", "Interactive sign-ins", "signIns", "Graph"],
    ["nonInteractive", "Non-interactive sign-ins", "signIns", "Graph"],
    ["audits", "Directory changes", "directoryAudits", "Graph"],
    ["riskyUsers", "Current risky users", "riskyUsers", "Graph"],
    ["riskDetections", "Risk detections", "riskDetections", "Graph"],
    ["users", "User inventory", "users", "Graph"],
    [
      "servicePrincipals",
      "Application identities",
      "servicePrincipals",
      "Graph",
    ],
    ["oauth", "Delegated OAuth grants", "oauthGrants", "Graph"],
    ["devices", "Device inventory", "devices", "Graph"],
    ["admins", "Directory role assignments", "admins", "Graph"],
    ["mfa", "MFA registration", "mfa", "Graph"],
    ["ual", "Unified Audit Log", "ualRecords", "Graph"],
    [
      "exchange",
      "Mailbox configuration snapshot",
      "exchangeSnapshots",
      "Worker",
    ],
  ];
  CATALOG.push(...[["managedIdentity", "Managed-identity sign-ins", "managedIdentitySignIns", "Desktop"], ["applications", "Application registrations", "applications", "Desktop"], ["applicationPermissions", "Application permissions", "applicationPermissions", "Desktop"], ["authenticationMethods", "Authentication methods", "authenticationMethods", "Desktop"], ["conditionalAccess", "Conditional Access policies", "conditionalAccess", "Desktop"], ["securityDefaults", "Security defaults", "securityDefaults", "Desktop"], ["groups", "Groups and dynamic rules", "groups", "Desktop"], ["groupMembers", "Group membership", "groupMembers", "Desktop"], ["licenses", "Tenant licenses", "licenses", "Desktop"], ["userLicenses", "User license assignments", "userLicenses", "Desktop"], ["roleSchedules", "PIM schedules and role activity", "roleSchedules", "Desktop"], ["securityAlerts", "Security alerts", "securityAlerts", "Desktop"], ["secureScore", "Secure Score and controls", "secureScore", "Desktop"], ["messages", "Email content", "messages", "Desktop"], ["attachments", "Email attachments", "attachments", "Desktop"], ["transportRules", "Transport rules", "transportRules", "Exchange"], ["messageTrace", "Message trace", "messageTrace", "Exchange"], ["adminAudit", "Admin audit log", "adminAudit", "Exchange"], ["mailboxAudit", "Mailbox audit log", "mailboxAudit", "Exchange"], ["azureActivity", "Azure subscription activity", "azureActivity", "Azure"], ["azureDirectoryActivity", "Azure directory activity", "azureDirectoryActivity", "Azure"]]);
  const STATES = [
    "not-collected",
    "running",
    "partial",
    "complete",
    "unavailable",
    "failed",
    "cancelled",
    "imported",
  ];
  const fields = [...new Set(CATALOG.map((x) => x[2]))];
  // Derived display rows retain their raw origin without adding fields to evidence.
  const origins = new WeakMap();
  const clone = (x) => JSON.parse(JSON.stringify(x));
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
  function unique(rows, byId = false) {
    const seen = new Set();
    return rows.filter((r) => {
      const k = byId && r.id ? String(r.id) : canonical(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  function create(opts) {
    const ev = Object.assign(
      {
        scope: "tenant",
        generated: new Date().toISOString(),
        caseId: crypto.randomUUID(),
        tenantId: "",
        tenantName: "Unverified import",
        raw: {},
        manifest: {},
        sources: [],
        dispositions: {},
      },
      opts || {},
    );
    fields.forEach((k) => {
      ev[k] = ev[k] || [];
    });
    CATALOG.forEach(([k, label, , route]) => {
      ev.manifest[k] = { state: "not-collected", label, route, count: 0 };
    });
    return ev;
  }
  function setSource(ev, key, records, info) {
    if (!CATALOG.some((x) => x[0] === key))
      throw Error("Unknown evidence source");
    ev.raw[key] = unique(records);
    ev.manifest[key] = Object.assign({}, ev.manifest[key], info, {
      count: ev.raw[key].length,
    });
    refresh(ev);
  }
  function refresh(ev) {
    fields.forEach((f) => {
      ev[f] = unique(
        CATALOG.filter((x) => x[2] === f).flatMap((x) => ev.raw[x[0]] || []),
        ["signIns","directoryAudits","riskDetections"].includes(f),
      );
    });
    const users = new Map(ev.users.map((u) => [u.id, u.userPrincipalName]));
    const applications = new Map(ev.servicePrincipals.map((sp) => [sp.id, sp]));
    ev.oauthGrants = ev.oauthGrants.map((raw) => {
      const g = { ...raw };
      origins.set(g, raw);
      if (g.principalId && users.has(g.principalId))
        g.principalUpn = users.get(g.principalId);
      const sp = applications.get(g.clientId);
      if (sp) {
        g.appId = sp.appId;
        g.appName = sp.displayName;
      }
      return g;
    });
    const userDetails = new Map(ev.users.map((u) => [u.id, u]));
    ev.admins = ev.admins.map((r) => {
      // One Graph expansion supplies the role. Resolve identity from preserved
      // inventory or the canonical case subject without changing original rows.
      const principal =
        r.principal ||
        userDetails.get(r.principalId) ||
        applications.get(r.principalId) ||
        (r.principalId && r.principalId === ev.subject?.objectId
          ? { userPrincipalName: ev.subject.upn }
          : {});
      const view = {
        ...r,
        userPrincipalName:
          r.userPrincipalName || principal.userPrincipalName || "",
        displayName:
          r.displayName || principal.displayName || r.principalId || "",
        role: r.role || r.roleDefinition?.displayName || r.roleDefinitionId,
        accountEnabled: r.accountEnabled ?? principal.accountEnabled,
      };
      origins.set(view, r);
      return view;
    });
    return ev;
  }
  function referenceIndex(ev) {
    const identity = new WeakMap(), values = new Map();
    function put(row, references) {
      const key = canonical(row);
      const list = values.get(key) || [];
      for (const reference of references) if (!list.includes(reference)) list.push(reference);
      values.set(key, list);
      if (row && typeof row === "object") identity.set(row, list);
    }
    for (const [key] of CATALOG)
      (ev.raw?.[key] || []).forEach((record, i) => put(record, [key + ":" + (i + 1)]));
    let enriched = false;
    function exact(record) {
      const original = origins.get(record) || record;
      if (identity.has(original)) return identity.get(original);
      const value = canonical(original);
      if (values.has(value)) return values.get(value);
      // Subject adapters and worker messages can copy enriched display rows.
      // Recreate only their lookup, preserving the caller's filtered views.
      if (!enriched && ev.raw && ev.manifest) {
        enriched = true;
        const view = refresh({ ...ev });
        for (const row of [...view.oauthGrants, ...view.admins]) {
          const refs = identity.get(origins.get(row));
          if (refs) put(row, refs);
        }
      }
      return values.get(value) || [];
    }
    // Complete values must match: never guess from an account, timestamp or title.
    return (records = []) => [...new Set(records.filter(Boolean).flatMap(exact))];
  }
  function ensure(input) {
    if (input.raw && input.manifest) return input;
    const ev = create(input);
    CATALOG.forEach(([key, , field]) => {
      if (key === "nonInteractive") return;
      const rows = input[field] || [];
      if (rows.length)
        setSource(ev, key, rows, {
          state: input.demo ? "complete" : "imported",
          note: input.demo
            ? "Illustrative demo data"
            : "Coverage cannot be proven from this legacy input",
        });
    });
    return ev;
  }
  function userScope(ev) {
    return ev.scope === "user" || (!ev.scope && !!(ev.subject?.upn || ev.upn));
  }
  function oauthScope(ev, grant) {
    const lower = (v) =>
      String(v || "")
        .trim()
        .toLowerCase();
    const consent = lower(grant.consentType);
    if (
      consent === "allprincipals" ||
      lower(grant.permissionType) === "application"
    )
      return "tenant";
    if (consent !== "principal") return "unattributed";
    const upn = lower(ev.subject?.upn || ev.upn || ev.user?.userPrincipalName);
    const id = lower(
      ev.subject?.objectId ||
        ev.user?.id ||
        (ev.users || []).find((u) => upn && lower(u.userPrincipalName) === upn)
          ?.id,
    );
    const principal = lower(grant.principalId);
    // IDs take precedence over display names or an inconsistent imported UPN.
    if (principal && id) return principal === id ? "user" : "other";
    if (principal) return "unattributed";
    const principalUpn = lower(grant.principalUpn);
    if (upn && principalUpn) return upn === principalUpn ? "user" : "other";
    return "unattributed";
  }
  function oauthSummary(ev) {
    const counts = { user: 0, tenant: 0, other: 0, unattributed: 0 };
    for (const grant of ev.oauthGrants || []) counts[oauthScope(ev, grant)]++;
    return counts;
  }
  async function digest(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    return Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  }
  async function bundle(ev) {
    const evidence = clone(ev);
    return {
      schema: "limon.triage.evidence",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      collectorVersion: window.BETA_BUILD || 3,
      evidence,
      integrity: { algorithm: "SHA-256", sha256: await digest(evidence) },
    };
  }
  async function unpack(obj) {
    if (
      !obj ||
      obj.schema !== "limon.triage.evidence" ||
      obj.schemaVersion !== 1
    )
      throw Error("Unsupported evidence bundle version");
    const ev = obj.evidence;
    if (!ev || typeof ev.caseId !== "string" || !ev.raw || !ev.manifest)
      throw Error("Invalid evidence bundle");
    if (
      !obj.integrity ||
      obj.integrity.algorithm !== "SHA-256" ||
      (await digest(ev)) !== obj.integrity.sha256
    )
      throw Error("Evidence integrity check failed. The bundle has changed.");
    // A bundle is untrusted input: only catalogued sources may carry records or manifest
    // entries, and a manifest entry may not rename the source it describes.
    const known = new Set(CATALOG.map((x) => x[0]));
    for (const k of Object.keys(ev.raw))
      if (!known.has(k)) throw Error("Unknown evidence source in bundle: " + k);
    for (const k of Object.keys(ev.manifest))
      if (!known.has(k)) throw Error("Unknown manifest entry in bundle: " + k);
    for (const [k, , f] of CATALOG) {
      if (ev.raw[k] && !Array.isArray(ev.raw[k]))
        throw Error("Invalid records for " + k);
      if (ev[f] && !Array.isArray(ev[f]))
        throw Error("Invalid evidence field " + f);
      if (ev.manifest[k]) {
        if (!STATES.includes(ev.manifest[k].state))
          throw Error("Invalid source state");
        if (typeof ev.manifest[k] !== "object" || Array.isArray(ev.manifest[k]))
          throw Error("Invalid manifest entry for " + k);
        delete ev.manifest[k].key;
      }
    }
    if (ev.dispositions && typeof ev.dispositions !== "object")
      throw Error("Invalid dispositions");
    if (ev.actionLog && !Array.isArray(ev.actionLog))
      throw Error("Invalid action log");
    const restored = refresh(clone(ev));
    if(restored.scope === "user" && restored.subject?.upn && window.TriageCase){
      const scoped=window.TriageCase.subject(restored,restored.subject.upn);
      // Preserve the grant inventory for explicit user/tenant/other attribution in
      // the viewer. The OAuth analyzer applies its own strict subject filter.
      scoped.oauthGrants=restored.oauthGrants;
      return scoped;
    }
    return restored;
  }
  function coverage(ev) {
    const all = CATALOG.map(([k, label, , route]) =>
      Object.assign(
        { state: "not-collected", count: 0 },
        ev.manifest[k] || {},
        { key: k, label, route },
      ),
    );
    return {
      all,
      complete: all.filter((s) => s.state === "complete").length,
      gaps: all.filter((s) => s.state !== "complete").length,
    };
  }
  window.BETA_Evidence = {
    CATALOG,
    STATES,
    create,
    setSource,
    refresh,
    ensure,
    bundle,
    unpack,
    coverage,
    unique,
    canonical,
    referenceIndex,
    userScope,
    oauthScope,
    oauthSummary,
  };
})();
