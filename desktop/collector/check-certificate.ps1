$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'certificate.ps1')
try {
    $credential=[Console]::In.ReadLine()|ConvertFrom-Json -AsHashtable
    $cert=Read-TriageCertificate $credential
    @{thumbprint=$cert.Thumbprint;expiresAt=$cert.NotAfter.ToUniversalTime().ToString('o');startsAt=$cert.NotBefore.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress
} catch { [Console]::Error.WriteLine($_.Exception.Message);exit 1 }
finally { if($cert){$cert.Dispose()};$credential=$null }
