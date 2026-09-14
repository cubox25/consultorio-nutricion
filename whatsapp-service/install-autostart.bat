@echo off
setlocal EnableExtensions
pushd "%~dp0" || exit /b 1
if not exist "package.json" (
  echo ERROR: ejecuta esto dentro de whatsapp-service
  pause
  exit /b 1
)
echo Llamando al instalador magico...
call "%CD%\INSTALAR-WHATSAPP.cmd"
endlocal
