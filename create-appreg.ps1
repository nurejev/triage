<#
.SYNOPSIS
    Creates the multi-tenant app registration for Limon-IT M365 Triage
    in YOUR (Limon-IT) tenant and prints the client ID + admin consent URL.
    Run once as an Application Administrator.
#>
param(
    [string]$DisplayName = "M365 Triage (Limon-IT)",
    [string]$SpaRedirect = "https://triage.limon-it.nl",
    [string[]]$ExtraRedirects = @("http://localhost:8080"),
    # Register only the read-only triage scopes - the containment screen will
    # then be unable to arm. Use for a look-but-do-not-touch deployment.
    [switch]$ReadOnly
)
Connect-MgGraph -Scopes "Application.ReadWrite.All"

$graphAppId = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$graphAppId'"
$scopeNames = @(
    # --- triage: read-only ---
    "User.Read.All","AuditLog.Read.All","Directory.Read.All","Policy.Read.All",
    "IdentityRiskyUser.Read.All","IdentityRiskEvent.Read.All",
    "UserAuthenticationMethod.Read.All","AuditLogsQuery.Read.All"
)
# --- containment: write. Requested by the app only when the analyst arms the
#     containment screen. Pass -ReadOnly to leave them out entirely and ship a
#     triage-only deployment. ---
if (-not $ReadOnly) {
    $scopeNames += @(
        "User.RevokeSessions.All",              # revoke refresh tokens
        "User.ReadWrite.All",                   # disable account, reset password
        "User-PasswordProfile.ReadWrite.All",   # password reset where the tenant splits this out
        "UserAuthenticationMethod.ReadWrite.All", # remove attacker-added MFA methods
        "DelegatedPermissionGrant.ReadWrite.All"  # revoke OAuth consent grants
    )
}
$resourceAccess = foreach ($name in $scopeNames) {
    $perm = $graphSp.Oauth2PermissionScopes | Where-Object { $_.Value -eq $name }
    if ($null -eq $perm) { Write-Warning "Scope not found: $name"; continue }
    @{ Id = $perm.Id; Type = "Scope" }
}

$app = New-MgApplication -DisplayName $DisplayName `
    -SignInAudience "AzureADMultipleOrgs" `
    -Spa @{ RedirectUris = (@($SpaRedirect) + $ExtraRedirects) } `
    -RequiredResourceAccess @(@{ ResourceAppId = $graphAppId; ResourceAccess = $resourceAccess }) `
    -Web @{ } -Info @{ MarketingUrl = "https://limon-it.nl" }

New-MgServicePrincipal -AppId $app.AppId | Out-Null

Write-Host ""
Write-Host "Client ID: $($app.AppId)" -ForegroundColor Green
Write-Host "Paste it into js/authConfig.js (clientId)." -ForegroundColor Gray
Write-Host ""
Write-Host "Admin consent URL for customers:" -ForegroundColor Green
Write-Host "https://login.microsoftonline.com/organizations/adminconsent?client_id=$($app.AppId)&redirect_uri=$SpaRedirect"
Write-Host ""
if ($ReadOnly) {
    Write-Host "Read-only build: containment cannot be armed in this deployment." -ForegroundColor Yellow
} else {
    Write-Host "Containment (write) scopes are registered. Sign-in still requests read-only scopes"  -ForegroundColor Yellow
    Write-Host "only; the write scopes are requested when an analyst arms the containment screen."   -ForegroundColor Yellow
}
