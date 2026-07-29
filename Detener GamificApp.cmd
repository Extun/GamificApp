@echo off
rem ============================================================
rem  GamificApp - Detener la aplicacion (Windows)
rem  Haz doble clic en este archivo.
rem
rem  Cierra unicamente los procesos que inicio GamificApp.
rem  No borra ningun dato: todo sigue guardado para la proxima vez.
rem ============================================================
chcp 65001 >nul
title Detener GamificApp

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\detener.ps1"

echo.
pause
