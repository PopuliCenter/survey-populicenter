#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-media.sh — Pulihkan FILE MEDIA (foto/audio/tanda tangan) dari arsip.
#
# ⚠ DESTRUKTIF: menimpa isi volume `uploads` di PRODUKSI.
#   Berkas yang ada di volume tapi TIDAK ada di arsip akan TETAP ada
#   (restore ini menimpa, bukan menyapu bersih) — aman untuk pemulihan parsial.
#
# Pakai:
#   bash scripts/restore-media.sh backups/uploads_20260715_023000.tar.gz
#
# Untuk MENGUJI arsip tanpa menyentuh produksi, pakai --dry-run:
#   bash scripts/restore-media.sh --dry-run backups/uploads_20260715_023000.tar.gz
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

APP_SERVICE="${APP_SERVICE:-backend}"
UPLOAD_PATH="${UPLOAD_PATH:-/app/uploads}"

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; shift; fi

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Pakai: bash scripts/restore-media.sh [--dry-run] <backups/uploads_*.tar.gz>" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

# ── Validasi arsip SEBELUM menyentuh apa pun ────────────────────────────────
if ! gzip -t "$ARCHIVE" 2>/dev/null; then
  echo "✗ Arsip korup (gagal uji gzip). Batal." >&2
  exit 1
fi
COUNT="$(tar -tzf "$ARCHIVE" | grep -vc '/$' || true)"
echo "▶ Arsip : $ARCHIVE"
echo "  Berisi: $COUNT berkas"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "  Contoh isi:"
  tar -tzf "$ARCHIVE" | grep -v '/$' | head -5 | sed 's/^/    · /'
  echo "✅ Uji selesai — arsip VALID. Produksi tidak disentuh (--dry-run)."
  exit 0
fi

if [ "$COUNT" -eq 0 ]; then
  echo "✗ Arsip kosong — menolak restore (mencegah 'pemulihan' yang menghapus apa pun)." >&2
  exit 1
fi

# ── Konfirmasi eksplisit: ini produksi ──────────────────────────────────────
echo
echo "⚠  Ini akan MENIMPA media di volume produksi ($UPLOAD_PATH)."
read -r -p "   Ketik 'PULIHKAN' untuk lanjut: " CONFIRM
[ "$CONFIRM" = "PULIHKAN" ] || { echo "Dibatalkan."; exit 1; }

if ! $DC ps --status running --services 2>/dev/null | grep -qx "$APP_SERVICE"; then
  echo "✗ Service '$APP_SERVICE' tidak berjalan." >&2
  exit 1
fi

echo "▶ Memulihkan $COUNT berkas → $UPLOAD_PATH"
$DC exec -T "$APP_SERVICE" sh -c "mkdir -p '$UPLOAD_PATH' && tar -xzf - -C '$UPLOAD_PATH'" < "$ARCHIVE"

AFTER="$($DC exec -T "$APP_SERVICE" sh -c "find '$UPLOAD_PATH' -type f | wc -l" | tr -d '\r[:space:]')"
echo "✅ Selesai. Volume kini berisi $AFTER berkas."
