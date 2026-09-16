param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
try {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) { throw 'Install Node.js 22 or newer from https://nodejs.org, then open Shack Doctor again.' }
  $nodeVersion = (& $nodeCommand.Source --version)
  if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) { throw 'Shack Doctor needs Node.js 22 or newer.' }
  $stationPort = if ($env:SHACK_DOCTOR_PORT) { [int]$env:SHACK_DOCTOR_PORT } else { 4783 }
  if ($stationPort -lt 1 -or $stationPort -gt 65535) { throw 'SHACK_DOCTOR_PORT must be between 1 and 65535.' }
  $stationUrl = "http://127.0.0.1:$stationPort"
  $existingStation = $null
  try { $existingStation = Invoke-RestMethod "$stationUrl/api/state" -TimeoutSec 2 } catch { }
  if ($existingStation.application -eq 'shack-doctor') {
    if (-not $NoBrowser) { Start-Process $stationUrl }
    Write-Host 'Opened the running Shack Doctor station.'
    exit 0
  }
  # Wait for the service before opening its page. No system settings are changed.
  $browserHelper = @"
for (`$attempt = 0; `$attempt -lt 40; `$attempt++) {
  try {
    `$station = Invoke-RestMethod '$stationUrl/api/state' -TimeoutSec 1
    if (`$station.application -eq 'shack-doctor') { Start-Process '$stationUrl'; exit }
  } catch { }
  Start-Sleep -Milliseconds 250
}
"@
  $encodedHelper = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($browserHelper))
  if (-not $NoBrowser) { Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $encodedHelper) }
  Write-Host "Shack Doctor - $stationUrl"
  Write-Host 'Keep this window open. Press Ctrl+C to stop the local service.'
  & $nodeCommand.Source (Join-Path $PSScriptRoot 'server.mjs')
  exit $LASTEXITCODE
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
