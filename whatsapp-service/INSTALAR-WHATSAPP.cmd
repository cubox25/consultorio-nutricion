@echo off
setlocal EnableExtensions
set "HERE=%~dp0"
set "HERE=%HERE:~0,-1%"

echo.
echo  INSTALADOR MAGICO WHATSAPP - CONSULTORIO
echo  ========================================
echo  Carpeta del instalador:
echo  %HERE%
echo.

if exist "%HERE%\package.json" if exist "%HERE%\src\index.js" goto :run

if exist "%HERE%\whatsapp-service\package.json" if exist "%HERE%\whatsapp-service\src\index.js" (
  set "HERE=%HERE%\whatsapp-service"
  echo  Detecte whatsapp-service dentro de esta carpeta.
  echo  Usando: %HERE%
  echo.
  goto :run
)

echo  ERROR: no encuentro package.json + src\index.js
echo.
echo  Abrí el Explorador y entrá a la carpeta:
echo    CONSULTORIO-NUTRICION\whatsapp-service
echo  Ahi hace doble clic en INSTALAR-WHATSAPP.cmd
echo.
pause
exit /b 1

:run
if not exist "%HERE%\install-autostart.ps1" (
  echo  ERROR: falta install-autostart.ps1 en:
  echo  %HERE%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%\install-autostart.ps1" "%HERE%"
set ERR=%ERRORLEVEL%
exit /b %ERR%
