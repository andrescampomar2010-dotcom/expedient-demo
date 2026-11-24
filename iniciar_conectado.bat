@echo off
cd /d "%~dp0"
node --version
if errorlevel 1 (echo Instala Node.js 22 o superior desde nodejs.org. & pause & exit /b 1)
if not exist node_modules (echo Primero ejecuta: npm ci & pause & exit /b 1)
echo Abre http://localhost:4875 en Chrome o Edge. Para conectar cuentas: http://localhost:4875/setup . Ctrl+C para detener.
npm start
pause
