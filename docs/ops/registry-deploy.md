# Deploy via Registry (GHCR) — 12-factor faktor 5

Memisahkan tahap **build** dari **run**: image dibangun oleh **CI (GitHub
Actions)** dan didorong ke **GHCR**, lalu server produksi cukup **menariknya**.
Menutup pelanggaran faktor 5 "build di server produksi" — build gagal tak lagi
menyandera produksi, dan rollback jadi hitungan detik (tukar tag, bukan rebuild).

## Cara kerja

1. Push ke `main` → CI menjalankan test (frontend + backend).
2. **Hanya bila test lulus**, dua job publish membangun & mendorong ke GHCR:
   - `ghcr.io/populicenter/survey-backend` (dipakai service **backend & worker**)
   - `ghcr.io/populicenter/survey-nginx` (SPA + reverse proxy)
   - Tiap image dua tag: **`latest`** (deploy default) + **`sha-<commit>`** (rollback).
3. Server: `docker compose pull && docker compose up -d` — **tanpa build**.

`docker-compose.yml` menyimpan **`image:` DAN `build:`**:
- Produksi → `pull` memakai `image:` dari GHCR.
- Dev lokal → `docker compose up -d --build` tetap membangun dari sumber.

## Prasyarat (sekali)

- **Repo GitHub `PopuliCenter/...`** dengan Actions aktif. Job publish memakai
  `GITHUB_TOKEN` bawaan (permission `packages: write`) — **tak perlu secret PAT**.
- **Paket GHCR boleh privat** (default). Server perlu bisa menariknya:
  ```bash
  # di server, sekali — login GHCR dgn Personal Access Token (scope: read:packages)
  echo <GHCR_PAT> | docker login ghcr.io -u <username-github> --password-stdin
  ```
  ⚠️ PAT ini rahasia — buat di GitHub → Settings → Developer settings → Tokens
  (classic, scope **`read:packages`** saja). Jangan taruh di repo.
- **(Opsional) Sentry web**: set repo secret `VITE_SENTRY_DSN` agar dipanggang ke
  image nginx. Kosong = web tanpa Sentry (tetap jalan).

## Deploy rutin (setelah CI hijau)

```bash
cd /var/www/survey-populicenter && git pull      # ambil compose + config/cert terbaru
docker compose pull backend worker nginx         # tarik image baru dari GHCR
docker compose up -d                             # jalankan; entrypoint auto-migrate
docker compose ps                                # semua healthy
```
> `git pull` tetap perlu: `nginx.conf`, `nginx-common.conf`, `certs/`, dan
> `docker-compose.yml` adalah **host-mount/konfigurasi**, bukan bagian image.

## Rollback presisi (detik, bukan menit)

Setiap commit punya tag `sha-<12char>`. Untuk kembali ke versi sebelumnya:
```bash
# cari tag di GHCR (Packages) atau dari histori commit
IMAGE_TAG=sha-abc123def456 docker compose up -d backend worker nginx
```
Set `IMAGE_TAG` di `.env` server agar menetap, atau inline seperti di atas.
Tanpa `IMAGE_TAG`, default `latest`.

> ⚠️ **Rollback backend + migrasi:** entrypoint menjalankan migrasi maju otomatis,
> TAPI migrasi mundur TIDAK otomatis. Bila versi baru menambah kolom lalu Anda
> rollback image, skema tetap lebih baru — biasanya aman (kolom ekstra diabaikan
> kode lama). Rollback yang butuh turunkan skema = manual `sequelize db:migrate:undo`.

## Verifikasi image benar

```bash
docker compose images                # tag yang sedang jalan
docker image inspect ghcr.io/populicenter/survey-backend:latest \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
```

## Batasan / catatan jujur

- **Transisi pertama**: image GHCR belum ada sampai CI pertama sukses pasca-merge.
  Sampai itu, server masih bisa `docker compose up -d --build` (build lokal) —
  `build:` sengaja dipertahankan sebagai jaring.
- **Nama image di-hardcode `ghcr.io/populicenter/...`** (lowercase, sesuai
  konvensi stack tetangga `survei-*`). Bila org/nama repo berubah, sesuaikan di
  `.github/workflows/ci.yml` DAN `docker-compose.yml`.
- Job publish hanya jalan pada **push ke main**, bukan PR — PR tetap diuji tanpa
  mendorong image.
