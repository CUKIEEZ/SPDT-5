@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Instal Node.js LTS terlebih dahulu.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Menginstal dependensi proyek...
  call npm install
  if errorlevel 1 (
    echo Instalasi gagal. Pastikan komputer terhubung ke internet, lalu coba npm install kembali.
    pause
    exit /b 1
  )
)
call npm start
pause
