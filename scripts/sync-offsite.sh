#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-offsite.sh — Salin backup ke LUAR server (disaster recovery sejati).
#
# KENAPA WAJIB:
#   Backup yang hanya ada di VPS ini TIDAK melindungi dari VPS ini hilang —
#   disk rusak, akun ditangguhkan, salah `rm -rf`. Justru skenario itulah yang
#   seharusnya dilindungi backup. Tanpa salinan off-site, backup hanya
#   melindungi dari kesalahan aplikasi, bukan dari kehilangan server.
#
# PRASYARAT (dikerjakan SEKALI, oleh Anda — bukan oleh skrip ini):
#   1. Buat bucket PRIVAT di penyedia murah (Backblaze B2 / Wasabi / S3).
#   2. apt install rclone   (atau: curl https://rclone.org/install.sh | sudo bash)
#   3. rclone config        → buat remote, mis. bernama `b2`
#      ⚠ Kunci akses HANYA diketik oleh Anda di `rclone config`. Jangan pernah
#        menaruh kunci di skrip ini atau di repo.
#   4. (Sangat disarankan) Enkripsi: buat remote `crypt` di atas remote storage.
#      Berkas backup berisi SELURUH data responden — perlakukan sebagai rahasia.
#
# Pakai:
#   RCLONE_REMOTE=b2:populi-backup bash scripts/sync-offsite.sh
#
# Cron (setelah backup selesai) — lihat scripts/BACKUP.md:
#   0 4 * * *  cd /var/www/survey-populicenter && RCLONE_REMOTE=b2:populi-backup bash scripts/sync-offsite.sh >> /var/log/populi-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
OFFSITE_MARKER="${OFFSITE_MARKER:-/var/lib/populi-offsite-ok}"

# ── Gagal KERAS bila belum dikonfigurasi ────────────────────────────────────
# Sengaja TIDAK diam-diam sukses: skrip off-site yang "berhasil" tanpa benar-
# benar menyalin apa pun adalah rasa aman palsu — persis jebakan yang membuat
# orang baru sadar backup-nya kosong saat sudah terlambat.
if [ -z "$RCLONE_REMOTE" ]; then
  echo "✗ RCLONE_REMOTE belum diset — TIDAK ada yang disalin ke luar server." >&2
  echo "  Contoh: RCLONE_REMOTE=b2:populi-backup bash scripts/sync-offsite.sh" >&2
  exit 1
fi
if ! command -v rclone >/dev/null 2>&1; then
  echo "✗ rclone belum terpasang. Pasang dulu, lalu 'rclone config'." >&2
  exit 1
fi

# ── Pastikan ADA yang layak disalin ─────────────────────────────────────────
DUMPS="$(ls -1 "$BACKUP_DIR"/web_survey_platform_*.dump 2>/dev/null | wc -l)"
ARCHIVES="$(ls -1 "$BACKUP_DIR"/uploads_*.tar.gz 2>/dev/null | wc -l)"
if [ "$DUMPS" -eq 0 ] || [ "$ARCHIVES" -eq 0 ]; then
  echo "✗ Backup tidak lengkap di $BACKUP_DIR (dump DB: $DUMPS, arsip media: $ARCHIVES)." >&2
  echo "  Jalankan backup-db.sh & backup-media.sh dulu. Batal menyalin." >&2
  exit 1
fi

echo "▶ Menyalin $DUMPS dump DB + $ARCHIVES arsip media → $RCLONE_REMOTE"
rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" \
  --include 'web_survey_platform_*.dump' \
  --include 'uploads_*.tar.gz' \
  --transfers 2 --checkers 4 --stats-one-line --stats 30s

# ── Verifikasi: benar-benar ADA di sisi remote (bukan sekadar "perintah sukses") ──
REMOTE_COUNT="$(rclone lsf "$RCLONE_REMOTE" 2>/dev/null | grep -Ec 'web_survey_platform_.*\.dump|uploads_.*\.tar\.gz' || true)"
if [ "$REMOTE_COUNT" -eq 0 ]; then
  echo "✗ Remote KOSONG setelah sinkron — sinkron gagal diam-diam." >&2
  exit 1
fi
echo "  ✓ Remote berisi $REMOTE_COUNT berkas backup"

# Penanda untuk ops-check.sh (mendeteksi sinkron yang basi/berhenti).
mkdir -p "$(dirname "$OFFSITE_MARKER")"
touch "$OFFSITE_MARKER"

echo "✅ Selesai. Penanda diperbarui: $OFFSITE_MARKER"
