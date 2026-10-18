const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
function fixture() {
  const window = {},
    ctx = vm.createContext({ window, crypto: webcrypto, TextEncoder });
  for (const file of ["evidence", "blacklists", "analyzers", "desk-model"])
    vm.runInContext(fs.readFileSync("BETA/js/" + file + ".js", "utf8"), ctx);
  const E = window.BETA_Evidence,
    ev = E.create({
      scope: "user",
      subject: { upn: "alice@example.test", objectId: "a1" },
    });
  E.setSource(
    ev,
    "oauth",
    [
      {
        id: "mine",
        consentType: "Principal",
        principalId: "a1",
        appName: "User consent",
        scope: "Mail.ReadWrite",
      },
      {
        id: "global",
        consentType: "AllPrincipals",
        principalId: null,
        appName: "Global consent",
        scope: "Mail.ReadWrite",
      },
      {
        id: "other",
        consentType: "Principal",
        principalId: "b1",
        principalUpn: "alice@example.test",
        appName: "Other account",
        scope: "Mail.ReadWrite",
      },
      {
        id: "unknown",
        consentType: "Principal",
        principalId: null,
        appName: "Unknown account",
        scope: "Mail.ReadWrite",
      },
      {
        id: "weird",
        consentType: "AllPrincipals",
        appName: "###",
        scope: "Mail.ReadWrite",
      },
    ],
    { state: "complete" },
  );
  const analyze = (value) =>
    window.BETA_Analyzers.analyze(value || ev).findings.filter(
      (f) => f.Analyzer === "OAuthPermissions",
    );
  return { window, E, ev, analyze };
}
test("user findings require a matching per-user grant, not global consent, another account or an unknown relationship", () => {
  const { ev, analyze } = fixture(),
    before = JSON.stringify(ev.raw);
  const findings = analyze();
  assert.equal(findings.length, 1);
  assert.match(findings[0].Title, /User consent/);
  assert.equal(findings[0].User, "alice@example.test");
  assert.equal(JSON.stringify(ev.raw), before);
  assert.equal(ev.manifest.oauth.count, 5);
});
test("tenant analysis retains global and other-account OAuth rules, including unusual-name detection", () => {
  const { ev, analyze } = fixture();
  ev.scope = "tenant";
  delete ev.subject;
  const findings = analyze();
  assert.equal(findings.length, 6);
  assert.ok(findings.some((f) => /Global consent/.test(f.Title) && !f.User));
  assert.ok(findings.some((f) => /non-alphanumeric/.test(f.Title)));
});
test("a familiar app name or ID is never allowlisted when it has a grant for this user", () => {
  const { ev, analyze } = fixture();
  ev.oauthGrants[0].appName = "Microsoft Graph Command Line Tools";
  ev.oauthGrants[1].appName = ev.oauthGrants[0].appName;
  assert.equal(analyze().length, 1);
  assert.match(analyze()[0].Title, /Microsoft Graph Command Line Tools/);
});
test("principal identity supports case-insensitive IDs and exported UPNs while rejecting conflicting IDs", () => {
  const { E, ev } = fixture();
  assert.equal(
    E.oauthScope(ev, { consentType: "Principal", principalId: "A1" }),
    "user",
  );
  assert.equal(
    E.oauthScope(ev, {
      consentType: "Principal",
      principalUpn: "ALICE@EXAMPLE.TEST",
    }),
    "user",
  );
  assert.equal(
    E.oauthScope(ev, {
      consentType: "Principal",
      principalId: "b1",
      principalUpn: "alice@example.test",
    }),
    "other",
  );
  assert.equal(
    E.oauthScope(ev, { consentType: "AllPrincipals", principalId: "a1" }),
    "tenant",
  );
  assert.equal(
    E.oauthScope(ev, {
      permissionType: "Application",
      consentType: "Principal",
      principalId: "a1",
    }),
    "tenant",
  );
  assert.equal(E.oauthScope(ev, { principalId: "a1" }), "unattributed");
  assert.equal(
    E.oauthScope(ev, {
      consentType: "Principal",
      principalDisplayName: "alice@example.test",
    }),
    "unattributed",
  );
});
test("user inventory can resolve the subject ID; missing identity never attributes arbitrary grants", () => {
  const { E, ev, analyze } = fixture();
  delete ev.subject.objectId;
  assert.equal(analyze().length, 0);
  ev.users = [{ id: "a1", userPrincipalName: "ALICE@EXAMPLE.TEST" }];
  assert.equal(analyze().length, 1);
  delete ev.subject;
  ev.users = [];
  assert.equal(analyze().length, 0);
});
test("scope filtering applies when reopening old bundles and preserves every raw grant and prior review", async () => {
  const { E, ev, analyze, window } = fixture();
  const globalFinding = analyze({ ...ev, scope: "tenant" }).find((f) =>
    /Global consent/.test(f.Title),
  );
  window.TriageDeskModel.review(
    ev,
    globalFinding.Id,
    "confirmed",
    "Previous global review",
    "oauth:2",
    "Analyst",
  );
  const reopened = await E.unpack(await E.bundle(ev));
  assert.equal(analyze(reopened).length, 1);
  assert.equal(JSON.stringify(reopened.raw), JSON.stringify(ev.raw));
  assert.equal(reopened.actionLog.length, 1);
  assert.equal(reopened.dispositions[globalFinding.Id].state, "confirmed");
  const handover = window.TriageDeskModel.handover(reopened, analyze(reopened));
  assert.match(handover, /1 automated signals; 0 confirmed/);
  assert.match(handover, /1 user-specific grants/);
});
test("scope totals distinguish direct, tenant-wide, unrelated and unknown grants without filtering evidence", () => {
  const { E, ev } = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(E.oauthSummary(ev))), {
    user: 1,
    tenant: 2,
    other: 1,
    unattributed: 1,
  });
  assert.equal(ev.oauthGrants.length, 5);
});
