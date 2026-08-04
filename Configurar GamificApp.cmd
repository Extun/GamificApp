@echo off
rem ============================================================
rem  GamificApp - Configurar la aplicacion (Windows)
rem  Haz doble clic en este archivo.
rem
rem  Sirve para cambiar de opinion cuando quieras sobre las dos opciones
rem  que el instalador pregunta una sola vez:
rem
rem    1. Que otros dispositivos de la misma red puedan usar GamificApp.
rem    2. Que GamificApp se inicie sola al iniciar sesion en Windows.
rem
rem  No instala nada, no toca la base de datos y no borra ningun dato.
rem ============================================================
chcp 65001 >nul
title Configurar GamificApp

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\configurar.ps1"

echo.
pause
