#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# populi-pull.sh — QNAP menarik backup Populi dari VPS (rsync read-only lewat
# rrsync) lalu melapor ke Healthchecks.io. Dijadwalkan cron 04:00 oleh
# ensure-cron.sh. Lihat docs/ops/backup-qnap.md.
#
# TAHAN REBOOT & UPDATE FIRMWARE: kunci SSH, known_hosts, konfigurasi, dan
# skrip ini disimpan di volume data /share/Backup/.populi — BUKAN di:
#   · /root/.ssh, /tmp  → RAM-disk QTS, hilang tiap reboot
#   · /mnt/HDA_ROOT/.config → bisa terhapus saat update firmware
# Hilangnya known_hosts membuat StrictHostKeyChecking gagal ("Host key
# verification failed") dan sinkron berhenti DIAM-DIAM — kegagalan yang
# dicegah skrip ini.
#
# Laporan Healthchecks: ping /start saat mulai, lalu /<exit-code> dengan ±9 KB
# ekor log sebagai body → bila gagal, pesan error rsync/ssh langsung tampil di
# dashboard Healthchecks tanpa perlu SSH ke NAS. 0 = sukses, selain itu = gagal.
# ─────────────────────────────────────────────────────────────────────────────

# Nilai spesifik lokasi (IP VPS, URL ping) di populi.conf, di folder yang sama
# dengan skrip ini — TIDAK masuk repo. Format: VPS_HOST=… dan HC_URL=…
CONF="$(dirname "$0")/populi.conf"
# shellcheck source=/dev/null
[ -f "$CONF" ] && . "$CONF"

# ── Konfigurasi (default; ditimpa oleh populi.conf / environment) ───────────
VPS_HOST="${VPS_HOST:-IP_VPS}"                       # IP origin VPS — BUKAN domain Cloudflare (SSH tak lewat CF)
HC_URL="${HC_URL:-https://hc-ping.com/HC_UUID}"      # URL ping job ini di Healthchecks
DIR="${DIR:-/share/Backup/.populi}"                  # kunci SSH, known_hosts, skrip, conf
DEST="${DEST:-/share/Backup/populi-survey/}"         # tujuan salinan backup (TANPA --delete)
LOG="${LOG:-/share/Backup/populi-survey-rsync.log}"  # log kumulatif, dirotasi bila >5 MB
MIN_FREE_GB="${MIN_FREE_GB:-20}"                     # batalkan bila sisa disk di bawah ini
LOCK="${LOCK:-/tmp/populi-pull.lock}"                # di RAM memang ideal: lenyap saat reboot
# ─────────────────────────────────────────────────────────────────────────────

# Cron membawa PATH minimal — tambahkan lokasi biner QTS di BELAKANG.
PATH="$PATH:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin"
RUNLOG="/tmp/populi-pull.$$.log"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
hc() { curl -fsS -m 15 --retry 3 -o /dev/null "$@" || true; }

# ── Kunci: cegah dua proses berjalan bersamaan (lock basi >20 jam dibuang) ───
if ! mkdir "$LOCK" 2>/dev/null; then
  started=$(cat "$LOCK/started" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - started )) -gt 72000 ]; then
    rm -rf "$LOCK" && mkdir "$LOCK"
  else
    echo "$(ts) SKIP: run sebelumnya masih berjalan" >> "$LOG"
    hc --data-raw "SKIP: run sebelumnya masih berjalan (lock $LOCK)" "$HC_URL/fail"
    exit 1
  fi
fi
date +%s > "$LOCK/started"
trap 'rm -rf "$LOCK" "$RUNLOG"' EXIT
trap 'exit 130' INT TERM

hc "$HC_URL/start"

rc=0
{
  echo "=== START $(ts) ==="
  avail_kb=$(df -P "$(dirname "$DEST")" 2>/dev/null | awk 'NR==2 {print $4}')
  if [ "$VPS_HOST" = "IP_VPS" ]; then
    echo "GAGAL: VPS_HOST belum diisi — buat $CONF (lihat docs/ops/backup-qnap.md)"
    rc=93
  elif [ -z "$avail_kb" ] || [ "$avail_kb" -lt $((MIN_FREE_GB * 1024 * 1024)) ]; then
    echo "GAGAL: sisa disk ${avail_kb:-?} KB < ${MIN_FREE_GB} GB — kosongkan /share/Backup dulu"
    rc=91
  elif [ ! -f "$DIR/id_ed25519" ]; then
    echo "GAGAL: kunci SSH tidak ada di $DIR/id_ed25519"
    rc=92
  else
    mkdir -p "$DEST"
    # accept-new: percayai host key VPS saat pertama terhubung, TOLAK bila
    # kemudian berubah (mis. VPS dibangun ulang) → gagal + pesannya terkirim.
    rsync -az --stats --timeout=600 --partial-dir=.rsync-partial \
      -e "ssh -i $DIR/id_ed25519 -o UserKnownHostsFile=$DIR/known_hosts -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=4" \
      "backupro@$VPS_HOST:/" "$DEST"
    rc=$?
    # 24 = sebagian file lenyap saat transfer (rotasi backup di VPS) — bukan kegagalan.
    if [ "$rc" -eq 24 ]; then
      echo "catatan: rsync rc=24 (file berubah saat transfer) dianggap sukses"
      rc=0
    fi
  fi
  echo "=== END rc=$rc $(ts) ==="
} > "$RUNLOG" 2>&1

cat "$RUNLOG" >> "$LOG"
size=$(wc -c < "$LOG" | tr -d ' ')
if [ "${size:-0}" -gt 5242880 ]; then mv -f "$LOG" "$LOG.1"; fi

# Lapor hasil: exit code sebagai status + ekor log run ini sebagai body.
tail -c 9000 "$RUNLOG" | curl -fsS -m 15 --retry 3 -o /dev/null --data-binary @- "$HC_URL/$rc" || true
exit "$rc"
