# Load Test — Simulasi Submit Responden Konkuren

Menguji jalur submit responden saat banyak TPD menyimpan data **bersamaan**
(skenario nyata: 40 TPD × 10 responden serempak, ramp-up bertahap), sekaligus
memverifikasi integritas: kuota tidak jebol & nomor kuesioner tidak duplikat.

## Prasyarat
- PostgreSQL + Redis (bisa via Docker), backend ter-migrasi.
- Node 18+ (memakai `fetch` bawaan).

## Cara pakai (lokal)

1. **Stack DB/Redis** (contoh port khusus agar tak bentrok):
   ```bash
   docker run -d --name lt_pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=<pw> \
     -e POSTGRES_DB=web_survey_platform -p 55432:5432 postgres:16-alpine
   docker run -d --name lt_redis -p 56379:6379 redis:7-alpine
   ```

2. **Migrasi** (dari folder `backend`):
   ```bash
   DB_PORT=55432 npx sequelize-cli db:migrate
   ```

3. **Seed** survei + N TPD + kuota → menulis `loadtest-config.json`:
   ```bash
   DB_PORT=55432 LT_TPD=40 LT_QUOTA=10 node loadtest/seed-loadtest.js
   ```

4. **Jalankan backend** (rate-limit dimatikan untuk uji beban):
   ```bash
   NODE_ENV=development DB_PORT=55432 REDIS_URL=redis://localhost:56379 \
     RATE_LIMIT_DISABLED=true PORT=3000 node src/app.js
   ```

5. **Jalankan simulasi**:
   ```bash
   DB_PORT=55432 LT_RESP=10 LT_RAMP="10,20,30,40" LT_OVERRUN=40 node loadtest/run-loadtest.js
   ```

## ENV
| Var | Default | Keterangan |
|-----|---------|------------|
| `LT_TPD` | 40 | jumlah TPD yang di-seed |
| `LT_QUOTA` | 10 | kuota per TPD |
| `LT_RESP` | 10 | submit per TPD per level |
| `LT_RAMP` | `10,20,30,40` | tahapan jumlah TPD |
| `LT_OVERRUN` | 5 | uji boundary: tembak `kuota+OVERRUN` konkuren dari 1 TPD |
| `LT_BASE` | `http://localhost:3000` | URL backend |

## Yang diverifikasi
- **Throughput / latency** (p50/p95/max) per level.
- **Kuota tidak jebol** (`maxPerTPD ≤ quota`) — uji boundary C1: tembak melebihi
  kuota secara konkuren harus menghasilkan **tepat `quota`** commit.
- **Tidak ada nomor kuesioner duplikat**.

> Catatan: token surveyor di-mint langsung dengan `JWT_SECRET` (mem-bypass
> `/auth/login`) agar fokus beban di `/responses/start` + `/submit`.
> Untuk menembak VPS produksi, butuh otorisasi + rencana pembersihan data uji.
