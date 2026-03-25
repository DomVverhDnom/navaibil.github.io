#!/bin/bash
# Запуск на VPS (Ubuntu/Debian) от root или с sudo.
# Настраивает nginx + Let's Encrypt для API и выводит готовые строки для .env и GitHub.
#
# Использование:
#   export API_DOMAIN=api.example.com          # A-запись на IP этого сервера
#   export CERTBOT_EMAIL=you@example.com      # для Let's Encrypt
#   export PAGES_ORIGIN=https://domvverhdnom.github.io
#   export APP_PUBLIC_URL=https://domvverhdnom.github.io/navaibil.github.io
#   sudo -E bash deploy/setup-api-https-and-pages.sh
#
# Или одной строкой:
#   API_DOMAIN=api.example.com CERTBOT_EMAIL=a@b.ru sudo -E bash deploy/setup-api-https-and-pages.sh

set -euo pipefail

API_DOMAIN="${API_DOMAIN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
PAGES_ORIGIN="${PAGES_ORIGIN:-https://domvverhdnom.github.io}"
APP_PUBLIC_URL="${APP_PUBLIC_URL:-https://domvverhdnom.github.io/navaibil.github.io}"
APP_DIR="${APP_DIR:-/opt/vibetelegram}"
NODE_UPSTREAM="${NODE_UPSTREAM:-127.0.0.1:3000}"

if [[ -z "$API_DOMAIN" || -z "$CERTBOT_EMAIL" ]]; then
  echo "Задайте переменные: API_DOMAIN и CERTBOT_EMAIL"
  echo "Пример: API_DOMAIN=api.mysite.ru CERTBOT_EMAIL=me@mail.ru sudo -E bash $0"
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите с sudo: sudo -E bash $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

CONF_PATH="/etc/nginx/sites-available/vibetelegram-api"
CONF_ENABLED="/etc/nginx/sites-enabled/vibetelegram-api"

# HTTP-only конфиг для первого запуска certbot
cat >"$CONF_PATH" <<NGX
upstream vibe_node {
    server ${NODE_UPSTREAM};
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};

    client_max_body_size 50m;

    location / {
        proxy_pass http://vibe_node;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io/ {
        proxy_pass http://vibe_node;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
NGX

ln -sf "$CONF_PATH" "$CONF_ENABLED"
nginx -t
systemctl enable nginx
systemctl reload nginx

certbot --nginx -d "$API_DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect

systemctl reload nginx

API_BASE="https://${API_DOMAIN}"

echo ""
echo "========== Готово: HTTPS для API =========="
echo "Проверка: curl -sS -I ${API_BASE}/ | head -n3"
echo ""
echo "--- В ${APP_DIR}/.env (или отредактируйте и: pm2 restart vibetelegram) ---"
echo "HOST=127.0.0.1"
echo "PORT=3000"
echo "TRUST_PROXY=1"
echo "CORS_ORIGINS=${PAGES_ORIGIN}"
echo "APP_PUBLIC_URL=${APP_PUBLIC_URL}"
echo "OAUTH_SERVER_PUBLIC_URL=${API_BASE}"
echo ""
echo "--- GitHub: Settings → Secrets → Actions ---"
echo "Name:  VITE_API_URL"
echo "Value: ${API_BASE}"
echo ""
echo "Затем: Actions → Deploy GitHub Pages → Run workflow"
echo "=========================================="
