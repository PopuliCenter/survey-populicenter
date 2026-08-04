# Manual Web Survey Platform — Populi Center

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Struktur Proyek](#2-struktur-proyek)
3. [Cara A: Menjalankan di Localhost (Tanpa Docker)](#3-cara-a-menjalankan-di-localhost-tanpa-docker)
4. [Cara B: Menjalankan di Localhost dengan Docker](#4-cara-b-menjalankan-di-localhost-dengan-docker)
5. [Cara C: Deploy ke VPS / AWS EC2 dengan Docker](#5-cara-c-deploy-ke-vps--aws-ec2-dengan-docker)
6. [Cara D: Deploy ke VPS / AWS EC2 Tanpa Docker](#6-cara-d-deploy-ke-vps--aws-ec2-tanpa-docker)
7. [Menjalankan Test](#7-menjalankan-test)
8. [Akun Default & Role](#8-akun-default--role)
9. [Variabel Lingkungan](#9-variabel-lingkungan)
10. [Fitur Utama](#10-fitur-utama)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prasyarat

### Tanpa Docker (Cara A / D)

| Software | Versi Minimum | Keterangan |
|---|---|---|
| **Node.js** | 18.x+ | [nodejs.org](https://nodejs.org) |
| **npm** | 9.x+ | Sudah termasuk dalam Node.js |
| **PostgreSQL** | 14.x+ | [postgresql.org](https://www.postgresql.org) |
| **Redis** | 6.x+ | [redis.io](https://redis.io) |

### Dengan Docker (Cara B / C)

| Software | Versi Minimum | Keterangan |
|---|---|---|
| **Docker** | 24.x+ | [docker.com](https://www.docker.com) |
| **Docker Compose** | v2+ | Sudah termasuk dalam Docker Desktop |

---

## 2. Struktur Proyek

```
web-survey-platform/
├── backend/              # API server (Node.js + Express + Sequelize)
│   ├── src/
│   │   ├── config/       # Konfigurasi database, redis, queue
│   │   ├── middleware/    # Auth, audit log
│   │   ├── migrations/   # Database migrations
│   │   ├── models/       # Sequelize models
│   │   ├── routes/       # API endpoints
│   │   ├── seeders/      # Data awal (admin default)
│   │   ├── utils/        # Validator, helpers
│   │   ├── workers/      # Export worker (Bull queue)
│   │   └── app.js        # Entry point
│   ├── tests/            # Unit, property, integration tests
│   ├── Dockerfile        # Docker image backend
│   ├── .env.example      # Template environment
│   └── package.json
├── frontend/             # UI (React + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/   # Komponen reusable
│   │   ├── pages/        # Halaman admin/supervisor/viewer
│   │   ├── surveyor/     # Halaman surveyor (form, list)
│   │   ├── services/     # API client (axios)
│   │   └── utils/        # Helpers, offline DB
│   ├── android/          # Project Android (Capacitor) — build APK TPD
│   ├── Dockerfile        # Docker image frontend (multi-stage + nginx)
│   └── package.json
├── sampling-service/     # Microservice Random Sampling (Python + FastAPI)
│   ├── main.py           # Endpoint HTTP (/inspect, /preview, /run, /template)
│   ├── sampling_engine.py# Engine metodologi (MFD/BPS)
│   └── requirements.txt
├── docs/                 # Dokumentasi (play-store, legal, ops, embed WordPress)
├── docker-compose.yml    # Orchestrasi semua service
├── nginx.conf            # Reverse proxy config untuk Docker
├── .env.docker           # Template env untuk Docker deployment
└── MANUAL.md             # File ini
```

---

## 3. Cara A: Menjalankan di Localhost (Tanpa Docker)

### Langkah 1: Pastikan PostgreSQL dan Redis Berjalan

**PostgreSQL:**
```bash
# Windows: buka pgAdmin atau jalankan service PostgreSQL
# Linux/Mac:
sudo systemctl start postgresql
```

**Redis:**
```bash
# Windows: jalankan redis-server.exe
# Linux:
sudo systemctl start redis
# Mac:
brew services start redis

# Verifikasi:
redis-cli ping   # harus menjawab PONG
```

### Langkah 2: Buat Database

```bash
psql -U postgres
```
```sql
CREATE DATABASE web_survey_platform;
CREATE DATABASE web_survey_platform_test;
\q
```

### Langkah 3: Konfigurasi Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=web_survey_platform
DB_USER=postgres
DB_PASSWORD=password_postgresql_anda
JWT_SECRET=secret_key_acak_panjang
SESSION_SECRET=session_secret_acak_panjang
REDIS_URL=redis://localhost:6379
UPLOAD_DIR=uploads/photos
MAX_FILE_SIZE_MB=5
FRONTEND_URL=http://localhost:5173
```

### Langkah 4: Install Dependensi

```bash
# Terminal 1 — Backend
cd backend
npm install

# Terminal 2 — Frontend
cd frontend
npm install
```

### Langkah 5: Migrasi & Seeder

```bash
cd backend
npm run migrate
npm run seed
```

### Langkah 6: Jalankan Aplikasi

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Buka **http://localhost:5173** → Login: `admin@example.com` / `Admin123!`

### Checklist Sebelum Login

Jika muncul "Terjadi kesalahan internal server" saat login, periksa:

| Cek | Perintah | Harus |
|---|---|---|
| PostgreSQL aktif | `pg_isready` | `accepting connections` |
| Redis aktif | `redis-cli ping` | `PONG` |
| Password DB benar | Cek `DB_PASSWORD` di `.env` | Sesuai password PostgreSQL |
| Database ada | `psql -U postgres -l` | `web_survey_platform` ada di list |
| Migrasi sudah jalan | `npm run migrate` | Tidak ada error |
| Seeder sudah jalan | `npm run seed` | Tidak ada error |
| Backend jalan | `curl http://localhost:3000/health` | `{"status":"ok"}` |

---

## 4. Cara B: Menjalankan di Localhost dengan Docker

### Langkah 1: Buat File .env

```bash
cp .env.docker .env
```

Edit `.env`:
```env
DB_PASSWORD=password_aman
JWT_SECRET=secret_key_acak_panjang
SESSION_SECRET=session_secret_acak_panjang
FRONTEND_URL=http://localhost
```

### Langkah 2: Build & Jalankan

```bash
docker compose up -d --build
```

### Langkah 3: Migrasi & Seeder

```bash
docker compose exec backend node node_modules/sequelize-cli/lib/sequelize db:migrate
docker compose exec backend node node_modules/sequelize-cli/lib/sequelize db:seed:all
```

### Langkah 4: Verifikasi

```bash
docker compose ps          # semua service harus "running" / "healthy"
curl http://localhost/health   # {"status":"ok"}
```

Buka **http://localhost** → Login: `admin@example.com` / `Admin123!`

### Perintah Berguna

```bash
docker compose logs -f backend    # lihat log backend
docker compose restart backend    # restart backend
docker compose down               # stop semua
docker compose down -v            # stop + hapus data (HATI-HATI)
```

---

## 5. Cara C: Deploy ke VPS / AWS EC2 dengan Docker

### Langkah 1: Install Docker di Server

```bash
ssh root@IP_SERVER

# Install Docker
curl -fsSL https://get.docker.com | sh

# Verifikasi
docker --version
docker compose version
```

### Langkah 2: Clone & Konfigurasi

```bash
cd /var/www
git clone https://github.com/PopuliCenter/survey-app.git
cd survey-app

cp .env.docker .env
nano .env
```

Edit `.env` — **WAJIB ganti semua nilai default**:
```env
DB_PASSWORD=password_database_aman_dan_panjang
JWT_SECRET=hasil_generate_random_64_karakter
SESSION_SECRET=hasil_generate_random_64_karakter
FRONTEND_URL=http://IP_SERVER
```

Generate secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Atau jika node belum ada:
openssl rand -hex 64
```

### Langkah 3: Build & Deploy

```bash
docker compose up -d --build
docker compose exec backend node node_modules/sequelize-cli/lib/sequelize db:migrate
docker compose exec backend node node_modules/sequelize-cli/lib/sequelize db:seed:all
docker compose ps
```

Aplikasi jalan di **http://IP_SERVER**

### Langkah 4: Update Aplikasi

```bash
cd /var/www/survey-app
git pull origin main
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose exec backend node node_modules/sequelize-cli/lib/sequelize db:migrate
```

### Langkah 5: Backup Database

```bash
# Backup
docker compose exec postgres pg_dump -U surveyapp web_survey_platform > backup_$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U surveyapp web_survey_platform
```

---

## 6. Cara D: Deploy ke VPS / AWS EC2 Tanpa Docker

### Langkah 1: Install Software di Server

```bash
ssh root@IP_SERVER

sudo apt update && sudo apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# Nginx + PM2
sudo apt install -y nginx
sudo npm install -g pm2
```

### Langkah 2: Setup Database

```bash
sudo -u postgres psql
```
```sql
CREATE USER surveyapp WITH PASSWORD 'password_aman';
CREATE DATABASE web_survey_platform OWNER surveyapp;
GRANT ALL PRIVILEGES ON DATABASE web_survey_platform TO surveyapp;
\q
```

### Langkah 3: Clone & Konfigurasi

```bash
cd /var/www
git clone https://github.com/PopuliCenter/survey-app.git
cd survey-app/backend

npm install --production
cp .env.example .env
nano .env
```

Isi `.env`:
```env
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=web_survey_platform
DB_USER=surveyapp
DB_PASSWORD=password_aman
JWT_SECRET=generate_random_64_karakter
SESSION_SECRET=generate_random_64_karakter
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://IP_SERVER
UPLOAD_DIR=uploads/photos
MAX_FILE_SIZE_MB=5
```

```bash
npm run migrate
npm run seed
```

### Langkah 4: Build Frontend

```bash
cd /var/www/survey-app/frontend
npm install
npm run build
```

### Langkah 5: Jalankan dengan PM2

```bash
cd /var/www/survey-app/backend
pm2 start src/app.js --name "survey-api" -i 2
pm2 start src/workers/index.js --name "survey-worker"
pm2 save
pm2 startup
```

### Langkah 6: Konfigurasi Nginx

```bash
sudo nano /etc/nginx/sites-available/survey-platform
```

```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 10M;

    root /var/www/survey-app/frontend/dist;
    index index.html;

    location /auth       { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /admins     { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /supervisors { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /viewers    { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /surveyors  { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /surveys    { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /responses  { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /reports    { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /dashboard  { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /map        { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /upload     { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /audit-logs { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /cleanup    { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /health     { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /uploads/   { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/survey-platform /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### Langkah 7: Update Aplikasi

```bash
cd /var/www/survey-app
git pull origin main
cd backend && npm install --production && npm run migrate && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 restart all
```

---

## 7. Menjalankan Test

### Backend

```bash
cd backend
npm test                    # semua test
npm run test:coverage       # dengan coverage report
```

### Frontend

```bash
cd frontend
npm test -- --run           # sekali jalan
npm run test:coverage       # dengan coverage report
```

---

## 8. Akun Default & Role

Setelah seeder, tersedia akun admin:

| Field | Nilai |
|---|---|
| Email | `admin@example.com` |
| Password | `Admin123!` |
| Role | `admin` |

### Role

| Role | Akses |
|---|---|
| **admin** | Semua fitur: Dashboard, Pengguna, Surveyors, Surveys, Responses, Reports, Map, Audit Log, Pembersihan Data, Random Sampling, hapus permanen respons |
| **supervisor** | Dashboard, Surveys, Surveyors, Responses, Reports, Map, Random Sampling, kecualikan respons dari laporan |
| **asisten supervisor** | Seperti supervisor **tanpa** kelola/ubah survei (mewarisi hak akses supervisor) |
| **viewer** / **partner lokal** | Dashboard, Surveys, Reports, Map, Responses (read-only) |
| **surveyor** (TPD) | Halaman surveyor: daftar survei, isi formulir, undian RT, notifikasi |

> **Kunci perangkat**: bila survei mengaktifkan "Kunci Perangkat", satu akun TPD hanya bisa login/isi dari satu perangkat (HP) yang pertama kali dipakai. Reset lewat **Manajemen TPD → Reset Perangkat**.

### Aturan Password

Min. 8 karakter, huruf besar, huruf kecil, dan angka. Contoh: `Admin123!`, `Surveyor1`

---

## 9. Variabel Lingkungan

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port backend |
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `DB_HOST` | `localhost` | Host PostgreSQL (`postgres` untuk Docker) |
| `DB_PORT` | `5432` | Port PostgreSQL |
| `DB_NAME` | `web_survey_platform` | Nama database |
| `DB_USER` | `postgres` | Username PostgreSQL |
| `DB_PASSWORD` | — | Password PostgreSQL |
| `DB_SSL` | — | Set `true` untuk koneksi SSL (jangan set untuk Docker) |
| `JWT_SECRET` | — | Secret JWT (wajib ganti di production) |
| `SESSION_SECRET` | — | Secret session (wajib ganti di production) |
| `REDIS_URL` | `redis://localhost:6379` | URL Redis (`redis://redis:6379` untuk Docker) |
| `FRONTEND_URL` | `http://localhost:5173` | URL frontend untuk CORS |
| `UPLOAD_DIR` | `uploads/photos` | Direktori upload |
| `MAX_FILE_SIZE_MB` | `5` | Max ukuran file upload |
| `SAMPLING_SERVICE_URL` | `http://sampling:8000` | URL internal microservice Random Sampling |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | — | Path file service account JSON untuk push FCM. Kosong = push nonaktif (fitur lonceng tetap jalan) |
| `MEDIA_STORAGE` | `local` | `local` (folder `UPLOAD_DIR`) atau `minio` (object storage S3) |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` / `MINIO_USE_SSL` | — | Konfigurasi MinIO bila `MEDIA_STORAGE=minio` |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Batas login per IP+email / 15 mnt |
| `LOGIN_IP_RATE_LIMIT_MAX` | `100` | Batas login per IP / 15 mnt (untuk jaringan CGNAT banyak TPD) |
| `SENTRY_DSN` | — | DSN Sentry (error tracking); kosong = nonaktif |

> **Push FCM & Random Sampling bersifat opsional.** Bila `FIREBASE_SERVICE_ACCOUNT_PATH` tidak diisi, backend hidup normal tanpa push. Bila service `sampling` tidak berjalan, hanya menu Random Sampling yang tak tersedia. JANGAN commit file service account JSON ke repo.

---

## 10. Fitur Utama

### 10.1 Pengaturan Field Tools per Survei

Admin mengonfigurasi field tools (Tanda Tangan, Audio, Foto, GPS) per survei: **Wajib**, **Opsional**, atau **Nonaktif**. Konfigurasi di Survey Builder → Pengaturan Field Tools.

### 10.2 Mode Tampilan Formulir

Admin memilih mode formulir per survei:
- **Per Pertanyaan (Wizard)**: satu pertanyaan per halaman + navigasi + grid overview
- **Satu Halaman (Scroll)**: semua pertanyaan dalam satu halaman

### 10.3 Nomor Kuesioner

Format: `{PREFIX}-{YYYYMMDD}-{NOMOR}`. Jika ada pertanyaan Nomor Kuesioner (Unik), nomor input surveyor digunakan sebagai suffix.

### 10.4 Skip Logic

"Lompat ke Q5" pada Q1 → Q2, Q3, Q4 disembunyikan. Operator: sama dengan, tidak sama dengan, mengandung, lebih dari, kurang dari.

### 10.5 Opsi "Lainnya"

Pertanyaan pilihan tunggal/ganda bisa diaktifkan opsi "Lainnya" — surveyor mengetik jawaban sendiri.

### 10.6 Filter di Manajemen

- **Survei**: filter tahun, bulan
- **Surveyor**: filter nama, survei, tahun/bulan bergabung
- **Responden**: filter survei, surveyor, tanggal, geolokasi, status review

### 10.7 Randomisasi Urutan Pertanyaan (Blok Acak)

Admin menandai **blok** pertanyaan (lewat rentang nomor) yang urutannya diacak per responden — mengurangi bias urutan. Panel menampilkan **rekap** blok (dari nomor berapa sampai berapa) dan tombol **hapus blok**. Saling eksklusif dengan skip logic; seed diacak per nomor kuesioner sehingga bisa direplikasi. Data diri responden tidak ikut diacak.

### 10.8 Undian RT (Pemilihan RT)

Untuk survei berbasis wilayah, TPD melakukan **undian RT** yang jadi replika Form A dengan **grid kotak** agar admin/SPV/asisten bisa memverifikasi pengacakan secara visual. Bisa dijalankan **offline** memakai tiket seed (deterministik), lalu disinkronkan saat online. Aktifkan di Survey Builder → Field Tools → Pemilihan RT + jumlah RT.

### 10.9 Kunci Perangkat (1 Akun TPD = 1 HP)

Bila diaktifkan per survei, akun TPD terikat ke **perangkat pertama** yang mengisi survei berkunci. Login dari perangkat lain ditolak sejak halaman masuk. Badge di Manajemen TPD menampilkan perangkat sebenarnya (mis. `Android · <model>` atau `Komputer (Windows)`). Reset via **Reset Perangkat** agar bisa mengikat ulang.

### 10.10 Kebijakan GPS

- **APK (HP)**: submit **diblokir** sampai GPS mendapatkan fix (data lapangan wajib berkoordinat).
- **Web**: best-effort — submit tanpa koordinat **diterima** hanya bila status kegagalan GPS terekam (timeout / lokasi tidak tersedia), lalu ditandai **kuning "GPS"** untuk review.

### 10.11 Notifikasi TPD

- **Lonceng di dashboard TPD**: pesan dari admin/SPV + notifikasi otomatis saat responsnya ditandai review.
- **Push FCM ke HP** (bila `FIREBASE_SERVICE_ACCOUNT_PATH` diisi): notifikasi tetap tampil walau aplikasi sedang dibuka (dicermin ke tray).

### 10.12 Kecualikan Respons dari Laporan

Saat oversampling menambal data fraud, admin/SPV dapat **mengecualikan** respons dari laporan — respons tetap ada di database tetapi tidak masuk ekspor, snapshot publik, maupun agregat, dan **tidak** memakai kuota. **Hapus permanen** hanya bisa dilakukan admin.

### 10.13 Font Formulir per Survei

Di Pengaturan Survei, atur **skala** (normal / besar / lebih besar) dan **jenis huruf** (default / serif / Atkinson Hyperlegible / ringkas) formulir agar nyaman dibaca TPD di lapangan.

### 10.14 Checklist "Siap Offline"

Di aplikasi TPD, checklist pra-lapangan memastikan survei, data acuan wilayah, dan tiket undian RT sudah terunduh sebelum berangkat ke lokasi tanpa sinyal.

### 10.15 Laporan & Hasil Publik

- **Laporan PPTX** otomatis (template Populi) dari data agregat.
- **Hasil publik**: snapshot agregat opt-in yang bisa di-**embed** sebagai iframe ke website (mis. populicenter.org).

### 10.16 Random Sampling

Menu **Random Sampling** (admin/supervisor) memanggil microservice Python/FastAPI untuk menyusun sampel wilayah dengan 3 metode: **Proporsional + bobot desain**, **√N + bobot**, dan **PPS Sistematik**. Unggah MFD, pratinjau alokasi, jalankan, lalu unduh hasil Excel. Lihat [sampling-service/README.md](sampling-service/README.md).

---

## 11. Troubleshooting

### "Terjadi kesalahan internal server" saat login

**Penyebab umum (urutan cek):**

1. **Redis tidak aktif** → `redis-cli ping` harus jawab `PONG`
2. **Password database salah** → cek `DB_PASSWORD` di `.env` sesuai password PostgreSQL
3. **Database belum dibuat** → `psql -U postgres -l` harus ada `web_survey_platform`
4. **Migrasi belum jalan** → `cd backend && npm run migrate`
5. **Seeder belum jalan** → `cd backend && npm run seed`

### "The server does not support SSL connections" (Docker)

**Penyebab:** Production config memaksa SSL tapi PostgreSQL Docker tidak pakai SSL.

**Solusi:** Jangan set `DB_SSL=true` di `.env`. Pastikan variabel `DB_SSL` tidak ada atau kosong.

### Docker image tidak terupdate setelah git pull

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Port 80 sudah digunakan

```bash
# Cek proses di port 80
sudo lsof -i :80
# atau
sudo netstat -tlnp | grep :80

# Stop proses yang menggunakan port
sudo systemctl stop apache2   # jika Apache
sudo systemctl stop nginx     # jika Nginx lama
```

### Backend tidak bisa connect ke database

```bash
# Localhost
pg_isready -h localhost -p 5432

# Docker
docker compose exec postgres pg_isready -U surveyapp
docker compose logs postgres
```

### Redis connection closed / refused

```bash
# Localhost
redis-cli ping

# Docker
docker compose exec redis redis-cli ping
docker compose logs redis
```

### Migrasi gagal

```bash
# Reset total (HATI-HATI — hapus semua data)
cd backend
npm run migrate:undo:all
npm run migrate
npm run seed
```

### Export/download masih include data PENDING

Restart backend setelah update kode:
```bash
# Localhost
# Stop dan jalankan ulang npm run dev

# Docker
docker compose restart backend worker
```

### Push FCM tidak sampai ke HP TPD

1. Pastikan `FIREBASE_SERVICE_ACCOUNT_PATH` terisi dan file JSON ada di server → cek log backend saat start (`[Push] FCM aktif` vs `NONAKTIF`).
2. Pastikan HP TPD sudah pakai APK terbaru dan token FCM tercatat (tabel `fcm_tokens`).
3. Lonceng dashboard tetap berfungsi walau push nonaktif — keduanya jalur terpisah.

### "Pengaturan survei tidak berlaku di APK"

Biasanya **cache survei basi** di HP, bukan bug. Minta TPD menekan **Perbarui** saat online agar menarik pengaturan terbaru (font, field tools, kunci perangkat). Server tetap menegakkan aturan saat submit.

### Kunci perangkat "masih bisa login di 2 device"

Akun terikat ke perangkat **pertama** yang mengisi survei berkunci. Bila ternyata terikat ke browser web (bukan HP), buka **Manajemen TPD → Reset Perangkat**, lalu login & mulai survei **dari HP** agar mengikat ulang ke HP. Cek badge perangkat untuk memastikan terikat ke `Android`, bukan `Komputer`.

### Menu Random Sampling error / kosong

Pastikan service `sampling` berjalan (`docker compose ps` → `sampling` healthy) dan `SAMPLING_SERVICE_URL` menunjuk ke `http://sampling:8000`. Service ini tanpa port ke host (hanya diakses backend via jaringan internal Docker).

### Backup & Restore Database

> **Penting:** media (foto, **rekaman audio**, tanda tangan) disimpan terpisah dari database. Backup DB saja tidak menyertakan media — cadangkan juga `UPLOAD_DIR` / bucket MinIO.

```bash
# Docker
docker compose exec postgres pg_dump -U surveyapp web_survey_platform > backup.sql
cat backup.sql | docker compose exec -T postgres psql -U surveyapp web_survey_platform

# Localhost
pg_dump -U postgres web_survey_platform > backup.sql
psql -U postgres web_survey_platform < backup.sql
```
