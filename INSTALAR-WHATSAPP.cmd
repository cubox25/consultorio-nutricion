@echo off
setlocal EnableExtensions
set "HERE=%~dp0"
set "HERE=%HERE:~0,-1%"
set "TARGET=%HERE%\whatsapp-service\INSTALAR-WHATSAPP.cmd"

if not exist "%TARGET%" (
  echo ERROR: no encuentro whatsapp-service\INSTALAR-WHATSAPP.cmd
  echo Ruta esperada:
  echo %TARGET%
  pause
  exit /b 1
)

call "%TARGET%"
exit /b %ERRORLEVEL%
