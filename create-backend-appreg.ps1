<#
.SYNOPSIS
    Creates the CONFIDENTIAL app registration for the Triage Exchange
    containment backend, generates its certificate, and prints the .env the
    container needs.

.DESCRIPTION
    This is a SECOND, separate app registration from the Triage SPA. It is
    single-tenant, certificate-authenticated, and lives in the customer
    tenant that will run the backend - never shared between tenants.

    What it ends up holding:
      * Exchange.ManageAsApp (Office 365 Exchange Online app role) - app-only
        access to the Exchange management cmdlets. Scope it down with
        Exchange RBAC for Applications afterwards (step 6 below).
      * An exposed API scope Contain.Exchange, pre-authorized for the Triage
        SPA, so only the SPA can obtain tokens for this backend.
      * Delegated Microsoft Graph User.Read + Directory.Read.All, used only
        for the on-behalf-of call that checks the caller's directory roles.

    Run once, as an account that can create app registrations and grant
    admin consent (Application Administrator + Privileged Role Administrator,
    or Global Administrator).

.PARAMETER SpaAppId
    Application (client) ID of the Triage SPA - the value in js/authConfig.js.

.EXAMPLE
    ./create-backend-appreg.ps1 -SpaAppId 8f1b5185-e782-4dc3-8aee-92ba4616c8d0 `
        -Organization contoso.onmicrosoft.com
#>
param(
    [Parameter(Mandatory)][string]$SpaAppId,
    [Parameter(Mandatory)][string]$Organization,          # contoso.onmicrosoft.com
    [string]$DisplayName = "M365 Triage - Exchange containment backend",
    [string]$CertPath = "./certs",
    [int]$CertMonths = 12,
    [securestring]$PfxPassword
)

$ErrorActionPreference = "Stop"
Connect-MgGraph -Scopes "Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All", "Directory.ReadWrite.All"
$ctx = Get-MgContext
$tenantId = $ctx.TenantId

# ---------------------------------------------------------------- 1. cert ---
if (-not $PfxPassword) { $PfxPassword = Read-Host "Password for the .pfx" -AsSecureString }
New-Item -ItemType Directory -Force -Path $CertPath | Out-Null
Write-Host "Generating certificate..." -ForegroundColor Cyan
$cert = New-SelfSignedCertificate -Subject "CN=M365TriageBackend" `
    -CertStoreLocation "Cert:\CurrentUser\My" -KeyExportPolicy Exportable `
    -KeySpec Signature -KeyLength 2048 -NotAfter (Get-Date).AddMonths($CertMonths)

$pfx = Join-Path $CertPath "backend.pfx"
$cer = Join-Path $CertPath "backend.cer"
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $PfxPassword | Out-Null
Export-Certificate  -Cert $cert -FilePath $cer | Out-Null

# Node needs PEM (public cert + private key) for the client assertion.
# openssl is the least surprising way to get both out of the pfx.
$crtPem = Join-Path $CertPath "backend.crt"
$keyPem = Join-Path $CertPath "backend.key"
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PfxPassword))
if (Get-Command openssl -ErrorAction SilentlyContinue) {
    & openssl pkcs12 -in $pfx -clcerts -nokeys -out $crtPem -passin "pass:$plain" 2>$null
    & openssl pkcs12 -in $pfx -nocerts -nodes  -out $keyPem -passin "pass:$plain" 2>$null
    Write-Host "  wrote $crtPem and $keyPem" -ForegroundColor Gray
} else {
    Write-Warning "openssl not found - convert the pfx yourself:"
    Write-Warning "  openssl pkcs12 -in backend.pfx -clcerts -nokeys -out backend.crt"
    Write-Warning "  openssl pkcs12 -in backend.pfx -nocerts -nodes  -out backend.key"
}

# ----------------------------------------------------------------- 2. app ---
$graphAppId = "00000003-0000-0000-c000-000000000000"
$exoAppId   = "00000002-0000-0ff1-ce00-000000000000"   # Office 365 Exchange Online
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$graphAppId'"
$exoSp   = Get-MgServicePrincipal -Filter "appId eq '$exoAppId'"

$delegated = @("User.Read", "Directory.Read.All") | ForEach-Object {
    $n = $_
    $p = $graphSp.Oauth2PermissionScopes | Where-Object { $_.Value -eq $n }
    if (-not $p) { Write-Warning "Graph scope not found: $n"; return }
    @{ Id = $p.Id; Type = "Scope" }
}
$manageAsApp = $exoSp.AppRoles | Where-Object { $_.Value -eq "Exchange.ManageAsApp" }
if (-not $manageAsApp) { throw "Exchange.ManageAsApp app role not found - is Exchange Online licensed in this tenant?" }

$scopeId = [guid]::NewGuid()
$app = New-MgApplication -DisplayName $DisplayName `
    -SignInAudience "AzureADMyOrg" `
    -RequiredResourceAccess @(
        @{ ResourceAppId = $graphAppId; ResourceAccess = @($delegated) },
        @{ ResourceAppId = $exoAppId;   ResourceAccess = @(@{ Id = $manageAsApp.Id; Type = "Role" }) }
    ) `
    -Api @{
        Oauth2PermissionScopes = @(@{
            Id = $scopeId; Value = "Contain.Exchange"; Type = "User"
            AdminConsentDisplayName = "Contain a compromised mailbox"
            AdminConsentDescription = "Allows the signed-in incident responder to clear inbox rules, mailbox forwarding and delegates on a named mailbox through the Triage backend."
            UserConsentDisplayName  = "Contain a compromised mailbox"
            UserConsentDescription  = "Lets Triage clear inbox rules, forwarding and delegates on a mailbox you name."
            IsEnabled = $true
        })
        # Only the Triage SPA may request a token for this API. Any other
        # client - including one an attacker registers - is refused by Entra
        # before the request ever reaches the backend.
        PreAuthorizedApplications = @(@{
            AppId = $SpaAppId; DelegatedPermissionIds = @($scopeId)
        })
    }

