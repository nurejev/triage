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
    Application (client) ID of the Triage SPA - the clientId value in
    js/authConfig.js. Currently 8f1b5185-e782-4dc3-8aee-92ba4616c8d0.

.PARAMETER Organization
    The tenant's Exchange organisation name, e.g. contoso.onmicrosoft.com.
    Find it with: (Get-MgOrganization).VerifiedDomains | Where IsInitial

.NOTES
    Runs on macOS, Linux and Windows. Needs openssl (already present on
    macOS and Linux; on Windows it ships with Git) and the Microsoft.Graph
    PowerShell module.

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
# Four files, all in $CertPath:
#   backend.key / backend.crt  PEM - Node signs the client assertion with these
#   backend.pfx                PKCS#12 - Connect-ExchangeOnline wants this
#   backend.cer                DER - uploaded to the app registration
# openssl is used wherever it exists (macOS, Linux, and Windows with Git
# installed); the Windows PKI cmdlets are the fallback, since they do not
# exist on macOS or Linux PowerShell.
if (-not $PfxPassword) { $PfxPassword = Read-Host "Password for the .pfx" -AsSecureString }
New-Item -ItemType Directory -Force -Path $CertPath | Out-Null
$pfx    = Join-Path $CertPath "backend.pfx"
$cer    = Join-Path $CertPath "backend.cer"
$crtPem = Join-Path $CertPath "backend.crt"
$keyPem = Join-Path $CertPath "backend.key"
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PfxPassword))
$days = [int]([math]::Round($CertMonths * 30.4))

Write-Host "Generating certificate ($CertMonths months)..." -ForegroundColor Cyan
if (Get-Command openssl -ErrorAction SilentlyContinue) {
    & openssl req -x509 -newkey rsa:2048 -sha256 -days $days -nodes `
        -keyout $keyPem -out $crtPem -subj "/CN=M365TriageBackend" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "openssl failed to generate the key pair" }
    & openssl pkcs12 -export -out $pfx -inkey $keyPem -in $crtPem `
        -passout "pass:$plain" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "openssl failed to build the .pfx" }
    & openssl x509 -in $crtPem -outform der -out $cer 2>$null
}
elseif (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue) {
    Write-Host "  openssl not found - using the Windows PKI cmdlets." -ForegroundColor Gray
    $cert = New-SelfSignedCertificate -Subject "CN=M365TriageBackend" `
        -CertStoreLocation "Cert:\CurrentUser\My" -KeyExportPolicy Exportable `
        -KeySpec Signature -KeyLength 2048 -NotAfter (Get-Date).AddMonths($CertMonths)
    Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $PfxPassword | Out-Null
    Export-Certificate  -Cert $cert -FilePath $cer | Out-Null
    Write-Warning "The container also needs PEM files. Install openssl and run:"
    Write-Warning "  openssl pkcs12 -in $pfx -clcerts -nokeys -out $crtPem"
    Write-Warning "  openssl pkcs12 -in $pfx -nocerts -nodes  -out $keyPem"
}
else {
    throw "Neither openssl nor New-SelfSignedCertificate is available. Install openssl (macOS: it is already there; Linux: apt install openssl; Windows: comes with Git) and re-run."
}
# The private key is the whole ballgame - do not leave it world-readable.
if ($IsLinux -or $IsMacOS) { & chmod 600 $keyPem $pfx 2>$null }
Write-Host "  wrote $keyPem, $crtPem, $pfx, $cer" -ForegroundColor Gray

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
Update-MgApplication -ApplicationId $app.Id -KeyCredentials @(@{
    Type = "AsymmetricX509Cert"; Usage = "Verify"
    Key = [System.IO.File]::ReadAllBytes((Resolve-Path $cer).Path)
    DisplayName = "M365TriageBackend"
})
$sp = New-MgServicePrincipal -AppId $app.AppId

# --------------------------------------------------------------- 3. output ---
# backend.env - read by the backend container itself.
$root = Split-Path -Parent $PSCommandPath
$envFile = Join-Path $root "backend.env"
@"
# Generated by create-backend-appreg.ps1 on $(Get-Date -Format s)
TENANT_ID=$tenantId
ORGANIZATION=$Organization
BACKEND_APP_ID=$($app.AppId)
SPA_APP_ID=$SpaAppId
API_SCOPE=Contain.Exchange
CERT_PFX_PASSWORD=$plain
# Mailboxes the backend must never touch (comma separated), e.g. break-glass:
PROTECTED_UPNS=
"@ | Set-Content -Path $envFile -Encoding utf8

# .env - read automatically by `docker compose`, so nobody has to export a
# variable by hand (and get it wrong in PowerShell, where VAR=x is not a thing).
$dotEnv = Join-Path $root ".env"
@"
# Generated by create-backend-appreg.ps1 - picked up automatically by docker compose.
BACKEND_APP_ID=$($app.AppId)
"@ | Set-Content -Path $dotEnv -Encoding utf8
if ($IsLinux -or $IsMacOS) { & chmod 600 $envFile 2>$null }

Write-Host ""
Write-Host "Backend app registration created." -ForegroundColor Green
Write-Host "  Application (client) ID : $($app.AppId)"
Write-Host "  Service principal ID    : $($sp.Id)"
Write-Host "  Tenant ID               : $tenantId"
Write-Host "  Wrote                   : $envFile, $dotEnv, $pfx, $crtPem, $keyPem"
Write-Host "  backend.env holds the .pfx password - it is gitignored, keep it that way." -ForegroundColor Gray
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
Write-Host "  6. Start it. BACKEND_APP_ID is already in .env, so this is the whole command"
Write-Host "     (same in PowerShell, bash and zsh):"
Write-Host "       docker compose --profile backend up -d"
Write-Host "     Then open http://localhost:8080 - the containment screen will say"
Write-Host "     'Exchange backend: connected to $Organization'."
Write-Host ""
Write-Host "  7. Diary the certificate expiry: $((Get-Date).AddMonths($CertMonths).ToString('yyyy-MM-dd'))" -ForegroundColor Yellow
