@echo off
cd /d "%~dp0"
node --version
if errorlevel 1 (echo Instala Node.js 22 o superior. & pause & exit /b 1)
if not exist node_modules (echo Ejecuta npm ci en esta carpeta antes de iniciar. & pause & exit /b 1)
echo Abre http://localhost:4875 en Chrome o Edge. Ctrl+C para detener.
npm run demo:simulated
pause
