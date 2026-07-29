@echo off
rem ============================================================
rem  GamificApp - Iniciar la aplicacion (Windows)
rem  Haz doble clic en este archivo.
rem
rem  Usalo cada dia despues de haber ejecutado una vez
rem  "Instalar GamificApp.cmd". Si ya esta en marcha, no la duplica.
rem ============================================================
chcp 65001 >nul
title Iniciar GamificApp

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\iniciar.ps1"
set CODIGO=%ERRORLEVEL%

echo.
if not "%CODIGO%"=="0" (
  echo   GamificApp no se pudo iniciar.
  echo   Lee el mensaje de arriba: explica que falta y como resolverlo.
  echo   Detalle tecnico: "%~dp0logs\iniciar.log"
)
echo.
pause
