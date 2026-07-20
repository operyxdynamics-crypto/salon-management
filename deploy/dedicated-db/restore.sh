#!/bin/sh
# Restore a dump into the running database. THIS REPLACES EVERYTHING CURRENTLY IN IT.
#
#   ./restore.sh backups/operyx-20260719-2100.dump
#
# Written for the 9pm phone call, so it explains itself and refuses to run half-cocked:
# it takes a safety dump of the current state first, so even a restore of the wrong file
# is itself undoable.
set -eu

cd "$(dirname "$0")"

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Usage: ./restore.sh backups/<file>.dump"
  echo "Available:"
  ls -1t backups/*.dump 2>/dev/null || echo "  (no backups found)"
  exit 1
fi

echo "About to REPLACE the live database with: $1"
printf "Type the word RESTORE to continue: "
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Nothing done."; exit 1; }

SAFETY="backups/operyx-pre-restore-$(date -u +%Y%m%d-%H%M).dump"
echo "Safety dump of current state → $SAFETY"
docker compose exec -T db pg_dump -U operyx -d operyx -Fc > "$SAFETY"

echo "Restoring…"
# --clean --if-exists drops and recreates objects, so a partial old state can't linger underneath.
docker compose exec -T db pg_restore -U operyx -d operyx --clean --if-exists --no-owner < "$1"

echo "Done. If this was the wrong file, the state from two minutes ago is in $SAFETY"
