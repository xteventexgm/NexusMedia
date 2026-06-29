@echo off
title NexusMedia Engine

:: %~dp0 ya trae el "\" al final, así que va directo al "src"
cd /d "%~dp0src\servidor"

:: Ejecuta Node en la misma terminal
node server.js