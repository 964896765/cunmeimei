# Exercise the failure path using real disposable Docker resources, without starting PostgreSQL.
$ErrorActionPreference = 'Stop'
function docker {
  if ($args -contains 'up') {
    $createArgs = @($args[0..4]) + @('create', '--pull', 'never')
    & docker.exe @createArgs
    if ($LASTEXITCODE -ne 0) { throw 'Fault setup could not create disposable resources.' }
    Write-Host 'INJECTED: startup failure after actual resource creation.'
    $global:LASTEXITCODE = 17
  } else {
    & docker.exe @args
    $global:LASTEXITCODE = $LASTEXITCODE
  }
}
$caught = $false
try { & "$PSScriptRoot/test_pg_local.ps1" } catch {
  if ($_.Exception.Message -ne 'PostgreSQL test container failed to start.') { throw }
  $caught = $true
  Write-Host 'Expected startup error propagated.'
}
if (-not $caught) { throw 'Startup failure was incorrectly accepted.' }
if ($env:PG_LOCAL_PASSWORD -or $env:PG_TEST_DATABASE_URL) { throw 'Temporary database credentials leaked.' }
Write-Host 'PASS: startup failure propagated, resources removed, temporary environment cleared.'
