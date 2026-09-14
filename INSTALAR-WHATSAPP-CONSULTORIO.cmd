@echo off
setlocal EnableExtensions
title Instalador WhatsApp - Consultorio
color 0A

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "SVC=%ROOT%\whatsapp-service"
set "PS1=%SVC%\install-autostart.ps1"

echo.
echo  ============================================================
echo   INSTALADOR WHATSAPP - PC DEL CONSULTORIO
echo  ============================================================
echo.
echo   Esto se hace UNA sola vez.
echo   Despues arranca solo al prender la PC.
echo.
echo   Carpeta del proyecto:
echo   %ROOT%
echo.

if not exist "%SVC%\package.json" goto :missing
if not exist "%SVC%\src\index.js" goto :missing
if not exist "%PS1%" goto :missing

where node >nul 2>&1
if errorlevel 1 (
  echo   ERROR: falta Node.js en esta PC.
  echo.
  echo   1^) Entra a https://nodejs.org
  echo   2^) Instala la version LTS
  echo   3^) Reinicia esta ventana y vuelve a hacer doble clic
  echo      en INSTALAR-WHATSAPP-CONSULTORIO.cmd
  echo.
  pause
  exit /b 1
)

echo   Todo OK. Abriendo instalador...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" "%SVC%"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo   Hubo un problema en la instalacion (codigo %ERR%^).
  echo   Si podes, mandale una foto de esta pantalla a quien te ayudo.
  echo.
  pause
  exit /b %ERR%
)
exit /b 0

:missing
echo   ERROR: no encuentro la carpeta whatsapp-service completa.
echo.
echo   Tiene que existir:
echo     %SVC%\package.json
echo     %SVC%\src\index.js
echo     %SVC%\install-autostart.ps1
echo.
echo   Abrí la carpeta CONSULTORIO-NUTRICION (la del sistema^)
echo   y ahi hace doble clic en INSTALAR-WHATSAPP-CONSULTORIO.cmd
echo.
pause
exit /b 1
