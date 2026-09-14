# Instalador magico de WhatsApp para la PC del consultorio.
# UNA sola vez. Despues arranca solo y se recupera si se cae.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Pause-End([string]$msg = "") {
  if ($msg) { Write-Host $msg }
  Write-Host ""
  Read-Host "Enter para cerrar"
}

Write-Host ""
Write-Host "============================================"
Write-Host "  INSTALADOR WHATSAPP - CONSULTORIO"
Write-Host "============================================"
Write-Host ""
Write-Host "Carpeta: $PWD"
Write-Host ""

if (-not (Test-Path "package.json") -or -not (Test-Path "src\index.js")) {
  Pause-End "ERROR: este instalador debe ejecutarse dentro de la carpeta whatsapp-service."
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Pause-End "ERROR: falta Node.js. Instala Node LTS desde https://nodejs.org y vuelve a ejecutar esto."
  exit 1
}

Write-Host "[1/5] Dependencias..."
if (-not (Test-Path "node_modules")) {
  npm.cmd install --prefix $PWD
  if ($LASTEXITCODE -ne 0) {
    Pause-End "ERROR: fallo npm install."
    exit 1
  }
} else {
  Write-Host "      ya estaban instaladas."
}

if (-not (Test-Path "start-hidden.vbs")) {
  Pause-End "ERROR: falta start-hidden.vbs"
  exit 1
}
if (-not (Test-Path "watchdog.ps1")) {
  Pause-End "ERROR: falta watchdog.ps1"
  exit 1
}

Write-Host "[2/5] Inicio con Windows (carpeta Inicio)..."
$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
if (-not (Test-Path $startup)) {
  Pause-End "ERROR: no se encontro la carpeta Inicio de Windows."
  exit 1
}
$startupVbs = Join-Path $startup "consultorio-pamela-whatsapp.vbs"
$watchdogPath = Join-Path $PWD "watchdog.ps1"
$startVbs = Join-Path $PWD "start-hidden.vbs"
@"
Set sh = CreateObject("WScript.Shell")
sh.Run "wscript.exe ""$startVbs""", 0, False
"@ | Set-Content -LiteralPath $startupVbs -Encoding ASCII
Write-Host "      $startupVbs"

Write-Host "[3/5] Tarea programada + watchdog (cada 5 min)..."
$taskName = "ConsultorioPamelaWhatsApp"
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdogPath`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerRepeat = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon, $triggerRepeat) -Settings $settings -Force | Out-Null
  Write-Host "      Tarea: $taskName"
} catch {
  Write-Host "      Aviso: no se pudo crear la tarea programada ($($_.Exception.Message))"
  Write-Host "      Igual queda el inicio automatico al encender Windows."
}

Write-Host "[4/5] Acceso directo en el escritorio..."
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "WhatsApp Consultorio.lnk"
try {
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($lnkPath)
  $lnk.TargetPath = "wscript.exe"
  $lnk.Arguments = "`"$startVbs`""
  $lnk.WorkingDirectory = $PWD
  $lnk.WindowStyle = 7
  $lnk.Description = "Iniciar WhatsApp del consultorio (segundo plano)"
  $lnk.Save()
  Write-Host "      $lnkPath"
} catch {
  Write-Host "      Aviso: no se pudo crear el acceso directo."
}

Write-Host "[5/5] Arrancando WhatsApp ahora..."
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$startVbs`"" -WindowStyle Hidden
Start-Sleep -Seconds 4
# Disparar watchdog una vez
try {
  Start-Process -FilePath "powershell.exe" -ArgumentList $arg -WindowStyle Hidden
} catch {}

Write-Host ""
Write-Host "============================================"
Write-Host "  LISTO - UNA SOLA VEZ"
Write-Host "============================================"
Write-Host ""
Write-Host "Que tiene que hacer ella a partir de ahora:"
Write-Host "  1) Encender la PC (WhatsApp arranca solo)."
Write-Host "  2) Entrar al panel -> WhatsApp."
Write-Host "  3) Si pide QR, escanear UNA vez."
Write-Host ""
Write-Host "Si algun dia dice 'servicio no iniciado':"
Write-Host "  - Doble clic en el acceso directo 'WhatsApp Consultorio'"
Write-Host "    del escritorio (o reiniciar la PC)."
Write-Host ""
Write-Host "Nota: WhatsApp a veces pide volver a vincular (raro)."
Write-Host "En ese caso solo se escanea el QR otra vez en el panel."
Write-Host ""
Pause-End
