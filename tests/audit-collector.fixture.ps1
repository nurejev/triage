$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../desktop/collector/exchange-extra.ps1')
$plan=@{scope='user'};$upn='alice@example.com';$objectId='22222222-2222-4222-8222-222222222222'
$start='2026-07-01T00:00:00Z';$end='2026-07-02T00:00:00Z'
$script:pages=@{};$script:saved=@{};$script:repeat=$false
function Save-Source($Key,$Records,$Manifest){$script:saved[$Key]=@{records=@($Records);manifest=$Manifest}}
function Search-UnifiedAuditLog {
 param($StartDate,$EndDate,$RecordType,$SessionId,$SessionCommand,$ResultSize)
 if($SessionCommand -ne 'ReturnLargeSet' -or $ResultSize -ne 5000){throw 'Invalid paging arguments'}
 if($script:pages.ContainsKey($SessionId) -and !$script:repeat){return}
 $script:pages[$SessionId]=1
 if($RecordType -eq 'ExchangeAdmin'){
  @{AuditData=(@{Id='admin1';UserId='another-admin@example.com';ObjectId=$upn}|ConvertTo-Json -Compress)}
 }elseif($RecordType -eq 'ExchangeItem'){
  @{AuditData=(@{Id='mail1';UserId='delegate@example.com';MailboxOwnerUPN=$upn}|ConvertTo-Json -Compress)}
  @{AuditData=(@{Id='mail2';UserId=$upn;MailboxOwnerUPN='other@example.com'}|ConvertTo-Json -Compress)}
 }
}
Read-ExchangeEvidence 'mailboxAudit'
if($saved.mailboxAudit.manifest.state -ne 'complete' -or $saved.mailboxAudit.records.Count -ne 1){throw 'Mailbox owner filtering or paging failed'}
Read-ExchangeEvidence 'adminAudit'
if($saved.adminAudit.records.Count -ne 1){throw 'Admin action on target was lost'}
$script:repeat=$true
Read-ExchangeEvidence 'adminAudit'
if($saved.adminAudit.manifest.state -ne 'partial' -or $saved.adminAudit.records.Count -ne 1){throw 'Repeated page was not marked partial'}
'PASS: unified audit paging, mailbox owner matching, target admin actions, partial preservation'
