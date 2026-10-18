# Reviewable customer setup. This script is exported by the wizard, never run by collection.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ModuleRoot,[string]$SettingsPath=(Join-Path $PSScriptRoot 'settings.json'),[switch]$PreviewOnly)
$ErrorActionPreference='Stop'
$c=Get-Content -LiteralPath $SettingsPath -Raw|ConvertFrom-Json -AsHashtable
if($c.schema -ne 'limon.triage.registration' -or $c.schemaVersion -ne 1){throw 'Invalid setup settings'}
$tenant=([guid]$c.tenantId).ToString()
$permissions=@('User.Read.All','AuditLog.Read.All','Directory.Read.All','RoleManagement.Read.Directory','IdentityRiskyUser.Read.All','IdentityRiskEvent.Read.All','AuditLogsQuery.Read.All','UserAuthenticationMethod.Read.All','Policy.Read.All','Application.Read.All','GroupMember.Read.All','LicenseAssignment.Read.All','SecurityAlert.Read.All','SecurityEvents.Read.All','Mail.Read')
if((($c.graphPermissions|Sort-Object)-join ',') -ne (($permissions|Sort-Object)-join ',')){throw 'Unexpected Graph permission set'}
if($c.exchange -and $c.organization -notmatch '^[a-z0-9][a-z0-9-]*\.onmicrosoft\.com$'){throw 'Invalid original Exchange organization domain'}
Write-Host "Customer: $($c.name) / Tenant: $tenant"
Write-Host ('New Graph application permissions: '+($permissions -join ', '))
if($c.exchange){Write-Host 'New Exchange application permission: Exchange.ManageAsApp. Separate cmdlet-only Exchange RBAC setup is required.'}
Write-Host 'Creates new single-tenant applications, service principals, a one-year certificate and application consent. No existing app is changed. No Entra administrator role is assigned.'
Write-Host 'The setup operator needs permission to create apps and grant Graph application consent (for example Privileged Role Administrator). Bootstrap delegated scopes: Application.ReadWrite.All, AppRoleAssignment.ReadWrite.All.'
if($PreviewOnly){return}
$stateFile=Join-Path $PSScriptRoot 'registration-state.json'
if((Test-Path $stateFile) -or (Test-Path (Join-Path $PSScriptRoot 'customer.pfx'))){throw 'This setup folder has already been used. Review registration-state.json and reuse any created apps through Existing registration. Do not create duplicates blindly.'}
$env:PSModulePath=$ModuleRoot+[IO.Path]::PathSeparator+(Join-Path $PSHOME 'Modules')
Import-Module (Join-Path $ModuleRoot 'Microsoft.Graph.Authentication/2.37.0/Microsoft.Graph.Authentication.psd1') -RequiredVersion 2.37.0
function Request([string]$Method,[string]$Route,$Body=$null){
 $arg=@{Method=$Method;Uri=('https://graph.microsoft.com/v1.0/'+$Route);OutputType='Hashtable';ErrorAction='Stop'}
 if($null -ne $Body){$arg.Body=$Body|ConvertTo-Json -Depth 20 -Compress;$arg.ContentType='application/json'}
 Invoke-MgGraphRequest @arg
}
$state=@{tenantId=$tenant;createdAt=[datetime]::UtcNow.ToString('o');apps=@()}
function Save-State { $json=$state|ConvertTo-Json -Depth 20; [IO.File]::WriteAllText($stateFile+'.tmp',$json);[IO.File]::Move($stateFile+'.tmp',$stateFile,$true) }
try {
 Connect-MgGraph -TenantId $tenant -Scopes @('Application.ReadWrite.All','AppRoleAssignment.ReadWrite.All') -ContextScope Process -NoWelcome
 $context=Get-MgContext
 if($context.TenantId -ne $tenant -or $context.AuthType -ne 'Delegated'){throw 'Setup signed in to the wrong tenant or authentication mode'}
 $resources=@(@{kind='graph';id='00000003-0000-0000-c000-000000000000';permissions=$permissions})
 if($c.exchange){$resources+=@{kind='exchange';id='00000002-0000-0ff1-ce00-000000000000';permissions=@('Exchange.ManageAsApp')}}
 # Resolve every permission before making any cloud change.
 foreach($r in $resources){
  $found=Request GET ('servicePrincipals?$filter='+[uri]::EscapeDataString("appId eq '$($r.id)'")+'&$select=id,appId,appRoles')
  if(@($found.value).Count -ne 1){throw "API service principal unavailable for $($r.kind)"}
  $r.sp=$found.value[0];$r.roles=@()
  foreach($permission in $r.permissions){
   $matches=@($r.sp.appRoles|Where-Object {$_.value -eq $permission -and $_.isEnabled -and 'Application' -in $_.allowedMemberTypes})
   if($matches.Count -ne 1){throw "Application permission unavailable: $permission"}
   $r.roles+=@{id=$matches[0].id;type='Role'}
  }
 }
 if((Read-Host "To create and consent these registrations, type tenant ID $tenant") -cne $tenant){throw 'Setup cancelled; no cloud objects created'}
 $password=Read-Host 'Choose a unique PFX password (minimum 16 characters; retain in your password manager)' -AsSecureString
 if($password.Length -lt 16){throw 'PFX password must be at least 16 characters'}
 $rsa=[Security.Cryptography.RSA]::Create(3072)
 $req=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Triage customer collector',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,$true))
 $cert=$req.CreateSelfSigned([datetimeoffset]::UtcNow.AddMinutes(-5),[datetimeoffset]::UtcNow.AddYears(1))
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
 try{$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr);$pfx=$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,$plain)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$plain=$null}
 $pfxPath=Join-Path $PSScriptRoot 'customer.pfx';[IO.File]::WriteAllBytes($pfxPath,$pfx)
 if(!$IsWindows){[IO.File]::SetUnixFileMode($pfxPath,[IO.UnixFileMode]::UserRead -bor [IO.UnixFileMode]::UserWrite)}
 [IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'customer.cer'),$cert.RawData)
 Save-State
 foreach($r in $resources){
  $name='Triage '+$c.name+' '+$r.kind+' '+([guid]::NewGuid().ToString().Substring(0,8))
  $body=@{displayName=$name;signInAudience='AzureADMyOrg';keyCredentials=@(@{type='AsymmetricX509Cert';usage='Verify';key=[Convert]::ToBase64String($cert.RawData);displayName='Triage collection';startDateTime=$cert.NotBefore.ToUniversalTime().ToString('o');endDateTime=$cert.NotAfter.ToUniversalTime().ToString('o')});requiredResourceAccess=@(@{resourceAppId=$r.id;resourceAccess=$r.roles})}
  $a=Request POST 'applications' $body
  $record=@{kind=$r.kind;applicationObjectId=$a.id;appId=$a.appId;displayName=$name;consentedRoles=@()};$state.apps+=$record;Save-State
  # Creation is not blindly retried: use the state file if a network response is ambiguous.
  $sp=$null
  for($attempt=0;$attempt -lt 8;$attempt++){
   try{$sp=Request POST 'servicePrincipals' @{appId=$a.appId};break}
   catch{if($_.Exception.Message -notmatch 'does not reference a valid application object' -or $attempt -eq 7){throw};Start-Sleep -Seconds 5}
  }
  $record.servicePrincipalId=$sp.id;Save-State
  foreach($role in $r.roles){
   Request POST ('servicePrincipals/'+$r.sp.id+'/appRoleAssignedTo') @{principalId=$sp.id;resourceId=$r.sp.id;appRoleId=$role.id}|Out-Null
   $record.consentedRoles+= $role.id;Save-State
  }
 }
 $profile=@{name=$c.name;tenantId=$tenant;organization=$c.organization;graphAppId=($state.apps|Where-Object kind -eq graph).appId;exchangeAppId=''}
 if($c.exchange){$profile.exchangeAppId=($state.apps|Where-Object kind -eq exchange).appId}
 $profile|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'profile.json')
 if($c.exchange){
  # Values are read from JSON, never interpolated into executable PowerShell.
  @'
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ModuleRoot,[switch]$PreviewOnly)
$ErrorActionPreference='Stop'
$s=Get-Content (Join-Path $PSScriptRoot 'registration-state.json') -Raw|ConvertFrom-Json
$a=$s.apps|Where-Object kind -eq exchange
$commands=@('Get-Mailbox','Get-InboxRule','Get-MailboxPermission','Get-RecipientPermission','Get-MailboxFolderStatistics','Get-MailboxFolderPermission','Get-MailboxAuditBypassAssociation','Get-TransportRule','Get-MessageTraceV2','Search-UnifiedAuditLog')
Write-Host "Exchange RBAC: $($s.tenantId) / App $($a.appId)"
Write-Host ('Creates service-principal reference, custom roles containing only: '+($commands -join ', ')+', and a role group for this app. Scope: all mailboxes in this tenant. No Entra admin role.')
if($PreviewOnly){return}
Import-Module (Join-Path $ModuleRoot 'ExchangeOnlineManagement/3.10.0/ExchangeOnlineManagement.psd1') -RequiredVersion 3.10.0
try{
 $connect=@{ShowBanner=$false;DisableWAM=$true;ErrorAction='Stop'};if($IsMacOS){$connect.SkipLoadingFormatData=$true}
 Connect-ExchangeOnline @connect
 $connection=@(Get-ConnectionInformation|Where-Object State -eq Connected)
 if($connection.Count -ne 1 -or $connection[0].TenantID -ne $s.tenantId){throw 'Wrong Exchange tenant'}
 $parents=@{}
 foreach($cmd in $commands){
  $entries=@(Get-ManagementRoleEntry ('*\'+$cmd))
  foreach($e in $entries){$role=Get-ManagementRole $e.Role;if(!$role.Parent -and !$role.IsEndUserRole){$parents[$cmd]=[string]$role.Name;break}}
  if(!$parents[$cmd]){throw "No assignable parent role found for $cmd. Ask your Exchange role administrator."}
 }
 if((Read-Host 'Type the target tenant ID to configure the displayed read-command roles') -cne $s.tenantId){throw 'Cancelled'}
 $prefix='Triage-'+$a.appId.Substring(0,8)
 if(Get-RoleGroup $prefix -ErrorAction SilentlyContinue){throw 'Role group already exists. Inspect it before reusing this setup.'}
 $existing=@(Get-ServicePrincipal|Where-Object AppId -eq $a.appId)
 if(!$existing.Count){New-ServicePrincipal -AppId $a.appId -ObjectId $a.servicePrincipalId -DisplayName $a.displayName|Out-Null}
 $sp=Get-ServicePrincipal|Where-Object AppId -eq $a.appId
 if(@($sp).Count -ne 1 -or [string]$sp.ObjectId -ne [string]$a.servicePrincipalId){throw 'Exchange service-principal identity mismatch'}
 $roles=@();$i=0
 foreach($cmd in $commands){
  $name=$prefix+'-'+(++$i)
  if(Get-ManagementRole $name -ErrorAction SilentlyContinue){throw "Role $name exists. Review partial setup before proceeding."}
  New-ManagementRole -Name $name -Parent $parents[$cmd]|Out-Null
  Get-ManagementRoleEntry ($name+'\*')|Where-Object Name -ne $cmd|ForEach-Object {Remove-ManagementRoleEntry $_.Identity -Confirm:$false}
  $roles+=$name
 }
 New-RoleGroup -Name $prefix -Roles $roles|Out-Null
 Add-RoleGroupMember -Identity $prefix -Member $sp.Identity
 Write-Host 'Exchange command roles configured. Test the certificate profile in Triage and inspect each source for permission gaps.'
}finally{Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue}
'@ | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'Exchange-RBAC.ps1')
 }
 Write-Host 'Created profile.json and customer.pfx. Import the profile, choose the PFX and enter its password in Triage.'
 if($c.exchange){Write-Host 'Exchange still needs the generated Exchange-RBAC.ps1 run by an Exchange role administrator. Review it first.'}
}catch{
 Write-Warning 'Setup stopped. Any created objects are retained; inspect registration-state.json before retrying. No automatic cloud cleanup is performed.'
 throw
}finally{if($cert){$cert.Dispose()};if($rsa){$rsa.Dispose()};Disconnect-MgGraph -ErrorAction SilentlyContinue|Out-Null}
