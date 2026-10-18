$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../desktop/collector/extended.ps1')
$id='target';$upn='target@example.com';$start='2026-07-01T00:00:00Z';$end='2026-07-02T00:00:00Z';$time='createdDateTime ge '+$start
function Query($Path,$Filter){'https://graph.microsoft.com/'+$Path+'?filter='+$Filter}
$script:saved=@{};$script:visits=0
function Save-Source($Key,$Rows,$Manifest){$script:saved[$Key]=@{records=@($Rows);manifest=$Manifest}}
function Graph-Request($Url){
 if($Url -match '/groups\?'){return @{value=@(@{id='g1';displayName='One'},@{id='g2';displayName='Two'})}}
 if($Url -match '/groups/g[12]/members'){return @{value=@(@{id='u1';displayName='Same member'})}}
 if($Url -match '/authentication/methods'){return @{value=@(@{id='m1';'@odata.type'='#microsoft.graph.fido2AuthenticationMethod'})}}
 if($Url -match '/applications'){ $script:visits++; if($Url -match 'page=2'){return @{value=@(@{id='a2'})}}; return @{value=@(@{id='a1'});'@odata.nextLink'='https://graph.microsoft.com/v1.0/applications?page=2'} }
 if($Url -match 'secureScores'){return @{value=@(@{id='score1'})}}
 if($Url -match 'secureScoreControlProfiles'){throw 'Access denied to control profiles'}
 if($Url -match 'repeat'){return @{value=@();'@odata.nextLink'=$Url}}
 if($Url -match '/messages'){$script:mailCalls++;if($script:notFound){throw '404 NotFound'};throw '403 Forbidden'}
 throw "Unexpected fixture request: $Url"
}
Read-Extended 'groupMembers'
if($saved.groupMembers.records.Count -ne 2 -or $saved.groupMembers.records[1].groupId -ne 'g2'){throw 'Membership context was lost'}
Read-Extended 'authenticationMethods'
if($saved.authenticationMethods.records[0].userPrincipalName -ne $upn){throw 'Method target lost'}
Read-Extended 'applications'
if($saved.applications.records.Count -ne 2 -or $visits -ne 2){throw 'Paging incomplete'}
Read-Extended 'secureScore'
if($saved.secureScore.manifest.state -ne 'partial' -or $saved.secureScore.records.Count -ne 1){throw 'Partial evidence lost'}
$rejected=$false;try{Read-AllGraph 'https://graph.microsoft.com/v1.0/repeat'|Out-Null}catch{$rejected=$true}
if(!$rejected){throw 'Continuation loop accepted'}
'PASS: membership context, account methods, full paging, partial preservation, loop guard'

Read-Extended 'messages'
if($saved.messages.manifest.state -ne 'unavailable' -or $saved.messages.manifest.error -notmatch 'Mail.Read.Shared'){throw 'Mailbox denial was not explained as unavailable access'}

$script:mailboxFailures=@{};$script:notFound=$true;$script:mailCalls=0
Read-Extended 'messages'
Read-Extended 'attachments'
if($script:mailCalls -ne 1){throw 'Unavailable mailbox was requested twice'}
foreach($key in @('messages','attachments')){if($saved[$key].manifest.state -ne 'unavailable' -or $saved[$key].manifest.error -notmatch 'Mailbox unavailable'){throw 'Missing mailbox diagnostic lost'}}
$script:mailboxFailures=@{};$auth=@{graphAppId='approved-app'};$tenant='target-tenant'
Read-Extended 'messages'
if($saved.messages.manifest.error -notmatch 'Application access' -or $saved.messages.manifest.error -notmatch 'Application approved-app' -or $saved.messages.manifest.error -match 'Delegated access'){throw 'Application mailbox guidance was not scoped to the selected connection'}
$auth=$null
Read-Extended 'azureActivity'
if($saved.azureActivity.manifest.state -ne 'unavailable' -or $saved.azureActivity.manifest.error -notmatch 'no sign-in'){throw 'Azure attempted late authentication'}
