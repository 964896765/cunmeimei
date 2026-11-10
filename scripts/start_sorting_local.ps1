# Run the updated local API without stopping the existing 3100 process.
param([switch]$Restart)
$ErrorActionPreference='Stop'
$backendPath=(Resolve-Path (Join-Path $PSScriptRoot '../backend')).Path
$statePath=Join-Path $backendPath '.local-sorting-server.json'
if(Get-NetTCPConnection -LocalPort 3101 -State Listen -ErrorAction SilentlyContinue){
 if(Test-Path -LiteralPath $statePath){
  $state=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $listener=Get-NetTCPConnection -LocalPort 3101 -State Listen
  $process=Get-Process -Id $state.pid -ErrorAction SilentlyContinue
  if($process -and $listener.OwningProcess -eq $state.pid -and $process.StartTime.ToUniversalTime().Ticks -eq ([datetime]$state.startedAt).ToUniversalTime().Ticks){
   if($Restart){Stop-Process -Id $state.pid; $process.WaitForExit(5000) | Out-Null}
   elseif((Invoke-RestMethod 'http://127.0.0.1:3101/api/v1/ready').ready){Write-Output 'PASS project sorting API already ready on loopback port 3101';return}
  }
 }
 if(Get-NetTCPConnection -LocalPort 3101 -State Listen -ErrorAction SilentlyContinue){throw 'Port 3101 is already in use; existing process left untouched.'}
}
$previousPort=$env:PORT
try{
 $env:PORT='3101'
 $process=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('--env-file=.env.local','--require=../scripts/local_database_bootstrap.js','src/server.js') -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $backendPath '.local-sorting-out.log') -RedirectStandardError (Join-Path $backendPath '.local-sorting-error.log')
 [IO.File]::WriteAllText($statePath,(@{pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
}finally{$env:PORT=$previousPort}
$ready=$false
for($attempt=0;$attempt -lt 30;$attempt++){
 try{if((Invoke-RestMethod 'http://127.0.0.1:3101/api/v1/ready').ready){$ready=$true;break}}catch{}
 Start-Sleep -Milliseconds 300
}
if(-not $ready){throw 'Updated local API did not become ready; inspect backend/.local-sorting-error.log.'}
Write-Output 'PASS updated project API ready on 127.0.0.1:3101; persistent database and port 3100 process retained.'
