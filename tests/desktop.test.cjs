const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync, spawn } = require("node:child_process");
const core = require("../desktop/core.cjs");
const { webcrypto } = require("node:crypto"),
  vm = require("node:vm");
const tenant = "11111111-1111-4111-8111-111111111111",
  object = "22222222-2222-4222-8222-222222222222";
const plan = () => ({
  schema: "limon.triage.plan",
  schemaVersion: 1,
  caseId: "33333333-3333-4333-8333-333333333333",
  tenantId: tenant,
  scope: "user",
  upn: "alice@example.com",
  window: { start: "2026-07-01T00:00:00Z", end: "2026-07-02T00:00:00Z" },
  sources: ["interactive"],
});
test("live desktop checkpoints require the selected source and verified tenant; stdout counts cannot invent evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "triage-checkpoint-"));
  try {
    const p = plan();
    core.atomicJson(path.join(root, "interactive.json"), {
      records: [{ id: "preserved" }],
      manifest: { state: "running", count: 999 },
    });
    assert.equal(core.readCheckpoint(root, p, "graph", "interactive"), null);
    core.atomicJson(path.join(root, "graph-context.json"), {
      tenantId: tenant,
      account: "analyst@example.com",
    });
    const saved = core.readCheckpoint(root, p, "graph", "interactive");
    const E = core.evidenceAPI(path.resolve(".")),
      ev = E.create();
    E.setSource(
      ev,
      "interactive",
      saved.checkpoint.records,
      saved.checkpoint.manifest,
    );
    assert.equal(ev.manifest.interactive.count, 1);
    assert.equal(ev.raw.interactive[0].id, "preserved");
    for (const key of ["../plan", "users", "exchange"])
      assert.throws(
        () => core.readCheckpoint(root, p, "graph", key),
        /Unexpected collection source/,
      );
    assert.throws(() =>
      core.readCheckpoint(root, p, "exchange", "interactive"),
    );
    core.atomicJson(path.join(root, "graph-context.json"), {
      tenantId: "foreign-tenant",
    });
    assert.throws(
      () => core.readCheckpoint(root, p, "graph", "interactive"),
      /tenant mismatch/,
    );
    core.atomicJson(path.join(root, "graph-context.json"), {
      tenantId: tenant,
    });
    core.atomicJson(path.join(root, "interactive.json"), {
      records: "invalid",
      manifest: { state: "complete" },
    });
    assert.throws(
      () => core.readCheckpoint(root, p, "graph", "interactive"),
      /Invalid collection checkpoint/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("desktop plan rejects command injection, foreign sources, invalid scope and excessive windows", () => {
  assert.equal(core.validatePlan(plan()).tenantId, tenant);
  for (const change of [
    { upn: "a';Remove-Item *@example.com" },
    { sources: ["Invoke-Expression"] },
    { scope: "tenant", sources: ["exchange"] },
    { window: { start: "2020-01-01", end: "2026-07-02" } },
  ])
    assert.throws(() => core.validatePlan({ ...plan(), ...change }));
  assert.equal(
    core.validatePlan({ ...plan(), command: "ignored" }).command,
    undefined,
  );
});
test("local viewer allowlist blocks private and traversed files", () => {
  const root = path.resolve(".");
  assert.equal(core.allowedFile("/backend/server.js", root), null);
  assert.equal(core.allowedFile("/.env", root), null);
  assert.equal(core.allowedFile("/BETA/%2e%2e/backend/server.js", root), null);
  assert.equal(core.allowedFile("/desktop/main.cjs", root), null);
  assert.equal(
    core.allowedFile("/BETA/index.html", root),
    path.join(root, "BETA/index.html"),
  );
});
function model() {
  const ctx = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
  for (const f of ["evidence", "desk-model"])
    vm.runInContext(fs.readFileSync("BETA/js/" + f + ".js", "utf8"), ctx);
  return ctx.window;
}
test("runbook preserves corrections and requires existing verification evidence", async () => {
  const w = model(),
    ev = w.BETA_Evidence.create(),
    m = w.TriageDeskModel;
  w.BETA_Evidence.setSource(ev, "interactive", [{ id: "first" }], {
    state: "complete",
  });
  assert.throws(
    () => m.outcome(ev, "contain", "verified", "Done", "interactive:5"),
    /reference/,
  );
  m.outcome(ev, "contain", "verified", "Checked", "interactive:1", "analyst");
  m.outcome(
    ev,
    "contain",
    "exception",
    "Correction: awaiting new evidence",
    "",
    "analyst",
  );
  assert.equal(ev.actionLog.length, 2);
  assert.equal(m.latest(ev, "contain").outcome, "exception");
  const opened = await w.BETA_Evidence.unpack(await w.BETA_Evidence.bundle(ev));
  assert.equal(opened.actionLog[0].outcome, "verified");
  assert.equal(opened.actionLog[1].outcome, "exception");
});
test("finding confirmation rejects absent records and action CSV neutralizes formulas", () => {
  const w = model(),
    ev = w.BETA_Evidence.create();
  assert.throws(
    () =>
      w.TriageDeskModel.review(ev, "id", "confirmed", "note", "interactive:1"),
    /reference/,
  );
  w.TriageDeskModel.append(ev, "note", '=HYPERLINK("https://invalid")');
  assert.match(w.TriageDeskModel.csv(ev), /'=HYPERLINK/);
});
test("desktop case bundle interoperates with browser integrity validation", async () => {
  const E = core.evidenceAPI(path.resolve(".")),
    ev = E.create({ tenantId: tenant });
  E.setSource(
    ev,
    "admins",
    [
      {
        principal: { userPrincipalName: "alice@example.com" },
        roleDefinition: { displayName: "Global Administrator" },
      },
    ],
    { state: "complete" },
  );
  assert.equal(ev.admins[0].role, "Global Administrator");
  assert.equal(ev.raw.admins[0].role, undefined);
  const bundle = await E.bundle(ev);
  assert.equal(core.hash(bundle.evidence), bundle.integrity.sha256);
  assert.equal(
    (await model().BETA_Evidence.unpack(bundle)).admins[0].role,
    "Global Administrator",
  );
});
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "triage-desktop-tests-"));
function moduleFile(name, version, script) {
  const dir = path.join(fixture, "modules", name, version);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, name + ".psd1"),
    `@{RootModule='${name}.psm1';ModuleVersion='${version}';GUID='44444444-4444-4444-8444-444444444444';FunctionsToExport='*'}`,
  );
  fs.writeFileSync(path.join(dir, name + ".psm1"), script);
}
moduleFile(
  "Microsoft.Graph.Authentication",
  "2.37.0",
  `
function Connect-MgGraph { param($TenantId,$Scopes,$ContextScope,[switch]$NoWelcome,$ErrorAction) }
function Disconnect-MgGraph { param($ErrorAction) }
function Get-MgContext { @{TenantId=$(if($env:TRIAGE_MOCK -eq 'wrong-tenant'){'bad'}else{'${tenant}'});AuthType='Delegated';Account='analyst@example.com'} }
function Invoke-MgGraphRequest { param($Method,$Uri,$Body,$ContentType,$OutputType,$ErrorAction)
 if($Uri -match '/messages' -and $env:TRIAGE_MOCK -eq 'mail-error'){
   $record=[Management.Automation.ErrorRecord]::new([Exception]::new('Response status code does not indicate success: NotFound (Not Found).'),'GraphError',[Management.Automation.ErrorCategory]::InvalidOperation,$null)
   $record.ErrorDetails=[Management.Automation.ErrorDetails]::new(('GET '+$Uri+' HTTP/2.0 404 Not Found'+[Environment]::NewLine+'X-Long-Header: '+('x'*500)+[Environment]::NewLine+'{"error":{"code":"ErrorItemNotFound","message":"The specified object was not found in the store.","innerError":{"request-id":"fixture-request-id"}}}'))
   throw $record
 }
 if($Uri -match '/users/(alice|${object})'){return @{id='${object}';userPrincipalName='alice@example.com';signInActivity=@{lastSignInDateTime='2026-07-01T01:00:00Z'}}}
 if($Uri -match '/oauth2PermissionGrants'){
   $filter=[uri]::UnescapeDataString($Uri)
   if($filter -match ' or '){throw 'Only Equals comparison is supported in Permissions entity set.'}
   if($filter -match 'AllPrincipals'){
     if($env:TRIAGE_MOCK -eq 'oauth-failed'){throw '403 Forbidden'}
     return @{value=@(@{id='tenant-grant';consentType='AllPrincipals';principalId=$null})}
   }
   if($filter -notmatch "principalId eq"){throw 'Expected an equality filter'}
   return @{value=@(@{id='user-grant';consentType='Principal';principalId='${object}'})}
 }


 if($Uri -match '/roleManagement/directory/roleEligibilityScheduleInstances'){
   if([uri]::UnescapeDataString($Uri) -notmatch 'expand=roleDefinition'){throw 'Role definition expansion required'}
   if($env:TRIAGE_MOCK -eq 'failed'){throw '403 Forbidden'}
   if($env:TRIAGE_ELIGIBLE -eq '1'){return @{value=@(@{id='elig-0';principalId='${object}';roleDefinitionId='role-definition';roleEligibilityScheduleId='sched-0';roleDefinition=@{displayName='Global Administrator'}})}}
   return @{value=@()}
 }
 if($Uri -match '/roleManagement/directory/roleAssignments'){
   $query=[uri]::UnescapeDataString($Uri)
   if($query -match 'expand=principal,roleDefinition'){throw 'Only one property can be expanded in a single query.'}
   if($query -notmatch 'expand=roleDefinition'){throw 'Role definition expansion required'}
   if($env:TRIAGE_MOCK -eq 'failed'){throw '403 Forbidden'}
   if($env:TRIAGE_MOCK -eq 'partial' -and $Uri -match 'skiptoken'){throw 'Connection interrupted'}
   $rows=@();for($i=0;$i -lt [int]$env:TRIAGE_COUNT;$i++){$rows+=@{id=('role-'+$i);principalId='${object}';roleDefinitionId='role-definition';roleDefinition=@{displayName='Security Reader'}}}
   if($env:TRIAGE_MOCK -eq 'partial'){return @{value=$rows;'@odata.nextLink'='https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?$expand=roleDefinition&$skiptoken=next'}}
   return @{value=$rows}
 }
 if($Uri -match '/reports/authenticationMethods/userRegistrationDetails'){
   if([uri]::UnescapeDataString($Uri) -match 'filter=id'){throw 'Query not allowed on property: id'}
   if($env:TRIAGE_MOCK -eq 'failed'){throw '403 Forbidden'}
   if($env:TRIAGE_MOCK -eq 'missing'){throw '404 Not Found'}
   $record=@{id=$(if($env:TRIAGE_MOCK -eq 'wrong-report'){'another-user'}else{'${object}'});userPrincipalName='alice@example.com';isMfaRegistered=$true;methodsRegistered=@('fido2')}
   if($Uri -match '/userRegistrationDetails/${object}$'){return $record}
   $rows=@();for($i=0;$i -lt [int]$env:TRIAGE_COUNT;$i++){$rows+=@{id=('report-'+$i);isMfaRegistered=$true}}
   return @{value=$rows}
 }
 if($env:TRIAGE_MOCK -eq 'failed'){throw '403 Forbidden'}
 if($env:TRIAGE_MOCK -eq 'partial' -and $Uri -match 'skiptoken'){throw 'Connection interrupted'}
 $rows=@(); for($i=0;$i -lt [int]$env:TRIAGE_COUNT;$i++){$rows+=@{id=[string]$i;userPrincipalName='alice@example.com';createdDateTime='2026-07-01T01:00:00Z';status=@{errorCode=0}}}
 if($env:TRIAGE_MOCK -eq 'partial'){return @{value=$rows;'@odata.nextLink'='https://graph.microsoft.com/beta/auditLogs/signIns?$skiptoken=next'}}
 return @{value=$rows}
}
`,
);
moduleFile(
  "ExchangeOnlineManagement",
  "3.10.0",
  `
function Connect-ExchangeOnline { param([switch]$ShowBanner,[switch]$DisableWAM,$CommandName,$ErrorAction,$UserPrincipalName)
 if($env:TRIAGE_CONNECT_LOG){@{account=$UserPrincipalName;commands=$CommandName;parameters=@($PSBoundParameters.Keys)}|ConvertTo-Json|Set-Content -LiteralPath $env:TRIAGE_CONNECT_LOG}
}
function Disconnect-ExchangeOnline { param([switch]$Confirm,$ErrorAction) }
function Get-ConnectionInformation { @{State='Connected';TenantID='${tenant}';UserPrincipalName=$(if($env:TRIAGE_MOCK -eq 'wrong-operator'){'another@example.com'}else{'analyst@example.com'})} }
function Get-Mailbox { param($Identity,$ErrorAction) @{UserPrincipalName='alice@example.com';PrimarySmtpAddress='alice@example.com';ExternalDirectoryObjectId='${object}';AuditEnabled=$true;GrantSendOnBehalfTo=@()} }
function Get-InboxRule { param($Mailbox,[switch]$IncludeHidden,$ErrorAction) if($env:TRIAGE_MOCK -eq 'partial'){throw 'Rules access denied'};for($i=0;$i -lt [int]$env:TRIAGE_COUNT;$i++){@{Name='Rule '+$i;Enabled=$true;ForwardTo=@('external@example.net')}} }
function Get-MailboxPermission { param($Identity,$ErrorAction) }
function Get-RecipientPermission { param($Identity,$ErrorAction) }
function Get-MailboxAuditBypassAssociation { param($Identity,$ErrorAction) @{AuditBypassEnabled=$false} }
function Get-MailboxFolderStatistics { param($Identity,$ErrorAction) }
function Get-MailboxFolderPermission { param($Identity,$ErrorAction) }
`,
);
moduleFile(
  "Az.Accounts",
  "5.3.3",
  `
function Disable-AzContextAutosave { param($Scope) }
function Connect-AzAccount { param($Tenant,$Scope) [Console]::Out.WriteLine('FIXTURE_AZURE_LOGIN') }
function Get-AzContext { @{Tenant=@{Id='${tenant}'}} }
function Get-AzSubscription { param($TenantId) @{Id='subscription'} }
function Get-AzAccessToken { param($ResourceUrl) @{Token=(ConvertTo-SecureString 'fixture-token' -AsPlainText -Force)} }
function Invoke-RestMethod { param($Uri,$Authentication,$Token) @{value=@()} }
function Disconnect-AzAccount { param($Scope) }
`,
);
const ps = process.env.PWSH || "pwsh";
function run(
  mode,
  mock,
  count,
  sourceKey = mode === "graph" ? "interactive" : "exchange",
  overrides = {},
  graphContext = null,
) {
  const out = fs.mkdtempSync(path.join(fixture, "run-"));
  const p = {
    ...plan(),
    sources: [sourceKey],
    ...overrides,
  };
  if (graphContext)
    fs.writeFileSync(
      path.join(out, "graph-context.json"),
      JSON.stringify(graphContext),
    );
  const planFile = path.join(out, "plan.json");
  fs.writeFileSync(planFile, JSON.stringify(p));
  const r = spawnSync(
    ps,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      path.resolve("desktop/collector/collect.ps1"),
      "-PlanPath",
      planFile,
      "-OutputDirectory",
      out,
      "-Mode",
      mode,
      "-ModuleRoot",
      path.join(fixture, "modules"),
    ],
    {
      env: {
        ...process.env,
        PSModulePath: path.join(fixture, "modules"),
        TRIAGE_MOCK: mock,
        TRIAGE_COUNT: String(count),
        TRIAGE_CONNECT_LOG: path.join(out, "connect-args.json"),
      },
      encoding: "utf8",
      timeout: 25000,
    },
  );
  if (r.error) throw r.error;
  return {
    r,
    out,
    source: () =>
      JSON.parse(fs.readFileSync(path.join(out, sourceKey + ".json"))),
  };
}
test("actual delegated Graph collector preserves zero, one and multiple records", () => {
  for (const n of [0, 1, 3]) {
    const r = run("graph", "ok", n);
    assert.equal(r.r.status, 0, r.r.stderr);
    const source = r.source();
    assert.ok(Array.isArray(source.records));
    assert.equal(source.records.length, n);
    assert.equal(source.manifest.state, "complete");
    assert.match(decodeURIComponent(source.manifest.query), new RegExp(object));
  }
});
test("actual delegated collector rejects wrong-tenant sessions before evidence reads", () => {
  const r = run("graph", "wrong-tenant", 1);
  assert.equal(r.r.status, 1);
  assert.match(r.r.stderr, /target tenant/);
  assert.equal(fs.existsSync(path.join(r.out, "interactive.json")), false);
});
test("actual delegated Graph collector retains partial pages and permission gaps", () => {
  let r = run("graph", "partial", 2);
  assert.equal(r.r.status, 0, r.r.stderr);
  assert.equal(r.source().records.length, 2);
  assert.equal(r.source().manifest.state, "partial");
  r = run("graph", "failed", 0);
  assert.equal(r.source().manifest.state, "unavailable");
  assert.equal(r.source().records.length, 0);
});
test("actual delegated Exchange collector keeps arrays and per-command failures", () => {
  for (const n of [0, 1, 3]) {
    const r = run("exchange", "ok", n);
    assert.equal(r.r.status, 0, r.r.stderr);
    const s = r.source();
    assert.equal(s.manifest.state, "complete");
    assert.equal(
      s.records[0].sources.find((x) => x.key === "rules").records.length,
      n,
    );
    assert.equal(s.records[0].sources.length, 7);
  }
  const r = run("exchange", "partial", 1);
  assert.equal(r.r.status, 0, r.r.stderr);
  assert.equal(r.source().manifest.state, "partial");
  assert.equal(
    r.source().records[0].sources.find((s) => s.key === "rules").state,
    "failed",
  );
});
test.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

