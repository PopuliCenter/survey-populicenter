#!/bin/sh
# Entrypoint backend/worker (image yang sama untuk keduanya).
#
# AUTO-MIGRATE: dijalankan HANYA bila RUN_MIGRATIONS=1 (disetel di service
# `backend` pada docker-compose.yml — worker TIDAK, agar dua proses tidak
# berlomba menjalankan migrasi yang sama saat boot bersamaan).
#
# Kenapa fail-fast (set -e): lebih baik container GAGAL START daripada server
# hidup dengan skema DB tertinggal — kelas outage "login 500 karena kolom
# belum ada" (insiden 2026-07-13) yang justru ingin dihapus fitur ini.
# Bila migrasi gagal, restart policy compose akan mencoba ulang; errornya
# terlihat di `docker compose logs backend`.
set -e

if [ "$RUN_MIGRATIONS" = "1" ] || [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "[entrypoint] Menjalankan migrasi database (RUN_MIGRATIONS=$RUN_MIGRATIONS)…"
  npx sequelize-cli db:migrate
  echo "[entrypoint] Migrasi selesai — melanjutkan ke proses utama."
else
  echo "[entrypoint] Lewati migrasi (RUN_MIGRATIONS tidak disetel)."
fi

exec "$@"
