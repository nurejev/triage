# Fixed delegated acquisition. Input is a validated JSON plan, never command text.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PlanPath,[Parameter(Mandatory)][string]$OutputDirectory,[ValidateSet('graph','exchange')][string]$Mode,[Parameter(Mandatory)][string]$ModuleRoot,[switch]$WaitForCollection,[switch]$AppCredential)
$ErrorActionPreference='Stop'
$env:PSModulePath=$ModuleRoot+[IO.Path]::PathSeparator+(Join-Path $PSHOME 'Modules')
$ProgressPreference='SilentlyContinue'
. (Join-Path $PSScriptRoot 'extended.ps1')
$allowed=@('interactive','nonInteractive','audits','riskyUsers','riskDetections','users','servicePrincipals','oauth','devices','admins','mfa','ual','exchange')+$ExtendedKeys+$ExchangeKeys
$tenant=$null
function Read-Plan {
    # The plan is read twice: once to connect (tenant and scopes) and again after the host releases
    # collection, when Scope has completed the affected account, window and sources. The tenant never changes.
    $p=Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json -AsHashtable
    if ($p.schema -ne 'limon.triage.plan' -or $p.schemaVersion -ne 1 -or $p.sources.Count -eq 0) { throw 'Invalid collection plan' }
    $t=([guid]$p.tenantId).ToString()
    if ($script:tenant -and $t -ne $script:tenant) { throw 'The collection plan changed tenant after the connection was made' }
    foreach($key in $p.sources){if($key -notin $allowed){throw 'Unsupported source'}}
    if ($p.scope -notin @('user','tenant')) { throw 'Invalid scope' }
    $u=[string]$p.upn
    if ($p.scope -eq 'user' -and $u -notmatch '^[^\s@''<>]+@[^\s@''<>]+\.[^\s@''<>]+$') { throw 'Invalid affected account' }
    $s=([datetime]$p.window.start).ToUniversalTime().ToString('o')
    $e=([datetime]$p.window.end).ToUniversalTime().ToString('o')
    if(([datetime]$e -le [datetime]$s) -or (([datetime]$e-[datetime]$s).TotalDays -gt 180)){throw 'Invalid collection interval'}
    $script:plan=$p;$script:tenant=$t;$script:upn=$u;$script:start=$s;$script:end=$e
}
Read-Plan
function Write-Json([string]$Name,$Value){
    $file=Join-Path $OutputDirectory $Name
    $json=ConvertTo-Json -InputObject $Value -Depth 80 -Compress
    [IO.File]::WriteAllText($file+'.tmp',$json,[Text.UTF8Encoding]::new($false))
    [IO.File]::Move($file+'.tmp',$file,$true)
}
function Progress([string]$Key,[string]$State,[int]$Count=0){[Console]::Out.WriteLine('TRIAGE_PROGRESS:'+(@{source=$Key;state=$State;count=$Count}|ConvertTo-Json -Compress))}
function Save-Source([string]$Key,$Records,$Manifest){Write-Json ($Key+'.json') @{records=@($Records);manifest=$Manifest};Progress $Key $Manifest.state @($Records).Count}
function Await-Collection {
    if($WaitForCollection){
        [Console]::Out.WriteLine('TRIAGE_PROGRESS:'+(@{type='connected';mode=$Mode}|ConvertTo-Json -Compress))
        # Keep this module's delegated session in memory until the host releases collection.
        if([Console]::In.ReadLine() -cne 'collect'){throw 'Connection setup cancelled before collection'}
    }
    # Scope may have changed the affected account, window and sources while this session waited.
    Read-Plan
}
function Graph-Request([string]$Url,[string]$Method='GET',$Body=$null){
    if($script:graphReconnectRequired){throw $script:graphReconnectRequired}
    $uri=[uri]$Url
    if($uri.Scheme -ne 'https' -or $uri.Host -ne 'graph.microsoft.com' -or $uri.AbsolutePath -notmatch '^/(v1\.0|beta)/'){throw 'Untrusted Graph continuation URL'}
    for($attempt=0;$attempt -lt 4;$attempt++){
        try {if($Method -eq 'POST'){return Invoke-MgGraphRequest -Method POST -Uri $uri.AbsoluteUri -Body ($Body|ConvertTo-Json -Depth 8 -Compress) -ContentType 'application/json' -OutputType Hashtable -ErrorAction Stop};return Invoke-MgGraphRequest -Method GET -Uri $uri.AbsoluteUri -OutputType Hashtable -ErrorAction Stop}
        catch{
            $failureRecord=$_
            if($attempt -ge 3 -or $failureRecord.Exception.Message -notmatch '429|503|504'){
                # Surface Graph's own error body (code + message) and the request, not just the HTTP status.
                $detail=[string]$failureRecord.ErrorDetails.Message
                if(!$detail -and $failureRecord.Exception.Response){try{$detail=$failureRecord.Exception.Response.Content.ReadAsStringAsync().Result}catch{}}
                $graphError=''
                if($detail){
                    # The SDK can prefix the JSON with the full request and response headers.
                    # Read the error body before shortening anything, or a long mail query hides it.
                    $bodyMatch=[regex]::Match($detail,'(?s)\{\s*"error"\s*:.*\}\s*$')
                    $json=if($bodyMatch.Success){$bodyMatch.Value}else{$detail}
                    try{
                        $j=$json|ConvertFrom-Json -ErrorAction Stop
                        if($j.error.code -or $j.error.message){
                            $graphError=([string]$j.error.code+': '+[string]$j.error.message).Trim(': ')
                            if($j.error.innerError.'request-id'){$graphError+=' (request-id: '+[string]$j.error.innerError.'request-id'+')'}
                        }
                    }catch{}
                    if(!$graphError){$graphError=$detail.Substring(0,[math]::Min(400,$detail.Length))}
                }
                $failure=$failureRecord.Exception.Message+$(if($graphError){' — '+$graphError})+' ['+$Method+' '+$uri.AbsolutePath+']'
                if($failure -match 'interaction_required|MsalUiRequired|AADSTS50076|AADSTS50079|invalid_grant|\b401\b|Unauthorized'){
                    $script:graphReconnectRequired='Reconnect required: this Graph session can no longer continue silently. Stop this scan and reconnect explicitly. '+$failure
                    throw $script:graphReconnectRequired
                }
                throw $failure
            }
            Start-Sleep -Seconds ([math]::Min(60,[math]::Pow(2,$attempt+2)))
        }
    }
}
function Query([string]$Path,[string]$Filter=''){return 'https://graph.microsoft.com/'+$Path+$(if($Filter){$(if($Path.Contains('?')){'&'}else{'?'})+'$filter='+[uri]::EscapeDataString($Filter)})}
function Read-Pages([string]$Key,[string[]]$Urls,$Metadata=@{},[switch]$SingleUserReport){
    $rows=[Collections.Generic.List[object]]::new();$queryIndex=0;$next=$Urls[0];$query=$Urls -join "`n";$pages=0;$seen=[Collections.Generic.HashSet[string]]::new();$started=[datetime]::UtcNow.ToString('o')
    try{
        while($next){
            if(!$seen.Add($next)){throw 'Repeated continuation URL'}
            $result=Graph-Request $next
            if($SingleUserReport){
                if([string]$result.id -ne $id){throw 'Single-object response does not match the affected account'}
                $result=@{value=@($result)}
            }
            if(!$result.ContainsKey('value')){throw 'Graph collection response has no value array'}
            foreach($row in @($result.value)){if($Key -eq 'admins' -and ($row.roleEligibilityScheduleId -or $row.roleAssignmentScheduleId)){$row.kind='eligible'};$rows.Add($row)}
            $next=[string]$result.'@odata.nextLink';$pages++
            if(!$next){$queryIndex++;if($queryIndex -lt $Urls.Count){$next=$Urls[$queryIndex]}}
            Save-Source $Key $rows.ToArray() (@{state='running';startedAt=$started;pages=$pages;nextLink=$next;query=$query;queryIndex=$queryIndex}+ $Metadata)
        }
        $manifest=@{state=$(if($next){'partial'}else{'complete'});startedAt=$started;completedAt=[datetime]::UtcNow.ToString('o');pages=$pages;nextLink=$next;query=$query;queryIndex=$queryIndex;note='API-returned records; tenant retention applies. Inventory sources are current-state snapshots.'}+$Metadata
        Save-Source $Key $rows.ToArray() $manifest
    }catch{Save-Source $Key $rows.ToArray() (@{state=$(if($rows.Count){'partial'}elseif($_.Exception.Message -match '403|Forbidden|Reconnect required'){'unavailable'}else{'failed'});startedAt=$started;completedAt=[datetime]::UtcNow.ToString('o');pages=$pages;nextLink=$next;query=$query;queryIndex=$queryIndex;error=$_.Exception.Message}+$Metadata)}
}
function Connection-Stage([string]$Text){[Console]::Out.WriteLine('TRIAGE_PROGRESS:'+(@{type='connection-stage';mode=$Mode;stage=$Text}|ConvertTo-Json -Compress))}
$auth=$null;$cert=$null
try{
 if($AppCredential){
    $auth=[Console]::In.ReadLine()|ConvertFrom-Json -AsHashtable
    if([string]$auth.tenantId -ine $tenant){throw 'Certificate profile tenant mismatch'}
    . (Join-Path $PSScriptRoot 'certificate.ps1')
    Connection-Stage 'Checking customer certificate'
    $cert=Read-TriageCertificate $auth
 }
 Connection-Stage 'Loading connection module'
 if($Mode -eq 'graph'){
    Import-Module (Join-Path $ModuleRoot 'Microsoft.Graph.Authentication/2.37.0/Microsoft.Graph.Authentication.psd1') -RequiredVersion 2.37.0
    Connection-Stage $(if($auth){'Authenticating application with certificate'}else{'Waiting for Microsoft browser sign-in and callback'})
    if($auth){Connect-MgGraph -TenantId $tenant -ClientId ([guid]$auth.graphAppId).ToString() -Certificate $cert -ContextScope Process -NoWelcome -ErrorAction Stop | Out-Null}
    # One in-memory Graph session for this entire acquisition. Do not open the OS token cache per request.
    else{
      $scopes=@('User.Read.All','AuditLog.Read.All','Directory.Read.All','RoleManagement.Read.Directory','IdentityRiskyUser.Read.All','IdentityRiskEvent.Read.All','UserAuthenticationMethod.Read.All','AuditLogsQuery.Read.All')
      $extra=@{conditionalAccess='Policy.Read.All';securityDefaults='Policy.Read.All';applications='Application.Read.All';applicationPermissions='Application.Read.All';groups='GroupMember.Read.All';groupMembers='GroupMember.Read.All';licenses='LicenseAssignment.Read.All';userLicenses='LicenseAssignment.Read.All';securityAlerts='SecurityAlert.Read.All';secureScore='SecurityEvents.Read.All';messages='Mail.Read.Shared';attachments='Mail.Read.Shared'}
      foreach($source in $plan.sources){if($extra.ContainsKey($source)){$scopes+=$extra[$source]}}
      Connect-MgGraph -TenantId $tenant -Scopes @($scopes|Select-Object -Unique) -ContextScope Process -NoWelcome -ErrorAction Stop | Out-Null}
    $context=Get-MgContext
    if($context.TenantId -ne $tenant){throw 'The Graph session does not match the target tenant'}
    if($auth){if($context.AuthType -ne 'AppOnly' -or [string]$context.ClientId -ine $auth.graphAppId){throw 'The Graph application identity does not match the profile'}}
    elseif($context.AuthType -ne 'Delegated'){throw 'Expected delegated Graph authentication'}
    Connection-Stage 'Verifying tenant'
    $graphAccount=$(if($auth){'App '+$auth.graphAppId}else{[string]$context.Account})
    $graphContext=@{tenantId=$tenant;account=$graphAccount;objectId='';upn='';authType=[string]$context.AuthType;appId=$(if($auth){[string]$auth.graphAppId}else{''})}
    Write-Json 'graph-context.json' $graphContext
    Await-Collection
    Connection-Stage 'Verifying affected account'
    $subject=$null;$id=''
    if($plan.scope -eq 'user'){
        # signInActivity cannot be selected when a user is addressed by UPN (Graph returns 400); the users source reads it by object ID.
        $subject=Graph-Request ('https://graph.microsoft.com/v1.0/users/'+[uri]::EscapeDataString($upn)+'?$select=id,userPrincipalName,displayName')
        $id=([guid]$subject.id).ToString();$upn=[string]$subject.userPrincipalName
    }
    $graphContext.objectId=$id;$graphContext.upn=$upn
    Write-Json 'graph-context.json' $graphContext
    if(@($plan.sources|Where-Object {$_ -in @('azureActivity','azureDirectoryActivity')}).Count){
        Connection-Stage 'Connecting optional Azure sources before collection'
        try{Initialize-AzureEvidence}catch{$script:azureConnectionError=$_.Exception.Message;Connection-Stage ('Azure connection unavailable; continuing other sources: '+$script:azureConnectionError)}
    }
    $time="createdDateTime ge $start and createdDateTime le $end"
    $userFilter=if($id){" and userId eq '$id'"}else{''}
    $urls=@{
        interactive=(Query 'beta/auditLogs/signIns?$top=1000' "$time and signInEventTypes/any(t:t eq 'interactiveUser')$userFilter")
        nonInteractive=$(if($id){Query 'beta/auditLogs/signIns?$top=1000' "$time and signInEventTypes/any(t:t eq 'nonInteractiveUser')$userFilter"}else{@((Query 'beta/auditLogs/signIns?$top=1000' "$time and signInEventTypes/any(t:t eq 'nonInteractiveUser')"),(Query 'beta/auditLogs/signIns?$top=1000' "$time and signInEventTypes/any(t:t eq 'servicePrincipal')"))})
        audits=(Query 'v1.0/auditLogs/directoryAudits?$top=1000' ("activityDateTime ge $start and activityDateTime le $end"+$(if($id){" and (targetResources/any(t:t/id eq '$id') or initiatedBy/user/id eq '$id')"})))
        riskyUsers=(Query 'v1.0/identityProtection/riskyUsers?$top=500' $(if($id){"id eq '$id'"}else{''}))
        riskDetections=(Query 'v1.0/identityProtection/riskDetections?$top=500' "detectedDateTime ge $start and detectedDateTime le $end$userFilter")
        users=$(if($id){'https://graph.microsoft.com/v1.0/users/'+$id+'?$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastPasswordChangeDateTime,signInActivity'}else{Query 'v1.0/users?$top=999&$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastPasswordChangeDateTime,signInActivity'})
        servicePrincipals=(Query 'v1.0/servicePrincipals?$top=999')
        oauth=$(if($id){@((Query 'v1.0/oauth2PermissionGrants?$top=500' "principalId eq '$id'"),(Query 'v1.0/oauth2PermissionGrants?$top=500' "consentType eq 'AllPrincipals'"))}else{Query 'v1.0/oauth2PermissionGrants?$top=500'})
        devices=$(if($id){Query ('v1.0/users/'+$id+'/registeredDevices')}else{Query 'v1.0/devices?$top=999'})
        admins=@((Query 'v1.0/roleManagement/directory/roleAssignments?$expand=roleDefinition' $(if($id){"principalId eq '$id'"}else{''})),(Query 'v1.0/roleManagement/directory/roleEligibilityScheduleInstances?$expand=roleDefinition' $(if($id){"principalId eq '$id'"}else{''})))
        mfa=$(if($id){Query ('v1.0/reports/authenticationMethods/userRegistrationDetails/'+$id)}else{Query 'v1.0/reports/authenticationMethods/userRegistrationDetails?$top=500'})
    }
    foreach($key in $plan.sources){
        if($key -in $ExchangeKeys){continue}
        if($key -in $ExtendedKeys){Read-Extended $key;continue}
        Progress $key 'running'
        if($key -ne 'ual'){Read-Pages $key $urls[$key] -SingleUserReport:(($key -eq 'mfa' -or $key -eq 'users') -and [bool]$id);continue}
        $jobId=$null
        try{
            $body=@{displayName='Triage '+$plan.caseId;filterStartDateTime=$start;filterEndDateTime=$end}
            if($id){$body.userPrincipalNameFilters=@($upn);$body.objectIdFilters=@($id)}
            $job=Graph-Request 'https://graph.microsoft.com/v1.0/security/auditLog/queries' 'POST' $body
            $jobId=[string]$job.id
            if($jobId -notmatch '^[a-zA-Z0-9-]+$'){throw 'Invalid audit query ID'}
            $base='https://graph.microsoft.com/v1.0/security/auditLog/queries/'+$jobId
            Save-Source 'ual' @() @{state='running';queryId=$jobId;query=$base;note='Audit query pending'}
            $ready=$false
            for($poll=0;$poll -lt 120;$poll++){
                $job=Graph-Request $base
                if($job.status -eq 'succeeded'){$ready=$true;break}
                if($job.status -in @('failed','cancelled')){throw ('Audit query '+$job.status)}
                Start-Sleep -Seconds 5
            }
            if($ready){Read-Pages 'ual' ($base+'/records?$top=1000') @{queryId=$jobId}}
            else {Save-Source 'ual' @() @{state='partial';queryId=$jobId;query=$base;error='Audit query still pending after ten minutes. Query ID preserved for follow-up.'}}
        }catch{Save-Source 'ual' @() @{state='failed';queryId=$jobId;error=$_.Exception.Message}}
    }
 }else{
    
    Import-Module (Join-Path $ModuleRoot 'ExchangeOnlineManagement/3.10.0/ExchangeOnlineManagement.psd1') -RequiredVersion 3.10.0
    $commands=@('Get-Mailbox','Get-InboxRule','Get-MailboxPermission','Get-RecipientPermission','Get-MailboxFolderStatistics','Get-MailboxFolderPermission','Get-MailboxAuditBypassAssociation','Get-TransportRule','Get-MessageTraceV2','Search-UnifiedAuditLog')
    $graphContextFile=Join-Path $OutputDirectory 'graph-context.json'
    $g=$null;$connect=@{ShowBanner=$false;DisableWAM=$true;CommandName=$commands;ErrorAction='Stop'}
    if(Test-Path $graphContextFile){
        $g=Get-Content -LiteralPath $graphContextFile -Raw|ConvertFrom-Json
        if([string]$g.tenantId -ine $tenant){throw 'Graph sign-in context does not match the target tenant'}
        # Leave UserPrincipalName unset so Microsoft presents its full sign-in chooser.
        # Verify the operator after authentication instead of forcing a username-first flow.
    }
    if($auth){$connect.AppId=([guid]$auth.exchangeAppId).ToString();$connect.Certificate=$cert;$connect.Organization=[string]$auth.organization}
    if($IsMacOS){$connect.SkipLoadingFormatData=$true}
    Connection-Stage $(if($auth){'Authenticating application with certificate'}else{'Waiting for Microsoft browser sign-in and callback'})
    try{Connect-ExchangeOnline @connect | Out-Null}
    catch{
        if($auth -and $_.Exception.Message -match "role assigned to application"){throw ("The customer application has no Exchange RBAC assignment yet. Run Exchange-RBAC.ps1 from the registration setup folder (creates a read-only role group for the app), or assign the app the Exchange Recipient Administrator or Global Reader role in Entra. Original error: "+$_.Exception.Message)}
        throw
    }
    Connection-Stage 'Verifying tenant and operator'
    $connections=@(Get-ConnectionInformation | Where-Object {$_.State -eq 'Connected'})
    if($connections.Count -ne 1){throw ('Expected one Exchange connection, found '+$connections.Count)}
    $sessionTenant=[string]$connections[0].TenantID
    # App-only sessions report TenantID as the organization domain (customer.onmicrosoft.com), not the GUID;
    # in that case the domain the session opened is the identity to verify against the profile.
    $isGuid=$sessionTenant -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if($auth -and !$isGuid){
        $org=$(if($sessionTenant){$sessionTenant}else{[string]$connections[0].Organization})
        if($org -and $org -ine [string]$auth.organization){throw ('The Exchange session opened for '+$org+', not the profile organization '+$auth.organization)}
    }
    elseif($isGuid -and $sessionTenant -ine $tenant){throw ('The Exchange session belongs to tenant '+$sessionTenant+$(if($auth){' (organization '+[string]$auth.organization+')'}else{' (signed in as '+[string]$connections[0].UserPrincipalName+')'})+', not the target tenant '+$tenant+'. Check the tenant ID in the plan'+$(if($auth){' and the onmicrosoft.com domain in the customer profile.'}else{' and sign in with an account in that tenant.'}))}
    if($auth -and (!$connections[0].CertificateAuthentication -or [string]$connections[0].AppId -ine $auth.exchangeAppId)){throw 'The Exchange application identity does not match the profile'}
    if(!$auth -and $connections[0].CertificateAuthentication){throw 'Expected delegated Exchange authentication'}
    if(!$auth -and $g.account -and [string]$connections[0].UserPrincipalName -ine [string]$g.account){throw 'Exchange signed in with a different operator account than Microsoft Graph'}
    $exchangeContext=@{tenantId=$tenant;account=$(if($auth){'App '+$auth.exchangeAppId}else{[string]$connections[0].UserPrincipalName});objectId='';upn='';authType=$(if($auth){'AppOnly'}else{'Delegated'});appId=$(if($auth){$auth.exchangeAppId}else{''})}
    Write-Json 'exchange-context.json' $exchangeContext
    Await-Collection
    Connection-Stage 'Verifying mailbox identity'
    $mailboxes=@();$objectId=''
    if($plan.scope -eq 'user'){
        $mb=Get-Mailbox -Identity $upn -ErrorAction Stop
        $objectId=([guid]$mb.ExternalDirectoryObjectId).ToString()
        if([string]$mb.UserPrincipalName -ine $upn){throw 'Mailbox UPN mismatch'}
        # The Graph worker resolves the same account after release; compare when its context already carries the object ID.
        if(Test-Path $graphContextFile){$g=Get-Content -LiteralPath $graphContextFile -Raw|ConvertFrom-Json;if($g.objectId -and $g.objectId -ne $objectId){throw 'Mailbox identity differs from Graph subject'}}
        $mailboxes=@($mb)
    }
    $exchangeContext.objectId=$objectId;$exchangeContext.upn=$upn
    Write-Json 'exchange-context.json' $exchangeContext
    if($plan.scope -eq 'tenant' -and ($plan.sources -contains 'exchange' -or $plan.sources -contains 'mailboxAudit')){$mailboxes=@(Get-Mailbox -ResultSize Unlimited -ErrorAction Stop)}
    . (Join-Path $PSScriptRoot 'exchange-extra.ps1')
    foreach($key in $plan.sources){if($key -in @('transportRules','messageTrace','adminAudit','mailboxAudit')){Read-ExchangeEvidence $key}}
    $snapshots=[Collections.Generic.List[object]]::new()
    if($plan.sources -contains 'exchange'){foreach($mb in $mailboxes){
    $upn=[string]$mb.UserPrincipalName;$objectId=[string]$mb.ExternalDirectoryObjectId
    $parts=[Collections.Generic.List[object]]::new()
    $captured=[datetime]::UtcNow.ToString('o')
    function Add-MailboxSource([string]$Key,[string]$Command,[scriptblock]$Read){
        $started=[datetime]::UtcNow.ToString('o');$records=[Collections.Generic.List[object]]::new()
        try{& $Read | ForEach-Object {$records.Add($_)};$state='complete';$errorText=$null}
        catch{$state=if($records.Count){'partial'}else{'failed'};$errorText=$_.Exception.Message}
        $parts.Add(@{key=$Key;command=$Command;state=$state;records=@($records.ToArray());startedAt=$started;completedAt=[datetime]::UtcNow.ToString('o');error=$errorText})
        $snapshot=@{schema='limon.triage.exchange';schemaVersion=1;tenantId=$tenant;objectId=$objectId;upn=$upn;capturedAt=$captured;moduleVersion='3.10.0';powerShellVersion=$PSVersionTable.PSVersion.ToString();sources=@($parts.ToArray())}
        Save-Source 'exchange' (@($snapshots.ToArray())+@($snapshot)) @{state='running';startedAt=$captured;note='Mailbox acquisition checkpoint; inspect sub-source states'}
    }
    Add-MailboxSource 'mailbox' 'Get-Mailbox' {$mb | Select-Object ExternalDirectoryObjectId,UserPrincipalName,PrimarySmtpAddress,DisplayName,ExchangeGuid,RecipientTypeDetails,ForwardingAddress,ForwardingSmtpAddress,DeliverToMailboxAndForward,GrantSendOnBehalfTo,AuditEnabled,DefaultAuditSet,AuditAdmin,AuditDelegate,AuditOwner,AuditLogAgeLimit}
    Add-MailboxSource 'rules' 'Get-InboxRule -IncludeHidden' {Get-InboxRule -Mailbox $upn -IncludeHidden -ErrorAction Stop | Select-Object *}
    Add-MailboxSource 'fullAccess' 'Get-MailboxPermission' {Get-MailboxPermission -Identity $upn -ErrorAction Stop | Select-Object Identity,User,AccessRights,IsInherited,Deny}
    Add-MailboxSource 'sendAs' 'Get-RecipientPermission' {Get-RecipientPermission -Identity $upn -ErrorAction Stop | Select-Object Identity,Trustee,AccessRights,IsInherited,Deny}
    Add-MailboxSource 'sendOnBehalf' 'Get-Mailbox.GrantSendOnBehalfTo' {foreach($d in @($mb.GrantSendOnBehalfTo)){@{delegate=[string]$d}}}
    Add-MailboxSource 'auditBypass' 'Get-MailboxAuditBypassAssociation' {Get-MailboxAuditBypassAssociation -Identity $upn -ErrorAction Stop | Select-Object Identity,AuditBypassEnabled}
    Add-MailboxSource 'folderPermissions' 'Get-MailboxFolderStatistics; Get-MailboxFolderPermission' {
        $folders=@(Get-MailboxFolderStatistics -Identity $upn -ErrorAction Stop)
        
        # Address folders by FolderId (as Microsoft-Analyzer-Suite does): the root 'Top of Information Store'
        # and folders with '/' in their names cannot be addressed by path. A folder that refuses the read
        # (system folders, Recoverable Items) is recorded as a row with an error instead of aborting the inventory.
        foreach($folder in $folders){
            $folderPath=[string]$folder.FolderPath
            if($folder.FolderType -in @('Root','RecoverableItemsRoot','RecoverableItemsDeletions','RecoverableItemsPurges','RecoverableItemsVersions','RecoverableItemsDiscoveryHolds','Audits','CalendarLogging','SyncIssues','Conflicts','LocalFailures','ServerFailures')){continue}
            try{Get-MailboxFolderPermission -Identity ("${upn}:"+$folder.FolderId) -ErrorAction Stop | Select-Object @{n='FolderPath';e={$folderPath}},@{n='FolderType';e={[string]$folder.FolderType}},User,AccessRights,SharingPermissionFlags}
            catch{[pscustomobject]@{FolderPath=$folderPath;FolderType=[string]$folder.FolderType;User=$null;AccessRights=$null;SharingPermissionFlags=$null;Error=$_.Exception.Message}}
        }
    }
    $saved=Get-Content (Join-Path $OutputDirectory 'exchange.json') -Raw|ConvertFrom-Json -AsHashtable
    $saved.manifest.state=if(@($saved.records|ForEach-Object {$_.sources}|Where-Object {$_.state -ne 'complete'}).Count){'partial'}else{'complete'}
    $saved.manifest.completedAt=[datetime]::UtcNow.ToString('o');$saved.manifest.note='Current mailbox snapshot; inspect individual command states.'
    if($saved.manifest.state -eq 'partial'){
        $failed=@($saved.records|ForEach-Object {$_.sources}|Where-Object {$_.state -ne 'complete'}|ForEach-Object {$_.key+' ('+$_.command+'): '+$_.error})
        $saved.manifest.error='Mailbox commands that did not complete — '+($failed -join ' | ')
    }
    $snapshots.Clear();foreach($snapshot in $saved.records){$snapshots.Add($snapshot)}
    Save-Source 'exchange' $saved.records $saved.manifest
    }}
 }
 }catch{
 $detail=$_.Exception.Message
 if($auth){
  $hint=if($detail -match 'AADSTS700016|Application.*not found'){'Application ID was not found in the selected tenant. Check the profile tenant, the Application (client) ID (not Object ID), and the enterprise application in that tenant.'}
  elseif($detail -match 'AADSTS700027|AADSTS7000215|invalid_client|certificate.*not.*registered'){'Application certificate authentication failed. Check that this PFX matches a currently valid public certificate uploaded to this application registration.'}
  elseif($detail -match '403|Forbidden|Authorization_RequestDenied'){'Authentication or source access was denied. Verify admin consent for APPLICATION permissions and the service-specific Exchange/Azure access scope.'}
  elseif($detail -match '404|NotFound|not found|does not exist'){'The selected account or service resource could not be resolved. Verify the tenant, affected UPN, mailbox existence and application access scope.'}
  else{'Check the customer profile tenant, application IDs, certificate and service permissions. No delegated fallback was attempted.'}
  [Console]::Error.WriteLine(('Application connection ['+$Mode+']: '+$hint+' Original error: '+$detail))
 }else{[Console]::Error.WriteLine($detail)}
 exit 1
}
finally{if($script:azureReady){try{Disconnect-AzAccount -Scope Process -ErrorAction SilentlyContinue|Out-Null}catch{}};if($cert){$cert.Dispose()};if($Mode -eq 'graph'){try{Disconnect-MgGraph -ErrorAction SilentlyContinue|Out-Null}catch{}}else{try{Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue|Out-Null}catch{}}}
