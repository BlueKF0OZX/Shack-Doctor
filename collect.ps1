$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$result = @{ ports = @(); audio = @(); programs = @(); clock = @{}; errors = @{} }
try {
  $result.ports = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Ports'" | Where-Object { $_.Present -eq $true -and $_.Name -match '\(COM\d+\)' } | ForEach-Object {
    [void]($_.Name -match '\((COM\d+)\)'); @{ port = $Matches[1]; name = $_.Name }
  })
} catch { $result.errors.ports = 'Windows port inventory unavailable' }
try {
  $result.audio = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='AudioEndpoint'" | Where-Object { $_.Present -eq $true } | ForEach-Object { @{ name = $_.Name; status = $_.Status } })
} catch { $result.errors.audio = 'Windows audio inventory unavailable' }
try {
  $result.programs = @(Get-Process | Where-Object { $_.ProcessName -match '^(wsjtx|jtdx|flrig|fldigi|omnirig|Log4OM2|HamRadioDeluxe|HRDLogbook|GridTracker|JTAlert.*|ACLog|N1MM.*)$' } | Select-Object -ExpandProperty ProcessName -Unique)
} catch { $result.errors.programs = 'Application inventory unavailable' }
try { $result.clock = @{ status = (Get-Service W32Time).Status.ToString() } }
catch { $result.errors.clock = 'Windows Time service unavailable' }
$result | ConvertTo-Json -Depth 6 -Compress
