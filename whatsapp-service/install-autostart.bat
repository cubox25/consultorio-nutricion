@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  === WhatsApp del consultorio — inicio automatico ===
echo.
echo  Esto hace que WhatsApp arranque SOLO al encender la PC,
echo  sin abrir la ventana negra de CMD.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: No esta instalado Node.js.
  echo  Descarga LTS en https://nodejs.org e intenta de nuevo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  Instalando dependencias (solo la primera vez^)...
  call npm install
  if errorlevel 1 (
    echo  ERROR: fallo npm install.
    pause
    exit /b 1
  )
)

if not exist "start-hidden.vbs" (
  echo  ERROR: falta start-hidden.vbs en esta carpeta.
  pause
  exit /b 1
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%STARTUP%" (
  echo  ERROR: no se encontro la carpeta Inicio de Windows.
  pause
  exit /b 1
)

set "VBS=%STARTUP%\consultorio-pamela-whatsapp.vbs"
set "TARGET=%~dp0start-hidden.vbs"

(
  echo Set sh = CreateObject^("WScript.Shell"^)
  echo sh.Run "wscript.exe ""%TARGET%""", 0, False
) > "%VBS%"

echo  Autostart instalado en:
echo  %VBS%
echo.

echo  Arrancando WhatsApp ahora en segundo plano...
cscript //nologo "%~dp0start-hidden.vbs"
timeout /t 3 /nobreak >nul

echo.
echo  Listo.
echo  - Al reiniciar la PC, WhatsApp vuelve solo (sin CMD^).
echo  - En el panel anda a WhatsApp, Actualizar, y escanea el QR.
echo.
pause
endlocal
