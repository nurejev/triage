const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  crypto = require("node:crypto");
const load = (files, extra = {}) => {
  const window = { location: { origin: "http://localhost:8080" } };
  const ctx = vm.createContext({
    window,
    crypto: crypto.webcrypto,
    TextEncoder,
    DOMException,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    ...extra,
  });
  for (const f of files)
    vm.runInContext(fs.readFileSync("BETA/js/" + f + ".js", "utf8"), ctx);
  return window;
};
const plain = (x) => JSON.parse(JSON.stringify(x));
function suite() {
  return load([
    "evidence",
    "blacklists",
    "analyzers",
    "exchange-analysis",
    "import",
    "demo",
  ]);
}
test("bundle round-trip preserves records, source gaps, notes and deterministic findings", async () => {
  const w = suite(),
    e = w.BETA_Evidence.ensure(w.BETA_Demo.evidence());
  e.dispositions = { a: { note: "Review" } };
  e.response = { notes: "Handover" };
  e.manifest.nonInteractive.state = "partial";
  e.manifest.nonInteractive.nextLink =
    "https://graph.microsoft.com/beta/auditLogs/signIns?$skiptoken=abc";
  const result = w.BETA_Analyzers.analyze(e);
  const bundle = await w.BETA_Evidence.bundle(e);
  const reopened = await w.BETA_Evidence.unpack(bundle);
  assert.deepEqual(plain(w.BETA_Analyzers.analyze(reopened)), plain(result));
  assert.equal(reopened.manifest.nonInteractive.state, "partial");
  assert.equal(reopened.response.notes, "Handover");
  assert.deepEqual(plain(reopened.raw), plain(e.raw));
});
test("changed evidence and unknown versions fail integrity/version checks", async () => {
  const w = suite(),
    b = await w.BETA_Evidence.bundle(w.BETA_Evidence.create());
  b.evidence.tenantId = "changed";
  await assert.rejects(() => w.BETA_Evidence.unpack(b), /integrity/);
  b.schemaVersion = 2;
  await assert.rejects(() => w.BETA_Evidence.unpack(b), /version/);
});
test("file imports preserve failure and subject; mixed tenants cannot merge", async () => {
  const w = suite(),
    f = (name, value) => ({ name, text: async () => value });
  const e = await w.BETA_Import.ingest([
    f(
      "SignIns.csv",
      "UserPrincipalName,Status,Date\na@example.test,Failure,2026-07-15\n",
    ),
  ]);
  assert.equal(e.signIns[0].status.errorCode, -1);
  assert.equal(e.signIns[0].userPrincipalName, "a@example.test");
  assert.equal(e.manifest.interactive.state, "imported");
  await assert.rejects(
    () =>
      w.BETA_Import.ingest([
        f(
          "SignIns.json",
          JSON.stringify([
            {
              tenantId: "a",
              userPrincipalName: "a@x.test",
              status: { errorCode: 0 },
            },
            {
              tenantId: "b",
              userPrincipalName: "b@x.test",
              status: { errorCode: 0 },
            },
          ]),
        ),
      ]),
    /different tenants/,
  );
});
test("malformed JSONL, ambiguous sign-in status and unsupported Exchange files fail explicitly", async () => {
  const w = suite();
  assert.throws(
    () => w.BETA_Import.parseJsonLoose('{"a":1}\n{"broken"'),
    /line 2/,
  );
  assert.throws(
    () =>
      w.BETA_Import.normSignIn({
        userPrincipalName: "a@x.test",
        status: "unknown",
      }),
    /ambiguous/,
  );
  assert.equal(
    w.BETA_Import.classify("MailboxPermissions.csv", []),
    "exchange",
  );
  assert.equal(w.BETA_Import.classify("UnifiedAuditLog.csv", []), "ual");
  assert.deepEqual(
    plain(
      w.BETA_Import.normMfa({
        methodsRegistered: ["fido2"],
        isMfaRegistered: true,
      }).methodsRegistered,
    ),
    ["fido2"],
  );
});
test("uncollected sources never become complete because findings exist", () => {
  const w = suite(),
    e = w.BETA_Evidence.create();
  w.BETA_Evidence.setSource(e, "interactive", [], { state: "complete" });
  const c = w.BETA_Evidence.coverage(e);
  assert.equal(c.complete, 1);
  assert.equal(c.all.find((s) => s.key === "ual").state, "not-collected");
  assert.equal(w.BETA_Analyzers.analyze(e).findings.length, 0);
});
test("rapid IP changes are a medium-confidence review signal; unknown status is not success", () => {
  const w = suite();
  const rows = [
    {
      userPrincipalName: "a@x.test",
      createdDateTime: "2026-07-15T00:00:00Z",
      ipAddress: "1.2.3.4",
      status: { errorCode: 0 },
    },
    {
      userPrincipalName: "a@x.test",
      createdDateTime: "2026-07-15T00:00:10Z",
      ipAddress: "4.3.2.1",
      status: { errorCode: 0 },
    },
  ];
  let f = w.BETA_Analyzers.analyze({ signIns: rows }).findings.find((f) =>
    /30 seconds/.test(f.Title),
  );
  assert.equal(f.Severity, "Medium");
  delete rows[1].status;
  assert.ok(
    !w.BETA_Analyzers.analyze({ signIns: rows }).findings.some((f) =>
      /30 seconds/.test(f.Title),
    ),
  );
});
test("every matching event is analyzed past the previous hidden limit", () => {
  const w = suite(),
    rows = Array.from({ length: 45 }, (_, i) => ({
      userPrincipalName: "u" + i + "@x.test",
      authenticationProtocol: "ropc",
      status: { errorCode: 0 },
      createdDateTime: "2026-07-15T00:00:00Z",
    }));
  assert.equal(
    w.BETA_Analyzers.analyze({ signIns: rows }).findings.filter((f) =>
      /ROPC/.test(f.Title),
    ).length,
    45,
  );
});
test("Exchange snapshot produces findings without treating failed sources as clean", () => {
  const w = suite(),
    snapshot = {
      upn: "a@x.test",
      capturedAt: "2026-07-15",
      sources: [
        {
          key: "rules",
          state: "complete",
          records: [
            {
              Name: "Copy",
              Enabled: true,
              ForwardTo: ["external@example.test"],
            },
          ],
        },
        { key: "sendAs", state: "failed", records: [], error: "Denied" },
      ],
    };
  const result = w.BETA_Analyzers.analyze({ exchangeSnapshots: [snapshot] });
  assert.ok(result.findings.some((f) => /forwards or redirects/.test(f.Title)));
  assert.ok(!result.findings.some((f) => /clean/.test(f.Title)));
});
async function graph(fetcher) {
  const acc = { tenantId: "t", username: "a@x.test" };
  const w = load(["authConfig", "graph"], {
    fetch: fetcher,
    msal: {
      PublicClientApplication: class {
        async initialize() {}
        async handleRedirectPromise() {
          return null;
        }
        getAllAccounts() {
          return [acc];
        }
        async acquireTokenSilent() {
          return { accessToken: "test" };
        }
      },
    },
  });
  await w.TriageGraph.init();
  return w.TriageGraph;
}
const response = (b, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => b,
  headers: { get: () => null },
});
test("pagination cap is partial and resumes without losing prior records", async () => {
  let calls = 0;
  const g = await graph(async () =>
    ++calls === 1
      ? response({
          value: [{ id: "1" }],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/users?$skiptoken=2",
        })
      : response({ value: [{ id: "2" }] }),
  );
  const first = await g.pages("https://graph.microsoft.com/v1.0/users", {
    maxPages: 1,
  });
  assert.equal(first.state, "partial");
  const second = await g.pages(first.nextLink, {
    records: first.records,
    pages: first.pages,
  });
  assert.equal(second.state, "complete");
  assert.equal(second.records.length, 2);
  assert.equal(second.pages, 2);
});
test("page error retains evidence and continuation; forbidden continuation receives no token", async () => {
  let calls = 0;
  const g = await graph(async () => {
    calls++;
    return response({
      value: [{ id: "1" }],
      "@odata.nextLink": "https://attacker.example/steal",
    });
  });
  const r = await g.pages("https://graph.microsoft.com/v1.0/users");
  assert.equal(r.state, "partial");
  assert.equal(r.records.length, 1);
  assert.equal(calls, 1);
  assert.match(r.error, /Untrusted/);
});
test("cancellation keeps already collected pages", async () => {
  const controller = new AbortController();
  const g = await graph(async () =>
    response({
      value: [{ id: "1" }],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skip=1",
    }),
  );
  const r = await g.pages("https://graph.microsoft.com/v1.0/users", {
    signal: controller.signal,
    onPage: () => controller.abort(),
  });
  assert.equal(r.state, "cancelled");
  assert.equal(r.records.length, 1);
});

