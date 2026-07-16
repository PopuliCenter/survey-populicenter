#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-minio.sh — Pulihkan media dari arsip backup-minio ke MinIO.
#
# ⚠ DESTRUKTIF (tanpa --dry-run): menaruh kembali objek ke bucket produksi.
#   Menimpa objek dgn key sama; objek lain di bucket TIDAK dihapus (pemulihan
#   parsial aman — bukan sapu bersih).
#
# Pakai:
#   bash scripts/restore-minio.sh --dry-run backups/minio_20260716_024000.tar.gz  (uji arsip)
#   bash scripts/restore-minio.sh           backups/minio_20260716_024000.tar.gz  (eksekusi)
#
# CATATAN: arsip minio_*.tar.gz berisi berkas asli (uploads/…), jadi bila suatu
#   saat kembali ke MEDIA_STORAGE=disk, arsip yang SAMA bisa dipulihkan ke disk
#   pakai restore-media.sh — sengaja kompatibel.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

MINIO_SERVICE="${MINIO_SERVICE:-minio}"
BUCKET="${MINIO_BUCKET:-survey-media}"
MC_IMAGE="${MC_IMAGE:-minio/mc:latest}"

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; shift; fi
ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Pakai: bash scripts/restore-minio.sh [--dry-run] <backups/minio_*.tar.gz>" >&2
  exit 1
fi

# ── Validasi arsip SEBELUM menyentuh apa pun ────────────────────────────────
if ! gzip -t "$ARCHIVE" 2>/dev/null; then echo "✗ Arsip korup (gzip). Batal." >&2; exit 1; fi
COUNT="$(tar -tzf "$ARCHIVE" | grep -vc '/$' || true)"
echo "▶ Arsip : $ARCHIVE"
echo "  Berisi: $COUNT objek"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "  Contoh isi:"
  tar -tzf "$ARCHIVE" | grep -v '/$' | head -5 | sed 's/^/    · /'
  echo "✅ Uji selesai — arsip VALID. Produksi tidak disentuh (--dry-run)."
  exit 0
fi
if [ "$COUNT" -eq 0 ]; then
  echo "✗ Arsip kosong — menolak restore." >&2; exit 1
fi

if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
if ! $DC ps --status running --services 2>/dev/null | grep -qx "$MINIO_SERVICE"; then
  echo "✗ Service '$MINIO_SERVICE' tidak berjalan." >&2; exit 1
fi
MINIO_CID="$($DC ps -q "$MINIO_SERVICE")"

ENV_FILE="$REPO_ROOT/.env"
MINIO_USER="$(grep -E '^MINIO_ROOT_USER=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')"
MINIO_PASS="$(grep -E '^MINIO_ROOT_PASSWORD=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')"
if [ -z "$MINIO_USER" ] || [ -z "$MINIO_PASS" ]; then
  echo "✗ Kredensial MinIO tak ada di $ENV_FILE." >&2; exit 1
fi

echo
echo "⚠  Ini akan MENARUH KEMBALI $COUNT objek ke bucket produksi '$BUCKET'."
read -r -p "   Ketik 'PULIHKAN' untuk lanjut: " CONFIRM
[ "$CONFIRM" = "PULIHKAN" ] || { echo "Dibatalkan."; exit 1; }

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/minio_restore.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "▶ Ekstrak arsip ke staging…"
tar -xzf "$ARCHIVE" -C "$STAGE"

echo "▶ Mirror staging → bucket '$BUCKET'…"
docker run --rm \
  --network "container:$MINIO_CID" \
  -e "MC_HOST_m=http://${MINIO_USER}:${MINIO_PASS}@127.0.0.1:9000" \
  -v "$STAGE:/in:ro" \
  "$MC_IMAGE" mirror --overwrite /in "m/$BUCKET" >/dev/null

echo "✅ Selesai. $COUNT objek dipulihkan ke bucket '$BUCKET'."
