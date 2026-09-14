# Arranque automatico de WhatsApp (sin CMD visible)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "=== WhatsApp del consultorio - inicio automatico ==="
Write-Host "Carpeta: $PWD"
Write-Host ""

if (-not (Test-Path "package.json")) {
  Write-Host "ERROR: ejecuta este script desde whatsapp-service"
  Read-Host "Enter para cerrar"
  exit 1
}
if (-not (Test-Path "start-hidden.vbs")) {
  Write-Host "ERROR: falta start-hidden.vbs"
  Read-Host "Enter para cerrar"
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: instala Node.js LTS desde https://nodejs.org"
  Read-Host "Enter para cerrar"
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Instalando dependencias (solo la primera vez)..."
  npm.cmd install --prefix $PWD
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: fallo npm install"
    Read-Host "Enter para cerrar"
    exit 1
  }
}

$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$vbs = Join-Path $startup "consultorio-pamela-whatsapp.vbs"
$target = Join-Path $PWD "start-hidden.vbs"
@"
Set sh = CreateObject("WScript.Shell")
sh.Run "wscript.exe ""$target""", 0, False
"@ | Set-Content -LiteralPath $vbs -Encoding ASCII

Write-Host "Autostart instalado en:"
Write-Host $vbs
Write-Host ""
Write-Host "Arrancando WhatsApp ahora..."
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$target`"" -WindowStyle Hidden

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Listo. En el panel: WhatsApp -> Actualizar -> escanear QR."
Write-Host ""
Read-Host "Enter para cerrar"
