#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ops-check.sh — Pemeriksaan kesehatan harian: disk, backup, container.
#
# Dirancang untuk CRON. Keluar dengan kode ≠ 0 bila ada MASALAH, sehingga cron
# mengirim email otomatis ke MAILTO. Kalau semua sehat, ia diam (tak ada email).
#
# Yang diperiksa:
#   1. Disk    — pemakaian partisi & ukuran volume Docker
#   2. Backup  — apakah dump DB & arsip media MASIH SEGAR (bukan diam-diam mati)
#   3. Off-site— apakah backup terbaru sudah tersalin ke luar server (opsional)
#   4. Container — semua service jalan & healthy
#
# Cron harian (mis. 07:00, agar Anda lihat paginya) — `crontab -e`:
#   MAILTO=info@populicenter.org
#   0 7 * * *  cd /var/www/survey-populicenter && bash scripts/ops-check.sh
#
# Ambang bisa diubah via env: DISK_WARN_PCT, BACKUP_MAX_AGE_H
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail   # sengaja TANPA -e: kita ingin SEMUA cek berjalan, lalu lapor

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DISK_WARN_PCT="${DISK_WARN_PCT:-80}"      # peringatkan bila pemakaian ≥ 80%
BACKUP_MAX_AGE_H="${BACKUP_MAX_AGE_H:-30}" # backup harian → basi bila > 30 jam
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
OFFSITE_MARKER="${OFFSITE_MARKER:-}"       # opsional: file penanda sinkron off-site

PROBLEMS=0
warn() { echo "⚠  $*"; PROBLEMS=$((PROBLEMS + 1)); }
ok()   { echo "✓  $*"; }

if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

echo "═══ Pemeriksaan Ops — $(date '+%Y-%m-%d %H:%M') ═══"

# ── 1. Disk ─────────────────────────────────────────────────────────────────
echo
echo "── Disk"
USED_PCT="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
AVAIL="$(df -h --output=avail / | tail -1 | tr -d ' ')"
if [ "$USED_PCT" -ge "$DISK_WARN_PCT" ]; then
  warn "Disk / terpakai ${USED_PCT}% (sisa $AVAIL) — ambang ${DISK_WARN_PCT}%."
  echo "   Tindakan: arsipkan & hapus survei lama (laman Penyimpanan), atau perbesar disk."
else
  ok "Disk / terpakai ${USED_PCT}% (sisa $AVAIL)"
fi

# Volume Docker sering jadi biang disk penuh tanpa terlihat di df biasa.
UPLOADS_SIZE="$($DC exec -T backend sh -c 'du -sh /app/uploads 2>/dev/null | cut -f1' 2>/dev/null | tr -d '\r[:space:]')"
[ -n "$UPLOADS_SIZE" ] && ok "Volume uploads (media): $UPLOADS_SIZE"

# ── 2. Kesegaran backup ─────────────────────────────────────────────────────
# Backup yang diam-diam berhenti berjalan adalah kegagalan paling berbahaya:
# tak ada gejala sampai hari Anda benar-benar butuh memulihkan.
echo
echo "── Backup"
check_fresh() {
  local label="$1" pattern="$2"
  local newest
  newest="$(ls -1t $pattern 2>/dev/null | head -1)"
  if [ -z "$newest" ]; then
    warn "$label: TIDAK ADA backup sama sekali di $BACKUP_DIR"
    return
  fi
  local age_h=$(( ( $(date +%s) - $(date -r "$newest" +%s) ) / 3600 ))
  local size; size="$(du -h "$newest" | cut -f1)"
  if [ "$age_h" -gt "$BACKUP_MAX_AGE_H" ]; then
    warn "$label: BASI — terbaru ${age_h} jam lalu ($(basename "$newest")). Cron mati?"
  else
    ok "$label: segar (${age_h} jam lalu, $size)"
  fi
}
check_fresh "Dump DB    " "$BACKUP_DIR/web_survey_platform_*.dump"
check_fresh "Arsip media" "$BACKUP_DIR/uploads_*.tar.gz"

# ── 3. Off-site ─────────────────────────────────────────────────────────────
echo
echo "── Salinan luar server"
if [ -z "$OFFSITE_MARKER" ]; then
  warn "OFFSITE_MARKER belum diset → salinan off-site TIDAK dipantau."
  echo "   Backup yang hanya ada di server ini TIDAK melindungi dari server hilang."
elif [ ! -f "$OFFSITE_MARKER" ]; then
  warn "Penanda off-site tak ditemukan: $OFFSITE_MARKER — sinkron gagal?"
else
  age_h=$(( ( $(date +%s) - $(date -r "$OFFSITE_MARKER" +%s) ) / 3600 ))
  if [ "$age_h" -gt "$BACKUP_MAX_AGE_H" ]; then
    warn "Sinkron off-site BASI — terakhir ${age_h} jam lalu."
  else
    ok "Sinkron off-site segar (${age_h} jam lalu)"
  fi
fi

# ── 4. Container ────────────────────────────────────────────────────────────
echo
echo "── Container"
for svc in postgres redis backend worker nginx; do
  cid="$($DC ps -q "$svc" 2>/dev/null)"
  if [ -z "$cid" ]; then
    warn "$svc: TIDAK BERJALAN"
    continue
  fi
  state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$cid" 2>/dev/null)"
  if [ "$state" != "running" ] || { [ "$health" != "-" ] && [ "$health" != "healthy" ]; }; then
    warn "$svc: state=$state health=$health"
  else
    ok "$svc: running${health:+ ($health)}"
  fi
done

# ── Ringkasan ───────────────────────────────────────────────────────────────
echo
if [ "$PROBLEMS" -eq 0 ]; then
  echo "✅ Semua sehat."
  exit 0
fi
echo "❌ $PROBLEMS masalah ditemukan — perlu tindakan."
exit 1
