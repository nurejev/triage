<#
.SYNOPSIS
    Creates the multi-tenant app registration for Limon-IT M365 Triage
    in YOUR (Limon-IT) tenant and prints the client ID + admin consent URL.
    Run once as an Application Administrator.
#>
param(
    [string]$DisplayName = "M365 Triage (Limon-IT)",
    [string]$SpaRedirect = "https://triage.limon-it.nl",
    [string[]]$ExtraRedirects = @("http://localhost:8080")
)
Connect-MgGraph -Scopes "Application.ReadWrite.All"

$graphAppId = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$graphAppId'"
$scopeNames = @(
    "User.Read.All","AuditLog.Read.All","Directory.Read.All","Policy.Read.All",
    "IdentityRiskyUser.Read.All","IdentityRiskEvent.Read.All",
    "UserAuthenticationMethod.Read.All","AuditLogsQuery.Read.All"
)
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
