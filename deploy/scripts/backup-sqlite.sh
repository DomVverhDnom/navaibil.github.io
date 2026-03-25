#!/usr/bin/env bash
set -euo pipefail
# Запуск из корня проекта. SQLITE_PATH — как в .env, иначе server/data/app.db
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
DB="${SQLITE_PATH:-server/data/app.db}"
if [[ ! -f "$DB" ]]; then
  echo "Файл БД не найден: $DB" >&2
  exit 1
fi
mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"
cp "$DB" "backups/app-${TS}.db"
echo "OK: backups/app-${TS}.db"