test("OAuth keeps principal identity and resolves app IDs without changing raw grants", () => {
  const w = suite(),
    E = w.BETA_Evidence,
    e = E.create();
  E.setSource(
    e,
    "users",
    [{ id: "u1", userPrincipalName: "alice@example.test" }],
    { state: "complete" },
  );
  E.setSource(
    e,
    "servicePrincipals",
    [{ id: "s1", appId: "app1", displayName: "Test app" }],
    { state: "complete" },
  );
  E.setSource(
    e,
    "oauth",
    [{ principalId: "u1", clientId: "s1", scope: "Mail.Read" }],
    { state: "complete" },
  );
  assert.equal(e.oauthGrants[0].principalUpn, "alice@example.test");
  assert.equal(e.oauthGrants[0].appId, "app1");
  assert.equal(e.raw.oauth[0].appId, undefined);
});
test("MFA false remains false with non-MFA methods; unknown registration is not a proven gap", () => {
  const w = suite();
  const m = w.BETA_Import.normMfa({
    userPrincipalName: "a@x.test",
    isMfaRegistered: false,
    methodsRegistered: ["email"],
  });
  assert.equal(m.isMfaRegistered, false);
  assert.ok(
    w.BETA_Analyzers.analyze({ mfa: [m] }).findings.some((f) =>
      /no second factor/.test(f.Title),
    ),
  );
  assert.ok(
    !w.BETA_Analyzers.analyze({
      mfa: [{ userPrincipalName: "b@x.test", methodsRegistered: [] }],
    }).findings.some((f) => /no second factor/.test(f.Title)),
  );
});
test("cleared forwarding is not reported as configured forwarding", () => {
  const w = suite();
  const f = w.BETA_Analyzers.analyze({
    ualRecords: [
      {
        operation: "Set-Mailbox",
        auditData: {
          Operation: "Set-Mailbox",
          Parameters: [{ Name: "ForwardingSmtpAddress", Value: "null" }],
        },
      },
    ],
  }).findings;
  assert.ok(!f.some((f) => f.Title === "Mailbox forwarding configured"));
});
