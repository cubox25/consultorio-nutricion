@echo off
setlocal EnableExtensions
pushd "%~dp0" || (
  echo ERROR: no se pudo entrar a la carpeta del script.
  pause
  exit /b 1
)

echo.
echo === WhatsApp del consultorio - inicio automatico ===
echo.
echo Carpeta: %CD%
echo.

if not exist "package.json" (
  echo ERROR: no estas en whatsapp-service.
  echo Abr?? la carpeta whatsapp-service y ejecuta este archivo ahi.
  echo Ruta actual: %CD%
  popd
  pause
  exit /b 1
)

if not exist "start-hidden.vbs" (
  echo ERROR: falta start-hidden.vbs en:
  echo %CD%
  popd
  pause
  exit /b 1
)

if not exist "src\index.js" (
  echo ERROR: falta src\index.js
  popd
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: No esta instalado Node.js.
  echo Descarga LTS en https://nodejs.org e intenta de nuevo.
  popd
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias (solo la primera vez^)...
  call npm.cmd install --prefix "%CD%"
  if errorlevel 1 (
    echo ERROR: fallo npm install.
    popd
    pause
    exit /b 1
  )
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%STARTUP%" (
  echo ERROR: no se encontro la carpeta Inicio de Windows.
  popd
  pause
  exit /b 1
)

set "VBS=%STARTUP%\consultorio-pamela-whatsapp.vbs"
set "TARGET=%CD%\start-hidden.vbs"

> "%VBS%" (
  echo Set sh = CreateObject^("WScript.Shell"^)
  echo sh.Run "wscript.exe ""%TARGET%""", 0, False
)

echo Autostart instalado en:
echo %VBS%
echo.

echo Arrancando WhatsApp ahora en segundo plano...
cscript //nologo "%CD%\start-hidden.vbs"
timeout /t 3 /nobreak >nul

echo.
echo Listo.
echo - Al reiniciar la PC, WhatsApp vuelve solo (sin CMD^).
echo - En el panel anda a WhatsApp, Actualizar, y escanea el QR.
echo.
popd
pause
endlocal
