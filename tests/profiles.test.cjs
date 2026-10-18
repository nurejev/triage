"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawnSync } = require("node:child_process");
const {
  createStore,
  validateProfile,
  wizardSettings,
  redact,
} = require("../desktop/profiles.cjs");
const { validatePlan } = require("../desktop/core.cjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "triage-profiles-test-"));
const tenant = "11111111-1111-4111-8111-111111111111",
  appid = "22222222-2222-4222-8222-222222222222";
const profile = {
  name: "Fixture customer",
  tenantId: tenant,
  graphAppId: appid,
  exchangeAppId: appid,
  organization: "fixture.onmicrosoft.com",
};
const certificate = { thumbprint: "TEST", expiresAt: "2030-01-01T00:00:00Z" };
const crypto = require("node:crypto"),
  key = crypto.randomBytes(32),
  iv = crypto.randomBytes(16);
const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => {
    const c = crypto.createCipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([c.update(s), c.final()]);
  },
  decryptString: (b) => {
    const c = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([c.update(b), c.final()]).toString();
  },
};
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
test("profiles keep credentials out of list, disk plaintext, plans and tenant-mismatched runs", () => {
  const store = createStore(root, storage),
    credential = {
      pfx: "PRIVATE_CERTIFICATE",
      password: "fixture-long-password",
    };
  const saved = store.save(profile, credential, certificate);
  const disk = fs.readFileSync(
    path.join(root, "customer-profiles.json"),
    "utf8",
  );
  assert.ok(
    !disk.includes(credential.password) && !disk.includes(credential.pfx),
  );
  assert.equal(store.list()[0].secret, undefined);
  assert.equal(
    store.resolve(saved.id, tenant, ["users", "exchange"]).password,
    credential.password,
  );
  assert.throws(
    () => store.resolve(saved.id, appid, ["users"]),
    /tenant differ/,
  );
  const p = validatePlan({
    schema: "limon.triage.plan",
    schemaVersion: 1,
    caseId: appid,
    tenantId: tenant,
    scope: "user",
    upn: "user@example.com",
    sources: ["users"],
    window: { start: "2026-07-01", end: "2026-07-02" },
    connection: {
      mode: "app",
      profileId: saved.id,
      password: credential.password,
      pfx: credential.pfx,
    },
  });
  assert.deepEqual(p.connection, { mode: "app", profileId: saved.id });
  assert.ok(!JSON.stringify(p).includes(credential.password));
  store.remove(saved.id);
  assert.equal(store.list().length, 0);
  assert.throws(
    () => store.resolve(saved.id, tenant, ["users"]),
    /not on this computer/,
  );
});
test("profile storage uses a local key file, migrates keychain-era profiles once, and refuses expired certificates and missing services", () => {
  const dir = path.join(root, "closed");
  // 0.23: no OS keychain; an app-local AES-GCM key is created with owner-only permissions.
  const local = createStore(dir, { isEncryptionAvailable: () => false });
  const saved = local.save(profile, { pfx: "secret", password: "pw" }, certificate);
  assert.ok(fs.existsSync(path.join(dir, "profile-key")));
  const onDisk = fs.readFileSync(path.join(dir, "customer-profiles.json"), "utf8");
  assert.ok(!onDisk.includes("secret") || !onDisk.includes('"pw"'));
  assert.match(JSON.parse(onDisk)[0].secret, /^v2:/);
  assert.equal(local.resolve(saved.id, profile.tenantId, ["users"]).password, "pw");
  // A profile written by 0.22 (keychain-encrypted, no v2 prefix) is decrypted through the legacy
  // adapter exactly once and rewritten with the local key.
  const legacyItems = JSON.parse(fs.readFileSync(path.join(dir, "customer-profiles.json"), "utf8"));
  legacyItems[0].secret = Buffer.from(JSON.stringify({ pfx: "old", password: "oldpw" })).toString("base64");
  fs.writeFileSync(path.join(dir, "customer-profiles.json"), JSON.stringify(legacyItems));
  let legacyReads = 0;
  const migrating = createStore(dir, { isEncryptionAvailable: () => true, decryptString: (b) => { legacyReads++; return b.toString("utf8"); } });
  assert.equal(migrating.resolve(saved.id, profile.tenantId, ["users"]).password, "oldpw");
  assert.equal(migrating.resolve(saved.id, profile.tenantId, ["users"]).password, "oldpw");
  assert.equal(legacyReads, 1);
  assert.match(JSON.parse(fs.readFileSync(path.join(dir, "customer-profiles.json"), "utf8"))[0].secret, /^v2:/);
  local.remove(saved.id);
  assert.throws(
    () =>
      createStore(dir, storage).save(
        profile,
        { pfx: "x", password: "y" },
        { ...certificate, expiresAt: "bad" },
      ),
    /not valid/,
  );
  const s = createStore(path.join(root, "services"), storage),
    p = s.save(
      { ...profile, exchangeAppId: "" },
      { pfx: "x", password: "y" },
      certificate,
    );
  assert.throws(() => s.resolve(p.id, tenant, ["exchange"]), /no Exchange/);
  assert.throws(
    () => validateProfile({ ...profile, organization: "x; bad" }),
    /domain/,
  );
  assert.throws(
    () => validateProfile({ ...profile, graphAppId: "not-id" }),
    /application IDs/,
  );
  assert.throws(() => validatePlan({}), /Unsupported/);
  assert.equal(
    redact("failed password sentinel", ["sentinel"]),
    "failed password [redacted]",
  );
});
function ps(script, args = [], input) {
  return spawnSync(
    process.env.PWSH || "pwsh",
    ["-NoProfile", "-NonInteractive", "-File", path.resolve(script), ...args],
    { input, encoding: "utf8", timeout: 15000 },
  );
}
test("wizard preview performs no authentication or writes and rejects broadened permissions", () => {
  const settings = wizardSettings({ ...profile, exchange: true }),
    file = path.join(root, "settings.json");
  fs.writeFileSync(file, JSON.stringify(settings));
  let r = ps("desktop/collector/New-TriageRegistrations.ps1", [
    "-ModuleRoot",
    "/nonexistent",
    "-SettingsPath",
    file,
    "-PreviewOnly",
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Exchange.ManageAsApp/);
  assert.match(r.stdout, /No existing app is changed/);
  assert.equal(
    fs.existsSync(path.join(root, "registration-state.json")),
    false,
  );
  settings.graphPermissions.push("Directory.ReadWrite.All");
  fs.writeFileSync(file, JSON.stringify(settings));
  r = ps("desktop/collector/New-TriageRegistrations.ps1", [
    "-ModuleRoot",
    "/nonexistent",
    "-SettingsPath",
    file,
    "-PreviewOnly",
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unexpected Graph permission/);
});
test("actual PowerShell certificate check accepts a private PFX and rejects wrong password and expired certificates", () => {
  const generator = path.join(root, "cert.ps1");
  fs.writeFileSync(
    generator,
    `$rsa=[Security.Cryptography.RSA]::Create(2048)\n$r=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Fixture',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)\n$c=$r.CreateSelfSigned([datetimeoffset]::UtcNow.AddDays(-1),[datetimeoffset]::UtcNow.AddDays(2))\n[Convert]::ToBase64String($c.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'fixture-password'))`,
  );
  const generated = ps(generator);
  assert.equal(generated.status, 0, generated.stderr);
  const credential = {
    pfx: generated.stdout.trim(),
    password: "fixture-password",
  };
  fs.writeFileSync(
    path.join(root, "credential.json"),
    JSON.stringify(credential),
  );
  let r = ps(
    "desktop/collector/check-certificate.ps1",
    [],
    JSON.stringify(credential) + "\n",
  );
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).thumbprint);
  assert.ok(!r.stdout.includes(credential.pfx));
  r = ps(
    "desktop/collector/check-certificate.ps1",
    [],
    JSON.stringify({ ...credential, password: "wrong" }) + "\n",
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /PFX certificate cannot/);
  assert.ok(!r.stderr.includes("fixture-password"));
  fs.writeFileSync(
    generator,
    fs.readFileSync(generator, "utf8").replace("AddDays(2)", "AddHours(-1)"),
  );
  r = ps(
    "desktop/collector/check-certificate.ps1",
    [],
    JSON.stringify({
      pfx: ps(generator).stdout.trim(),
      password: credential.password,
    }) + "\n",
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /validity dates/);
});
test("actual app-certificate workers verify app identity and retain the two-phase collection gate", () => {
  const modules = path.join(root, "modules");
  function module(name, version, body) {
    const dir = path.join(modules, name, version);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, name + ".psd1"),
      `@{RootModule='${name}.psm1';ModuleVersion='${version}';FunctionsToExport='*'}`,
    );
    fs.writeFileSync(path.join(dir, name + ".psm1"), body);
  }
  module(
    "Microsoft.Graph.Authentication",
    "2.37.0",
    `
 function Connect-MgGraph {param($TenantId,$ClientId,$Certificate,$Scopes,$ContextScope,[switch]$NoWelcome,$ErrorAction) if(!$Certificate.HasPrivateKey -or $Scopes){throw 'Expected certificate only'};$script:client=$ClientId;$script:tenant=$TenantId}
 function Get-MgContext {@{TenantId=$script:tenant;ClientId=$(if($env:TRIAGE_WRONG_APP){'wrong'}else{$script:client});AuthType='AppOnly'}}
 function Invoke-MgGraphRequest {param($Method,$Uri,$OutputType,$ErrorAction) if($Uri -match '/users/(alice|33333333-3333-4333-8333-333333333333)'){return @{id='33333333-3333-4333-8333-333333333333';userPrincipalName='alice@example.com'}};return @{value=@(@{id='evidence'})}}
 function Disconnect-MgGraph {param($ErrorAction)}
 `,
  );
  module(
    "ExchangeOnlineManagement",
    "3.10.0",
    `
 function Connect-ExchangeOnline {param($AppId,$Certificate,$Organization,[switch]$ShowBanner,[switch]$DisableWAM,[switch]$SkipLoadingFormatData,$CommandName,$ErrorAction) if(!$Certificate.HasPrivateKey -or $Organization -ne 'fixture.onmicrosoft.com'){throw 'Expected customer certificate'};$script:client=$AppId}
 function Get-ConnectionInformation {@{State='Connected';TenantID='${tenant}';AppId=$(if($env:TRIAGE_WRONG_APP){'wrong'}else{$script:client});CertificateAuthentication=$true}}
 function Get-Mailbox {param($Identity,$ErrorAction) @{UserPrincipalName='alice@example.com';ExternalDirectoryObjectId='33333333-3333-4333-8333-333333333333';GrantSendOnBehalfTo=@()}}
 function Get-InboxRule {param($Mailbox,[switch]$IncludeHidden,$ErrorAction)}
 function Get-MailboxPermission {param($Identity,$ErrorAction)}
 function Get-RecipientPermission {param($Identity,$ErrorAction)}
 function Get-MailboxAuditBypassAssociation {param($Identity,$ErrorAction)}
 function Get-MailboxFolderStatistics {param($Identity,$ErrorAction)}
 function Get-MailboxFolderPermission {param($Identity,$ErrorAction)}
 function Disconnect-ExchangeOnline {param([switch]$Confirm,$ErrorAction)}
 `,
  );
  const credential = {
    ...JSON.parse(fs.readFileSync(path.join(root, "credential.json"))),
    ...profile,
  };
  for (const mode of ["graph", "exchange"]) {
    for (const wrong of [false, true]) {
      const out = fs.mkdtempSync(path.join(root, "app-run-")),
        source = mode === "graph" ? "users" : "exchange";
      fs.writeFileSync(
        path.join(out, "plan.json"),
        JSON.stringify({
          schema: "limon.triage.plan",
          schemaVersion: 1,
          caseId: appid,
          tenantId: tenant,
          scope: "user",
          upn: "alice@example.com",
          sources: [source],
          window: { start: "2026-07-01", end: "2026-07-02" },
        }),
      );
      const r = spawnSync(
        process.env.PWSH || "pwsh",
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          path.resolve("desktop/collector/collect.ps1"),
          "-PlanPath",
          path.join(out, "plan.json"),
          "-OutputDirectory",
          out,
          "-Mode",
          mode,
          "-ModuleRoot",
          modules,
          "-AppCredential",
          "-WaitForCollection",
        ],
        {
          encoding: "utf8",
          timeout: 15000,
          env: { ...process.env, TRIAGE_WRONG_APP: wrong ? "1" : "" },
          input: JSON.stringify(credential) + "\ncollect\n",
        },
      );
      assert.equal(r.status, wrong ? 1 : 0, r.stderr);
      if (wrong) {
        assert.match(r.stderr, /application identity/);
        assert.equal(fs.existsSync(path.join(out, source + ".json")), false);
      } else {
        const c = JSON.parse(
          fs.readFileSync(path.join(out, mode + "-context.json")),
        );
        assert.equal(c.authType, "AppOnly");
        assert.equal(c.appId, appid);
        assert.equal(
          JSON.parse(fs.readFileSync(path.join(out, source + ".json"))).manifest
            .state,
          "complete",
        );
        assert.ok(
          r.stdout.indexOf('"type":"connected"') <
            r.stdout.indexOf('"source":'),
        );
        assert.ok(!r.stdout.includes(credential.password));
      }
    }
  }
});
test("registration setup creates only reviewed apps and grants under mocked Graph; exports a usable profile and RBAC preview", () => {
  const folder = fs.mkdtempSync(path.join(root, "wizard-")),
    mod = path.join(
      folder,
      "modules",
      "Microsoft.Graph.Authentication",
      "2.37.0",
    );
  fs.mkdirSync(mod, { recursive: true });
  const settings = wizardSettings({ ...profile, exchange: true });
  fs.writeFileSync(
    path.join(folder, "settings.json"),
    JSON.stringify(settings),
  );
  fs.copyFileSync(
    "desktop/collector/New-TriageRegistrations.ps1",
    path.join(folder, "New-TriageRegistrations.ps1"),
  );
  fs.writeFileSync(
    path.join(mod, "Microsoft.Graph.Authentication.psd1"),
    "@{RootModule='mock.psm1';ModuleVersion='2.37.0';FunctionsToExport='*'}",
  );
  fs.writeFileSync(
    path.join(mod, "mock.psm1"),
    `
 $script:n=0
 function Connect-MgGraph {param($TenantId,$Scopes,$ContextScope,[switch]$NoWelcome);if($Scopes.Count -ne 2){throw 'Wrong bootstrap scopes'}}
 function Get-MgContext {@{TenantId='${tenant}';AuthType='Delegated'}}
 function Disconnect-MgGraph {param($ErrorAction)}
 function Read-Host {param($Prompt,[switch]$AsSecureString);if($AsSecureString){return ConvertTo-SecureString 'fixture-only-password-1234' -AsPlainText -Force};return '${tenant}'}
 function Invoke-MgGraphRequest {param($Method,$Uri,$OutputType,$ErrorAction,$Body,$ContentType)
 if($Method -eq 'GET' -and $Uri -match 'servicePrincipals'){
  $roles=@();foreach($p in @(${[...settings.graphPermissions, "Exchange.ManageAsApp"].map((p) => "'" + p + "'").join(",")})){$roles+=@{id=[guid]::NewGuid().ToString();value=$p;isEnabled=$true;allowedMemberTypes=@('Application')}}
  return @{value=@(@{id=[guid]::NewGuid().ToString();appRoles=$roles})}
 }
 if($Method -ne 'POST'){throw 'Unexpected cloud method'}
 $b=$Body|ConvertFrom-Json -AsHashtable
 if($Uri.EndsWith('/applications')){
  if($b.signInAudience -ne 'AzureADMyOrg' -or $b.requiredResourceAccess.Count -ne 1 -or $b.keyCredentials.Count -ne 1){throw 'Unexpected app setup'}
  $script:n++;return @{id=[guid]::NewGuid().ToString();appId=[guid]::NewGuid().ToString()}
 }
 if($Uri.EndsWith('/servicePrincipals')){return @{id=[guid]::NewGuid().ToString()}}
 if($Uri.EndsWith('/appRoleAssignedTo')){return @{id=[guid]::NewGuid().ToString()}}
 throw 'Unexpected Graph endpoint'
 }
 `,
  );
  let r = ps(path.join(folder, "New-TriageRegistrations.ps1"), [
    "-ModuleRoot",
    path.join(folder, "modules"),
  ]);
  assert.equal(r.status, 0, r.stderr);
  const exported = JSON.parse(
      fs.readFileSync(path.join(folder, "profile.json")),
    ),
    state = JSON.parse(
      fs.readFileSync(path.join(folder, "registration-state.json")),
    );
  validateProfile(exported);
  assert.equal(state.apps.length, 2);
  assert.equal(
    state.apps[0].consentedRoles.length,
    settings.graphPermissions.length,
  );
  assert.equal(state.apps[1].consentedRoles.length, 1);
  assert.equal(
    Object.keys(exported).some((k) => /password|cert|secret/i.test(k)),
    false,
  );
  assert.ok(fs.statSync(path.join(folder, "customer.pfx")).size > 1000);
  r = ps(path.join(folder, "Exchange-RBAC.ps1"), [
    "-ModuleRoot",
    "/missing",
    "-PreviewOnly",
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Get-InboxRule/);
  assert.match(r.stdout, /all mailboxes/);
  r = ps(path.join(folder, "New-TriageRegistrations.ps1"), [
    "-ModuleRoot",
    path.join(folder, "modules"),
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already been used/);
});
