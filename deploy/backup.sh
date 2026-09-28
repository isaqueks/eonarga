#!/usr/bin/env bash
# Backup diário na VPS (docs/02 — Hospedagem; docs/08 #55). Instalado pelo deploy/eonarga-backup.cron.
#   - Postgres: `pg_dump -Fc` do container eonarga-db em /opt/eonarga/backups/db/eonarga-<data>.dump
#     (restaurar: `docker exec -i eonarga-db pg_restore -U eonarga -d eonarga --clean --if-exists < arquivo`).
#   - Uploads: espelho incremental do volume em /opt/eonarga/backups/uploads (rsync).
# Guarda 14 dias de dumps. É cópia no mesmo disco: protege de bug e de "apaguei sem querer",
# não de perder a máquina — pra isso, copie a pasta backups pra fora de vez em quando.
set -euo pipefail

BASE=/opt/eonarga/backups
mkdir -p "$BASE/db" "$BASE/uploads"
STAMP="$(date +%F)"

docker exec eonarga-db pg_dump -U eonarga -Fc eonarga > "$BASE/db/eonarga-$STAMP.dump.tmp"
mv "$BASE/db/eonarga-$STAMP.dump.tmp" "$BASE/db/eonarga-$STAMP.dump"
find "$BASE/db" -name 'eonarga-*.dump' -mtime +14 -delete

UPLOADS="$(docker volume inspect eonarga_app_data -f '{{.Mountpoint}}')/uploads"
rsync -a --delete "$UPLOADS/" "$BASE/uploads/"

echo "$(date -Is) backup ok: $(du -sh "$BASE/db/eonarga-$STAMP.dump" | cut -f1) de banco, $(du -sh "$BASE/uploads" | cut -f1) de uploads"
