# Start this project's persistent local database and loopback API. Never removes data.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backend = Join-Path $root 'backend'
$settings = Join-Path $backend '.env.local'
$compose = Join-Path $root 'infrastructure/compose.postgres-dev.yml'
$utf8 = New-Object System.Text.UTF8Encoding($false)
if (-not (Test-Path -LiteralPath $settings)) {
  $dbPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $adminPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $content = "PG_LOCAL_PASSWORD=$dbPassword`nADMIN_PASSWORD=$adminPassword`nNODE_ENV=development`nDATA_DRIVER=postgres`nHOST=127.0.0.1`nPORT=3100`nALLOW_DEV_LOGIN=true`nSERVICE_AREAS=中心街道,西城区,北城区`n"
  [IO.File]::WriteAllText($settings, $content, $utf8)
}
docker compose --env-file $settings -p citylife-local-dev -f $compose up -d --wait --wait-timeout 100 --pull never
if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL failed to initialize; existing volume retained.' }
$binding = @(docker compose --env-file $settings -p citylife-local-dev -f $compose port postgres 5432)
if ($LASTEXITCODE -ne 0 -or $binding.Count -ne 1 -or $binding[0] -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Could not resolve local database port.' }
$dbPort = $Matches[1]
$content = [IO.File]::ReadAllText($settings)
$dbPassword = [regex]::Match($content, '(?m)^PG_LOCAL_PASSWORD=(.+)$').Groups[1].Value.Trim()
if (-not $dbPassword) { throw 'Local database password missing.' }
$content = [regex]::Replace($content, '(?m)^DATABASE_URL=.*\r?\n?', '')
$content += "DATABASE_URL=postgres://citylife_dev:$dbPassword@127.0.0.1:$dbPort/citylife_dev`n"
[IO.File]::WriteAllText($settings, $content, $utf8)
Push-Location $backend
try {
  node --env-file=.env.local src/migrate.js
  if ($LASTEXITCODE -ne 0) { throw 'Local database migration failed.' }
  $listener = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    $statePath = Join-Path $backend '.local-server.json'
    if (Test-Path -LiteralPath $statePath) {
      $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
      $existing = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
      $details = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $state.pid)
      if ($existing -and @($listener.OwningProcess) -contains $state.pid -and $details.CommandLine -match '--env-file=\.env\.local.*src/server\.js' -and (!$state.startedAt -or $existing.StartTime.ToUniversalTime().Ticks -eq ([datetime]$state.startedAt).ToUniversalTime().Ticks)) {
        $result = Invoke-RestMethod 'http://127.0.0.1:3100/api/v1/ready'
        if ($result.ready) { Write-Host 'PASS: this project local API is already running; persistent data retained.'; return }
      }
    }
    throw 'Port 3100 is already in use; existing process was left untouched.'
  }
  $nodePath = (Get-Command node.exe).Source
  $process = Start-Process -FilePath $nodePath -ArgumentList @('--env-file=.env.local', 'src/server.js') -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $backend '.local-server-out.log') -RedirectStandardError (Join-Path $backend '.local-server-error.log')
  [IO.File]::WriteAllText((Join-Path $backend '.local-server.json'), (@{pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress), $utf8)
  $ready = $false
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { $result = Invoke-RestMethod 'http://127.0.0.1:3100/api/v1/ready'; if ($result.ready) { $ready=$true; break } } catch {}
    if ($process.HasExited) { throw 'Local API exited; inspect backend/.local-server-error.log.' }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Local API readiness timed out.' }
  Write-Host 'PASS: persistent development PostgreSQL and API ready on http://127.0.0.1:3100'
  Write-Host 'Credentials remain server-side in backend/.env.local; development data is retained.'
} finally { Pop-Location }
