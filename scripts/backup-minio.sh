#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-minio.sh — Backup media dari MinIO (setelah MEDIA_STORAGE=s3).
#
# KENAPA SKRIP INI ADA:
#   Setelah flip ke MEDIA_STORAGE=s3, media BARU (foto, REKAMAN AUDIO, tanda
#   tangan) ditulis ke MinIO — bukan lagi ke volume `uploads`. backup-media.sh
#   yang menge-tar `uploads` TIDAK lagi mencakup media itu. Tanpa skrip ini,
#   kehilangan server = kehilangan seluruh media pasca-flip.
#
# CARA KERJA (bukan tar volume mentah):
#   Menyalin OBJEK ASLI (nama = uploads/<jenis>/…) ke folder sementara, lalu
#   menge-tar-nya. Keuntungan vs tar volume opaque:
#     · berkas bisa diperiksa/dipakai langsung (jpg/webm/png sungguhan);
#     · restore fleksibel: ke MinIO (restore-minio.sh) ATAU ke disk (mode 'disk');
#     · struktur identik layout disk lama → kompatibel restore-media.sh.
#   Penyalinan memakai backend/scripts/media-mirror.cjs di dalam image backend
#   kita sendiri (punya paket minio + env MINIO_*).
#
# KENAPA BUKAN `mc`: image minio/mc & minio/minio ditarik dari registry publik
#   (Docker Hub 404, dl.min.io 410). Backup berhenti 24 Okt 2026 begitu image mc
#   lokal hilang dari server. Karena minio/minio juga tak bisa ditarik lagi, skrip
#   ini sekaligus mengarsipkan image server MinIO agar server baru bisa dipulihkan.
#
# Jalankan di VPS produksi:
#   bash scripts/backup-minio.sh
#
# Hasil: backups/minio_YYYYmmdd_HHMMSS.tar.gz (+ rotasi). QNAP menarik seluruh
#   isi backups/, jadi arsip ini ikut ter-off-site OTOMATIS (tanpa ubah QNAP).
#
# Cron harian (mis. 02:40, setelah backup-media 02:30) — `crontab -e`:
#   40 2 * * *  cd /var/www/survey-populicenter && bash scripts/backup-minio.sh >> /var/log/populi-backup.log 2>&1
#
# Restore: bash scripts/restore-minio.sh <file.tar.gz>          (⚠ destruktif)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

MINIO_SERVICE="${MINIO_SERVICE:-minio}"
MIRROR_SERVICE="${MIRROR_SERVICE:-worker}"   # service berimage backend, tanpa RUN_MIGRATIONS
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION="${BACKUP_RETENTION:-14}"
HC_PING_URL="${HC_MINIO_PING_URL:-}"   # opsional: dead man's switch khusus (boleh kosong)

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "✗ Docker Compose tidak ditemukan." >&2
  exit 1
fi

# Service minio harus jalan
if ! $DC ps --status running --services 2>/dev/null | grep -qx "$MINIO_SERVICE"; then
  echo "✗ Service '$MINIO_SERVICE' tidak berjalan. Jalankan '$DC up -d' dulu." >&2
  exit 1
fi
MINIO_CID="$($DC ps -q "$MINIO_SERVICE")"
if [ -z "$MINIO_CID" ]; then echo "✗ Container minio tak ditemukan." >&2; exit 1; fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/minio_${TS}.tar.gz"
STAGE="$(mktemp -d "$BACKUP_DIR/.minio_stage_${TS}.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "▶ Mirror bucket media → staging sementara…"
# Alat dipasang dari checkout ini, jadi perbaikan backup cukup `git pull` dan tak
# menunggu image baru. Kredensial & nama bucket datang dari env service worker,
# sumber yang sama dengan aplikasi. Pesan error sengaja TIDAK dibuang: menyembunyikannya
# membuat insiden Okt 2026 terbaca sebagai "bucket/kredensial" selama 10 hari.
if ! $DC run --rm --no-deps -T \
      -v "$STAGE:/out" \
      -v "$REPO_ROOT/backend/scripts/media-mirror.cjs:/app/scripts/media-mirror.cjs:ro" \
      "$MIRROR_SERVICE" node scripts/media-mirror.cjs pull /out; then
  echo "✗ Mirror bucket gagal — lihat pesan di atas." >&2
  exit 1
