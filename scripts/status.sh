#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# status.sh — Ringkasan server SATU LAYAR untuk dilihat cepat dari HP (via SSH).
#
# Read-only, aman dijalankan kapan saja. Menampilkan: disk & RAM host, semua
# container (3 stack) + status sehat, CPU/MEM per container, dan usia backup.
#
# Pakai (dari app SSH di HP, mis. Termius):
#   cd /var/www/survey-populicenter && bash scripts/status.sh
#
# Tip: buat alias agar cukup ketik `st`:
#   echo "alias st='cd /var/www/survey-populicenter && bash scripts/status.sh'" >> ~/.bashrc
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"

echo "═══ STATUS  $(date '+%a %d %b %H:%M') ═══"

echo
echo "── Disk & RAM host"
df -h / | awk 'NR==1 || /\//' | sed 's/^/  /'
free -h 2>/dev/null | awk 'NR<=2' | sed 's/^/  /'
# Peringatan disk ringkas
DISK_PCT="$(df / | awk 'NR==2{gsub("%","",$5); print $5}')"
[ "${DISK_PCT:-0}" -ge 80 ] && echo "  ⚠ DISK ${DISK_PCT}% — mulai penuh!"

echo
echo "── Container (semua stack)"
# Tandai yang TIDAK running/healthy agar langsung terlihat di layar kecil.
docker ps -a --format '{{.Names}}\t{{.Status}}' 2>/dev/null | sort | while IFS=$'\t' read -r name stat; do
  case "$stat" in
    Up*healthy*|Up*) mark="✓" ;;
    *)               mark="✗" ;;
  esac
  printf '  %s %-32s %s\n' "$mark" "$name" "$stat"
done

echo
echo "── CPU / MEM per container"
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null \
  | sort | awk -F'\t' '{printf "  %-32s %7s  %s\n", $1, $2, $3}'

echo
echo "── Backup terbaru"
for pat in "web_survey_platform_*.dump:DB" "uploads_*.tar.gz:media-disk" "minio_*.tar.gz:media-MinIO"; do
  glob="${pat%%:*}"; label="${pat##*:}"
  newest="$(ls -1t "$BACKUP_DIR"/$glob 2>/dev/null | head -1)"
  if [ -z "$newest" ]; then
    printf '  %-12s %s\n' "$label" "— tak ada"
  else
    age_h=$(( ( $(date +%s) - $(date -r "$newest" +%s) ) / 3600 ))
    printf '  %-12s %s jam lalu (%s)\n' "$label" "$age_h" "$(du -h "$newest" | cut -f1)"
  fi
done

echo
echo "(alarm lengkap: bash scripts/ops-check.sh · error app: Sentry)"
