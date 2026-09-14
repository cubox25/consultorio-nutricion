@echo off
setlocal EnableExtensions
set "HERE=%~dp0"
set "HERE=%HERE:~0,-1%"
call "%HERE%\INSTALAR-WHATSAPP.cmd"
exit /b %ERRORLEVEL%
