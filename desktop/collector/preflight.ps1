param([Parameter(Mandatory)][string]$ModuleRoot,[ValidateSet('Microsoft.Graph.Authentication','ExchangeOnlineManagement','Az.Accounts')][string]$ProbeModule)
$ErrorActionPreference='Stop'
$env:PSModulePath=$ModuleRoot+[IO.Path]::PathSeparator+(Join-Path $PSHOME 'Modules')
try {
    if ($PSVersionTable.PSVersion -lt [version]'7.6.0') { throw 'PowerShell 7.6 or later is required.' }
    $requirements = @{'Microsoft.Graph.Authentication'='2.37.0';'ExchangeOnlineManagement'='3.10.0';'PowerShellGet'='2.2.5';'PackageManagement'='1.4.8.1';'Az.Accounts'='5.3.3'}
    $found = @{}
    foreach ($name in $requirements.Keys) {
        $m = Get-Module -ListAvailable -Name (Join-Path $ModuleRoot ($name+'/'+$requirements[$name]+'/'+$name+'.psd1')) | Where-Object { $_.Version -eq [version]$requirements[$name] } | Select-Object -First 1
        if (!$m) { throw "Bundled module is missing: $name $($requirements[$name])" }
        $found[$name] = $m.Version.ToString()
    }
    if ($ProbeModule) { Import-Module (Join-Path $ModuleRoot ($ProbeModule+'/'+$requirements[$ProbeModule]+'/'+$ProbeModule+'.psd1')) -ErrorAction Stop }
    @{ready=$true;powerShell=$PSVersionTable.PSVersion.ToString();modules=$found;platform=$PSVersionTable.OS} | ConvertTo-Json -Depth 5 -Compress
} catch { @{ready=$false;reason=$_.Exception.Message} | ConvertTo-Json -Compress; exit 1 }
