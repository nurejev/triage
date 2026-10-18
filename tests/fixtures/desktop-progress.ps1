# Synthetic evidence only. Used by the isolated Electron integration test.
# Connect-first: sign in with the connection plan, wait for release, then read the completed plan.
param($PlanPath,$OutputDirectory,$Mode,$ModuleRoot,[switch]$WaitForCollection)
$ErrorActionPreference='Stop'
$p=Get-Content -Raw $PlanPath | ConvertFrom-Json
function Write-Fixture($Name,$Value) {
  $file=Join-Path $OutputDirectory $Name
  [IO.File]::WriteAllText(($file+'.tmp'), ($Value | ConvertTo-Json -Depth 20 -Compress))
  [IO.File]::Move(($file+'.tmp'),$file,$true)
}
function Source($Key,$State,$Records,$ErrorText='') {
  Write-Fixture ($Key+'.json') @{records=@($Records);manifest=@{state=$State;error=$ErrorText;pages=1;query='Synthetic fixture query'}}
  [Console]::Out.WriteLine('TRIAGE_PROGRESS:'+(@{source=$Key;state=$State;count=999}|ConvertTo-Json -Compress))
}
function Await-Release {
  if($WaitForCollection){
    [Console]::Out.WriteLine('TRIAGE_PROGRESS:'+(@{type='connected';mode=$Mode}|ConvertTo-Json -Compress))
    if([Console]::In.ReadLine() -cne 'collect'){throw 'Fixture setup cancelled'}
  }
  $script:p=Get-Content -Raw $PlanPath | ConvertFrom-Json
}
if($Mode -eq 'exchange'){
 Write-Fixture 'exchange-context.json' @{tenantId=$p.tenantId;account='analyst@example.com';upn='';objectId=''}
 Await-Release
 Write-Fixture 'exchange-context.json' @{tenantId=$p.tenantId;account='analyst@example.com';upn=$p.upn;objectId='22222222-2222-4222-8222-222222222222'}
 Source 'exchange' 'complete' @(@{schema='limon.triage.exchange';schemaVersion=1;tenantId=$p.tenantId;upn=$p.upn;objectId='22222222-2222-4222-8222-222222222222';capturedAt=[datetime]::UtcNow.ToString('o');sources=@(
 @{key='rules';state='complete';records=@(@{Name='Synthetic redirect';Enabled=$true;ForwardTo=@();RedirectTo=@('external@example.net');Description='Fictional rule for UI validation'})},
 @{key='mailbox';state='complete';records=@(@{ForwardingSmtpAddress=$null;AuditEnabled=$true})},
 @{key='fullAccess';state='complete';records=@()},
 @{key='sendAs';state='complete';records=@()}
 )})
 exit
}
Write-Fixture 'graph-context.json' @{tenantId=$p.tenantId;account='analyst@example.com';upn='';objectId=''}
Await-Release
# The affected account is resolved after release; a foreign tenant context must be refused by the host.
Write-Fixture 'graph-context.json' @{tenantId=$(if($p.upn -eq 'mismatch@example.com'){'wrong-tenant'}else{$p.tenantId});account='analyst@example.com';upn=$p.upn;objectId='22222222-2222-4222-8222-222222222222'}
$rows=@(@{id='fixture-1';userPrincipalName=$p.upn;createdDateTime='2026-07-01T01:00:00Z';status=@{errorCode=0}},@{id='fixture-2';userPrincipalName=$p.upn;createdDateTime='2026-07-01T02:00:00Z';status=@{errorCode=0}})
[Console]::Out.WriteLine('Synthetic PowerShell collection output <script>test</script>')
Source 'interactive' 'running' $rows
$limit=[datetime]::UtcNow.AddSeconds(50)
while(!(Test-Path (Join-Path $OutputDirectory 'advance'))) {
  if([datetime]::UtcNow -gt $limit){throw 'Fixture advance timeout'}
  Start-Sleep -Milliseconds 100
}
$rows+=@{id='fixture-3';userPrincipalName=$p.upn;createdDateTime='2026-07-01T03:00:00Z';status=@{errorCode=0}}
Source 'interactive' 'complete' $rows
Source 'audits' 'failed' @() 'Synthetic permission denial'
Source 'users' 'complete' @(@{id='22222222-2222-4222-8222-222222222222';userPrincipalName=$p.upn;displayName='Fictional account'})
