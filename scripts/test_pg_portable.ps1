# Isolated Windows PostgreSQL fallback when Docker Desktop is unavailable.
param([Parameter(Mandatory=$true)][string]$BinariesPath, [switch]$FullRegression, [switch]$RecoveryOnly, [switch]$UiOnly, [switch]$JourneysOnly, [switch]$BusinessOnly, [switch]$BusinessUi, [switch]$BookingSourceUi, [switch]$ExistingUi, [switch]$WorkflowUi, [switch]$CentersUi, [switch]$NavigationUi)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$postgresBin = (Resolve-Path -LiteralPath $BinariesPath).Path
foreach ($toolName in @('initdb.exe','pg_ctl.exe','createdb.exe','pg_isready.exe')) {
 if (-not (Test-Path -LiteralPath (Join-Path $postgresBin $toolName))) { throw 'Expected complete official PostgreSQL bin directory.' }
}
$clusterRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('citylife-navigation-cluster-' + [guid]::NewGuid().ToString('N'))))
$expectedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $clusterRoot.StartsWith($expectedTemp, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($clusterRoot) -notmatch '^citylife-navigation-cluster-[a-f0-9]{32}$') { throw 'Unexpected disposable cluster directory.' }
New-Item -Path $clusterRoot -ItemType Directory | Out-Null
$clusterData = Join-Path $clusterRoot 'data'
$passwordPath = Join-Path $clusterRoot 'initial-password.txt'
$testPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText($passwordPath, $testPassword, [Text.UTF8Encoding]::new($false))
$oldDsn = $env:PG_TEST_DATABASE_URL
$oldPassword = $env:PGPASSWORD
$started = $false
$stopped = $false
try {
 $initOutput = @(& (Join-Path $postgresBin 'initdb.exe') -D $clusterData -U citylife_test --pwfile=$passwordPath --auth-host=scram-sha-256 --auth-local=trust -E UTF8 --locale=C 2>&1)
 if ($LASTEXITCODE -ne 0) { throw 'Portable PostgreSQL initialization failed; no credentials printed.' }
 Remove-Item -LiteralPath $passwordPath
 $portText = & node -e "const n=require('net').createServer();n.listen(0,'127.0.0.1',()=>{console.log(n.address().port);n.close()})"
 $testPort = [int]$portText
 if ($testPort -le 1024 -or $testPort -gt 65535 -or $testPort -eq 5432) { throw 'Invalid disposable PostgreSQL port.' }
 # Capture pg_ctl to files: inherited Windows pipes otherwise remain open in postgres.
 $serverOptions = '-h 127.0.0.1 -p ' + $testPort
 $postgresStart = Start-Process -FilePath (Join-Path $postgresBin 'pg_ctl.exe') -ArgumentList @('-D', $clusterData, '-l', (Join-Path $clusterRoot 'postgres.log'), '-o', ('"' + $serverOptions + '"'), '-w', 'start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $clusterRoot 'pgctl-start.log') -RedirectStandardError (Join-Path $clusterRoot 'pgctl-start-error.log')
 if (-not $postgresStart.WaitForExit(30000)) { throw 'Portable PostgreSQL startup timed out.' }
 & (Join-Path $postgresBin 'pg_isready.exe') -h 127.0.0.1 -p $testPort -U citylife_test -d postgres -t 5 -q
 if ($LASTEXITCODE -ne 0) { throw 'Portable PostgreSQL did not become ready.' }
 $started = $true
 $env:PGPASSWORD = $testPassword
 & (Join-Path $postgresBin 'createdb.exe') -h 127.0.0.1 -p $testPort -U citylife_test citylife_test
 if ($LASTEXITCODE -ne 0) { throw 'Disposable test database creation failed.' }
 $env:PG_TEST_DATABASE_URL = "postgres://citylife_test:$testPassword@127.0.0.1:$testPort/citylife_test"
 Write-Output "Portable PostgreSQL healthy on loopback port $testPort; existing databases untouched."
 Push-Location (Join-Path $projectRoot 'backend')
 try {
  if ($BusinessOnly) {
   node --test tests/business-progress.test.js tests/booking-source-lifecycle.test.js tests/lifecycle-maintenance.test.js tests/booking-submissions.test.js
   if ($LASTEXITCODE -ne 0) { throw 'Business edge verification failed.' }
  }
  if ($JourneysOnly) {
   node --test tests/project-journeys-integration.test.js
   if ($LASTEXITCODE -ne 0) { throw 'Per-project business journey verification failed.' }
  }
  if (-not $RecoveryOnly -and -not $UiOnly -and -not $JourneysOnly -and -not $BusinessOnly) {
   npm run verify:pg
   if ($LASTEXITCODE -ne 0) { throw 'Strict PostgreSQL verification failed.' }
  }
  if ($FullRegression) {
   foreach ($suite in @('test','test:e2e','test:permissions','test:merchant-application')) {
    npm run $suite
    if ($LASTEXITCODE -ne 0) { throw "$suite failed." }
   }
  }
  if ($FullRegression -or $RecoveryOnly) {
   $oldProcessPath = $env:PATH
   $oldNativeTools = $env:PG_TEST_NATIVE_TOOLS
   $oldToolContainer = $env:PG_TEST_TOOL_CONTAINER
   try {
    $env:PATH = $postgresBin + ';' + $oldProcessPath
    $env:PG_TEST_NATIVE_TOOLS = '1'
    $env:PG_TEST_TOOL_CONTAINER = $null
    node ../scripts/check_recovery_drill.js
    if ($LASTEXITCODE -ne 0) { throw 'Portable backup and restore verification failed.' }
   } finally {
    $env:PATH = $oldProcessPath
    $env:PG_TEST_NATIVE_TOOLS = $oldNativeTools
    $env:PG_TEST_TOOL_CONTAINER = $oldToolContainer
   }
  }
  if ($WorkflowUi) {
   node ../scripts/check_workflows_ui.js
   if ($LASTEXITCODE -ne 0) { throw 'Workflow native acceptance failed.' }
  }
  if ($ExistingUi) {
   foreach ($scriptName in @('check_login_ui.js','check_workflows_ui.js','check_workflow_privacy_ui.js')) {
    node (Join-Path '../scripts' $scriptName)
    if ($LASTEXITCODE -ne 0) { throw "Existing native acceptance failed: $scriptName" }
   }
  }
  if ($BookingSourceUi) {
   node ../scripts/check_business_progress_ui.js --booking-source
   if ($LASTEXITCODE -ne 0) { throw 'Booking source native acceptance failed.' }
  }
  if ($BusinessUi) {
   node ../scripts/check_business_progress_ui.js
   if ($LASTEXITCODE -ne 0) { throw 'Business native acceptance failed.' }
  }
  if ($CentersUi) {
   node ../scripts/check_centers_browse_ui.js
   if ($LASTEXITCODE -ne 0) { throw 'Centers native acceptance failed.' }
  }
  if ($NavigationUi) {
   node ../scripts/check_navigation_filters_ui.js
   if ($LASTEXITCODE -ne 0) { throw 'Navigation native acceptance failed.' }
  }
 } finally { Pop-Location }
} finally {
 $env:PG_TEST_DATABASE_URL = $oldDsn
 $env:PGPASSWORD = $oldPassword
 $testPassword = $null
 if ($started -or (Test-Path -LiteralPath (Join-Path $clusterData 'postmaster.pid'))) {
  $stopOutput = @(& (Join-Path $postgresBin 'pg_ctl.exe') -D $clusterData -m fast -w stop 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL could not stop; cluster preserved.' }
  $stopped = $true
 }
 if (-not $started -or $stopped) {
  $resolvedCluster = [IO.Path]::GetFullPath($clusterRoot)
  if (-not $resolvedCluster.StartsWith($expectedTemp, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedCluster) -notmatch '^citylife-navigation-cluster-[a-f0-9]{32}$') { throw 'Cluster cleanup boundary check failed.' }
  Remove-Item -LiteralPath $resolvedCluster -Recurse -Force
  Write-Output 'PASS: only the task-created disposable PostgreSQL cluster was stopped and removed.'
 }
}
Write-Output 'PASS: real portable PostgreSQL verification and cleanup.'
