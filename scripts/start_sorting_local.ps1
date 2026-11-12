# Compatibility entry point for the canonical local API launcher.
param([switch]$Restart)
& (Join-Path $PSScriptRoot 'start_local.ps1') -Restart:$Restart
