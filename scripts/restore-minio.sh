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
MIRROR_SERVICE="${MIRROR_SERVICE:-worker}"   # service berimage backend, tanpa RUN_MIGRATIONS

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
  # sed membaca sampai habis; `head` di sini memutus pipa, dan dengan pipefail + -e
  # skrip mati sebelum sempat menyatakan arsip valid.
  tar -tzf "$ARCHIVE" | grep -v '/$' | sed -n '1,5s/^/    · /p'
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

echo
echo "⚠  Ini akan MENARUH KEMBALI $COUNT objek ke bucket media produksi."
read -r -p "   Ketik 'PULIHKAN' untuk lanjut: " CONFIRM
[ "$CONFIRM" = "PULIHKAN" ] || { echo "Dibatalkan."; exit 1; }

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/minio_restore.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "▶ Ekstrak arsip ke staging…"
tar -xzf "$ARCHIVE" -C "$STAGE"

echo "▶ Mirror staging → bucket media…"
# Alat & kredensial sama seperti backup-minio.sh: image backend kita + env worker.
$DC run --rm --no-deps -T \
  -v "$STAGE:/in:ro" \
  -v "$REPO_ROOT/backend/scripts/media-mirror.cjs:/app/scripts/media-mirror.cjs:ro" \
  "$MIRROR_SERVICE" node scripts/media-mirror.cjs push /in "$COUNT"

echo "✅ Selesai. $COUNT objek dipulihkan."
