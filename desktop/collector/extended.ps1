# Additional acquisition routes. Called only after the parent verifies the target tenant.
$ExchangeKeys=@('exchange','transportRules','messageTrace','adminAudit','mailboxAudit')
$ExtendedKeys=@('managedIdentity','applications','applicationPermissions','authenticationMethods','conditionalAccess','securityDefaults','groups','groupMembers','licenses','userLicenses','roleSchedules','securityAlerts','secureScore','messages','attachments','azureActivity','azureDirectoryActivity')
function Read-AllGraph([string]$Url) {
    $seen=[Collections.Generic.HashSet[string]]::new()
    while($Url){
        if(!$seen.Add($Url)){throw 'Microsoft returned a repeated continuation URL'}
        $r=Graph-Request $Url
        if($r.ContainsKey('value')){foreach($row in $r.value){$row};$Url=[string]$r.'@odata.nextLink'}else{$r;$Url=$null}
    }
}
$script:mailboxFailures=@{}
function Mailbox-AccessGuidance {
    if($auth){return 'Application access: check Microsoft Graph application Mail.Read consent and that Exchange application access policies or RBAC allow this target mailbox. Exchange.ManageAsApp alone does not grant Graph mail access.'}
    return 'Delegated access: Mail.Read.Shared requires the signed-in account to have existing access to the target mailbox. Seeing the mailbox in Exchange admin center, or holding an administrator role, does not grant access to its email content. Use existing mailbox delegation or an approved application with Mail.Read and access to this mailbox.'
}
function Read-MailMessages($User,[string]$Url){
    $key=[string]$User.id
    if($script:mailboxFailures.ContainsKey($key)){throw $script:mailboxFailures[$key]}
    try{Read-AllGraph $Url}
    catch{
        $detail=$_.Exception.Message
        if($detail -match '404|NotFound|Not Found|MailboxNotEnabledForRESTAPI|MailboxNotSupportedForRESTAPI'){
            $connection=if($auth){'Application '+$auth.graphAppId}else{'Signed-in account '+$context.Account}
            $detail='Mailbox unavailable to this connection: Microsoft Graph could not read email for '+$User.userPrincipalName+' ('+$key+'). This does not establish that the mailbox is missing or empty. '+(Mailbox-AccessGuidance)+' Verify the target account and active Exchange Online mailbox in tenant '+$tenant+'. '+$connection+'. Original error: '+$detail
            $script:mailboxFailures[$key]=$detail
        }elseif($detail -match '403|Forbidden'){$script:mailboxFailures[$key]=$detail}
        throw $detail
    }
}
function Read-Extended([string]$Key){
    $rows=[Collections.Generic.List[object]]::new();$errors=[Collections.Generic.List[string]]::new();$began=[datetime]::UtcNow.ToString('o')
    function Add-Rows([scriptblock]$Read){
        try{& $Read | ForEach-Object {$rows.Add($_)}; Save-Source $Key $rows.ToArray() @{state='running';startedAt=$began;note='Portable full collection; tenant-context sources retain their scope'}}
        catch{
          $msg=$_.Exception.Message
          if($Key -in @('messages','attachments') -and $msg -match '403|Forbidden'){
            $msg='Mailbox access denied. '+(Mailbox-AccessGuidance)+' Original error: '+$msg
          }
          $errors.Add($msg)
        }
    }
    $base='https://graph.microsoft.com/v1.0'
    $allUsers={if($id){@{id=$id;userPrincipalName=$upn}}else{Read-AllGraph ($base+'/users?$select=id,userPrincipalName&$top=999')}}
    switch($Key){
        managedIdentity {Add-Rows {Read-AllGraph (Query 'beta/auditLogs/signIns?$top=1000' "$time and signInEventTypes/any(t:t eq 'managedIdentity')")}}
        applications {Add-Rows {Read-AllGraph ($base+'/applications?$top=999')}}
        applicationPermissions {
            Add-Rows {foreach($sp in (Read-AllGraph ($base+'/servicePrincipals?$top=999'))){
                foreach($grant in (Read-AllGraph ($base+'/servicePrincipals/'+$sp.id+'/appRoleAssignments'))){$grant.clientDisplayName=$sp.displayName;$grant.clientAppId=$sp.appId;$grant.scope='tenant';$grant}
            }}
        }
        authenticationMethods {Add-Rows {foreach($u in (& $allUsers)){foreach($m in (Read-AllGraph ($base+'/users/'+$u.id+'/authentication/methods'))){$m.userId=$u.id;$m.userPrincipalName=$u.userPrincipalName;$m}}}}
        conditionalAccess {Add-Rows {Read-AllGraph ($base+'/identity/conditionalAccess/policies')}}
        securityDefaults {Add-Rows {Read-AllGraph ($base+'/policies/identitySecurityDefaultsEnforcementPolicy')}}
        groups {Add-Rows {Read-AllGraph ($base+'/groups?$top=999&$select=id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule,membershipRuleProcessingState,isAssignableToRole,createdDateTime')}}
        groupMembers {Add-Rows {foreach($g in (Read-AllGraph ($base+'/groups?$select=id,displayName&$top=999'))){foreach($m in (Read-AllGraph ($base+'/groups/'+$g.id+'/members'))){$m.groupId=$g.id;$m.groupDisplayName=$g.displayName;$m}}}}
        licenses {Add-Rows {Read-AllGraph ($base+'/subscribedSkus')}}
        userLicenses {Add-Rows {foreach($u in (& $allUsers)){foreach($l in (Read-AllGraph ($base+'/users/'+$u.id+'/licenseDetails'))){$l.userPrincipalName=$u.userPrincipalName;$l}}}}
        roleSchedules {Add-Rows {foreach($type in @('roleAssignmentScheduleInstances','roleEligibilityScheduleInstances')){foreach($r in (Read-AllGraph (Query ('v1.0/roleManagement/directory/'+$type+'?$expand=roleDefinition') $(if($id){"principalId eq '$id'"}else{''})))){$r.scheduleType=$type;$r}}}}
        securityAlerts {Add-Rows {Read-AllGraph (Query 'v1.0/security/alerts_v2' "createdDateTime ge $start and createdDateTime le $end")}}
        secureScore {Add-Rows {Read-AllGraph ($base+'/security/secureScores');Read-AllGraph ($base+'/security/secureScoreControlProfiles')}}
        {$_ -in @('messages','attachments')} {
            # Preserve bodies, headers and nested attachment payloads; no browser mail scopes are added.
            foreach($u in (& $allUsers)){
                Add-Rows {
                    $url=Query ('v1.0/users/'+$u.id+'/messages?$top=100&$select=id,internetMessageId,subject,from,sender,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,sentDateTime,createdDateTime,lastModifiedDateTime,parentFolderId,conversationId,body,bodyPreview,internetMessageHeaders,hasAttachments,isRead,importance') "receivedDateTime ge $start and receivedDateTime le $end"
                    foreach($m in (Read-MailMessages $u $url)){
                        if($Key -eq 'messages'){$m.userPrincipalName=$u.userPrincipalName;$m}
                        elseif($m.hasAttachments){foreach($a in (Read-AllGraph ($base+'/users/'+$u.id+'/messages/'+[uri]::EscapeDataString($m.id)+'/attachments'))){$a.messageId=$m.id;$a.userPrincipalName=$u.userPrincipalName;$a}}
                    }
                }
            }
        }
        {$_ -in @('azureActivity','azureDirectoryActivity')} {Add-Rows {Read-AzureEvidence $Key}}
    }
    $state=if($errors.Count){if($rows.Count){'partial'}elseif(($errors -join ' ') -match '403|Forbidden|access denied|Mailbox unavailable|Azure connection unavailable|Reconnect required'){'unavailable'}else{'failed'}}else{'complete'}
    Save-Source $Key $rows.ToArray() @{state=$state;startedAt=$began;completedAt=[datetime]::UtcNow.ToString('o');error=($errors -join ' | ');note='Portable collection. Configuration and tenant-context sources are current snapshots; event sources use the requested UTC window.'}
}
function Initialize-AzureEvidence {
    Import-Module (Join-Path $ModuleRoot 'Az.Accounts/5.3.3/Az.Accounts.psd1') -ErrorAction Stop
    if($script:azureAttempted){if(!$script:azureReady){throw 'Azure connection unavailable. Reconnect explicitly before running Azure sources.'};return}
    $script:azureAttempted=$true
    if(!$script:azureReady){
        Disable-AzContextAutosave -Scope Process|Out-Null
        if($auth){
            $temp=[IO.Path]::GetTempFileName()
            try{
                [IO.File]::WriteAllBytes($temp,[Convert]::FromBase64String($auth.pfx))
                if(!$IsWindows){[IO.File]::SetUnixFileMode($temp,[IO.UnixFileMode]::UserRead -bor [IO.UnixFileMode]::UserWrite)}
                Connect-AzAccount -ServicePrincipal -ApplicationId $auth.graphAppId -Tenant $tenant -CertificatePath $temp -CertificatePassword (ConvertTo-SecureString $auth.password -AsPlainText -Force) -Scope Process -ErrorAction Stop|Out-Null
            }finally{Remove-Item $temp -Force -ErrorAction SilentlyContinue}
        }else{Connection-Stage 'Azure activity requires Azure browser sign-in';Connect-AzAccount -Tenant $tenant -Scope Process -ErrorAction Stop|Out-Null}
        if([string](Get-AzContext).Tenant.Id -ine $tenant){throw 'Azure tenant mismatch'}
        $script:azureReady=$true
    }
}
function Read-AzureEvidence([string]$Key){
    if(!$script:azureReady){throw ('Azure connection unavailable: '+$script:azureConnectionError+' Reconnect explicitly; no sign-in will start during collection.')}
    function Arm-Pages([string]$Url){
        $seen=[Collections.Generic.HashSet[string]]::new()
        while($Url){
            $uri=[uri]$Url
            if($uri.Scheme -ne 'https' -or $uri.Host -ne 'management.azure.com' -or !$seen.Add($Url)){throw 'Invalid Azure continuation'}
            $token=(Get-AzAccessToken -ResourceUrl 'https://management.azure.com/').Token
            $result=Invoke-RestMethod -Uri $Url -Authentication Bearer -Token $token
            foreach($r in $result.value){$r};$Url=[string]$result.nextLink
        }
    }
    $filter=[uri]::EscapeDataString("eventTimestamp ge '$start' and eventTimestamp le '$end'")
    if($Key -eq 'azureDirectoryActivity'){Arm-Pages ('https://management.azure.com/providers/Microsoft.Insights/eventtypes/management/values?api-version=2015-04-01&$filter='+$filter)}
    else{foreach($sub in (Get-AzSubscription -TenantId $tenant)){Arm-Pages ('https://management.azure.com/subscriptions/'+$sub.Id+'/providers/Microsoft.Insights/eventtypes/management/values?api-version=2015-04-01&$filter='+$filter)}}
}
