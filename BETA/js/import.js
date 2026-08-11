// Import Microsoft-Extractor-Suite output (the MAS input format) and normalize
// it onto the evidence shape BETA_Analyzers.analyze expects. Everything is
// parsed in this browser tab - nothing is uploaded. Multiple files merge into
// one evidence object, so you can drop a whole export folder in at once.
(function () {
  "use strict";

  // ---- RFC-4180-ish CSV parser (quotes, escaped "", embedded , and \n) ----
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let row = [], field = "", i = 0, inQ = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function csvToObjects(text) {
    const rows = parseCsv(text).filter(function (r) { return r.length && !(r.length === 1 && r[0] === ""); });
    if (rows.length < 2) return [];
    const head = rows[0];
    return rows.slice(1).map(function (r) { const o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; });
  }
  function parseJsonLoose(text) {
    text = text.replace(/^﻿/, "").trim();
    try { const v = JSON.parse(text); return Array.isArray(v) ? v : (v && v.value ? v.value : [v]); }
    catch (e) {
      // JSON-lines fallback (one object per line)
      const out = [];
      text.split(/\r?\n/).forEach(function (l) { l = l.trim(); if (!l) return; try { out.push(JSON.parse(l)); } catch (e2) { /* skip */ } });
      return out;
    }
  }
  function records(name, text) {
    return /\.json$/i.test(name) || (!/\.csv$/i.test(name) && /^[\[{]/.test(text.trim())) ? parseJsonLoose(text) : csvToObjects(text);
  }
  // Which Extractor-Suite artifact is this? Keyed off filename first, then shape.
  function classify(name, rows) {
    const n = name.toLowerCase();
    if (/signin/.test(n)) return "signins";
    if (/auditlog|entraaudit|directoryaudit/.test(n)) return "audits";
    if (/riskydetection/.test(n)) return "riskDetections";
    if (/riskyuser/.test(n)) return "riskyUsers";
    if (/oauth|permission/.test(n)) return "oauth";
    if (/device/.test(n)) return "devices";
    if (/admin/.test(n)) return "admins";
    if (/mfa|registrationdetail/.test(n)) return "mfa";
    if (/user/.test(n)) return "users";
    if (/-ual|unifiedaudit|\bual\b/.test(n)) return "ual";
    // shape-based fallback
    const r = rows[0] || {};
    if (r.AuditData || r.Operations || r.RecordType) return "ual";
    if (r.riskEventType) return "riskDetections";
    if (r.riskState && r.riskLevel && !r.riskEventType) return "riskyUsers";
    if (r.userPrincipalName && r.createdDateTime && (r.appDisplayName || r.ipAddress)) return "signins";
    if (r.activityDisplayName) return "audits";
    return "unknown";
  }
  // Normalize a UAL CSV row (wrapper columns) into {operation, recordType, userPrincipalName, createdDateTime, auditData}
  function normUal(r) {
    let ad = r.AuditData || r.auditData;
    if (typeof ad === "string") { try { ad = JSON.parse(ad); } catch (e) { ad = {}; } }
    ad = ad || r;
    return { operation: r.Operations || r.Operation || ad.Operation, recordType: r.RecordType || ad.RecordType,
      userPrincipalName: r.UserIds || r.UserId || ad.UserId, createdDateTime: r.CreationDate || ad.CreationTime, auditData: ad };
  }

  function ingest(files, done, onProgress) {
    const ev = { scope: "tenant", imported: true, generated: new Date().toISOString(),
      signIns: [], directoryAudits: [], riskyUsers: [], riskDetections: [], oauthGrants: [],
      users: [], devices: [], admins: [], mfa: [], ualRecords: [], sources: [] };
    let pending = files.length;
    if (!pending) return done(ev);
    Array.prototype.forEach.call(files, function (file) {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const rows = records(file.name, String(reader.result));
          const kind = classify(file.name, rows);
          route(ev, kind, rows);
          ev.sources.push({ file: file.name, kind: kind, rows: rows.length });
        } catch (e) { ev.sources.push({ file: file.name, kind: "error", rows: 0, error: e.message }); }
        if (onProgress) onProgress(files.length - pending + 1, files.length, file.name);
        if (--pending === 0) done(ev);
      };
      reader.onerror = function () { ev.sources.push({ file: file.name, kind: "error", rows: 0 }); if (--pending === 0) done(ev); };
      reader.readAsText(file);
    });
  }
  function route(ev, kind, rows) {
    if (kind === "signins") ev.signIns = ev.signIns.concat(rows);
    else if (kind === "audits") ev.directoryAudits = ev.directoryAudits.concat(rows);
    else if (kind === "riskyUsers") ev.riskyUsers = ev.riskyUsers.concat(rows);
    else if (kind === "riskDetections") ev.riskDetections = ev.riskDetections.concat(rows);
    else if (kind === "oauth") ev.oauthGrants = ev.oauthGrants.concat(rows.map(normOauth));
    else if (kind === "users") ev.users = ev.users.concat(rows);
    else if (kind === "devices") ev.devices = ev.devices.concat(rows);
    else if (kind === "admins") ev.admins = ev.admins.concat(rows);
    else if (kind === "mfa") ev.mfa = ev.mfa.concat(rows.map(normMfa));
    else if (kind === "ual") ev.ualRecords = ev.ualRecords.concat(rows.map(normUal));
  }
  function normOauth(r) {
    return { appName: r.AppDisplayName || r.appDisplayName, appId: r.AppId || r.appId, clientId: r.ClientObjectId || r.clientId,
      scope: r.Permission || r.scope || "", permissionType: r.PermissionType || r.permissionType || "Delegated",
      consentType: r.ConsentType || r.consentType, principalUpn: r.PrincipalDisplayName || r.principalUpn || "", createdDateTime: r.CreatedDateTime || null };
  }
  function normMfa(r) {
    const methods = (r.MethodsRegistered || r.methodsRegistered || "").split(/[,;]\s*/).filter(Boolean);
    return { userPrincipalName: r.UserPrincipalName || r.userPrincipalName, isMfaRegistered: /true/i.test(String(r.IsMfaRegistered || r.isMfaRegistered)) || methods.length > 0,
      isAdmin: /true/i.test(String(r.IsAdmin || r.isAdmin)), methodsRegistered: methods };
  }

  window.BETA_Import = { ingest: ingest };
})();
