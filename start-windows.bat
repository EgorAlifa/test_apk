@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js не найден.
  echo Установите Node.js LTS с сайта https://nodejs.org ^(кнопка LTS^),
  echo затем снова дважды щёлкните этот файл.
  echo.
  pause
  exit /b 1
)
node server.js
echo.
echo Сервер остановлен.
pause
