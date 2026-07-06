#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-db.sh — PEMULIHAN BENCANA: restore backup ke DB PRODUKSI.
#
#   ⚠  DESTRUKTIF. Menimpa data di database '$DB_NAME'. Gunakan hanya saat
#      benar-benar memulihkan. Untuk sekadar MENGUJI backup, pakai
#      verify-restore.sh (aman, ke DB sementara).
#
#   bash scripts/restore-db.sh backups/web_survey_platform_YYYYmmdd_HHMMSS.dump
#
# Set FORCE=1 untuk melewati konfirmasi (mis. dalam runbook otomatis).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PG_SERVICE="${PG_SERVICE:-postgres}"
DB_USER="${DB_USER:-surveyapp}"
DB_NAME="${DB_NAME:-web_survey_platform}"

DUMP="${1:-}"
[ -z "$DUMP" ] && { echo "Pemakaian: bash scripts/restore-db.sh <file.dump>" >&2; exit 1; }
[ -f "$DUMP" ] || { echo "✗ File tidak ditemukan: $DUMP" >&2; exit 1; }

if docker compose version >/dev/null 2>&1; then DC="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose";
else echo "✗ Docker Compose tidak ditemukan." >&2; exit 1; fi

echo "═══════════════════════════════════════════════════════════"
echo "  ⚠  RESTORE PRODUKSI — akan MENIMPA data di '$DB_NAME'"
echo "     Sumber : $DUMP"
echo "═══════════════════════════════════════════════════════════"
if [ "${FORCE:-0}" != "1" ]; then
  read -r -p "Ketik 'RESTORE' untuk melanjutkan: " CONFIRM
  [ "$CONFIRM" = "RESTORE" ] || { echo "Dibatalkan."; exit 1; }
fi

echo "▶ Menyarankan backup pengaman terlebih dahulu…"
bash "$SCRIPT_DIR/backup-db.sh" || echo "  ⚠ backup pengaman gagal/dilewati — lanjut atas keputusan Anda."

echo "▶ Restore… (--clean --if-exists: objek lama di-drop lalu dibuat ulang)"
# Alirkan file ke pg_restore di dalam container. --single-transaction agar
# restore atomik (semua-atau-tidak).
$DC exec -T "$PG_SERVICE" pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges --single-transaction < "$DUMP"

echo "✅ Restore selesai ke '$DB_NAME'."
echo "   Disarankan: restart backend & worker → $DC restart backend worker"