test("mail failures preserve Graph JSON after long SDK request headers and explain connection access", () => {
  const result = run("graph", "mail-error", 0, "messages", {
    sources: ["messages", "attachments"],
  });
  assert.equal(result.r.status, 0, result.r.stderr);
  for (const key of ["messages", "attachments"]) {
    const source = JSON.parse(
      fs.readFileSync(path.join(result.out, key + ".json")),
    );
    assert.equal(source.manifest.state, "unavailable");
    assert.equal(source.records.length, 0);
    assert.match(
      source.manifest.error,
      /ErrorItemNotFound: The specified object was not found in the store/,
    );
    assert.match(source.manifest.error, /request-id: fixture-request-id/);
    assert.match(source.manifest.error, /Mail.Read.Shared/);
    assert.match(
      source.manifest.error,
      /Signed-in account analyst@example.com/,
    );
    assert.match(
      source.manifest.error,
      /does not establish that the mailbox is missing or empty/,
    );
    assert.doesNotMatch(source.manifest.error, /X-Long-Header/);
  }
});

test("actual desktop OAuth collection joins user and tenant grants using equality queries", () => {
  const result = run("graph", "ok", 0, "oauth");
  assert.equal(result.r.status, 0, result.r.stderr);
  const source = result.source();
  assert.deepEqual(
    source.records.map((r) => r.id),
    ["user-grant", "tenant-grant"],
  );
  assert.equal(source.manifest.state, "complete");
  assert.equal(source.manifest.queryIndex, 2);
  assert.equal(source.manifest.query.split("\n").length, 2);
});
test("actual desktop OAuth collection retains user grants when the tenant query fails", () => {
  const result = run("graph", "oauth-failed", 0, "oauth");
  assert.equal(result.r.status, 0, result.r.stderr);
  const source = result.source();
  assert.deepEqual(
    source.records.map((r) => r.id),
    ["user-grant"],
  );
  assert.equal(source.manifest.state, "partial");
  assert.equal(source.manifest.queryIndex, 1);
  assert.match(source.manifest.error, /Forbidden/);
});

