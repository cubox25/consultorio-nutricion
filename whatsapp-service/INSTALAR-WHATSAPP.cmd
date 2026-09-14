@echo off
setlocal EnableExtensions
pushd "%~dp0" || (
  echo ERROR: no se pudo abrir la carpeta del instalador.
  pause
  exit /b 1
)

echo.
echo  INSTALADOR MAGICO WHATSAPP - CONSULTORIO
echo  ========================================
echo  Carpeta: %CD%
echo.

if not exist "package.json" (
  echo ERROR: este archivo debe estar dentro de whatsapp-service
  popd
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\install-autostart.ps1"
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
