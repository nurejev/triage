# Synthetic connection orchestration fixture; no Microsoft services are contacted.
# Connect-first: the plan at start pins the tenant; the completed plan is read again after release.
param($PlanPath,$OutputDirectory,$Mode,$ModuleRoot,[switch]$WaitForCollection)
$ErrorActionPreference='Stop'
$p=Get-Content -Raw $PlanPath | ConvertFrom-Json
function Write-Fixture($Name,$Value) {
 $file=Join-Path $OutputDirectory $Name
 [IO.File]::WriteAllText(($file+'.tmp'), ($Value | ConvertTo-Json -Depth 20 -Compress))
 [IO.File]::Move(($file+'.tmp'),$file,$true)
}
Write-Fixture ($Mode+'-started.json') @{pid=$PID;at=[datetime]::UtcNow.ToString('o')}
if($Mode -eq 'exchange') {
 $limit=[datetime]::UtcNow.AddSeconds(45)
 while(!(Test-Path (Join-Path $OutputDirectory 'approve-exchange')) -and !(Test-Path (Join-Path $OutputDirectory 'deny-exchange'))) {
  if([datetime]::UtcNow -gt $limit){throw 'Fixture auth approval timeout'}
  Start-Sleep -Milliseconds 50
 }
 if(Test-Path (Join-Path $OutputDirectory 'deny-exchange')){throw 'Synthetic Exchange sign-in denied'}
}
Write-Fixture ($Mode+'-context.json') @{tenantId=$p.tenantId;account='operator@example.com';upn='';objectId=''}
[Console]::Out.WriteLine('TRIAGE_PROGRESS:'+(@{type='connected';mode=$Mode}|ConvertTo-Json -Compress))
if([Console]::In.ReadLine() -cne 'collect'){throw 'Cancelled before collection'}
$p=Get-Content -Raw $PlanPath | ConvertFrom-Json
Write-Fixture ($Mode+'-released.json') @{at=[datetime]::UtcNow.ToString('o');upn=$p.upn;sources=@($p.sources)}
Write-Fixture ($Mode+'-context.json') @{tenantId=$p.tenantId;account='operator@example.com';upn=$p.upn;objectId='22222222-2222-4222-8222-222222222222'}
$key=if($Mode -eq 'graph'){'users'}else{'exchange'}
Write-Fixture ($key+'.json') @{records=@();manifest=@{state='complete';note='Synthetic collection'}}
[Console]::Out.WriteLine('TRIAGE_PROGRESS:'+(@{source=$key;state='complete';count=0}|ConvertTo-Json -Compress))