test("actual desktop directory roles accept one expansion and preserve partial checkpoints", () => {
  for (const scope of ["user", "tenant"]) {
    const r = run(
      "graph",
      "ok",
      2,
      "admins",
      scope === "tenant" ? { scope, upn: "" } : {},
    );
    const source = r.source();
    assert.equal(source.manifest.state, "complete");
    assert.equal(source.records.length, 2);
    assert.equal(
      source.records[0].roleDefinition.displayName,
      "Security Reader",
    );
    // Two queries per source: active assignments, then PIM eligibility.
    const queries = source.manifest.query.split("\n");
    assert.equal(queries.length, 2);
    assert.match(queries[1], /roleEligibilityScheduleInstances/);
    for (const q of queries) {
      assert.equal(new URL(q).searchParams.get("$expand"), "roleDefinition");
      assert.equal(new URL(q).searchParams.has("$filter"), scope === "user");
    }
  }
  const partial = run("graph", "partial", 1, "admins").source();
  assert.equal(partial.manifest.state, "partial");
  assert.equal(partial.records.length, 1);
  assert.match(partial.manifest.nextLink, /skiptoken/);
});
test("actual desktop MFA uses a single-user report and tenant-wide paged inventory", () => {
  const single = run("graph", "ok", 1, "mfa").source();
  assert.equal(single.manifest.state, "complete");
  assert.equal(single.records.length, 1);
  assert.equal(single.records[0].id, object);
  assert.equal(single.records[0].isMfaRegistered, true);
  assert.ok(single.manifest.query.endsWith("/" + object));
  assert.ok(!single.manifest.query.includes("$filter"));
  for (const n of [0, 2]) {
    const source = run("graph", "ok", n, "mfa", {
      scope: "tenant",
      upn: "",
    }).source();
    assert.equal(source.manifest.state, "complete");
    assert.equal(source.records.length, n);
    assert.ok(
      source.manifest.query.endsWith("/userRegistrationDetails?$top=500"),
    );
  }
});
test("actual desktop MFA keeps denied, missing and wrong-user reports as evidence gaps", () => {
  for (const [mock, state] of [
    ["failed", "unavailable"],
    ["missing", "failed"],
    ["wrong-report", "failed"],
  ]) {
    const source = run("graph", mock, 1, "mfa").source();
    assert.equal(source.manifest.state, state);
    assert.equal(source.records.length, 0);
    assert.ok(source.manifest.error);
  }
});

