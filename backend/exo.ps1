<#
.SYNOPSIS
    Exchange Online helper for the Triage containment backend.

    Called by server.js with one action per process. Never receives a command
    string - only named parameters, already validated on the Node side - so
    there is nothing here to inject into. Writes a single JSON document to
    stdout and nothing else.

    App-only authentication with a certificate. The service principal should
    hold the narrowest Exchange RBAC role assignment that works (see
    SECURITY.md), not blanket Exchange Administrator.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet(
        "rules-list", "rules-remove", "rules-disable",
        "forwarding-get", "forwarding-clear",
        "delegates-list", "delegates-remove")]
    [string]$Action,
    [Parameter(Mandatory)][string]$AppId,
    [Parameter(Mandatory)][string]$Organization,
    [Parameter(Mandatory)][string]$PfxPath,
    [string]$PfxPassword = "",
    [string]$Upn,
    [string]$RuleId,
    [string]$Delegate
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Out-Json($o) {
    # Depth 6 keeps nested rule conditions intact without dumping the world.
    $o | ConvertTo-Json -Depth 6 -Compress
}

try {
    $cert = if ($PfxPassword) {
        [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
            $PfxPath, $PfxPassword,
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    } else {
        [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($PfxPath)
    }

    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    Connect-ExchangeOnline -AppId $AppId -Certificate $cert -Organization $Organization `
        -ShowBanner:$false -CommandName Get-InboxRule, Remove-InboxRule, Set-InboxRule, `
        Get-Mailbox, Set-Mailbox, Get-MailboxPermission, Remove-MailboxPermission `
        -ErrorAction Stop | Out-Null

    switch ($Action) {

        "rules-list" {
            $rules = Get-InboxRule -Mailbox $Upn -ErrorAction Stop
            Out-Json @($rules | ForEach-Object {
                [pscustomobject]@{
                    id                  = [string]$_.Identity
                    ruleIdentity        = [string]$_.RuleIdentity
                    name                = $_.Name
                    enabled             = [bool]$_.Enabled
                    priority            = $_.Priority
                    description         = ($_.Description -replace '\s+', ' ')
                    forwardTo           = @($_.ForwardTo           | ForEach-Object { "$_" })
                    forwardAsAttachment = @($_.ForwardAsAttachmentTo | ForEach-Object { "$_" })
                    redirectTo          = @($_.RedirectTo          | ForEach-Object { "$_" })
                    moveToFolder        = "$($_.MoveToFolder)"
                    deleteMessage       = [bool]$_.DeleteMessage
                    markAsRead          = [bool]$_.MarkAsRead
                    stopProcessingRules = [bool]$_.StopProcessingRules
                    from                = @($_.From                | ForEach-Object { "$_" })
                    subjectContains     = @($_.SubjectContainsWords)
                    bodyContains        = @($_.BodyContainsWords)
                }
            })
        }

        "rules-remove" {
            # -Confirm:$false because there is no console here; the human
            # confirmation happened in the browser and is in the audit log.
            Remove-InboxRule -Mailbox $Upn -Identity $RuleId -Confirm:$false -ErrorAction Stop
            Out-Json @{ removed = $RuleId; mailbox = $Upn }
        }

        "rules-disable" {
            Set-InboxRule -Mailbox $Upn -Identity $RuleId -Enabled:$false -Confirm:$false -ErrorAction Stop
            Out-Json @{ disabled = $RuleId; mailbox = $Upn }
        }

        "forwarding-get" {
            $mb = Get-Mailbox -Identity $Upn -ErrorAction Stop
            Out-Json @{
                identity                  = [string]$mb.Identity
                forwardingAddress         = "$($mb.ForwardingAddress)"
                forwardingSmtpAddress     = "$($mb.ForwardingSmtpAddress)"
                deliverToMailboxAndForward = [bool]$mb.DeliverToMailboxAndForward
                hiddenFromAddressLists    = [bool]$mb.HiddenFromAddressListsEnabled
            }
        }

        "forwarding-clear" {
            $before = Get-Mailbox -Identity $Upn -ErrorAction Stop
            Set-Mailbox -Identity $Upn -ForwardingAddress $null -ForwardingSmtpAddress $null `
                -DeliverToMailboxAndForward $false -Confirm:$false -ErrorAction Stop
            Out-Json @{
                cleared = $true
                previousForwardingAddress     = "$($before.ForwardingAddress)"
                previousForwardingSmtpAddress = "$($before.ForwardingSmtpAddress)"
            }
        }

        "delegates-list" {
            $perms = Get-MailboxPermission -Identity $Upn -ErrorAction Stop |
                Where-Object { $_.User -notlike "NT AUTHORITY\SELF" -and -not $_.IsInherited }
            Out-Json @($perms | ForEach-Object {
                [pscustomobject]@{
                    user         = "$($_.User)"
                    accessRights = @($_.AccessRights | ForEach-Object { "$_" })
                    deny         = [bool]$_.Deny
                }
            })
        }

        "delegates-remove" {
            Remove-MailboxPermission -Identity $Upn -User $Delegate -AccessRights FullAccess `
                -Confirm:$false -ErrorAction Stop
            Out-Json @{ removed = $Delegate; mailbox = $Upn }
        }
    }
}
catch {
    Out-Json @{ error = "$($_.Exception.Message)" }
    exit 1
}
finally {
    try { Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}
}
