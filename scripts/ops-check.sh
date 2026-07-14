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
#   0 7 * * *  cd /var/www/survey-populicenter && bash scripts/ops-check.sh >> /var/log/populi-ops.log 2>&1
#
# ⚠ JANGAN andalkan MAILTO cron: VPS umumnya TIDAK punya MTA, jadi email cron
#   tidak ke mana-mana dan peringatan tenggelam di file log yang tak dibaca.
#   Pakai HC_PING_URL (Healthchecks.io, gratis) — lihat di bawah.
#
# DEAD MAN'S SWITCH (sangat disarankan):
#   Set HC_PING_URL → skrip melapor ke Healthchecks.io tiap kali jalan.
#   Ini menangkap DUA kegagalan sekaligus:
#     · ada masalah  → skrip ping /fail  → Anda dapat alarm
#     · skrip/server/cron MATI → tak ada ping sama sekali → Anda TETAP dapat alarm
#   Kegagalan kedua itulah yang paling berbahaya (cron mati diam-diam) dan
#   TIDAK bisa dideteksi oleh mekanisme apa pun yang hidup di server ini.
#
#   export HC_PING_URL=https://hc-ping.com/<uuid>   # atau taruh di /etc/environment
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
OFFSITE_MARKER="${OFFSITE_MARKER:-}"       # model PUSH (rclone): file penanda sinkron
OFFSITE_PULL="${OFFSITE_PULL:-}"           # model PULL (NAS menarik): set ke 1
HC_PING_URL="${HC_PING_URL:-}"             # opsional: dead man's switch (Healthchecks.io)

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
if [ "$OFFSITE_PULL" = "1" ]; then
  # Model PULL (NAS kantor menarik dari VPS). VPS TIDAK bisa melihat NAS, jadi
  # kesehatan tarikan HANYA dapat dipantau dari sisi NAS (cron NAS ping sendiri
  # ke Healthchecks). Memaksa cek dari sini akan selalu gagal → alarm palsu tiap
  # hari → alarm diabaikan. Alarm yang selalu berbunyi lebih buruk dari tak ada.
  ok "Off-site model PULL (NAS kantor) — dipantau dari sisi NAS, bukan dari sini"
elif [ -z "$OFFSITE_MARKER" ]; then
  warn "Off-site TIDAK dipantau (OFFSITE_MARKER/OFFSITE_PULL belum diset)."
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

# ── Ringkasan + lapor ke dead man's switch ──────────────────────────────────
echo
if [ "$PROBLEMS" -eq 0 ]; then
  echo "✅ Semua sehat."
  [ -n "$HC_PING_URL" ] && curl -fsS -m 10 --retry 3 -o /dev/null "$HC_PING_URL" || true
  exit 0
fi
echo "❌ $PROBLEMS masalah ditemukan — perlu tindakan."
# Ping /fail → Healthchecks.io langsung mengirim alarm (email/WA/Telegram).
[ -n "$HC_PING_URL" ] && curl -fsS -m 10 --retry 3 -o /dev/null "${HC_PING_URL}/fail" || true
exit 1
