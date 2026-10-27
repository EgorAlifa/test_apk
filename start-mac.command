#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js не найден."
  echo "Установите Node.js LTS с сайта https://nodejs.org (кнопка LTS),"
  echo "затем снова дважды щёлкните этот файл."
  echo
  read -r -p "Нажмите Enter, чтобы закрыть окно..." _
  exit 1
fi
node server.js
echo
read -r -p "Сервер остановлен. Нажмите Enter, чтобы закрыть окно..." _