Update-MgApplication -ApplicationId $app.Id -IdentifierUris @("api://$($app.AppId)")
$certBytes = [Convert]::ToBase64String((Get-Item $cer | Get-Content -AsByteStream -Raw))
Update-MgApplication -ApplicationId $app.Id -KeyCredentials @(@{
    Type = "AsymmetricX509Cert"; Usage = "Verify"
    Key = [Convert]::FromBase64String($certBytes); DisplayName = "M365TriageBackend"
})
$sp = New-MgServicePrincipal -AppId $app.AppId

# --------------------------------------------------------------- 3. output ---
$envFile = Join-Path $CertPath "../backend.env"
@"
# Generated by create-backend-appreg.ps1 on $(Get-Date -Format s)
TENANT_ID=$tenantId
ORGANIZATION=$Organization
BACKEND_APP_ID=$($app.AppId)
SPA_APP_ID=$SpaAppId
API_SCOPE=Contain.Exchange
CERT_PFX_PASSWORD=<the .pfx password you just typed>
# Mailboxes the backend must never touch (comma separated), e.g. break-glass:
PROTECTED_UPNS=
"@ | Set-Content -Path $envFile -Encoding utf8

Write-Host ""
Write-Host "Backend app registration created." -ForegroundColor Green
Write-Host "  Application (client) ID : $($app.AppId)"
Write-Host "  Service principal ID    : $($sp.Id)"
Write-Host "  Tenant ID               : $tenantId"
Write-Host "  Wrote                   : $envFile, $pfx, $crtPem, $keyPem"
Write-Host ""
Write-Host "STILL TO DO - these cannot be scripted safely:" -ForegroundColor Yellow
Write-Host "  4. Grant admin consent for the app (Entra > App registrations > $DisplayName"
Write-Host "     > API permissions > Grant admin consent). This covers Exchange.ManageAsApp"
Write-Host "     and the delegated Graph permissions used for the role check."
Write-Host ""
Write-Host "  5. Give the service principal Exchange rights. Least privilege first:"
Write-Host "       Connect-ExchangeOnline -Organization $Organization"
Write-Host "       New-ServicePrincipal -AppId $($app.AppId) -ObjectId $($sp.Id) -DisplayName '$DisplayName'"
Write-Host "       New-ManagementRoleAssignment -App $($sp.Id) -Role 'Mail Recipients'"
Write-Host "       New-ManagementRoleAssignment -App $($sp.Id) -Role 'View-Only Recipients'"
Write-Host "     Confirm which role actually carries the cmdlets you need, e.g.:"
Write-Host "       Get-ManagementRole -Cmdlet Get-InboxRule"
Write-Host "     Scope it to a recipient group instead of the whole tenant where you can:"
Write-Host "       New-ManagementScope -Name 'IR mailboxes' -RecipientRestrictionFilter \"MemberOfGroup -eq '<group DN>'\""
Write-Host "       New-ManagementRoleAssignment -App $($sp.Id) -Role 'Mail Recipients' -CustomRecipientWriteScope 'IR mailboxes'"
Write-Host "     (Assigning the Exchange Administrator directory role instead works but is far broader.)"
Write-Host ""
Write-Host "  6. Put BACKEND_APP_ID in the web container: BACKEND_APP_ID=$($app.AppId)"
Write-Host "     docker compose --profile backend up -d"
Write-Host ""
Write-Host "  7. Diary the certificate expiry: $((Get-Date).AddMonths($CertMonths).ToString('yyyy-MM-dd'))" -ForegroundColor Yellow