test("Exchange leaves the sign-in chooser unhinted for passkeys and rejects a changed operator", () => {
  const context = {
    tenantId: tenant,
    account: "analyst@example.com",
    objectId: object,
    upn: "alice@example.com",
  };
  const result = run("exchange", "ok", 0, "exchange", {}, context);
  assert.equal(result.r.status, 0, result.r.stderr);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(result.out, "connect-args.json")))
      .account,
    null,
  );
  const parameters = JSON.parse(
    fs.readFileSync(path.join(result.out, "connect-args.json")),
  ).parameters;
  for (const key of [
    "UserPrincipalName",
    "Credential",
    "Device",
    "AccessToken",
  ])
    assert.equal(parameters.includes(key), false);
  const rejected = run(
    "exchange",
    "wrong-operator",
    0,
    "exchange",
    {},
    context,
  );
  assert.equal(rejected.r.status, 1);
  assert.match(rejected.r.stderr, /different operator/);
  assert.equal(fs.existsSync(path.join(rejected.out, "exchange.json")), false);
  const foreign = run(
    "exchange",
    "ok",
    0,
    "exchange",
    {},
    { ...context, tenantId: "foreign" },
  );
  assert.equal(foreign.r.status, 1);
  assert.equal(
    fs.existsSync(path.join(foreign.out, "connect-args.json")),
    false,
  );
});