fi

FILE_COUNT="$(find "$STAGE" -type f | wc -l | tr -d '[:space:]')"
echo "  · $FILE_COUNT objek ter-mirror"

# Arsipkan staging (root arsip = uploads/… agar cocok layout disk lama)
if ! tar -czf "$OUT" -C "$STAGE" . ; then
  echo "✗ tar gagal — hapus file parsial." >&2
  rm -f "$OUT"; exit 1
fi

# ── Validasi: arsip utuh (rasa aman palsu > backup gagal) ────────────────────
if [ ! -s "$OUT" ]; then echo "✗ Arsip 0 byte — dihapus." >&2; rm -f "$OUT"; exit 1; fi
if ! gzip -t "$OUT" 2>/dev/null; then echo "✗ Arsip korup — dihapus." >&2; rm -f "$OUT"; exit 1; fi
ARCHIVED="$(tar -tzf "$OUT" | grep -vc '/$' || true)"
if [ "$ARCHIVED" -ne "$FILE_COUNT" ]; then
  echo "✗ Jumlah arsip ($ARCHIVED) ≠ objek mirror ($FILE_COUNT) — dihapus." >&2
  rm -f "$OUT"; exit 1
fi
if [ "$FILE_COUNT" -eq 0 ]; then
  echo "⚠ Bucket media KOSONG — arsip berisi 0 media. Bila ini tak diduga," >&2
  echo "  cek MEDIA_STORAGE & apakah migrasi sudah dijalankan." >&2
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "  ✓ Sukses ($SIZE, $ARCHIVED objek terarsip)"

# ── Rotasi ───────────────────────────────────────────────────────────────────
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/minio_*.tar.gz 2>/dev/null | tail -n +"$((RETENTION + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then
  echo "▶ Rotasi: hapus ${#OLD[@]} arsip lama (retensi=$RETENTION)"
  for f in "${OLD[@]}"; do rm -f "$f" && echo "  · $(basename "$f")"; done
fi

# ── Arsip image server MinIO ─────────────────────────────────────────────────
# Salinan image di server ini satu-satunya sumber untuk MinIO yang sedang dipakai.
# Hanya ditulis bila image berubah. Kegagalan di sini tak menggagalkan backup
# media yang sudah selesai di atas, tapi dicetak agar terlihat di log.
IMAGE_REF="$(docker inspect -f '{{.Config.Image}}' "$MINIO_CID")"
IMAGE_ID="$(docker inspect -f '{{.Image}}' "$MINIO_CID" | sed 's/^sha256://' | cut -c1-12)"
IMAGE_OUT="$BACKUP_DIR/image-minio-server_${IMAGE_ID}.tar.gz"
if [ ! -s "$IMAGE_OUT" ]; then
  echo "▶ Arsipkan image server MinIO ($IMAGE_REF)…"
  if docker save "$IMAGE_REF" | gzip > "$IMAGE_OUT.tmp" && gzip -t "$IMAGE_OUT.tmp"; then
    mv "$IMAGE_OUT.tmp" "$IMAGE_OUT"
    find "$BACKUP_DIR" -maxdepth 1 -name 'image-minio-server_*.tar.gz' ! -name "$(basename "$IMAGE_OUT")" -delete
    echo "  ✓ $(basename "$IMAGE_OUT") ($(du -h "$IMAGE_OUT" | cut -f1))"
  else
    rm -f "$IMAGE_OUT.tmp"
    echo "⚠ Gagal mengarsipkan image server MinIO — backup media tetap sah." >&2
  fi
fi

echo "✅ Selesai. Total arsip MinIO: $(ls -1 "$BACKUP_DIR"/minio_*.tar.gz 2>/dev/null | wc -l)"
[ -n "$HC_PING_URL" ] && curl -fsS -m 10 --retry 3 -o /dev/null "$HC_PING_URL" || true
