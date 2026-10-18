const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm");
const tenant = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const base = "https://graph.microsoft.com/v1.0/oauth2PermissionGrants";
function fixture(pages) {
  const window = {
    TRIAGE_AUTH: {
      graphV1: "https://graph.microsoft.com/v1.0",
      graphBase: "https://graph.microsoft.com/beta",
    },
    TriageGraph: {
      account: { tenantId: tenant, username: "analyst@example.com" },
      pages,
      gfetch: async () => ({
        id: user,
        userPrincipalName: "alice@example.com",
      }),
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
    window,
    ev,
    run: (extra = {}) =>
      window.BETA_Collect.collect(1, false, () => {}, {
        evidence: ev,
        sources: ["oauth"],
        upn: "alice@example.com",
        ...extra,
      }),
  };
}
test("OAuth uses separate equality queries and resumes the unfinished query with all earlier grants", async () => {
  const calls = [],
    next = base + "?$skiptoken=all-next";
  const f = fixture(async (url, opts) => {
    calls.push(url);
    const filter = new URL(url).searchParams.get("$filter");
    assert.ok(!filter || !filter.includes(" or "));
    const record =
      url === next
        ? { id: "all-2", consentType: "AllPrincipals" }
        : filter.startsWith("principalId")
          ? { id: "user-1", principalId: user, consentType: "Principal" }
          : { id: "all-1", consentType: "AllPrincipals" };
    const records = [...opts.records, record],
      partial = record.id === "all-1";
    const result = {
      records,
      pages: opts.pages + 1,
      nextLink: partial ? next : null,
      state: partial ? "partial" : "complete",
      error: partial ? "More pages available" : "",
    };
    opts.onPage(result);
    return result;
  });
  await f.run();
  assert.equal(calls.length, 2);
  assert.equal(
    new URL(calls[0]).searchParams.get("$filter"),
    `principalId eq '${user}'`,
  );
  assert.equal(
    new URL(calls[1]).searchParams.get("$filter"),
    "consentType eq 'AllPrincipals'",
  );
  assert.equal(f.ev.manifest.oauth.state, "partial");
  assert.equal(f.ev.manifest.oauth.queryIndex, 1);
  const restored = await f.window.BETA_Evidence.unpack(
    await f.window.BETA_Evidence.bundle(f.ev),
  );
  assert.equal(restored.manifest.oauth.nextLink, next);
  await f.run({ resume: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[2], next);
  assert.deepEqual(
    Array.from(f.ev.raw.oauth, (r) => r.id),
    ["user-1", "all-1", "all-2"],
  );
  assert.equal(f.ev.manifest.oauth.state, "complete");
  assert.equal(f.ev.manifest.oauth.queryIndex, 2);
});
test("OAuth retries a legacy rejected OR query with supported filters and retains a later failure", async () => {
  const calls = [];
  const f = fixture(async (url, opts) => {
    calls.push(url);
    assert.doesNotMatch(new URL(url).searchParams.get("$filter"), / or /);
    const first = calls.length === 1;
    const records = first
      ? [{ id: "user-1", principalId: user }]
      : opts.records;
    return {
      records,
      pages: first ? 1 : opts.pages,
      state: first ? "complete" : "partial",
      nextLink: first ? null : url,
      error: first ? "" : "403 Forbidden",
    };
  });
  f.ev.manifest.oauth = {
    state: "failed",
    query: base + "?$filter=unsupported-or",
    nextLink: base + "?$filter=unsupported-or",
  };
  await f.run({ resume: true });
  assert.equal(calls.length, 2);
  assert.equal(f.ev.raw.oauth.length, 1);
  assert.equal(f.ev.manifest.oauth.state, "partial");
  assert.match(f.ev.manifest.oauth.error, /Forbidden/);
  assert.equal(f.ev.manifest.oauth.queryIndex, 1);
});
test("tenant OAuth inventory remains one paged query", async () => {
  const calls = [];
  const f = fixture(async (url) => {
    calls.push(url);
    return { records: [], state: "complete", pages: 1, nextLink: null };
  });
  await f.run({ upn: undefined });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.has("$filter"), false);
  assert.equal(f.ev.manifest.oauth.state, "complete");
});