test("actual Graph worker retains its session and waits for host release before source queries", async () => {
  const out = fs.mkdtempSync(path.join(fixture, "handshake-"));
  const planFile = path.join(out, "plan.json");
  fs.writeFileSync(planFile, JSON.stringify(plan()));
  const child = spawn(
    ps,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      path.resolve("desktop/collector/collect.ps1"),
      "-PlanPath",
      planFile,
      "-OutputDirectory",
      out,
      "-Mode",
      "graph",
      "-ModuleRoot",
      path.join(fixture, "modules"),
      "-WaitForCollection",
    ],
    { env: { ...process.env, TRIAGE_COUNT: "1", TRIAGE_MOCK: "ok" } },
  );
  let stdout = "",
    stderr = "";
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  let released = false;
  const timeout = setTimeout(() => child.kill(), 15000);
  child.stdout.on("data", (data) => {
    stdout += data;
    if (!released && stdout.includes('"type":"connected"')) {
      released = true;
      assert.equal(fs.existsSync(path.join(out, "interactive.json")), false);
      child.stdin.end("collect\n");
    }
  });
  try {
    assert.equal(await done, 0, stderr);
    assert.equal(released, true);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(out, "interactive.json"))).records
        .length,
      1,
    );
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
});

test("optional Azure authenticates once before any selected source collects", () => {
  const r = run("graph", "ok", 0, "azureActivity", {
    sources: ["interactive", "azureActivity", "azureDirectoryActivity"],
  });
  assert.equal(r.r.status, 0, r.r.stderr);
  const out = r.r.stdout;
  assert.equal(out.split("FIXTURE_AZURE_LOGIN").length - 1, 1);
  assert.ok(out.indexOf("FIXTURE_AZURE_LOGIN") < out.indexOf('"source":'));
  assert.equal(r.source().manifest.state, "complete");
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(r.out, "azureDirectoryActivity.json")))
      .manifest.state,
    "complete",
  );
});

