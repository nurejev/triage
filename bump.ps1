<#
.SYNOPSIS
    Bump the build number, add an ENCA-style changelog entry, refresh ?v= cache-busters.
.DESCRIPTION
    Items are "kind|tool|text" strings; kind is new, improved or fixed.
.EXAMPLE
    .\bump.ps1 -Title "Sign-in enabled" -Items "new|Sign in|App registration configured; sign in with Microsoft now works."
.EXAMPLE
    .\bump.ps1 -Title "Small fixes" -Items "fixed|Report|Timestamps now always UTC.","improved|Help|Clarified consent steps."
#>
param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string[]]$Items
)
$ErrorActionPreference = 'Stop'

$buildJs = Get-Content js/build.js -Raw
if ($buildJs -notmatch 'TRIAGE_BUILD = (\d+)') { throw "Cannot find TRIAGE_BUILD in js/build.js" }
$cur = [int]$Matches[1]
$new = $cur + 1
$today = Get-Date -Format 'yyyy-MM-dd'

$itemLines = foreach ($i in $Items) {
    $parts = $i -split '\|', 3
    if ($parts.Count -lt 3 -or $parts[0] -notin @('new', 'improved', 'fixed')) {
        throw "Item must be 'kind|tool|text' with kind new/improved/fixed: $i"
    }
    $tool = $parts[1] -replace '"', '\"'
    $text = $parts[2] -replace '"', '\"'
    '      { kind: "' + $parts[0] + '", tool: "' + $tool + '", text: "' + $text + '" },'
}
$safeTitle = $Title -replace '"', '\"'
$entry = "  {`n    build: $new, date: `"$today`", title: `"$safeTitle`",`n    items: [`n" +
         (($itemLines) -join "`n") + "`n    ],`n  },"

$buildJs = $buildJs -replace 'TRIAGE_BUILD = \d+', "TRIAGE_BUILD = $new"
$buildJs = $buildJs -replace 'TRIAGE_BUILD_DATE = "[^"]*"', "TRIAGE_BUILD_DATE = `"$today`""
$buildJs = $buildJs.Replace("window.TRIAGE_CHANGELOG = [", "window.TRIAGE_CHANGELOG = [`n$entry")
Set-Content js/build.js -Value $buildJs -Encoding UTF8 -NoNewline

$html = Get-Content index.html -Raw
$html = $html -replace '\?v=\d+', "?v=$new"
Set-Content index.html -Value $html -Encoding UTF8 -NoNewline

Write-Host "Build $cur -> $new ($today) `"$Title`" with $($Items.Count) item(s). Commit and push to deploy." -ForegroundColor Green
