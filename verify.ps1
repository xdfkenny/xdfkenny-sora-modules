$ErrorActionPreference = 'Stop'

$repo = 'xdfkenny/xdfkenny-sora-modules'
$module = 'yfsp'
$api = "https://api.github.com/repos/$repo/contents"

Write-Host "Verifying $module module served from main..." -ForegroundColor Cyan

$manifest = Invoke-RestMethod -Uri "$api/$module/$module.json?ref=main" -Headers @{ 'Accept' = 'application/vnd.github.raw' }
Write-Host "  version: $($manifest.version)"
Write-Host "  scriptUrl: $($manifest.scriptUrl)"

if ($manifest.scriptUrl -notmatch "raw.githubusercontent.com/$repo/main/") {
    Write-Host "  WARN: scriptUrl does not point to main branch!" -ForegroundColor Yellow
}

$script = Invoke-RestMethod -Uri "$api/$module/$module.js?ref=main" -Headers @{ 'Accept' = 'application/vnd.github.raw' }

$hasSign = $script -match 'function signStreamUrl'
$hasMarker = $script -match 'YFSP_BUILD'
Write-Host "  signStreamUrl present: $hasSign"
Write-Host "  build marker present:  $hasMarker"

if ($hasSign -and $hasMarker) {
    Write-Host "  OK: main serves the fixed script." -ForegroundColor Green
} else {
    Write-Host "  FAIL: main is serving a stale/old script!" -ForegroundColor Red
    exit 1
}

$commit = git log origin/main -1 --oneline
Write-Host "  main HEAD: $commit" -ForegroundColor Cyan
