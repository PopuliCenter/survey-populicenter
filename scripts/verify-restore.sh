#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-restore.sh — UJI RESTORE yang AMAN (tidak menyentuh DB produksi).
#
# Mengambil backup .dump terbaru (atau file yang diberikan), me-restore-nya ke
# DATABASE SEMENTARA di dalam container postgres yang sama, menjalankan
# sanity-check (jumlah tabel & baris beberapa tabel inti), lalu MENGHAPUS DB
# sementara itu. Membuktikan backup benar-benar bisa dipulihkan — tanpa risiko.
#
#   bash scripts/verify-restore.sh                 # pakai backup terbaru
#   bash scripts/verify-restore.sh backups/xxx.dump
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PG_SERVICE="${PG_SERVICE:-postgres}"
DB_USER="${DB_USER:-surveyapp}"
DB_NAME="${DB_NAME:-web_survey_platform}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
TEST_DB="${TEST_DB:-verify_restore_tmp}"

if docker compose version >/dev/null 2>&1; then DC="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose";
else echo "✗ Docker Compose tidak ditemukan." >&2; exit 1; fi

# ── Tentukan file backup ─────────────────────────────────────────────────────
DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t "$BACKUP_DIR"/${DB_NAME}_*.dump 2>/dev/null | head -n1 || true)"
  [ -z "$DUMP" ] && { echo "✗ Tak ada backup di $BACKUP_DIR. Jalankan backup-db.sh dulu." >&2; exit 1; }
fi
[ -f "$DUMP" ] || { echo "✗ File tidak ditemukan: $DUMP" >&2; exit 1; }
echo "▶ Menguji restore dari: $DUMP"

# ── Bersihkan sisa DB uji bila ada, lalu buat baru ───────────────────────────
cleanup() {
  $DC exec -T "$PG_SERVICE" dropdb -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
echo "▶ Membuat DB sementara '$TEST_DB'…"
$DC exec -T "$PG_SERVICE" createdb -U "$DB_USER" "$TEST_DB"

# ── Restore ke DB sementara (stream file via stdin ke pg_restore) ─────────────
echo "▶ Restore…"
if ! $DC exec -T "$PG_SERVICE" pg_restore -U "$DB_USER" -d "$TEST_DB" --no-owner --no-privileges < "$DUMP"; then
  # pg_restore bisa keluar non-zero karena warning non-fatal; lanjut cek isi.
  echo "  ⚠ pg_restore melaporkan peringatan — lanjut verifikasi isi…"
fi

# ── Sanity check ─────────────────────────────────────────────────────────────
q() { $DC exec -T "$PG_SERVICE" psql -U "$DB_USER" -d "$TEST_DB" -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

TABLES="$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "  · Jumlah tabel (public): ${TABLES:-0}"
if [ "${TABLES:-0}" -lt 1 ]; then
  echo "✗ GAGAL: tidak ada tabel setelah restore — backup ini TIDAK valid." >&2
  exit 1
fi

# Hitung baris beberapa tabel inti bila ada (tidak menggagalkan bila tabel tak ada).
for t in users surveys questions responses; do
  if [ "$(q "SELECT to_regclass('public.$t') IS NOT NULL;")" = "t" ]; then
    echo "  · $t: $(q "SELECT count(*) FROM \"$t\";") baris"
  fi
done

echo "✅ UJI RESTORE BERHASIL — backup dapat dipulihkan. DB sementara dihapus otomatis."
