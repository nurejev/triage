param([Parameter(Mandatory)][string]$ModuleRoot)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$bound=$null;$connected=$false;$writeReady=$false
while($null -ne ($line=[Console]::In.ReadLine())){
$request=$line|ConvertFrom-Json -AsHashtable
try{
 if($bound -and ($request.tenantId -ine $bound.tenantId -or $request.objectId -ine $bound.objectId -or $request.caseId -ine $bound.caseId -or $request.upn -ine $bound.upn)){throw 'Response context changed; reconnect explicitly'}
 Import-Module (Join-Path $ModuleRoot 'Microsoft.Graph.Authentication/2.37.0/Microsoft.Graph.Authentication.psd1')
 $scopes=@('User.Read.All','AuditLog.Read.All','Directory.Read.All','IdentityRiskyUser.Read.All','IdentityRiskEvent.Read.All','UserAuthenticationMethod.Read.All','AuditLogsQuery.Read.All')
 if($request.write){$scopes+=@('User.RevokeSessions.All','User.ReadWrite.All','User-PasswordProfile.ReadWrite.All','UserAuthenticationMethod.ReadWrite.All','DelegatedPermissionGrant.ReadWrite.All')}
 if(!$connected -or ($request.write -and !$writeReady)){
  $connected=$false
  Connect-MgGraph -TenantId $request.tenantId -Scopes $scopes -ContextScope Process -NoWelcome -ErrorAction Stop|Out-Null
  $writeReady=[bool]$request.write
 }
 $context=Get-MgContext
 if([string]$context.TenantId -ine $request.tenantId -or $context.AuthType -ne 'Delegated'){throw 'Response tenant or delegated identity mismatch'}
 if($request.operator -and [string]$context.Account -ine $request.operator){throw 'Response operator changed; reconnect explicitly'}
 $user=Invoke-MgGraphRequest -Uri ('https://graph.microsoft.com/v1.0/users/'+$request.objectId+'?$select=id,userPrincipalName') -OutputType Hashtable
 if([string]$user.id -ine $request.objectId -or [string]$user.userPrincipalName -ine $request.upn){throw 'Response account identity changed'}
 $connected=$true;$bound=$request
 if($request.connect){$result=@{account=@{tenantId=[string]$context.TenantId;username=[string]$context.Account}}}
 else{
  if($request.method -eq 'DELETE' -and $request.url -match '/oauth2PermissionGrants/'){
   $grant=Invoke-MgGraphRequest -Uri $request.url -OutputType Hashtable
   if([string]$grant.principalId -ine $request.objectId -or $grant.consentType -ne 'Principal'){throw 'Only this user-specific consent grant may be removed'}
  }
  $args=@{Uri=$request.url;Method=$request.method;OutputType='Hashtable';ErrorAction='Stop'}
  if($request.ContainsKey('body')){$args.Body=$request.body|ConvertTo-Json -Depth 40 -Compress;$args.ContentType='application/json'}
  $result=Invoke-MgGraphRequest @args
 }
 [Console]::Out.WriteLine('TRIAGE_RESPONSE:'+(@{ok=$true;value=$result}|ConvertTo-Json -Depth 80 -Compress))
}catch{[Console]::Out.WriteLine('TRIAGE_RESPONSE:'+(@{ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress));if(!$connected){break}}
}
