# Canonical launcher for this project's persistent local database and API.
param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendPath = Join-Path $projectRoot 'backend'
$settingsPath = Join-Path $backendPath '.env.local'
$composePath = Join-Path $projectRoot 'infrastructure/compose.postgres-dev.yml'
$utf8 = [Text.UTF8Encoding]::new($false)
if (-not (Test-Path -LiteralPath $settingsPath)) {
  $databasePassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $operatorPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $settings = "PG_LOCAL_PASSWORD=$databasePassword`nADMIN_PASSWORD=$operatorPassword`nNODE_ENV=development`nDATA_DRIVER=postgres`nHOST=127.0.0.1`nPORT=3101`nALLOW_DEV_LOGIN=true`nSERVICE_AREAS=中心街道,西城区,北城区`nDATABASE_URL=postgres://citylife_dev:$databasePassword@127.0.0.1:5432/citylife_dev`n"
  [IO.File]::WriteAllText($settingsPath, $settings, $utf8)
}
docker compose --env-file $settingsPath -p citylife-local-dev -f $composePath up -d --wait --wait-timeout 100 --pull never
if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL startup failed. Check Docker availability.' }
Push-Location $backendPath
try {
  node --env-file=.env.local --require=../scripts/local_database_bootstrap.js src/migrate.js --check
  if ($LASTEXITCODE -ne 0) {
    node --env-file=.env.local --require=../scripts/local_database_bootstrap.js -e "(async()=>{const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});try{const result=await pool.query(`"SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`");if(result.rows[0].count)throw Error('Existing database needs a backed-up upgrade');await require('./src/schema-migrations').applyMigrations(pool);console.log('Initialized empty local schema');}finally{await pool.end();}})().catch(()=>{console.error('Use scripts/upgrade_local_database.js for the backed-up upgrade of an existing database');process.exitCode=1;});"
    if ($LASTEXITCODE -ne 0) { throw 'Existing database migrations need attention. Run scripts/upgrade_local_database.js --apply to back up, restore-check and apply pending migrations.' }
  }
} finally { Pop-Location }
$hasher = [Security.Cryptography.SHA256]::Create()
try { $projectHash = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot))).Replace('-','').Substring(0,12) } finally { $hasher.Dispose() }
$stateDirectory = Join-Path $env:LOCALAPPDATA ('CityLifeMiniapp/' + $projectHash)
[IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
$statePath = Join-Path $stateDirectory 'local-server.json'
$listener = Get-NetTCPConnection -LocalPort 3101 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $ownedProcess = $null
  foreach ($candidate in @($statePath,(Join-Path $backendPath '.local-sorting-server.json'),(Join-Path $backendPath '.local-server.json'))) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $state = Get-Content -LiteralPath $candidate -Raw | ConvertFrom-Json
    $candidateProcess = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if ($candidateProcess -and $state.startedAt -and @($listener.OwningProcess) -contains $state.pid -and $candidateProcess.StartTime.ToUniversalTime().Ticks -eq ([datetime]$state.startedAt).ToUniversalTime().Ticks) {
      $ownedProcess = $candidateProcess
      break
    }
  }
  if (-not $ownedProcess) { throw 'Port 3101 is occupied by an unidentified process. Resolve that port conflict before starting this API.' }
  if ($Restart) {
    Stop-Process -Id $ownedProcess.Id
    $ownedProcess.WaitForExit(5000) | Out-Null
  } elseif ((Invoke-RestMethod 'http://127.0.0.1:3101/api/v1/ready').ready) {
    Write-Output 'PASS project API ready on http://127.0.0.1:3101'
    return
  } else { throw 'The existing project API is unhealthy. Run scripts/start_local.ps1 -Restart to reload it.' }
}
$previousPort = $env:PORT
try {
  $env:PORT = '3101'
  $nodePath = (Get-Command node.exe).Source
  $process = Start-Process -FilePath $nodePath -ArgumentList @('--env-file=.env.local','--require=../scripts/local_database_bootstrap.js','src/server.js') -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDirectory 'api-out.log') -RedirectStandardError (Join-Path $stateDirectory 'api-error.log')
  [IO.File]::WriteAllText($statePath,(@{pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress),$utf8)
} finally { $env:PORT = $previousPort }
for ($attempt=0; $attempt -lt 30; $attempt++) {
  try { if ((Invoke-RestMethod 'http://127.0.0.1:3101/api/v1/ready').ready) { Write-Output 'PASS persistent local PostgreSQL and API ready on http://127.0.0.1:3101'; return } } catch {}
  if ($process.HasExited) { throw ('Local API exited. Inspect ' + (Join-Path $stateDirectory 'api-error.log')) }
  Start-Sleep -Milliseconds 300
}
throw ('Local API readiness timed out. Inspect ' + (Join-Path $stateDirectory 'api-error.log'))
