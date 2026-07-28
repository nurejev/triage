# Startup banner + module load for the triage-pwsh container.
$ErrorActionPreference = "Continue"
Import-Module Microsoft-Extractor-Suite -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Limon-IT M365 Triage - PowerShell companion" -ForegroundColor Green
Write-Host "  ExchangeOnlineManagement, Microsoft.Graph and Microsoft-Extractor-Suite are installed."
Write-Host ""
Write-Host "  No browser in here - sign in with a device code:" -ForegroundColor Yellow
Write-Host '    Connect-ExchangeOnline -Device                      # inbox rules, forwarding, delegates, UAL'
Write-Host '    Connect-MgGraph -UseDeviceCode -Scopes "AuditLog.Read.All","Directory.Read.All"'
Write-Host ""
Write-Host "  Containment (after exporting the evidence!):" -ForegroundColor Yellow
Write-Host '    Get-InboxRule -Mailbox user@tenant.com | Format-List Name,Description,Enabled,RedirectTo'
Write-Host '    Get-Mailbox user@tenant.com | Select-Object ForwardingAddress,ForwardingSmtpAddress,DeliverToMailboxAndForward'
Write-Host '    Remove-InboxRule -Mailbox user@tenant.com -Identity "<rule name>"'
Write-Host '    Set-Mailbox user@tenant.com -ForwardingAddress $null -ForwardingSmtpAddress $null'
Write-Host ""
Write-Host "  Full extraction (writes to /evidence -> ./evidence on your machine):" -ForegroundColor Yellow
Write-Host '    Get-UAL -UserIds user@tenant.com -StartDate 2026-06-01 -EndDate 2026-07-28'
Write-Host '    Get-GraphEntraSignInLogs -UserIds user@tenant.com'
Write-Host '    Get-AllEvidence   # or Start-MESTriage'
Write-Host ""
Write-Host "  Load the output back into the Triage web app via 'View extraction output'."
Write-Host ""
