// ======================================================================
// Import & view Microsoft-Extractor-Suite output (and Triage Evidence JSON).
//
// Everything is parsed in this browser tab - nothing is uploaded. The parsed
// records are mapped onto the same evidence shape the live collector builds
// (js/app.js -> collect), then handed to the existing detection engine and
// report renderer, so imported data reads exactly like a live triage.
//
// Recognized inputs:
//   * Unified Audit Log       Get-UAL              CSV or JSON  (wrapper cols
//                                                  CreationDate/Operations/
//                                                  UserIds/AuditData, or the
//                                                  parsed AuditData objects)
//   * Entra sign-in logs      Get-GraphEntraSignInLogs   JSON (Graph shape)
//   * OAuth grants            Get-OAuthPermissionsGraph  CSV or JSON (best effort)
//   * Triage Evidence JSON    exported by this tool      JSON (whole evidence)
// ======================================================================
(function () {
  "use strict";

  // ---- tiny RFC-4180-ish CSV parser (quotes, escaped "", embedded , and \n) ----
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
    const rows = [];
    let row = [], field = "", i = 0, inQ = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
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
    const rows = parseCsv(text).filter(function (r) {
      return r.length && !(r.length === 1 && r[0] === "");
    });
    if (rows.length < 2) return [];
    const head = rows[0];
    return rows.slice(1).map(function (r) {
      const o = {};
      head.forEach(function (h, idx) { o[h] = r[idx]; });
      return o;
    });
  }
  // case-insensitive property lookup over a list of candidate names
  function pick(obj, names) {
    if (!obj) return undefined;
    const keys = Object.keys(obj);
    for (let n = 0; n < names.length; n++) {
      const want = names[n].toLowerCase();
      for (let k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase() === want) return obj[keys[k]];
      }
    }
    return undefined;
  }
  function hasKey(obj, names) { return pick(obj, names) !== undefined; }

  // ---- record mappers -> evidence shape ----
  function mapUal(r) {
    let ad = pick(r, ["AuditData"]);
    if (typeof ad === "string") { try { ad = JSON.parse(ad); } catch (e) { ad = null; } }
    if (!ad || typeof ad !== "object") {
      // AuditDataOnly export: the row itself is the parsed audit event
      ad = (hasKey(r, ["Operation"]) || hasKey(r, ["CreationTime"])) ? r : {};
    }
    return {
      createdDateTime: pick(r, ["CreationDate", "CreationTime"]) || ad.CreationTime || "",
      operation: pick(r, ["Operations", "Operation"]) || ad.Operation || "",
      userPrincipalName: pick(r, ["UserIds", "UserId", "UserPrincipalName"]) || ad.UserId || "",
      auditData: ad
    };
  }
  // Suite sign-in JSON already matches the Graph resource - pass through.
  // For a flattened CSV export, rebuild the nested bits the detections read.
  function mapSignInCsv(r) {
    return {
      createdDateTime: pick(r, ["createdDateTime", "CreationTime", "Date"]),
      ipAddress: pick(r, ["ipAddress", "IP", "ClientIP"]),
      location: { countryOrRegion: pick(r, ["countryOrRegion", "Country"]) || "",
                  city: pick(r, ["city", "City"]) || "" },
      status: { errorCode: parseInt(pick(r, ["errorCode", "ErrorCode", "Status"]) || "0", 10) || 0 },
      appDisplayName: pick(r, ["appDisplayName", "AppDisplayName", "App"]) || "",
      clientAppUsed: pick(r, ["clientAppUsed", "ClientAppUsed"]) || "",
      conditionalAccessStatus: pick(r, ["conditionalAccessStatus"]) || "",
      riskLevelDuringSignIn: pick(r, ["riskLevelDuringSignIn", "riskLevel", "RiskLevel"]) || "none",
      deviceDetail: { operatingSystem: pick(r, ["operatingSystem", "OS"]) || "" }
    };
  }
  function mapOAuth(r) {
    return {
      appName: pick(r, ["appName", "AppDisplayName", "displayName", "ClientDisplayName", "Application"]) || "",
      clientId: pick(r, ["clientId", "ClientId", "appId", "AppId"]) || "",
      scope: pick(r, ["scope", "Scope", "Permission", "Permissions", "grantedScopes"]) || "",
      consentType: pick(r, ["consentType", "ConsentType"]) || "",
      createdDateTime: pick(r, ["createdDateTime", "CreationTime"]) || null
    };
  }

  // ---- classify one array of records (from a single file) ----
  function classify(arr) {
    const sample = arr.find(function (x) { return x && typeof x === "object"; });
    if (!sample) return { kind: "empty" };
    // UAL: has AuditData, or the Operations/Operation + a creation time combo
    if (hasKey(sample, ["AuditData"]) ||
        ((hasKey(sample, ["Operations", "Operation"])) && hasKey(sample, ["CreationDate", "CreationTime"]))) {
      return { kind: "ual", rows: arr.map(mapUal) };
    }
    // sign-ins: a creation time plus recognizable sign-in fields, and NOT a UAL row
    if (hasKey(sample, ["createdDateTime", "CreationTime", "Date"]) &&
        (hasKey(sample, ["ipAddress", "IP", "appDisplayName", "clientAppUsed", "riskLevelDuringSignIn", "userPrincipalName", "userDisplayName"]))) {
      // native Graph JSON already fits; flattened CSV is rebuilt
      const looksGraph = hasKey(sample, ["ipAddress"]) && (typeof sample.status === "object" || typeof sample.location === "object");
      return { kind: "signins", rows: looksGraph ? arr : arr.map(mapSignInCsv) };
    }
    // OAuth grants: a scope/permission column with an app/client identifier
    if (hasKey(sample, ["scope", "Scope", "Permission", "Permissions"]) &&
        hasKey(sample, ["clientId", "ClientId", "appId", "AppId", "appName", "AppDisplayName", "displayName", "Application"])) {
      return { kind: "oauth", rows: arr.map(mapOAuth) };
    }
    return { kind: "unknown" };
  }

  // ---- read one file, return a {name, kind, count, add(acc)} descriptor ----
  function readFile(file) {
    return new Promise(function (resolve) {
      const reader = new FileReader();
      reader.onerror = function () { resolve({ name: file.name, kind: "error", detail: "could not read file" }); };
      reader.onload = function () {
        const text = String(reader.result || "");
        const lower = file.name.toLowerCase();
        try {
          // 1) JSON / JSONL
          if (lower.endsWith(".json") || lower.endsWith(".jsonl") || /^\s*[\[{]/.test(text)) {
            let data;
            if (lower.endsWith(".jsonl")) {
              data = text.split(/\r?\n/).filter(function (l) { return l.trim(); })
                .map(function (l) { return JSON.parse(l); });
            } else {
              data = JSON.parse(text);
            }
            // native Triage Evidence JSON (a single evidence object)
            if (data && !Array.isArray(data) && typeof data === "object" &&
                (hasKey(data, ["upn"]) || data.ualRecords || data.signIns || data.findings)) {
              return resolve({ name: file.name, kind: "evidence", evidence: data });
            }
            const arr = Array.isArray(data) ? data : (data && Array.isArray(data.value) ? data.value : [data]);
            const c = classify(arr);
            return resolve({ name: file.name, kind: c.kind, rows: c.rows, count: arr.length });
          }
          // 2) CSV
          const objs = csvToObjects(text);
          const c = classify(objs);
          return resolve({ name: file.name, kind: c.kind, rows: c.rows, count: objs.length });
        } catch (e) {
          return resolve({ name: file.name, kind: "error", detail: (e.message || "parse error").slice(0, 80) });
        }
      };
      reader.readAsText(file);
    });
  }

  // ---- module state ----
  let built = null; // the assembled evidence object, ready to view

  function assemble(descriptors) {
    // If a native evidence file was dropped, it wins (it already holds everything).
    const nativeDesc = descriptors.find(function (d) { return d.kind === "evidence"; });
    const acc = { signIns: [], ualRecords: [], oauthGrants: [] };
    const lines = [];
    let recognized = 0;

    descriptors.forEach(function (d) {
      if (d.kind === "evidence") {
        lines.push('<li><span class="ok">Triage Evidence JSON</span> - ' + esc(d.name) +
          ' (' + ((d.evidence.findings || []).length) + ' findings, full evidence)</li>');
        recognized++;
      } else if (d.kind === "ual") {
        acc.ualRecords = acc.ualRecords.concat(d.rows);
        lines.push('<li><span class="ok">Unified Audit Log</span> - ' + esc(d.name) + ' (' + d.rows.length + ' events)</li>');
        recognized++;
      } else if (d.kind === "signins") {
        acc.signIns = acc.signIns.concat(d.rows);
        lines.push('<li><span class="ok">Sign-in logs</span> - ' + esc(d.name) + ' (' + d.rows.length + ' events)</li>');
        recognized++;
      } else if (d.kind === "oauth") {
        acc.oauthGrants = acc.oauthGrants.concat(d.rows);
        lines.push('<li><span class="ok">OAuth grants</span> - ' + esc(d.name) + ' (' + d.rows.length + ' apps)</li>');
        recognized++;
      } else if (d.kind === "error") {
        lines.push('<li><span class="err">Could not parse</span> - ' + esc(d.name) + ' (' + esc(d.detail || "") + ')</li>');
      } else {
        lines.push('<li><span class="ignore">Not recognized</span> - ' + esc(d.name) +
          (d.count ? ' (' + d.count + ' rows ignored)' : '') + '</li>');
      }
    });

    let ev;
    if (nativeDesc) {
      ev = nativeDesc.evidence;
      ev.imported = true;
      // merge any additionally-dropped Suite files into the native evidence
      if (acc.ualRecords.length) ev.ualRecords = (ev.ualRecords || []).concat(acc.ualRecords);
      if (acc.signIns.length) ev.signIns = (ev.signIns || []).concat(acc.signIns);
      if (acc.oauthGrants.length) ev.oauthGrants = (ev.oauthGrants || []).concat(acc.oauthGrants);
    } else if (recognized) {
      ev = {
        upn: inferUpn(acc), imported: true, demo: false, skipped: [],
        signIns: acc.signIns, ualRecords: acc.ualRecords, oauthGrants: acc.oauthGrants,
        riskyUsers: [], riskDetections: [], directoryAudits: [],
        authMethods: { loaded: false, methods: [] }, user: {}
      };
    } else {
      ev = null;
    }

    const total = acc.signIns.length + acc.ualRecords.length + acc.oauthGrants.length +
      (nativeDesc ? 1 : 0);
    let head;
    if (!recognized) {
      head = '<strong class="err">Nothing recognized.</strong> Drop <code>UAL-*.csv</code>, ' +
        '<code>SignInLogsGraph.json</code>, an OAuth export, or a Triage Evidence JSON.';
    } else {
      head = '<strong>' + recognized + ' file' + (recognized === 1 ? '' : 's') + ' recognized.</strong> ' +
        (nativeDesc ? 'Ready to view.' : (total + ' record' + (total === 1 ? '' : 's') + ' ready to analyze.'));
    }
    document.getElementById("importSummary").innerHTML = head + '<ul>' + lines.join("") + '</ul>';
    document.getElementById("viewImportBtn").disabled = !ev;
    document.getElementById("importClearBtn").style.display = descriptors.length ? "" : "none";
    built = ev;
  }

  function inferUpn(acc) {
    const s = acc.signIns.find(function (x) { return x && (x.userPrincipalName || x.userId); });
    if (s) return s.userPrincipalName || s.userId;
    const u = acc.ualRecords.find(function (x) { return x && x.userPrincipalName; });
    if (u) return u.userPrincipalName;
    return "Imported evidence";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  async function handleFiles(fileList) {
    const files = Array.prototype.slice.call(fileList);
    if (!files.length) return;
    document.getElementById("importSummary").innerHTML = '<span class="mini muted">Parsing ' +
      files.length + ' file' + (files.length === 1 ? '' : 's') + '&hellip;</span>';
    const descriptors = await Promise.all(files.map(readFile));
    assemble(descriptors);
  }

  // ---- wire up UI (elements live in index.html; guarded so the pure logic
  //      above is importable/testable in a non-DOM context too) ----
  if (typeof document !== "undefined" && document.getElementById("dropZone")) {
    const fileInput = document.getElementById("importFiles");
    const dropZone = document.getElementById("dropZone");
    document.getElementById("browseBtn").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () { handleFiles(fileInput.files); });

    ["dragenter", "dragover"].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.remove("drag"); });
    });
    dropZone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });

    document.getElementById("viewImportBtn").addEventListener("click", function () {
      if (built && window.TriageApp) window.TriageApp.showEvidence(built);
    });
    document.getElementById("importClearBtn").addEventListener("click", function () {
      built = null; fileInput.value = "";
      document.getElementById("importSummary").innerHTML = "";
      document.getElementById("viewImportBtn").disabled = true;
      document.getElementById("importClearBtn").style.display = "none";
    });
  }

  // ---- test hook: expose the pure helpers for a headless harness ----
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseCsv: parseCsv, csvToObjects: csvToObjects, classify: classify,
      mapUal: mapUal, mapSignInCsv: mapSignInCsv, mapOAuth: mapOAuth, pick: pick };
  }
})();
