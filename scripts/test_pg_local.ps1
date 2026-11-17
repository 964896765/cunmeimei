# V0.25: isolated local PostgreSQL; project-scoped disposable named volume.
param([switch]$FullRegression, [switch]$RecoveryOnly, [switch]$UiAcceptance, [switch]$WorkflowUi, [switch]$LoginUi, [switch]$CentersUi, [switch]$NavigationUi, [switch]$ExperienceUi)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$compose = Join-Path $root 'infrastructure/compose.postgres-test.yml'
foreach ($command in @('docker', 'node', 'npm')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command was not found." }
}
$project = 'citylife-v25-' + [guid]::NewGuid().ToString('N')
$oldPassword = $env:PG_LOCAL_PASSWORD
$oldDsn = $env:PG_TEST_DATABASE_URL
$Password = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$env:PG_LOCAL_PASSWORD = $Password
$attempted = $false
$failure = $null
function Write-SafeDockerLogs {
  $lines = @(docker compose -p $project -f $compose logs --no-color --tail 100 2>&1)
  foreach ($line in $lines) { Write-Host ([string]$line).Replace($Password, '[REDACTED]') }
}
try {
  Write-Host "Isolated Compose project: $project"
  $attempted = $true
  docker compose -p $project -f $compose up -d --wait --wait-timeout 90 --pull never
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL test container failed to start.' }
  $portOutput = @(docker compose -p $project -f $compose port pgtest 5432)
  if ($LASTEXITCODE -ne 0 -or $portOutput.Count -ne 1 -or $portOutput[0] -notmatch '^127\.0\.0\.1:(\d+)\s*$') {
    throw 'Could not determine the dynamically assigned PostgreSQL loopback port.'
  }
  $testPort = [int]$Matches[1]
  if ($testPort -lt 1 -or $testPort -gt 65535 -or $testPort -eq 5432) { throw 'Invalid or non-random test PostgreSQL port.' }
  Write-Host "PostgreSQL healthy on loopback port $testPort"
  $encoded = [uri]::EscapeDataString($Password)
  $env:PG_TEST_DATABASE_URL = "postgres://citylife_test:$encoded@127.0.0.1:$testPort/citylife_test"
  Push-Location (Join-Path $root 'backend')
  try {
    if (-not $ExperienceUi) {
      npm install
      if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    }
    if (-not $RecoveryOnly -and -not $ExperienceUi) {
      npm run verify:pg
      if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL integration test failed.' }
    }
    if ($FullRegression) {
      foreach ($suite in @('test', 'test:e2e', 'test:permissions', 'test:merchant-application')) {
        npm run $suite
        if ($LASTEXITCODE -ne 0) { throw "$suite failed." }
      }
    }
    if ($FullRegression -or $RecoveryOnly) {
      $env:PG_TEST_TOOL_CONTAINER = (docker compose -p $project -f $compose ps -q pgtest).Trim()
      try {
        node ../scripts/check_recovery_drill.js
        if ($LASTEXITCODE -ne 0) { throw 'Backup restore drill failed.' }
      } finally { Remove-Item Env:PG_TEST_TOOL_CONTAINER -ErrorAction SilentlyContinue }
    }
    if ($UiAcceptance) {
      node ../scripts/check_project_polish_ui.js
      if ($LASTEXITCODE -ne 0) { throw 'Product UI acceptance failed.' }
    }
    if ($LoginUi) {
      node ../scripts/check_login_ui.js
      if ($LASTEXITCODE -ne 0) { throw 'Login UI acceptance failed.' }
    }
    if ($WorkflowUi) {
      node ../scripts/check_workflows_ui.js
      if ($LASTEXITCODE -ne 0) { throw 'Business workflow UI acceptance failed.' }
    }
    if ($CentersUi) {
      node ../scripts/check_centers_browse_ui.js
      if ($LASTEXITCODE -ne 0) { throw 'Centers and browse UI acceptance failed.' }
    }
    if ($NavigationUi) {
      node ../scripts/check_navigation_filters_ui.js
      if ($LASTEXITCODE -ne 0) { throw 'Navigation and filter UI acceptance failed.' }
    }
    if ($ExperienceUi) {
      node ../scripts/check_experience_refinement_ui.js
      if ($LASTEXITCODE -ne 0) { throw 'Experience native acceptance failed.' }
    }
  } finally { Pop-Location }
} catch {
  $failure = $_
  try { Write-SafeDockerLogs } catch { Write-Warning 'Container logs unavailable.' }
} finally {
  try {
    if ($attempted) {
      # Keep password available until Compose has parsed and completed down.
      docker compose -p $project -f $compose down --volumes --remove-orphans
      if ($LASTEXITCODE -ne 0) { throw "Cleanup failed for isolated project $project" }
      foreach ($kind in @('container', 'network', 'volume')) {
        $remaining = @(docker $kind ls --quiet --filter "label=com.docker.compose.project=$project")
        if ($LASTEXITCODE -ne 0 -or $remaining.Count -ne 0) { throw "Cleanup verification failed: $kind for $project" }
      }
      Write-Host 'PASS: isolated project containers, networks and volumes removed.'
    }
  } finally {
    Remove-Item Env:PG_TEST_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:PG_LOCAL_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $oldPassword) { $env:PG_LOCAL_PASSWORD = $oldPassword }
    if ($null -ne $oldDsn) { $env:PG_TEST_DATABASE_URL = $oldDsn }
    $Password = $null
    $encoded = $null
  }
}
if ($failure) { throw $failure }
Write-Host 'PASS: real isolated PostgreSQL integration suite and cleanup.'
