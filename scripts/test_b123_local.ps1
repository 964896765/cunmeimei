param([switch]$Focused,[switch]$UiOnly)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskCompose = Join-Path $taskRoot 'infrastructure/compose.postgres-test.yml'
$taskProject = 'citylife-b123-' + [guid]::NewGuid().ToString('N')
$taskReport = Join-Path $taskRoot 'docs/remediation/b123-2026-11-18'
New-Item -ItemType Directory -Path $taskReport -Force | Out-Null
$taskPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$env:PG_LOCAL_PASSWORD = $taskPassword
$env:CITYLIFE_AUDIT_OUTPUT = Join-Path $taskReport 'project-journeys'
try {
    docker compose -p $taskProject -f $taskCompose up -d --wait --wait-timeout 90 --pull never
    if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL startup failed' }
    $taskPort = (docker compose -p $taskProject -f $taskCompose port pgtest 5432).Trim()
    if ($taskPort -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Unexpected test database binding' }
    $env:PG_TEST_DATABASE_URL = 'postgres://citylife_test:' + $taskPassword + '@127.0.0.1:' + $Matches[1] + '/citylife_test'
    Push-Location (Join-Path $taskRoot 'backend')
    try {
        if ($UiOnly) {
            node ../scripts/check_b123_ui.js *> (Join-Path $taskReport 'ui.log')
        } elseif ($Focused) {
            node --test tests/cursor-pagination.test.js *> (Join-Path $taskReport 'pagination-pg.log')
        } else {
            node src/run-tests.js *> (Join-Path $taskReport 'full-pg.log')
        }
        if ($LASTEXITCODE -ne 0) { throw 'Regression failed; see scoped report log' }
    } finally { Pop-Location }
} finally {
    # Only this newly created random test project is eligible for cleanup.
    if ($taskProject -notmatch '^citylife-b123-[a-f0-9]{32}$') { throw 'Invalid test cleanup target' }
    docker compose -p $taskProject -f $taskCompose down --volumes --remove-orphans
    if ($LASTEXITCODE -ne 0) { throw 'Isolated project cleanup failed' }
    Remove-Item Env:PG_TEST_DATABASE_URL,Env:PG_LOCAL_PASSWORD,Env:CITYLIFE_AUDIT_OUTPUT -ErrorAction SilentlyContinue
}
