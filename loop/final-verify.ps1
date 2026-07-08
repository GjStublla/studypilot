$ErrorActionPreference = 'Continue'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Ext = if ($env:STUDYPILOT_EXTENSION_ROOT) {
  $env:STUDYPILOT_EXTENSION_ROOT
} else {
  (Resolve-Path (Join-Path $Root '..\studypilot-extension')).Path
}
$Fail = 0

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Step
  )

  Write-Host "==> $Label"
  & $Step
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Write-Host "FAILED: $Label"
    $script:Fail = 1
    $global:LASTEXITCODE = 0
  }
}

function Invoke-Rg {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string[]]$Paths
  )

  Invoke-Step $Label {
    & rg -q $Pattern @Paths
  }
}

Push-Location $Root
Invoke-Step 'main build' { npm run build }
Pop-Location

if (Test-Path -LiteralPath $Ext) {
  Push-Location $Ext
  Invoke-Step 'extension build' { npm run build }
  Pop-Location
} else {
  Write-Host "FAILED: extension root not found at $Ext"
  $Fail = 1
}

Invoke-Rg 'AC-00 history request contract' 'history' @(
  (Join-Path $Root 'supabase/functions/socratic-coach/index.ts'),
  (Join-Path $Ext 'src/shared/studypilotSupabase.ts')
)

Invoke-Rg 'AC-01 gemini multimodal parts' 'inlineData|parts' @(
  (Join-Path $Root 'supabase/functions/shared/gemini.ts')
)
Invoke-Rg 'AC-01 coach images contract' 'images' @(
  (Join-Path $Root 'supabase/functions/socratic-coach/index.ts')
)

Invoke-Rg 'AC-02 compressed screenshot wiring' 'createImageBitmap|OffscreenCanvas|jpeg|images' @(
  (Join-Path $Ext 'src/background'),
  (Join-Path $Ext 'src/shared/studypilotSupabase.ts')
)
& rg -q 'image payloads are not wired|Image sharing is not wired yet|Snapshot capture works; image is not sent yet' (Join-Path $Ext 'src')
if ($LASTEXITCODE -eq 0) {
  Write-Host 'FAILED: AC-02 stale screenshot copy still present'
  $Fail = 1
}
$global:LASTEXITCODE = 0

Invoke-Rg 'AC-03 running transcript state' 'atSeconds|transcript|history' @(
  (Join-Path $Ext 'src/content/FloatingStudyPilot.tsx'),
  (Join-Path $Ext 'src/shared')
)
Invoke-Rg 'AC-03 persisted transcript offsets' 'time_offset_seconds' @(
  (Join-Path $Ext 'src/shared/studypilotSupabase.ts')
)

$Migrations = Get-ChildItem -LiteralPath (Join-Path $Root 'supabase/migrations') -File -ErrorAction SilentlyContinue
if (-not ($Migrations | Where-Object { $_.Name -match 'session.*captures|screenshot' })) {
  Write-Host 'FAILED: no session capture/screenshot migration'
  $Fail = 1
}
Invoke-Rg 'AC-04 storage and screenshot path wiring' 'session-captures|screenshot_path' @(
  (Join-Path $Root 'supabase'),
  (Join-Path $Ext 'src'),
  (Join-Path $Root 'src')
)

& rg -q 'SpeechRecognition|webkitSpeechRecognition' (Join-Path $Ext 'src/content')
if ($LASTEXITCODE -eq 0) {
  Write-Host 'AC-05: speech hooks present (optional)'
} else {
  Write-Host 'AC-05: skipped (optional)'
}
$global:LASTEXITCODE = 0

if ($Fail -eq 0) {
  Write-Host 'final-verify: PASS (PowerShell matrix equivalent; AC-06 live E2E still requires deploy/manual transcript)'
  exit 0
}

Write-Host 'final-verify: FAIL'
exit 1
