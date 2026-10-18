const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const core=require('../desktop/core.cjs'),{validateRequest,validateContext}=require('../desktop/response.cjs');
const context={caseId:'11111111-1111-4111-8111-111111111111',tenantId:'22222222-2222-4222-8222-222222222222',objectId:'33333333-3333-4333-8333-333333333333',upn:'person@example.com'};
test('full portable plan supports tenant mailbox sources; browser catalog remains restricted',()=>{
 const E=core.evidenceAPI(path.resolve('.'));
 assert.deepEqual(Array.from(E.CATALOG,c=>c[0]).sort(),core.KEYS.slice().sort());
 const p=core.validatePlan({...context,schema:'limon.triage.plan',schemaVersion:1,scope:'tenant',upn:'',sources:core.KEYS,window:{start:'2026-07-01T00:00:00Z',end:'2026-07-02T00:00:00Z'}});
 assert.equal(p.sources.length,34);
 assert.equal(E.CATALOG.filter(c=>c[3]==='Graph').length,12);
 for(const key of ['exchange','messageTrace','transportRules','adminAudit','mailboxAudit'])assert.equal(core.isExchange(key),true);
});
test('membership and per-user license evidence retains repeated IDs in different contexts',()=>{
 const E=core.evidenceAPI(path.resolve('.')),ev=E.create();
 E.setSource(ev,'groupMembers',[{id:'user',groupId:'a'},{id:'user',groupId:'b'}],{state:'complete'});
 assert.equal(ev.groupMembers.length,2);
});
test('native response only permits reviewed operations against its bound account',()=>{
 assert.throws(()=>validateContext({...context,objectId:'not-resolved'}));
 const own='https://graph.microsoft.com/v1.0/users/'+context.objectId;
 assert.equal(validateRequest(context,{url:own,method:'PATCH',body:{accountEnabled:false}}).write,true);
 assert.equal(validateRequest(context,{url:own+'/revokeSignInSessions',method:'POST',body:{}}).write,true);
 for(const request of [
  {url:own,method:'DELETE'},
  {url:own,method:'PATCH',body:{displayName:'changed'}},
  {url:own.replace(context.objectId,context.caseId),method:'PATCH',body:{accountEnabled:false}},
  {url:'https://attacker.example/v1.0/users'},
  {url:'https://graph.microsoft.com/v1.0/applications',method:'POST',body:{}},
  {url:'https://graph.microsoft.com/v1.0/security/auditLog/queries',method:'POST',body:{userPrincipalNameFilters:['another@example.com']}}
 ])assert.throws(()=>validateRequest(context,request));
});

test('extended PowerShell collectors preserve context, pagination and partial failures',()=>{
 const {spawnSync}=require('node:child_process');
 const ps=process.env.PWSH || 'pwsh';
 const r=spawnSync(ps,['-NoProfile','-File',path.join(__dirname,'extended-collector.fixture.ps1')],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
test('native response worker verifies tenant, operator and consent ownership with mocked Microsoft calls',()=>{
 const fs=require('node:fs'),os=require('node:os'),{spawnSync}=require('node:child_process');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'triage-response-fixture-'));
 const dir=path.join(tmp,'Microsoft.Graph.Authentication/2.37.0');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'mock.psm1'),`
 function Connect-MgGraph { param($TenantId,$Scopes,$ContextScope,[switch]$NoWelcome) if($ContextScope -ne 'Process'){throw 'Persistent OS cache used'};if($env:FIX_LOG){Add-Content -LiteralPath $env:FIX_LOG -Value 'connect'} }
 function Get-MgContext { @{TenantId=$env:FIX_TENANT;Account='operator@example.com';AuthType='Delegated'} }
 function Invoke-MgGraphRequest { param($Uri,$Method,$OutputType,$Body,$ContentType)
  if($Uri -match 'oauth2PermissionGrants'){if($Method -eq 'DELETE'){throw 'Deletion must not happen'};return @{principalId='other';consentType='AllPrincipals'}}
  return @{id='${context.objectId}';userPrincipalName='${context.upn}'}
 }
 Export-ModuleMember -Function *
 `);
 fs.writeFileSync(path.join(dir,'Microsoft.Graph.Authentication.psd1'),"@{RootModule='mock.psm1';ModuleVersion='2.37.0';GUID='11111111-1111-4111-8111-111111111111';FunctionsToExport='*'}");
 const run=(req,tenant=context.tenantId)=>{
  const r=spawnSync(process.env.PWSH||'pwsh',['-NoProfile','-File',path.resolve('desktop/collector/response.ps1'),'-ModuleRoot',tmp],{input:JSON.stringify({...context,...req})+'\n',env:{...process.env,FIX_TENANT:tenant},encoding:'utf8',timeout:30000});
  const line=r.stdout.split('\n').find(x=>x.startsWith('TRIAGE_RESPONSE:'));
  assert.ok(line,r.stdout+r.stderr);return JSON.parse(line.slice(16));
 };
 try{
  assert.equal(run({connect:true}).ok,true);
  const logFile=path.join(tmp,'connect.log');
  const requests=[{connect:true},{method:'GET',url:'https://graph.microsoft.com/v1.0/users/'+context.objectId},{method:'GET',url:'https://graph.microsoft.com/v1.0/users/'+context.objectId}];
  const reuse=spawnSync(process.env.PWSH||'pwsh',['-NoProfile','-File',path.resolve('desktop/collector/response.ps1'),'-ModuleRoot',tmp],{input:requests.map(r=>JSON.stringify({...context,...r})).join('\n')+'\n',env:{...process.env,FIX_TENANT:context.tenantId,FIX_LOG:logFile},encoding:'utf8',timeout:30000});
  assert.equal(reuse.status,0,reuse.stderr);
  assert.equal(reuse.stdout.split('\n').filter(l=>l.startsWith('TRIAGE_RESPONSE:')&&JSON.parse(l.slice(16)).ok).length,3);
  assert.equal(fs.readFileSync(logFile,'utf8').trim().split(/\r?\n/).length,1,'three commands must share one Graph sign-in');

  assert.match(run({connect:true},context.caseId).error,/tenant/);
  assert.match(run({connect:true,operator:'other@example.com'}).error,/operator/);
  assert.match(run({url:'https://graph.microsoft.com/v1.0/oauth2PermissionGrants/g',method:'DELETE',write:true}).error,/user-specific/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('unified Exchange audit replaces retired commands and preserves incomplete results',()=>{
 const {spawnSync}=require('node:child_process');
 const r=spawnSync(process.env.PWSH||'pwsh',['-NoProfile','-File',path.join(__dirname,'audit-collector.fixture.ps1')],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
