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
#   Memakai `mc mirror` untuk menyalin OBJEK ASLI (nama = uploads/<jenis>/…) ke
#   folder sementara, lalu menge-tar-nya. Keuntungan vs tar volume opaque:
#     · berkas bisa diperiksa/dipakai langsung (jpg/webm/png sungguhan);
#     · restore fleksibel: ke MinIO (mc mirror balik) ATAU ke disk (mode 'disk');
#     · struktur identik layout disk lama → kompatibel restore-media.sh.
#   mc dijalankan via container minio/mc yang berbagi netns container minio
#   (akses 127.0.0.1:9000), kredensial via env MC_HOST_* (tak perlu alias).
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
BUCKET="${MINIO_BUCKET:-survey-media}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION="${BACKUP_RETENTION:-14}"
MC_IMAGE="${MC_IMAGE:-minio/mc:latest}"
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

# Kredensial dari CONTAINER MinIO yang BERJALAN — sumber kebenaran. Membaca .env
# rapuh: bila .env punya key ganda, compose (dan MinIO) memakai kemunculan
# TERAKHIR, sedangkan `grep|head -1` mengambil yang pertama → signature mismatch
# (bug 2026-07-16). docker inspect memberi nilai yang benar-benar dipakai MinIO.
minio_env() {
  docker inspect "$MINIO_CID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep "^$1=" | head -1 | cut -d= -f2-
}
MINIO_USER="$(minio_env MINIO_ROOT_USER)"
MINIO_PASS="$(minio_env MINIO_ROOT_PASSWORD)"
if [ -z "$MINIO_USER" ] || [ -z "$MINIO_PASS" ]; then
  echo "✗ MINIO_ROOT_USER/PASSWORD tak terbaca dari container '$MINIO_SERVICE'." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/minio_${TS}.tar.gz"
STAGE="$(mktemp -d "$BACKUP_DIR/.minio_stage_${TS}.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "▶ Mirror bucket '$BUCKET' → staging sementara…"
# mc di container yang berbagi netns minio → 127.0.0.1:9000. MC_HOST_m menyetel
# alias 'm' inline (kredensial di env, bukan argumen → tak bocor ke `ps`).
# Password kita hex (openssl rand -hex) → aman di URL. Bila kelak diganti ke
# karakter khusus, perlu URL-encode.
if ! docker run --rm \
      --network "container:$MINIO_CID" \
      -e "MC_HOST_m=http://${MINIO_USER}:${MINIO_PASS}@127.0.0.1:9000" \
      -v "$STAGE:/out" \
      "$MC_IMAGE" mirror --overwrite "m/$BUCKET" /out >/dev/null 2>&1; then
  echo "✗ mc mirror gagal (bucket kosong/kredensial/koneksi). Cek 'docker compose logs minio'." >&2
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
  echo "⚠ Bucket '$BUCKET' KOSONG — arsip berisi 0 media. Bila ini tak diduga," >&2
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

echo "✅ Selesai. Total arsip MinIO: $(ls -1 "$BACKUP_DIR"/minio_*.tar.gz 2>/dev/null | wc -l)"
[ -n "$HC_PING_URL" ] && curl -fsS -m 10 --retry 3 -o /dev/null "$HC_PING_URL" || true