// Connect-first flow: the worker signs in with a tenant-scoped connection plan and reads the
// completed plan (affected account, window, sources) only when the host releases collection.
function handshake(initialPlan, onConnected) {
  const out = fs.mkdtempSync(path.join(fixture, "connect-first-"));
  const planFile = path.join(out, "plan.json");
  fs.writeFileSync(planFile, JSON.stringify(initialPlan));
  const child = spawn(
    ps,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      path.resolve("desktop/collector/collect.ps1"),
      "-PlanPath",
      planFile,
      "-OutputDirectory",
      out,
      "-Mode",
      "graph",
      "-ModuleRoot",
      path.join(fixture, "modules"),
      "-WaitForCollection",
    ],
    { env: { ...process.env, TRIAGE_COUNT: "1", TRIAGE_MOCK: "ok" } },
  );
  let stdout = "",
    stderr = "",
    released = false;
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  const timeout = setTimeout(() => child.kill(), 15000);
  child.stdout.on("data", (d) => {
    stdout += d;
    if (!released && stdout.includes('"type":"connected"')) {
      released = true;
      onConnected(out, planFile);
      child.stdin.end("collect\n");
    }
  });
  return done.then((code) => {
    clearTimeout(timeout);
    return { code, out, stdout, stderr, released };
  });
}
test("connect-first worker resolves the affected account from the plan completed after release", async () => {
  const r = await handshake(
    { ...plan(), scope: "tenant", upn: "", sources: ["interactive"] },
    (out, planFile) => {
      const context = JSON.parse(
        fs.readFileSync(path.join(out, "graph-context.json")),
      );
      assert.equal(context.objectId, "");
      assert.equal(context.account, "analyst@example.com");
      fs.writeFileSync(
        planFile,
        JSON.stringify({ ...plan(), sources: ["interactive", "users"] }),
      );
    },
  );
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.released, true);
  const context = JSON.parse(
    fs.readFileSync(path.join(r.out, "graph-context.json")),
  );
  assert.equal(context.objectId, object);
  assert.equal(context.upn, "alice@example.com");
  const interactive = JSON.parse(
    fs.readFileSync(path.join(r.out, "interactive.json")),
  );
  assert.match(
    decodeURIComponent(interactive.manifest.query),
    new RegExp("userId eq '" + object + "'"),
  );
  const users = JSON.parse(fs.readFileSync(path.join(r.out, "users.json")));
  assert.equal(users.records.length, 1);
  assert.equal(users.records[0].id, object);
  assert.ok(
    r.stdout.indexOf('"stage":"Verifying affected account"') >
      r.stdout.indexOf('"type":"connected"'),
  );
});
test("connect-first worker refuses a plan that changes tenant after sign-in", async () => {
  const r = await handshake(
    { ...plan(), scope: "tenant", upn: "", sources: ["interactive"] },
    (out, planFile) => {
      fs.writeFileSync(
        planFile,
        JSON.stringify({
          ...plan(),
          tenantId: "55555555-5555-4555-8555-555555555555",
        }),
      );
    },
  );
  assert.equal(r.code, 1);
  assert.match(r.stderr, /changed tenant/);
  assert.equal(fs.existsSync(path.join(r.out, "interactive.json")), false);
});
