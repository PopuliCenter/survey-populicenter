#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-db.sh — Backup PostgreSQL (Populi Survey) dari container Docker.
#
# Jalankan di VPS produksi, dari root repo ATAU folder mana pun:
#   bash scripts/backup-db.sh
#
# Hasil: file .dump (format custom pg_dump, terkompресi & bisa di-restore
# selektif) di folder ./backups, dengan stempel waktu. Rotasi otomatis:
# menyimpan N backup terbaru (default 14), sisanya dihapus.
#
# Cron harian (mis. 02:15 WIB) — `crontab -e`:
#   15 2 * * *  cd /opt/survey-populicenter && bash scripts/backup-db.sh >> /var/log/populi-backup.log 2>&1
#
# Restore  : bash scripts/restore-db.sh <file.dump>      (PRODUKSI — destruktif)
# Uji aman : bash scripts/verify-restore.sh              (ke DB sementara)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Pindah ke root repo (parent dari folder script ini) agar `docker compose`
# menemukan docker-compose.yml.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Konfigurasi (samakan dengan docker-compose.yml; bisa dioverride via env) ──
PG_SERVICE="${PG_SERVICE:-postgres}"
DB_NAME="${DB_NAME:-web_survey_platform}"
DB_USER="${DB_USER:-surveyapp}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION="${BACKUP_RETENTION:-14}"   # simpan berapa backup terbaru

# ── Deteksi perintah compose (plugin v2 `docker compose` vs legacy) ──────────
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "✗ Docker Compose tidak ditemukan." >&2
  exit 1
fi

# ── Pastikan container postgres berjalan ─────────────────────────────────────
if ! $DC ps --status running --services 2>/dev/null | grep -qx "$PG_SERVICE"; then
  echo "✗ Service '$PG_SERVICE' tidak berjalan. Jalankan '$DC up -d' dulu." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}_${TS}.dump"

echo "▶ Backup '$DB_NAME' → $OUT"
# -Fc  : format custom (terkompресi, untuk pg_restore)
# -T   : jangan alokasikan TTY (wajib agar redirect biner tidak korup)
# Koneksi via socket lokal di dalam container (trust) → tak perlu password.
if ! $DC exec -T "$PG_SERVICE" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$OUT"; then
  echo "✗ pg_dump gagal — hapus file parsial." >&2
  rm -f "$OUT"
  exit 1
fi

# ── Validasi: file tidak kosong & header pg_dump custom valid ("PGDMP") ───────
if [ ! -s "$OUT" ]; then
  echo "✗ Backup kosong (0 byte) — dihapus." >&2
  rm -f "$OUT"
  exit 1
fi
if ! head -c 5 "$OUT" | grep -q "PGDMP"; then
  echo "✗ Header dump tidak valid (bukan format custom pg_dump) — dihapus." >&2
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "  ✓ Sukses ($SIZE)"

# ── Rotasi: sisakan $RETENTION file terbaru ──────────────────────────────────
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/${DB_NAME}_*.dump 2>/dev/null | tail -n +"$((RETENTION + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then
  echo "▶ Rotasi: hapus ${#OLD[@]} backup lama (retensi=$RETENTION)"
  for f in "${OLD[@]}"; do rm -f "$f" && echo "  · $(basename "$f")"; done
fi

echo "✅ Selesai. Total backup tersimpan: $(ls -1 "$BACKUP_DIR"/${DB_NAME}_*.dump 2>/dev/null | wc -l)"
