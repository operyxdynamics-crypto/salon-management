#!/bin/sh
# Take a backup right now, without waiting for tonight's scheduled one.
#
# Use before anything risky: a migration, a version upgrade, a restore rehearsal. The nightly
# backup protects against yesterday's disaster; this one protects against the next ten minutes.
set -eu

cd "$(dirname "$0")"
FILE="backups/operyx-manual-$(date -u +%Y%m%d-%H%M).dump"

docker compose exec -T db pg_dump -U operyx -d operyx -Fc > "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
