// Live tenant-wide collection from Microsoft Graph, into the normalized
// evidence shape BETA_Analyzers.analyze expects. Read-only. Everything stays
// in this tab. Windowed by day count; page caps keep the tab responsive.
(function () {
  const G = window.TriageGraph, A = window.TRIAGE_AUTH;

  // Steps mirror the Core BEC + Inventory analyzers the BETA covers.
  const STEPS = [
    ["signins", "Sign-in logs (interactive + non-interactive)"],
    ["audits", "Directory audit events"],
    ["risky", "Identity Protection (risky users + detections)"],
    ["oauth", "OAuth permission grants (tenant-wide)"],
    ["users", "User inventory"],
    ["devices", "Device inventory"],
    ["admins", "Directory role holders"],
    ["ual", "Unified Audit Log (async query)"]
  ];

  async function collect(days, withUal, onStep) {
    const ev = { scope: "tenant", days: days, live: true, generated: new Date().toISOString(),
      signIns: [], directoryAudits: [], riskyUsers: [], riskDetections: [], oauthGrants: [],
      users: [], devices: [], admins: [], mfa: [], ualRecords: [], skipped: [] };
    const start = new Date(Date.now() - days * 864e5).toISOString();
    const end = new Date().toISOString();

    async function step(key, fn, optional) {
      onStep(key, "run");
      try { const n = await fn(); onStep(key, "ok", n); }
      catch (e) { onStep(key, optional ? "skip" : "fail", (e.message || "").slice(0, 90)); ev.skipped.push(key); }
    }

    await step("signins", async function () {
      ev.signIns = await G.gall(A.graphBase + "/auditLogs/signIns?$top=1000&$filter=" +
        encodeURIComponent("createdDateTime ge " + start), 40);
      return ev.signIns.length + " events";
    });
    await step("audits", async function () {
      ev.directoryAudits = await G.gall(A.graphV1 + "/auditLogs/directoryAudits?$top=1000&$filter=" +
        encodeURIComponent("activityDateTime ge " + start), 20);
      return ev.directoryAudits.length + " events";
    }, true);
    await step("risky", async function () {
      ev.riskyUsers = await G.gall(A.graphV1 + "/identityProtection/riskyUsers?$top=500", 10);
      ev.riskDetections = await G.gall(A.graphV1 + "/identityProtection/riskDetections?$top=500&$filter=" +
        encodeURIComponent("detectedDateTime ge " + start), 10);
      return ev.riskyUsers.length + " users, " + ev.riskDetections.length + " detections";
    }, true);
    await step("oauth", async function () {
      const grants = await G.gall(A.graphV1 + "/oauth2PermissionGrants?$top=500", 20);
      const spIds = uniq(grants.map(function (g) { return g.clientId; })).slice(0, 60);
      const names = {}, appIds = {};
      for (const id of spIds) {
        try { const sp = await G.gfetch(A.graphV1 + "/servicePrincipals/" + id + "?$select=displayName,appId"); names[id] = sp.displayName; appIds[id] = sp.appId; }
        catch (e) { names[id] = id; }
      }
      ev.oauthGrants = grants.map(function (g) {
        return { appName: names[g.clientId], appId: appIds[g.clientId], clientId: g.clientId, scope: g.scope,
          permissionType: "Delegated", consentType: g.consentType, principalUpn: "", createdDateTime: null };
      });
      return ev.oauthGrants.length + " grants";
    }, true);
    await step("users", async function () {
      ev.users = await G.gall(A.graphV1 + "/users?$top=999&$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastPasswordChangeDateTime,jobTitle,department", 20);
      return ev.users.length + " users";
    }, true);
    await step("devices", async function () {
      ev.devices = await G.gall(A.graphV1 + "/devices?$top=999&$select=id,displayName,approximateLastSignInDateTime,registrationDateTime,operatingSystem,trustType,accountEnabled", 20);
      return ev.devices.length + " devices";
    }, true);
    await step("admins", async function () {
      const roles = await G.gall(A.graphV1 + "/directoryRoles", 5);
      const seen = {};
      for (const role of roles) {
        try {
          const members = await G.gall(A.graphV1 + "/directoryRoles/" + role.id + "/members?$select=id,displayName,userPrincipalName,accountEnabled", 5);
          members.forEach(function (m) {
            const key = m.id + "|" + role.displayName;
            if (seen[key]) return; seen[key] = 1;
            ev.admins.push({ userPrincipalName: m.userPrincipalName, displayName: m.displayName, role: role.displayName, accountEnabled: m.accountEnabled });
          });
        } catch (e) { /* skip role */ }
      }
      return ev.admins.length + " role assignments";
    }, true);
    if (withUal) {
      await step("ual", async function () {
        const recs = await G.ualQueryTenant(start, end, function (status, sec) { onStep("ual", "run", status + " · " + sec + "s"); });
        ev.ualRecords = recs;
        return ev.ualRecords.length + " events";
      }, true);
    } else { onStep("ual", "skip", "disabled"); ev.skipped.push("ual"); }

    return ev;
  }
  function uniq(a) { return Array.from(new Set(a.filter(Boolean))); }

  window.BETA_Collect = { collect: collect, STEPS: STEPS };
})();
