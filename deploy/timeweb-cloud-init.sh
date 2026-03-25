#!/bin/sh
# =============================================================================
# Сценарий первичной настройки VPS под VibeTelegram (Node + SQLite + PM2).
#
# Как использовать (Timeweb Cloud):
#   1) Документация: https://timeweb.cloud/docs/cloud-servers/manage-servers/cloud-init
#   2) При создании сервера или: Сервер → Конфигурация → Cloud-init → вставьте этот файл.
#   3) После сохранения — переустановка ОС или: на уже запущенной ВМ —
#      cloud-init clean --reboot (см. документацию Timeweb).
#
# Shell-скрипт Timeweb превращает в runcmd и выполняет ОДИН раз при первом применении.
# Секреты в панель не кладите: приватный репозиторий — настройте ключ отдельно или
# замените GIT_REPO после клонирования вручную.
#
# Перед вставкой отредактируйте переменные ниже (или оставьте значения по умолчанию).
# =============================================================================

set -eu

# Публичный clone URL (HTTPS). Приватный репо — используйте deploy key / PAT или клонируйте сами.
GIT_REPO="${GIT_REPO:-https://github.com/DomVverhDnom/navaibil.github.io.git}"

# Каталог установки
APP_DIR="${APP_DIR:-/opt/vibetelegram}"

# Дополнительные origin для CORS (через запятую, без пробелов). Пример: фронт на GitHub Pages
EXTRA_CORS="${EXTRA_CORS:-https://domvverhdnom.github.io}"

LOG_TAG="[vibetelegram-bootstrap]"
log() {
  echo "$LOG_TAG $*"
}

log "старт: обновление пакетов"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

log "установка git, build-essential, curl, ca-certificates, python3 (для node-gyp / better-sqlite3)"
apt-get install -y git build-essential curl ca-certificates python3

log "Node.js 22.x (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

log "PM2"
npm install -g pm2

log "каталог $APP_DIR"
mkdir -p "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  log "репозиторий уже есть, git pull"
  cd "$APP_DIR"
  git pull --ff-only
else
  log "git clone $GIT_REPO"
  git clone "$GIT_REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

log "npm ci && npm run build"
npm ci
npm run build

PRIMARY_IP=""
if command -v hostname >/dev/null 2>&1; then
  PRIMARY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$PRIMARY_IP" ]; then PRIMARY_IP="127.0.0.1"; fi

CORS_LIST="http://${PRIMARY_IP}:3000,http://127.0.0.1:3000,http://localhost:3000"
if [ -n "$EXTRA_CORS" ]; then
  CORS_LIST="${CORS_LIST},${EXTRA_CORS}"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  log "создание $APP_DIR/.env (замените APP_PUBLIC_URL и CORS после появления домена/HTTPS)"
  JWT_HEX=$(openssl rand -hex 32)
  cat > "$APP_DIR/.env" <<EOF
JWT_SECRET=${JWT_HEX}
HOST=0.0.0.0
PORT=3000
CORS_ORIGINS=${CORS_LIST}
APP_PUBLIC_URL=http://${PRIMARY_IP}:3000
OAUTH_SERVER_PUBLIC_URL=http://${PRIMARY_IP}:3000
ADMIN_EMAILS=
EOF
else
  log ".env уже существует — не перезаписываю"
fi

cd "$APP_DIR"
log "pm2: vibetelegram"
pm2 delete vibetelegram 2>/dev/null || true
pm2 start ecosystem.config.cjs --env production
pm2 save

log "автозапуск PM2 (если команда не сработала — выполните вручную вывод pm2 startup)"
set +e
PM2_LINE=$(pm2 startup systemd -u root --hp /root 2>&1 | grep -E '^sudo env PATH=' | head -n1)
if [ -n "$PM2_LINE" ]; then
  eval "$PM2_LINE"
else
  PM2_LINE=$(pm2 startup systemd -u root --hp /root 2>&1 | grep -E '^env PATH=' | head -n1)
  [ -n "$PM2_LINE" ] && eval "$PM2_LINE"
fi
set -e

cat > /root/vibetelegram-README.txt <<EOF
VibeTelegram: первичная настройка завершена (cloud-init).

  Каталог:    $APP_DIR
  Лог cloud-init: /var/log/cloud-init-output.log
  Проверка:   curl -sS -I "http://${PRIMARY_IP}:3000/" | head -n1

Дальше:
  - Укажите домен в CORS_ORIGINS и APP_PUBLIC_URL / OAUTH_SERVER_PUBLIC_URL в $APP_DIR/.env
  - Поставьте nginx + Let's Encrypt (см. deploy/nginx-vibetelegram.conf.example и deploy/PRODUCTION.txt)
  - С фронтом только на GitHub Pages: секрет VITE_API_URL и HTTPS у API

Просмотр логов приложения: pm2 logs vibetelegram
EOF

log "готово. Инструкция: /root/vibetelegram-README.txt"
