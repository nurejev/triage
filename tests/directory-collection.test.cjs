const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm");
const tenant = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const role = {
  id: "assignment-1",
  principalId: id,
  roleDefinitionId: "role-1",
  roleDefinition: { id: "role-1", displayName: "Security Reader" },
};
function fixture({ direct, paged } = {}) {
  const calls = [];
  const window = {
    TRIAGE_AUTH: {
      graphV1: "https://graph.microsoft.com/v1.0",
      graphBase: "https://graph.microsoft.com/beta",
    },
    TriageGraph: {
      account: { tenantId: tenant, username: "analyst@example.com" },
      gfetch: async (url, opts = {}) => {
        calls.push({ url, kind: "direct", opts });
        if (new URL(url).pathname.startsWith("/v1.0/users/"))
          return { id, userPrincipalName: "alice@example.com" };
        // Reproduce the production API errors, not a permissive URL-agnostic mock.
        const u = new URL(url);
        if (u.searchParams.has("$filter"))
          throw Error("Query not allowed on property: id");
        assert.equal(
          u.pathname,
          "/v1.0/reports/authenticationMethods/userRegistrationDetails/" + id,
        );
        return direct
          ? direct(url, opts)
          : {
              id,
              userPrincipalName: "alice@example.com",
              isMfaRegistered: true,
              methodsRegistered: ["fido2"],
            };
      },
      pages: async (url, opts) => {
        calls.push({ url, kind: "paged", opts });
        const u = new URL(url),
          admins = /\/(roleAssignments|roleEligibilityScheduleInstances)$/.test(u.pathname);
        if (admins && u.searchParams.get("$expand")?.includes(","))
          throw Error("Only one property can be expanded in a single query.");
        if (
          u.pathname.includes("/userRegistrationDetails") &&
          u.searchParams.has("$filter")
        )
          throw Error("Query not allowed on property: id");
        if (paged) return paged(url, opts);
        const records = admins
          ? u.pathname.endsWith("/roleEligibilityScheduleInstances")
            ? []
            : [structuredClone(role)]
          : [
              {
                id,
                userPrincipalName: "alice@example.com",
                isMfaRegistered: true,
              },
            ];
        const out = {
          records: [...opts.records, ...records],
          state: "complete",
          pages: opts.pages + 1,
          nextLink: null,
        };
        opts.onPage(out);
        return out;
      },
    },
  };
  const ctx = vm.createContext({
    window,
    URL,
    TextEncoder,
    crypto: require("node:crypto").webcrypto,
  });
  for (const file of ["evidence", "collect"])
    vm.runInContext(fs.readFileSync("BETA/js/" + file + ".js", "utf8"), ctx);
  const ev = window.BETA_Evidence.create({
    tenantId: tenant,
    live: true,
    window: { start: "2026-07-01T00:00:00Z", end: "2026-07-02T00:00:00Z" },
  });
  return {
    calls,
    ev,
    E: window.BETA_Evidence,
    run: (options = {}) =>
      window.BETA_Collect.collect(1, false, () => {}, {
        evidence: ev,
        sources: ["admins", "mfa"],
        upn: "alice@example.com",
        ...options,
      }),
  };
}
test("user roles and MFA use supported queries and retain raw role and registration evidence", async () => {
  const f = fixture();
  await f.run();
  const roleCall = f.calls.find((c) => c.kind === "paged");
  assert.equal(
    new URL(roleCall.url).searchParams.get("$expand"),
    "roleDefinition",
  );
  assert.equal(
    new URL(roleCall.url).searchParams.get("$filter"),
    `principalId eq '${id}'`,
  );
  assert.equal(f.ev.manifest.admins.state, "complete");
  assert.equal(f.ev.admins[0].role, "Security Reader");
  assert.equal(f.ev.admins[0].userPrincipalName, "alice@example.com");
  assert.deepEqual(JSON.parse(JSON.stringify(f.ev.raw.admins[0])), role);
  assert.equal(f.ev.manifest.mfa.state, "complete");
  assert.equal(f.ev.manifest.mfa.count, 1);
  assert.equal(f.ev.raw.mfa[0].isMfaRegistered, true);
  assert.equal(
    f.ev.manifest.mfa.query,
    "https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails/" +
      id,
  );
  assert.equal(
    f.calls.filter((c) => c.url.includes("userRegistrationDetails")).length,
    1,
  );
});
test("tenant reports remain paged; role identity resolves from inventory without altering raw assignments", async () => {
  const f = fixture();
  await f.run({ upn: undefined });
  assert.equal(f.calls.filter((c) => c.kind === "direct").length, 0);
  assert.ok(f.calls.every((c) => !new URL(c.url).searchParams.has("$filter")));
  const before = JSON.stringify(f.ev.raw.admins);
  f.E.setSource(
    f.ev,
    "users",
    [
      {
        id,
        userPrincipalName: "alice@example.com",
        displayName: "Alice",
        accountEnabled: false,
      },
    ],
    { state: "complete" },
  );
  assert.equal(f.ev.admins[0].userPrincipalName, "alice@example.com");
  assert.equal(f.ev.admins[0].accountEnabled, false);
  assert.equal(f.ev.admins[0].displayName, "Alice");
  assert.equal(JSON.stringify(f.ev.raw.admins), before);
});
test("resume replaces both rejected legacy queries instead of replaying their saved URLs", async () => {
  const f = fixture();
  for (const key of ["admins", "mfa"])
    f.ev.manifest[key] = {
      state: "failed",
      query: "https://graph.microsoft.com/v1.0/rejected",
      nextLink: "https://graph.microsoft.com/v1.0/rejected",
      error: "Old query failed",
    };
  await f.run({ resume: true });
  assert.equal(f.ev.manifest.admins.state, "complete");
  assert.equal(f.ev.manifest.mfa.state, "complete");
  assert.equal(f.ev.manifest.admins.error, "");
  assert.equal(f.ev.manifest.mfa.error, "");
  assert.ok(f.calls.every((c) => !c.url.includes("/rejected")));
});
test("registration access denial and missing reports remain visible gaps, never evidence of missing MFA", async () => {
  for (const status of [403, 404]) {
    const f = fixture({
      direct: async () => {
        throw Object.assign(Error("Report unavailable"), { status });
      },
    });
    await f.run({ sources: ["mfa"] });
    assert.equal(
      f.ev.manifest.mfa.state,
      status === 403 ? "unavailable" : "failed",
    );
    assert.equal(f.ev.raw.mfa.length, 0);
    assert.match(f.ev.manifest.mfa.error, /Report unavailable/);
  }
});
test("single-user registration rejects a response for another account and honors cancellation", async () => {
  const wrong = fixture({
    direct: async () => ({ id: "another-account", isMfaRegistered: false }),
  });
  await wrong.run({ sources: ["mfa"] });
  assert.equal(wrong.ev.manifest.mfa.state, "failed");
  assert.equal(wrong.ev.raw.mfa.length, 0);
  const controller = new AbortController();
  const cancelled = fixture({
    direct: async (_url, opts) => {
      assert.equal(opts.signal, controller.signal);
      controller.abort();
      throw Object.assign(Error("Cancelled"), { name: "AbortError" });
    },
  });
  await cancelled.run({ sources: ["mfa"], signal: controller.signal });
  assert.equal(cancelled.ev.manifest.mfa.state, "cancelled");
  assert.equal(cancelled.ev.raw.mfa.length, 0);
});
test("role pagination preserves a checkpoint and resumes its supported continuation", async () => {
  let n = 0;
  const next =
    "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?$skiptoken=next";
  const f = fixture({
    paged: async (url, opts) => {
      // The second (eligibility) query only runs once the active-assignment query completed.
      if (url.includes("roleEligibilityScheduleInstances")) {
        assert.equal(n, 2);
        const out = { records: opts.records, state: "complete", pages: opts.pages, nextLink: null };
        opts.onPage(out);
        return out;
      }
      if (n++) assert.equal(url, next);
      const out = {
        records: [...opts.records, { ...role, id: "assignment-" + n }],
        state: n === 1 ? "partial" : "complete",
        pages: n,
        nextLink: n === 1 ? next : null,
      };
      opts.onPage(out);
      return out;
    },
  });
  await f.run({ sources: ["admins"] });
  assert.equal(f.ev.manifest.admins.state, "partial");
  await f.run({ sources: ["admins"], resume: true });
  assert.equal(f.ev.manifest.admins.state, "complete");
  assert.equal(f.ev.raw.admins.length, 2);
});
test("empty tenant registration inventory is a completed zero-record query", async () => {
  const f = fixture({
    paged: async () => ({
      records: [],
      state: "complete",
      pages: 1,
      nextLink: null,
    }),
  });
  await f.run({ sources: ["mfa"], upn: undefined });
  assert.equal(f.ev.manifest.mfa.state, "complete");
  assert.equal(f.ev.manifest.mfa.count, 0);
});
