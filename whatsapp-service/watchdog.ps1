# Watchdog: si WhatsApp no responde en el puerto 3100, lo reinicia en segundo plano.
$ErrorActionPreference = "SilentlyContinue"
$ServiceDir = $PSScriptRoot
$LogDir = Join-Path $env:LOCALAPPDATA "consultorio-pamela-whatsapp-logs"
$LogFile = Join-Path $LogDir "watchdog.log"
$Port = 3100
$StartVbs = Join-Path $ServiceDir "start-hidden.vbs"
$LockFile = Join-Path $LogDir "watchdog.lock"

function Write-Log([string]$msg) {
  try {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  } catch {}
}

function Test-WhatsAppUp {
  try {
    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/status")
    $req.Method = "GET"
    $req.Timeout = 2500
    $req.ReadWriteTimeout = 2500
    $resp = $req.GetResponse()
    $resp.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-AlreadyStarting {
  if (-not (Test-Path $LockFile)) { return $false }
  try {
    $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($age.TotalMinutes -lt 3) { return $true }
  } catch {}
  return $false
}

if (-not (Test-Path $StartVbs)) {
  Write-Log "ERROR: no existe start-hidden.vbs en $ServiceDir"
  exit 1
}

if (Test-WhatsAppUp) {
  exit 0
}

if (Test-AlreadyStarting) {
  Write-Log "Ya hay un arranque reciente; se omite."
  exit 0
}

try {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
  Set-Content -LiteralPath $LockFile -Value (Get-Date -Format o) -Encoding ASCII
} catch {}

Write-Log "Servicio caido. Reiniciando..."
try {
  Start-Process -FilePath "wscript.exe" -ArgumentList "`"$StartVbs`"" -WindowStyle Hidden
} catch {
  Write-Log ("ERROR al iniciar: " + $_.Exception.Message)
  exit 1
}

Start-Sleep -Seconds 8
if (Test-WhatsAppUp) {
  Write-Log "OK: servicio respondiendo."
  exit 0
}

Write-Log "Aviso: se lanzo pero todavia no responde (puede estar generando QR)."
exit 0
