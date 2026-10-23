#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# ensure-cron.sh — pasang/perbarui jadwal populi-pull di crontab QTS (idempoten,
# aman dijalankan berulang kali).
#
# Di QTS, `crontab -e` saja HILANG saat reboot: crontab aktif dibangun ulang dari
# /etc/config/crontab (persisten). Skrip ini menulis ke sana — mempertahankan
# tugas sistem QTS, membuang hanya baris populi versi lama — lalu memuat ulang
# crond dan memverifikasi hasilnya.
#
# Jalankan: (1) saat instal, (2) setelah update firmware QTS, (3) opsional dari
# autorun.sh agar jadwal dipasang ulang otomatis tiap boot.
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT="${SCRIPT:-/share/Backup/.populi/populi-pull.sh}"
CT="${CT:-/etc/config/crontab}"
LINE="0 4 * * * /bin/sh $SCRIPT >/dev/null 2>&1"
TMP="/tmp/crontab.populi.$$"

[ -f "$SCRIPT" ] || { echo "GAGAL: $SCRIPT belum ada"; exit 1; }
[ -f "$CT" ] && cp -f "$CT" "$CT.bak-populi"

# Pertahankan baris lain (tugas sistem QTS!), buang hanya baris populi lama
# (versi rsync-langsung berisi 'populi-survey', versi skrip berisi 'populi-pull.sh').
{
  [ -f "$CT" ] && grep -v -e 'populi-survey' -e 'populi-pull.sh' "$CT"
  echo "$LINE"
} > "$TMP"
cp -f "$TMP" "$CT" && rm -f "$TMP"

crontab "$CT"
[ -x /etc/init.d/crond.sh ] && /etc/init.d/crond.sh restart >/dev/null 2>&1

if crontab -l 2>/dev/null | grep -qF "$SCRIPT"; then
  echo "OK: jadwal 04:00 terpasang:"
  crontab -l | grep -F "$SCRIPT"
else
  echo "GAGAL: jadwal tidak terpasang — periksa $CT (cadangan: $CT.bak-populi)"
  exit 1
fi
