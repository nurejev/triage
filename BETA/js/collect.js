// Read-only collection with exact UTC windows, explicit coverage and checkpoints.
(function () {
  "use strict";
  const G = window.TriageGraph,
    A = window.TRIAGE_AUTH,
    E = window.BETA_Evidence;
  const STEPS = E.CATALOG.filter((x) => x[3] === "Graph").map((x) => [
    x[0],
    x[1],
  ]);
  async function collect(days, withUal, onStep, options = {}) {
    const account = G.account;
    if (!account?.tenantId) throw Error("A tenant-bound sign-in is required");
    const ev =
      options.evidence ||
      E.create({
        live: true,
        tenantId: account.tenantId,
        tenantName: account.username.split("@")[1],
        days,
        window: {
          start: new Date(Date.now() - days * 864e5).toISOString(),
          end: new Date().toISOString(),
        },
      });
    if (ev.tenantId !== account.tenantId || ev.demo || ev.imported)
      throw Error("This evidence does not belong to the signed-in live tenant");
    const selected = options.sources || STEPS.map((x) => x[0]);
    if (selected.some((k) => !STEPS.some((x) => x[0] === k)))
      throw Error("Unsupported web source");
    // The desk may state the affected account before the object ID is known; resolve it here.
    if (options.upn && !ev.subject?.objectId) {
      const user = await G.gfetch(
        A.graphV1 +
          "/users/" +
          encodeURIComponent(options.upn) +
          "?$select=id,userPrincipalName,displayName",
      );
      if (!/^[0-9a-f-]{36}$/i.test(user.id || ""))
        throw Error("Could not resolve the affected account");
      ev.scope = "user";
      ev.subject = { upn: user.userPrincipalName, objectId: user.id };
    }
    const { start, end } = ev.window,
      signal = options.signal;
    const filt = (field, extra) =>
      encodeURIComponent(
        field +
          " ge " +
          start +
          " and " +
          field +
          " le " +
          end +
          (extra ? " and " + extra : ""),
      );
    const urls = {
      interactive:
        A.graphBase +
        "/auditLogs/signIns?$top=1000&$filter=" +
        filt(
          "createdDateTime",
          "signInEventTypes/any(t:t eq 'interactiveUser')",
        ),
      nonInteractive:
        A.graphBase +
        "/auditLogs/signIns?$top=1000&$filter=" +
        filt(
          "createdDateTime",
          "signInEventTypes/any(t:t eq 'nonInteractiveUser')",
        ),
      audits:
        A.graphV1 +
        "/auditLogs/directoryAudits?$top=1000&$filter=" +
        filt("activityDateTime"),
      riskyUsers: A.graphV1 + "/identityProtection/riskyUsers?$top=500",
      riskDetections:
        A.graphV1 +
        "/identityProtection/riskDetections?$top=500&$filter=" +
        filt("detectedDateTime"),
      users:
        A.graphV1 +
        "/users?$top=999&$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastPasswordChangeDateTime,signInActivity",
      oauth: A.graphV1 + "/oauth2PermissionGrants?$top=500",
      servicePrincipals:
        A.graphV1 + "/servicePrincipals?$top=999&$select=id,appId,displayName",
      devices:
        A.graphV1 +
        "/devices?$top=999&$select=id,displayName,approximateLastSignInDateTime,registrationDateTime,operatingSystem,trustType,accountEnabled",
      // Active assignments plus PIM eligibility (roleEligibilityScheduleInstances needs
      // RoleManagement.Read.Directory; a 403 there leaves the active list as a partial source).
      admins: [
        A.graphV1 +
          "/roleManagement/directory/roleAssignments?$expand=roleDefinition",
        A.graphV1 +
          "/roleManagement/directory/roleEligibilityScheduleInstances?$expand=roleDefinition",
      ],
      mfa: A.graphV1 + "/reports/authenticationMethods/userRegistrationDetails",
    };
    // Sign-ins, audits and UAL are volume sources; inventories are bounded by tenant size.
    const pageCap = { interactive: 200, nonInteractive: 200, audits: 200, ual: 200 };
    if (ev.scope !== "user") {
      // Service-principal and managed-identity sign-ins ride with the non-interactive source.
      urls.nonInteractive = [
        urls.nonInteractive,
        A.graphBase +
          "/auditLogs/signIns?$top=1000&$filter=" +
          filt(
            "createdDateTime",
            "signInEventTypes/any(t:t eq 'servicePrincipal')",
          ),
      ];
      urls.mfa += "?$top=500";
    }
    if (ev.scope === "user") {
      const id = ev.subject?.objectId;
      if (!/^[0-9a-f-]{36}$/i.test(id || ""))
        throw Error("A resolved user is required");
      const add = (url, expression) => {
        const u = new URL(url);
        const previous = u.searchParams.get("$filter");
        u.searchParams.set(
          "$filter",
          previous ? "(" + previous + ") and " + expression : expression,
        );
        return u.href;
      };
      for (const key of ["interactive", "nonInteractive", "riskDetections"])
        urls[key] = add(urls[key], "userId eq '" + id + "'");
      urls.audits = add(
        urls.audits,
        "(targetResources/any(t:t/id eq '" +
          id +
          "') or initiatedBy/user/id eq '" +
          id +
          "')",
      );
      urls.riskyUsers = add(urls.riskyUsers, "id eq '" + id + "'");
      // A single GET keeps signInActivity selectable (the list rejects it next to an id filter).
      urls.users =
        A.graphV1 +
        "/users/" +
        id +
        "?$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastPasswordChangeDateTime,signInActivity";
      // Graph accepts equality filters here, but not this cross-property OR.
      // Keep user-specific and tenant-wide consent as separate paged requests.
      urls.oauth = [
        add(urls.oauth, "principalId eq '" + id + "'"),
        add(urls.oauth, "consentType eq 'AllPrincipals'"),
      ];
      urls.devices = A.graphV1 + "/users/" + id + "/registeredDevices";
      urls.admins = urls.admins.map((u) => add(u, "principalId eq '" + id + "'"));
      // Registration reports expose a single-user GET; their list rejects id filters.
      urls.mfa += "/" + id;
      // Application identities provide tenant context for grants. Label this separately.
      ev.manifest.servicePrincipals.note =
        "Tenant application inventory used to resolve grants";
    }
    for (const [key] of STEPS) {
      if (!selected.includes(key)) continue;
      if (signal?.aborted) break;
      const old = ev.manifest[key];
      if (options.resume && old.state === "complete") continue;
      if (key === "ual" && !withUal && !options.resume) {
        onStep(key, "not-collected", "Not selected");
        continue;
      }
      if (
        key === "ual" &&
        options.resume &&
        old.state === "not-collected" &&
        !withUal
      )
        continue;
      ev.manifest[key] = {
        ...old,
        state: "running",
        startedAt: old.startedAt || new Date().toISOString(),
        window: { start, end },
      };
      onStep(key, "running", "Collecting…");
      const records = options.resume ? ev.raw[key] || [] : [];
      const queries = Array.isArray(urls[key]) ? urls[key] : null;
      const query = queries ? queries.join("\n") : urls[key];
      const opts = {
        signal,
        records,
        pages: options.resume ? old.pages || 0 : 0,
        maxPages: pageCap[key] || 50,
        onPage: (p) => {
          E.setSource(ev, key, p.records, {
            state: "running",
            pages: p.pages,
            nextLink: p.nextLink,
            query,
          });
          onStep(key, "running", p.records.length + " records");
        },
      };
      let out;
      try {
        if (key === "ual")
          out = await G.ualQueryTenant(
            start,
            end,
            (s, seconds) => onStep(key, "running", s + " · " + seconds + "s"),
            {
              ...opts,
              userPrincipalNames: ev.subject ? [ev.subject.upn] : undefined,
              objectIds: ev.subject ? [ev.subject.objectId] : undefined,
              queryId: old.queryId,
              nextLink: old.nextLink,
              onQuery: (id) => {
                ev.manifest[key].queryId = id;
              },
            },
          );
        else if ((key === "mfa" || key === "users") && ev.scope === "user") {
          const record = await G.gfetch(query, { signal });
          if (record?.id?.toLowerCase() !== ev.subject.objectId.toLowerCase())
            throw Error(
              (key === "mfa" ? "MFA registration" : "User") +
                " response does not match the affected account",
            );
          out = {
            records: [record],
            state: "complete",
            pages: 1,
            nextLink: null,
          };
        } else if (queries) {
          let index =
            options.resume && old.query === query ? old.queryIndex || 0 : 0;
          let nextLink =
            options.resume && old.query === query ? old.nextLink : null;
          let accumulated = records,
            pages = opts.pages;
          for (; index < queries.length; index++) {
            const following = queries[index + 1] || null;
            out = await G.pages(nextLink || queries[index], {
              ...opts,
              records: accumulated,
              pages,
              onPage: (p) => {
                E.setSource(ev, key, p.records, {
                  state: "running",
                  pages: p.pages,
                  query,
                  nextLink: p.nextLink || following,
                  queryIndex: p.nextLink ? index : index + 1,
                });
                onStep(key, "running", p.records.length + " records");
              },
            });
            out.queryIndex = out.state === "complete" ? index + 1 : index;
            if (out.state !== "complete") break;
            accumulated = out.records;
            pages = out.pages;
            out.nextLink = following;
            nextLink = null;
          }
          out ||= {
            records: accumulated,
            pages,
            state: "complete",
            nextLink: null,
            queryIndex: queries.length,
          };
        } else
          out = await G.pages(
            options.resume && old.query === query && old.nextLink
              ? old.nextLink
              : query,
            opts,
          );
      } catch (e) {
        out = {
          records: ev.raw[key] || records,
          state:
            e.name === "AbortError"
              ? "cancelled"
              : records.length
                ? "partial"
                : e.status === 403
                  ? "unavailable"
                  : "failed",
          error: e.message,
        };
      }
      let normalized = out.records;
      if (key === "admins")
        normalized = normalized.map((r) =>
          r.roleEligibilityScheduleId || r.roleAssignmentScheduleId
            ? { ...r, kind: "eligible" }
            : r,
        );
      if (key === "oauth")
        normalized = normalized.map((g) => ({
          ...g,
          scope: g.scope || "",
          permissionType: "Delegated",
          principalId: g.principalId,
          principalUpn: g.principalUpn || "",
          appName: g.appName || g.clientId,
        }));
      E.setSource(ev, key, normalized, {
        ...out,
        error: out.error || "",
        records: undefined,
        query,
        completedAt: new Date().toISOString(),
        note:
          key === "servicePrincipals"
            ? "Tenant application context; current state at acquisition"
            : [
                  "riskyUsers",
                  "users",
                  "oauth",
                  "devices",
                  "admins",
                  "mfa",
                ].includes(key)
              ? "Current state at acquisition; not historical coverage"
              : "API-returned records in the requested interval; tenant retention still applies",
      });
      onStep(key, out.state, out.error || normalized.length + " records");
    }
    return E.refresh(ev);
  }
  window.BETA_Collect = { collect, STEPS };
})();
