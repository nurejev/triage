// Import Microsoft-Extractor-Suite output (the MAS input format) and normalize
// it onto the evidence shape BETA_Analyzers.analyze expects. Everything is
// parsed in this browser tab - nothing is uploaded. Multiple files merge into
// one evidence object, so you can drop a whole export folder in at once.
(function () {
  "use strict";

  // ---- RFC-4180-ish CSV parser (quotes, escaped "", embedded , and \n) ----
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [],
      field = "",
      i = 0,
      inQ = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQ = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQ = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
    }
    if (inQ) throw Error("CSV contains an unclosed quoted field");
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }
  function csvToObjects(text) {
    const rows = parseCsv(text).filter(function (r) {
      return r.length && !(r.length === 1 && r[0] === "");
    });
    if (rows.length < 2) return [];
    const head = rows[0];
    return rows.slice(1).map(function (r) {
      if (r.length !== head.length)
        throw Error("CSV row does not match the header column count");
      const o = {};
      head.forEach(function (h, i) {
        o[h] = r[i];
      });
      return o;
    });
  }
  function parseJsonLoose(text) {
    text = text.replace(/^﻿/, "").trim();
    try {
      const v = JSON.parse(text);
      return Array.isArray(v) ? v : v && v.value ? v.value : [v];
    } catch (e) {
      const out = [];
      text.split(/\r?\n/).forEach(function (l, i) {
        if (!l.trim()) return;
        try {
          out.push(JSON.parse(l));
        } catch (err) {
          throw new Error(
            "Invalid JSON at line " + (i + 1) + ". File was not imported.",
          );
        }
      });
      return out;
    }
  }

  function records(name, text) {
    return /\.json$/i.test(name) ||
      (!/\.csv$/i.test(name) && /^[\[{]/.test(text.trim()))
      ? parseJsonLoose(text)
      : csvToObjects(text);
  }
  // Which Extractor-Suite artifact is this? Keyed off filename first, then shape.
  function classify(name, rows) {
    const n = name.toLowerCase();
    if (/transport.?rule/.test(n)) return "transportRules";
    if (/message.?trace/.test(n)) return "messageTrace";
    if (/mailboxpermission|mailbox.?auditstatus|mailbox.?rule/.test(n)) return "exchange";
    if (/mailbox.?audit/.test(n)) return "mailboxAudit";
    for(const c of window.BETA_Evidence.CATALOG) if(c[3] !== "Graph" && n.replace(/[^a-z]/g,"").includes(c[0].toLowerCase())) return c[0];
    if (/-ual|unifiedaudit|\bual\b/.test(n)) return "ual";
    if (/signin/.test(n)) return "signins";
    if (/auditlog|entraaudit|directoryaudit/.test(n)) return "audits";
    if (/riskydetection/.test(n)) return "riskDetections";
    if (/riskyuser/.test(n)) return "riskyUsers";
    if (/oauth/.test(n)) return "oauth";
    if (/device/.test(n)) return "devices";
    if (/admin/.test(n)) return "admins";
    if (/mfa|registrationdetail/.test(n)) return "mfa";
    if (/user/.test(n)) return "users";
    // shape-based fallback
    const r = rows[0] || {};
    if (r.AuditData || r.Operations || r.RecordType) return "ual";
    if (r.riskEventType) return "riskDetections";
    if (r.riskState && r.riskLevel && !r.riskEventType) return "riskyUsers";
    if (
      r.userPrincipalName &&
      r.createdDateTime &&
      (r.appDisplayName || r.ipAddress)
    )
      return "signins";
    if (r.activityDisplayName) return "audits";
    return "unknown";
  }
  // Normalize a UAL CSV row (wrapper columns) into {operation, recordType, userPrincipalName, createdDateTime, auditData}
  function normUal(r) {
    let ad = r.AuditData || r.auditData;
    if (typeof ad === "string") {
      try {
        ad = JSON.parse(ad);
      } catch (e) {
        ad = {};
      }
    }
    ad = ad || r;
    return {
      ...r,
      operation: r.operation || r.Operations || r.Operation || ad.Operation,
      recordType: r.RecordType || ad.RecordType,
      userPrincipalName:
        r.userPrincipalName || r.UserIds || r.UserId || ad.UserId,
      createdDateTime: r.createdDateTime || r.CreationDate || ad.CreationTime,
      auditData: ad,
    };
  }

  async function readFile(file) {
    if (file.size > 100 * 1024 * 1024)
      throw Error("File exceeds the 100 MB beta import limit");
    if (file.text) return file.text();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(Error("Cannot read file"));
      r.readAsText(file);
    });
  }
  async function ingest(files, done, onProgress) {
    const E = window.BETA_Evidence;
    const list = Array.from(files);
    let ev = E.create({ imported: true });
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      if (onProgress) onProgress(i + 1, list.length, file.name);
      const text = await readFile(file);
      let obj;
      try {
        obj = JSON.parse(text.replace(/^﻿/, ""));
      } catch (e) {
        /* CSV / JSONL handled below */
      }
      if (obj?.upn && Array.isArray(obj.signIns) && window.TriageCase) {
        if(list.length!==1) throw Error('Open a quick-user case on its own.');
        ev=window.TriageCase.toCommon(obj);ev.imported=true;ev.live=false;
      } else if (obj && obj.schema) {
        if (list.length !== 1)
          throw Error(
            "Import an evidence bundle on its own. Separate acquisitions must not silently merge.",
          );
        ev = await E.unpack(obj);
        ev.imported = true;
        ev.live = false;
        ev.dispositions = ev.dispositions || {};
      } else {
        const rows = records(file.name, text),
          kind = classify(file.name, rows);
        if (["unknown", "unsupported-exchange"].includes(kind))
          throw Error(
            file.name +
              ": unsupported artifact. Use a beta evidence bundle or supported Graph/UAL exports.",
          );
        const tenantIds = [
          ...new Set(
            rows
              .map((r) => r.tenantId || r.TenantId || r.AADTenantId)
              .filter(Boolean),
          ),
        ];
        if (
          tenantIds.length > 1 ||
          (ev.tenantId && tenantIds.length && ev.tenantId !== tenantIds[0])
        )
          throw Error("Files contain evidence from different tenants");
        if (tenantIds.length) ev.tenantId = tenantIds[0];
        const key = kind === "signins" ? "interactive" : kind;
        const tmp = E.create();
        route(tmp, kind, rows, file.name);
        const field = E.CATALOG.find((x) => x[0] === key)[2];
        E.setSource(ev, key, (ev.raw[key] || []).concat(tmp[field]), {
          state: "imported",
          note: "File imported; original collection completeness and time coverage are unverified",
        });
        ev.sources.push({ file: file.name, kind, rows: rows.length });
      }
    }
    if (done) done(ev);
    return ev;
  }
  function route(ev, kind, rows, name="") {
    if (kind === "signins")
      ev.signIns = ev.signIns.concat(rows.map(normSignIn));
    else if (kind === "audits")
      ev.directoryAudits = ev.directoryAudits.concat(rows);
    else if (kind === "riskyUsers") ev.riskyUsers = ev.riskyUsers.concat(rows);
    else if (kind === "riskDetections")
      ev.riskDetections = ev.riskDetections.concat(rows);
    else if (kind === "oauth")
      ev.oauthGrants = ev.oauthGrants.concat(rows.map(normOauth));
    else if (kind === "users") ev.users = ev.users.concat(rows);
    else if (kind === "devices") ev.devices = ev.devices.concat(rows);
    else if (kind === "admins") ev.admins = ev.admins.concat(rows);
    else if (kind === "mfa") ev.mfa = ev.mfa.concat(rows.map(normMfa));
    else if (kind === "ual")
      ev.ualRecords = ev.ualRecords.concat(rows.map(normUal));
    else if(kind === "exchange") ev.exchangeSnapshots.push({schema:"limon.triage.exchange",schemaVersion:1,tenantId:"",upn:"Unverified imported mailbox",sources:[{key:/rule/i.test(name)?"rules":/audit/i.test(name)?"mailbox":"fullAccess",state:"imported",records:rows}],capturedAt:""});
    else {const c=window.BETA_Evidence.CATALOG.find(c=>c[0]===kind);if(c) ev[c[2]]=ev[c[2]].concat(rows);}
  }
  function normSignIn(r) {
    const out = { ...r };
    out.userPrincipalName =
      r.userPrincipalName ||
      r.UserPrincipalName ||
      r["User principal name"] ||
      "";
    out.createdDateTime =
      r.createdDateTime || r.CreatedDateTime || r.Date || "";
    out.ipAddress = r.ipAddress || r.IPAddress || r["IP address"] || "";
    if (typeof r.status === "string") {
      try {
        out.status = JSON.parse(r.status);
      } catch (e) {
        out.status = undefined;
      }
    }
    if (!out.status || typeof out.status.errorCode !== "number") {
      const v = r.Status || r.status || r.ErrorCode || r["Sign-in error code"];
      const n = /^success$/i.test(String(v))
        ? 0
        : /^failure$/i.test(String(v))
          ? -1
          : /^\d+$/.test(String(v))
            ? Number(v)
            : null;
      if (n === null)
        throw Error("Sign-in row has ambiguous success/failure status");
      out.status = { errorCode: n };
    }
    if (!out.userPrincipalName && !r.servicePrincipalId && !r.managedServiceIdentity && !r.appId)
      throw Error("Sign-in row is missing its user or application identity");
    for (const k of ["location", "deviceDetail"])
      if (typeof out[k] === "string") {
        try {
          out[k] = JSON.parse(out[k]);
        } catch (e) {
          throw Error("Invalid " + k + " JSON in sign-in row");
        }
      }
    return out;
  }
  function normOauth(r) {
    return {
      ...r,
      appName: r.AppDisplayName || r.appDisplayName || r.appName,
      appId: r.AppId || r.appId,
      clientId: r.ClientObjectId || r.clientId,
      scope: r.Permission || r.scope || "",
      permissionType: r.PermissionType || r.permissionType || "Delegated",
      consentType: r.ConsentType || r.consentType,
      principalId: r.PrincipalId || r.principalId || "",
      principalUpn: r.PrincipalUserPrincipalName || r.principalUpn || "",
      createdDateTime: r.CreatedDateTime || null,
    };
  }
  function normMfa(r) {
    const raw = r.MethodsRegistered || r.methodsRegistered || [];
    const methods = Array.isArray(raw)
      ? raw
      : String(raw)
          .split(/[,;]\s*/)
          .filter(Boolean);
    return {
      userPrincipalName: r.UserPrincipalName || r.userPrincipalName,
      isMfaRegistered: /^(true|false)$/i.test(
        String(r.IsMfaRegistered ?? r.isMfaRegistered),
      )
        ? /^true$/i.test(String(r.IsMfaRegistered ?? r.isMfaRegistered))
        : null,
      isAdmin: /true/i.test(String(r.IsAdmin || r.isAdmin)),
      methodsRegistered: methods,
    };
  }

  window.BETA_Import = {
    ingest: ingest,
    classify: classify,
    normMfa: normMfa,
    normSignIn: normSignIn,
    parseJsonLoose: parseJsonLoose,
  };
})();
