#!/bin/sh
# Backup do PostgreSQL + arquivos. Agende diariamente (cron) e copie para outro local.
# Uso: DATABASE_URL=... STORAGE_LOCAL_DIR=./storage ./scripts/backup.sh /caminho/backups
set -eu
DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$DEST/banco-$STAMP.dump"
if [ -d "${STORAGE_LOCAL_DIR:-./storage}" ]; then tar -czf "$DEST/arquivos-$STAMP.tar.gz" -C "${STORAGE_LOCAL_DIR:-./storage}" .; fi
# mantém os últimos 30 backups de cada tipo
ls -1t "$DEST"/banco-*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f
ls -1t "$DEST"/arquivos-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "Backup salvo em $DEST ($STAMP)"
