#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-media.sh — Backup FILE MEDIA (foto, rekaman audio, tanda tangan).
#
# KENAPA SKRIP INI ADA:
#   backup-db.sh hanya membuang isi Postgres. Media TIDAK disimpan di database —
#   ia ada di named volume Docker `uploads` (compose: uploads:/app/uploads).
#   Tanpa skrip ini, kehilangan server = kehilangan SELURUH rekaman wawancara,
#   walaupun dump DB selamat.
#
#   ⚠ Named volume TIDAK bisa di-tar dari host lewat path biasa seperti
#   /var/www/.../backend/uploads — path itu tidak ada. Harus lewat container.
#
# Jalankan di VPS produksi:
#   bash scripts/backup-media.sh
#
# Hasil: backups/uploads_YYYYmmdd_HHMMSS.tar.gz (+ rotasi otomatis).
#
# Cron harian (mis. 02:30) — `crontab -e`:
#   30 2 * * *  cd /var/www/survey-populicenter && bash scripts/backup-media.sh >> /var/log/populi-backup.log 2>&1
#
# Restore: bash scripts/restore-media.sh <file.tar.gz>          (⚠ destruktif)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

APP_SERVICE="${APP_SERVICE:-backend}"
UPLOAD_PATH="${UPLOAD_PATH:-/app/uploads}"   # samakan dengan docker-compose.yml
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION="${BACKUP_RETENTION:-14}"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "✗ Docker Compose tidak ditemukan." >&2
  exit 1
fi

if ! $DC ps --status running --services 2>/dev/null | grep -qx "$APP_SERVICE"; then
  echo "✗ Service '$APP_SERVICE' tidak berjalan. Jalankan '$DC up -d' dulu." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/uploads_${TS}.tar.gz"

# Hitung jumlah file SEBELUM arsip — dipakai untuk sanity-check di bawah.
FILE_COUNT="$($DC exec -T "$APP_SERVICE" sh -c "find '$UPLOAD_PATH' -type f | wc -l" | tr -d '\r[:space:]')"
echo "▶ Backup media dari volume '$UPLOAD_PATH' ($FILE_COUNT berkas) → $OUT"

# -T : jangan alokasikan TTY (wajib agar stream biner tidak korup)
if ! $DC exec -T "$APP_SERVICE" tar -czf - -C "$UPLOAD_PATH" . > "$OUT"; then
  echo "✗ tar gagal — hapus file parsial." >&2
  rm -f "$OUT"
  exit 1
fi

# ── Validasi: arsip utuh & benar-benar berisi ────────────────────────────────
# Backup yang "ada tapi kosong" lebih berbahaya daripada backup yang gagal,
# karena memberi rasa aman palsu. Karena itu 0 berkas = GAGAL, bukan sukses.
if [ ! -s "$OUT" ]; then
  echo "✗ Arsip kosong (0 byte) — dihapus." >&2
  rm -f "$OUT"; exit 1
fi
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "✗ Arsip korup (gagal uji gzip) — dihapus." >&2
  rm -f "$OUT"; exit 1
fi
ARCHIVED="$(tar -tzf "$OUT" | grep -vc '/$' || true)"
if [ "$ARCHIVED" -eq 0 ] && [ "$FILE_COUNT" -gt 0 ]; then
  echo "✗ Volume berisi $FILE_COUNT berkas tapi arsip KOSONG — dihapus." >&2
  rm -f "$OUT"; exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "  ✓ Sukses ($SIZE, $ARCHIVED berkas terarsip)"

# ── Rotasi ───────────────────────────────────────────────────────────────────
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/uploads_*.tar.gz 2>/dev/null | tail -n +"$((RETENTION + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then
  echo "▶ Rotasi: hapus ${#OLD[@]} arsip lama (retensi=$RETENTION)"
  for f in "${OLD[@]}"; do rm -f "$f" && echo "  · $(basename "$f")"; done
fi

echo "✅ Selesai. Total arsip media: $(ls -1 "$BACKUP_DIR"/uploads_*.tar.gz 2>/dev/null | wc -l)"
