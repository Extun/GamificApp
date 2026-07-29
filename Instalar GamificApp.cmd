@echo off
rem ============================================================
rem  GamificApp - Instalacion local (Windows)
rem  Haz doble clic en este archivo.
rem
rem  Requisitos previos: Node.js y MySQL 8 ya instalados.
rem  El detalle de todo lo que ocurre queda en logs\instalador.log
rem ============================================================
chcp 65001 >nul
title Instalar GamificApp

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\instalar.ps1" %*
set CODIGO=%ERRORLEVEL%

echo.
if not "%CODIGO%"=="0" (
  echo   La instalacion NO se completo.
  echo   Lee el mensaje de arriba: explica que falta y como resolverlo.
  echo   Detalle tecnico: "%~dp0logs\instalador.log"
)
echo.
pause
