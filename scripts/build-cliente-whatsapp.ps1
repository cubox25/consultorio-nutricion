# Genera un ZIP listo para mandarle a la PC del consultorio.
# Uso (desde la raiz del repo):
#   powershell -ExecutionPolicy Bypass -File scripts\build-cliente-whatsapp.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Src = Join-Path $Root "whatsapp-service"
$OutDir = Join-Path $Root "dist\WhatsApp-Consultorio"
$ZipPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "WhatsApp-Consultorio-INSTALADOR.zip"

Write-Host "Origen: $Src"
Write-Host "Salida: $OutDir"
Write-Host "ZIP:    $ZipPath"
Write-Host ""

if (-not (Test-Path (Join-Path $Src "package.json"))) {
  throw "No se encontro whatsapp-service/package.json"
}

if (Test-Path $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$copyFiles = @(
  "package.json",
  "package-lock.json",
  "start-hidden.vbs",
  "watchdog.ps1",
  "install-autostart.ps1",
  ".env.example"
)
foreach ($f in $copyFiles) {
  $from = Join-Path $Src $f
  if (Test-Path $from) {
    Copy-Item -LiteralPath $from -Destination (Join-Path $OutDir $f) -Force
  }
}

# Codigo fuente
Copy-Item -LiteralPath (Join-Path $Src "src") -Destination (Join-Path $OutDir "src") -Recurse -Force

# .env: preferir whatsapp-service/.env, sino ../.env.local
$envCandidates = @(
  (Join-Path $Src ".env"),
  (Join-Path $Root ".env.local"),
  (Join-Path $Root ".env")
)
$envCopied = $false
foreach ($e in $envCandidates) {
  if (Test-Path $e) {
    $raw = Get-Content -LiteralPath $e -Raw -ErrorAction SilentlyContinue
    if ($raw -match "NEXT_PUBLIC_SUPABASE_URL\s*=" -and $raw -match "SUPABASE_SERVICE_ROLE_KEY\s*=") {
      # Extraer solo las keys necesarias (+ opciones WA)
      $url = ([regex]::Match($raw, "(?m)^(?:NEXT_PUBLIC_)?SUPABASE_URL=(.+)$")).Groups[1].Value.Trim()
      if (-not $url) {
        $url = ([regex]::Match($raw, "(?m)^NEXT_PUBLIC_SUPABASE_URL=(.+)$")).Groups[1].Value.Trim()
      }
      $key = ([regex]::Match($raw, "(?m)^SUPABASE_SERVICE_ROLE_KEY=(.+)$")).Groups[1].Value.Trim()
      if ($url -and $key) {
        $envBody = @"
NEXT_PUBLIC_SUPABASE_URL=$url
SUPABASE_SERVICE_ROLE_KEY=$key
WHATSAPP_CONFIRMATION_ENABLED=true
WHATSAPP_REMINDER_24H_ENABLED=true
WHATSAPP_REMINDER_2H_ENABLED=false
WHATSAPP_POLL_INTERVAL=60000
WHATSAPP_STATUS_PORT=3100
WHATSAPP_TIMEZONE=America/Argentina/Buenos_Aires
WHATSAPP_PROFESSIONAL_NAME=Pamela, Lic. en Nutricion
"@
        Set-Content -LiteralPath (Join-Path $OutDir ".env") -Value $envBody -Encoding UTF8
        $envCopied = $true
        Write-Host "Se incluyo .env desde: $e"
        break
      }
    }
  }
}
if (-not $envCopied) {
  Write-Host "AVISO: no se encontro SUPABASE_URL + SERVICE_ROLE_KEY. El cliente tendra que completar .env"
  Copy-Item (Join-Path $Src ".env.example") (Join-Path $OutDir ".env") -Force
}

# Instalador visible para el cliente (raiz del ZIP)
$instalarCmd = @"
@echo off
setlocal EnableExtensions
title Instalador WhatsApp - Consultorio
color 0A
set "HERE=%~dp0"
set "HERE=%HERE:~0,-1%"

echo.
echo  ============================================================
echo   WHATSAPP CONSULTORIO - INSTALACION (UNA SOLA VEZ)
echo  ============================================================
echo.
echo   Carpeta: %HERE%
echo.

if not exist "%HERE%\package.json" goto :bad
if not exist "%HERE%\src\index.js" goto :bad
if not exist "%HERE%\install-autostart.ps1" goto :bad

where node >nul 2>&1
if errorlevel 1 (
  echo   Falta Node.js.
  echo   1^) Entra a https://nodejs.org
  echo   2^) Instala la version LTS
  echo   3^) Volve a hacer doble clic en INSTALAR.cmd
  echo.
  pause
  exit /b 1
)

if not exist "%HERE%\.env" (
  echo   Falta el archivo .env con las claves de Supabase.
  echo   Pedile a quien te paso este instalador que te lo prepare.
  echo.
  pause
  exit /b 1
)

echo   Instalando... espera unos segundos.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%\install-autostart.ps1" "%HERE%"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo   Hubo un error. Mandale una foto de esta pantalla a tu soporte.
  pause
  exit /b %ERR%
)
exit /b 0

:bad
echo   ERROR: esta carpeta esta incompleta.
echo   Descomprime TODO el ZIP y entra a la carpeta WhatsApp-Consultorio
echo   antes de hacer doble clic en INSTALAR.cmd
echo.
pause
exit /b 1
"@
Set-Content -LiteralPath (Join-Path $OutDir "INSTALAR.cmd") -Value $instalarCmd.Replace("`n", "`r`n") -Encoding ASCII

$leeme = @"
WHATSAPP DEL CONSULTORIO - INSTRUCCIONES

1) Si no tenes Node.js: entra a https://nodejs.org e instala la version LTS.
2) Doble clic en INSTALAR.cmd
3) Cuando diga LISTO, entra al panel del sistema -> WhatsApp
4) Si aparece un codigo QR, escanealo con el celular
   (WhatsApp -> Dispositivos vinculados -> Vincular dispositivo)

LISTO. No hace falta repetirlo todos los dias.
Al encender la PC, WhatsApp arranca solo.

Si un dia dice que el servicio no esta iniciado:
- Doble clic en el acceso directo "WhatsApp Consultorio" del escritorio
  o reinicia la PC.
"@
Set-Content -LiteralPath (Join-Path $OutDir "LEEME.txt") -Value $leeme.Replace("`n", "`r`n") -Encoding UTF8

# ZIP en TEMP (evita bloqueos de OneDrive) y luego copiar al escritorio
$TempPack = Join-Path $env:TEMP "WhatsApp-Consultorio-Pack"
$TempZip = Join-Path $env:TEMP "WhatsApp-Consultorio-INSTALADOR.zip"
if (Test-Path $TempPack) { Remove-Item -LiteralPath $TempPack -Recurse -Force }
Copy-Item -LiteralPath $OutDir -Destination $TempPack -Recurse -Force
Start-Sleep -Seconds 1
if (Test-Path $TempZip) { Remove-Item -LiteralPath $TempZip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($TempPack, $TempZip)
if (Test-Path $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
Copy-Item -LiteralPath $TempZip -Destination $ZipPath -Force

Write-Host ""
Write-Host "OK. Paquete listo para mandarle al cliente:"
Write-Host "  $ZipPath"
Write-Host ""
Write-Host "Pasale ese ZIP por WhatsApp/Drive (es privado: incluye claves)."
Write-Host "Ella: descomprimir -> doble clic en INSTALAR.cmd"
