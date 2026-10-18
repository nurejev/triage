const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
function suite() {
  const ctx = vm.createContext({
    window: {},
    crypto: webcrypto,
    TextEncoder,
    AbortController,
    DOMException,
  });
  for (const file of [
    "evidence",
    "blacklists",
    "analyzers",
    "exchange-analysis",
    "demo",
    "desk-model",
  ])
    vm.runInContext(fs.readFileSync(`BETA/js/${file}.js`, "utf8"), ctx);
  vm.runInContext(fs.readFileSync("js/case.js", "utf8"), ctx);
  return ctx.window;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
test("every demo finding names actual supporting records; case round-trip preserves references and IDs", async () => {
  const w = suite(),
    E = w.BETA_Evidence,
    M = w.TriageDeskModel;
  const ev = E.ensure(w.BETA_Demo.evidence());
  const raw = JSON.stringify(ev.raw);
  const findings = w.BETA_Analyzers.analyze(ev).findings;
  assert.ok(findings.length > 30);
  for (const f of findings) {
    assert.ok(f.References.length, f.Title);
    for (const ref of f.References)
      assert.ok(M.ref(ev, ref), `${f.Title}: ${ref}`);
  }
  const critical = findings.find((f) => /federation changed/.test(f.Title));
  assert.equal(critical.References.length, 1);
  assert.match(
    M.ref(ev, critical.References[0]).activityDisplayName,
    /domain/i,
  );
  const reopened = await E.unpack(await E.bundle(ev));
  assert.deepEqual(
    plain(w.BETA_Analyzers.analyze(reopened).findings),
    plain(findings),
  );
  assert.equal(
    JSON.stringify(ev.raw),
    raw,
    "analysis never changes raw evidence",
  );
});
test("aggregate UAL findings reference the entire matching account/day set and omit unrelated rows", () => {
  const w = suite(),
    E = w.BETA_Evidence,
    ev = E.create({ window: { start: "2026-09-01", end: "2026-09-18" } });
  const rows = Array.from({ length: 50 }, (_, i) => ({
    id: `a${i}`,
    operation: "HardDelete",
    userPrincipalName: "a@example.test",
    createdDateTime: "2026-09-17T12:00:00Z",
  }));
  rows.push({
    id: "unrelated",
    operation: "HardDelete",
    userPrincipalName: "b@example.test",
    createdDateTime: "2026-09-16T12:00:00Z",
  });
  E.setSource(ev, "ual", rows, { state: "complete" });
  const f = w.BETA_Analyzers.analyze(ev).findings.find((f) =>
    /^Mass HardDelete/.test(f.Title),
  );
  assert.equal(f.References.length, 50);
  assert.ok(!f.References.includes("ual:51"));
  assert.deepEqual(plain(f.EvidenceWindow), plain(ev.window));
});
test("paired sign-in evidence crosses sources and survives copied subject views", () => {
  const w = suite(),
    E = w.BETA_Evidence,
    ev = E.create();
  const row = (id, ip, t) => ({
    id,
    userPrincipalName: "a@example.test",
    createdDateTime: t,
    ipAddress: ip,
    status: { errorCode: 0 },
    isInteractive: true,
  });
  E.setSource(
    ev,
    "interactive",
    [row("a", "1.1.1.1", "2026-09-17T12:00:00Z")],
    { state: "complete" },
  );
  E.setSource(
    ev,
    "nonInteractive",
    [row("b", "2.2.2.2", "2026-09-17T12:00:20Z")],
    { state: "complete" },
  );
  const scoped = w.TriageCase.subject(ev, "a@example.test");
  const f = w.BETA_Analyzers.analyze(scoped).findings.find((f) =>
    /within 30 seconds/.test(f.Title),
  );
  assert.deepEqual(plain(f.References), ["interactive:1", "nonInteractive:1"]);
  assert.equal(scoped.signIns.length, 2);
});
test("enriched OAuth and role views resolve after worker-style copying without broadening account scope", () => {
  const w = suite(),
    E = w.BETA_Evidence,
    ev = E.create({
      scope: "user",
      subject: { upn: "a@example.test", objectId: "u1" },
    });
  E.setSource(
    ev,
    "users",
    [
      { id: "u1", userPrincipalName: "a@example.test", accountEnabled: false },
      { id: "u2", userPrincipalName: "b@example.test" },
    ],
    { state: "complete" },
  );
  E.setSource(
    ev,
    "servicePrincipals",
    [{ id: "sp1", appId: "test-app", displayName: "Sync" }],
    { state: "complete" },
  );
  E.setSource(
    ev,
    "oauth",
    [
      {
        id: "g1",
        clientId: "sp1",
        principalId: "u1",
        consentType: "Principal",
        scope: "Mail.Read",
      },
      {
        id: "g2",
        clientId: "sp1",
        principalId: "u2",
        consentType: "Principal",
        scope: "Mail.ReadWrite",
      },
    ],
    { state: "complete" },
  );
  E.setSource(
    ev,
    "admins",
    [
      {
        id: "r1",
        principalId: "u1",
        roleDefinition: { displayName: "Global Administrator" },
      },
    ],
    { state: "complete" },
  );
  const copy = plain(ev),
    before = JSON.stringify(copy);
  const f = w.BETA_Analyzers.analyze(copy).findings;
  const oauth = f.filter((f) => f.Analyzer === "OAuthPermissions");
  assert.ok(oauth.length);
  for (const finding of oauth) {
    assert.ok(finding.References.includes("oauth:1"));
    assert.ok(finding.References.includes("servicePrincipals:1"));
    assert.ok(!finding.References.includes("oauth:2"));
  }
  assert.ok(
    f
      .find((f) => /disabled account/.test(f.Title))
      .References.includes("admins:1"),
  );
  assert.equal(JSON.stringify(copy), before);
});
test("identical preserved records have deterministic references across copies; near matches never qualify", () => {
  const w = suite(),
    E = w.BETA_Evidence,
    ev = E.create();
  E.setSource(ev, "interactive", [{ id: "same", a: 1 }], { state: "complete" });
  E.setSource(ev, "nonInteractive", [{ id: "same", a: 1 }], {
    state: "complete",
  });
  const refs = E.referenceIndex(ev);
  assert.deepEqual(plain(refs([ev.signIns[0]])), [
    "interactive:1",
    "nonInteractive:1",
  ]);
  assert.deepEqual(plain(refs([{ id: "same", a: 1 }])), [
    "interactive:1",
    "nonInteractive:1",
  ]);
  assert.deepEqual(plain(refs([{ id: "same", a: 2 }])), []);
});
test("review completion excludes investigating, stale finding IDs and invalid confirmations", () => {
  const w = suite(),
    M = w.TriageDeskModel,
    E = w.BETA_Evidence,
    ev = E.create();
  E.setSource(ev, "interactive", [{ id: "one" }], { state: "complete" });
  const f = [{ Id: "a" }, { Id: "b" }];
  M.review(ev, "a", "investigating", "Need more context", "interactive:1");
  M.review(ev, "old", "confirmed", "Old signal", "interactive:1");
  assert.deepEqual(plain(M.reviewProgress(ev, f)), {
    total: 2,
    resolved: 0,
    investigating: 1,
    outstanding: 2,
  });
  M.review(ev, "a", "confirmed", "Evidence supports finding", "interactive:1");
  M.review(ev, "b", "benign", "Approved change", "");
  assert.equal(M.reviewProgress(ev, f).outstanding, 0);
  delete ev.raw.interactive;
  assert.equal(M.reviewProgress(ev, f).resolved, 1);
});
test("response completion requires all latest outcomes; in-progress and corrected pending remain open", () => {
  const w = suite(),
    M = w.TriageDeskModel,
    E = w.BETA_Evidence,
    ev = E.create();
  E.setSource(ev, "interactive", [{ id: "one" }], { state: "complete" });
  for (const p of M.phases) M.outcome(ev, p.id, "in-progress", "Working", "");
  assert.equal(M.phaseProgress(ev).resolved, 0);
  for (const p of M.phases)
    M.outcome(ev, p.id, "verified", "Reviewed evidence", "interactive:1");
  M.outcome(
    ev,
    "contain",
    "exception",
    "External responder owns follow-up",
    "",
  );
  assert.deepEqual(plain(M.phaseProgress(ev)), {
    total: 5,
    resolved: 5,
    exceptions: 1,
  });
  M.outcome(ev, "contain", "pending", "Reopened after new evidence", "");
  assert.equal(M.phaseProgress(ev).resolved, 4);
});
test("export does not record handover; explicit owner/channel and outstanding work survive reopening", async () => {
  const w = suite(),
    M = w.TriageDeskModel,
    E = w.BETA_Evidence,
    ev = E.create();
  M.append(ev, "handover-exported", "Downloaded a note");
  assert.equal(M.handoverRecord(ev), undefined);
  assert.match(M.handover(ev, []), /Handover not recorded/);
  assert.throws(
    () => M.recordHandover(ev, "", "ticket", "Needs review"),
    /owner/,
  );
  assert.throws(() => M.recordHandover(ev, "SOC", "", "Needs review"), /how/);
  M.recordHandover(
    ev,
    "SOC",
    "INC-123",
    "Two source gaps need review",
    "analyst",
  );
  const reopened = await E.unpack(await E.bundle(ev));
  assert.equal(M.handoverRecord(reopened).recipient, "SOC");
  assert.match(
    M.handover(reopened, []),
    /recipient acceptance is not verified/,
  );
  assert.equal(reopened.actionLog[0].type, "handover-exported");
});
