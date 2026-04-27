# Manual Menjalankan Web Survey Platform

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Struktur Proyek](#2-struktur-proyek)
3. [Persiapan Awal (Pertama Kali)](#3-persiapan-awal-pertama-kali)
4. [Menjalankan Aplikasi](#4-menjalankan-aplikasi)
5. [Menjalankan Test](#5-menjalankan-test)
6. [Akun Default & Role](#6-akun-default--role)
7. [Variabel Lingkungan](#7-variabel-lingkungan)
8. [Fitur Utama](#8-fitur-utama)
9. [Deployment ke AWS EC2](#9-deployment-ke-aws-ec2)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prasyarat

Pastikan semua software berikut sudah terinstal sebelum memulai:

| Software | Versi Minimum | Keterangan |
|---|---|---|
| **Node.js** | 18.x atau lebih baru | [nodejs.org](https://nodejs.org) |
| **npm** | 9.x atau lebih baru | Sudah termasuk dalam Node.js |
| **PostgreSQL** | 14.x atau lebih baru | [postgresql.org](https://www.postgresql.org) |
| **Redis** | 6.x atau lebih baru | [redis.io](https://redis.io) |

Verifikasi instalasi:

```bash
node --version
npm --version
psql --version
redis-cli --version
```

---

## 2. Struktur Proyek

```
web-survey-platform/
├── backend/          # API server (Node.js + Express)
│   ├── src/
│   ├── tests/
│   ├── .env          # Konfigurasi environment (dibuat dari .env.example)
│   └── package.json
├── frontend/         # UI (React + Vite)
│   ├── src/
│   └── package.json
└── MANUAL.md
```

---

## 3. Persiapan Awal (Pertama Kali)

Langkah-langkah ini hanya perlu dilakukan **sekali** saat pertama kali menyiapkan proyek.

### 3.1 Siapkan Database PostgreSQL

Buka terminal dan masuk ke PostgreSQL:

```bash
psql -U postgres
```

Buat database untuk development dan testing:

```sql
CREATE DATABASE web_survey_platform;
CREATE DATABASE web_survey_platform_test;
\q
```

### 3.2 Pastikan Redis Berjalan

**Windows (via WSL atau Redis for Windows):**
```bash
redis-server
```

**macOS (via Homebrew):**
```bash
brew services start redis
```

**Linux:**
```bash
sudo systemctl start redis
```

Verifikasi Redis aktif:
```bash
redis-cli ping
# Output yang diharapkan: PONG
```

### 3.3 Konfigurasi Environment Backend

Masuk ke folder backend dan salin file contoh environment:

```bash
cd backend
cp .env.example .env
```

Buka file `backend/.env` dan sesuaikan nilainya:

```env
# Server
PORT=3000
NODE_ENV=development

# Database — sesuaikan dengan konfigurasi PostgreSQL Anda
DB_HOST=localhost
DB_PORT=5432
DB_NAME=web_survey_platform
DB_USER=postgres
DB_PASSWORD=yourpassword        # ganti dengan password PostgreSQL Anda

# JWT — ganti dengan string acak yang panjang dan aman
JWT_SECRET=ganti_dengan_secret_key_yang_aman_dan_panjang
SESSION_SECRET=ganti_dengan_session_secret_yang_aman

# Redis
REDIS_URL=redis://localhost:6379

# Upload
UPLOAD_DIR=uploads/photos
MAX_FILE_SIZE_MB=5

# Frontend URL (untuk CORS)
FRONTEND_URL=http://localhost:5173
```

### 3.4 Install Dependensi

Install dependensi backend dan frontend secara bersamaan (buka dua terminal):

**Terminal 1 — Backend:**
```bash
cd backend
npm install
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
```

### 3.5 Jalankan Migrasi Database

Dari folder `backend`, jalankan migrasi untuk membuat semua tabel:

```bash
cd backend
npm run migrate
```

Output yang diharapkan:
```
== 20240101000001-create-users: migrating =======
== 20240101000001-create-users: migrated (0.XXXs)
...
== 20240102000001-update-role-constraint: migrating =======
== 20240102000001-update-role-constraint: migrated (0.XXXs)
```

### 3.6 Jalankan Seeder (Data Awal)

Buat akun admin default:

```bash
cd backend
npm run seed
```

Ini akan membuat akun admin dengan kredensial:
- **Email:** `admin@example.com`
- **Password:** `Admin123!`

---

## 4. Menjalankan Aplikasi

Setelah persiapan awal selesai, gunakan langkah-langkah berikut setiap kali ingin menjalankan aplikasi.

### 4.1 Jalankan Backend

Buka terminal di folder `backend`:

```bash
cd backend

# Mode development (auto-restart saat file berubah)
npm run dev

# Atau mode production
npm start
```

Backend akan berjalan di: **http://localhost:3000**

Verifikasi backend aktif:
```bash
curl http://localhost:3000/health
# Output: {"status":"ok","timestamp":"..."}
```

### 4.2 Jalankan Worker Export (Opsional)

Worker ini diperlukan untuk fitur ekspor laporan ke XLSX/CSV secara asinkron. Buka terminal baru:

```bash
cd backend

# Mode development
npm run worker:dev

# Atau mode production
npm run worker
```

> Jika tidak menjalankan worker, fitur ekspor laporan tidak akan memproses job di background.

### 4.3 Jalankan Frontend

Buka terminal baru di folder `frontend`:

```bash
cd frontend

# Mode development
npm run dev
```

Frontend akan berjalan di: **http://localhost:5173**

Buka browser dan akses **http://localhost:5173** untuk mulai menggunakan aplikasi.

### Ringkasan Port

| Layanan | Port | URL |
|---|---|---|
| Frontend (Vite) | 5173 | http://localhost:5173 |
| Backend (Express) | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |

---

## 5. Menjalankan Test

### 5.1 Test Backend

```bash
cd backend

# Jalankan semua test
npm test

# Jalankan dengan laporan coverage
npm run test:coverage
```

> Test backend menggunakan database terpisah (`web_survey_platform_test`). Pastikan database tersebut sudah dibuat (lihat langkah 3.1).

### 5.2 Test Frontend

```bash
cd frontend

# Jalankan semua test (mode watch)
npm test

# Jalankan sekali tanpa watch mode
npm test -- --run

# Jalankan dengan laporan coverage
npm run test:coverage
```

---

## 6. Akun Default & Role

Setelah menjalankan seeder, tersedia satu akun admin default:

| Field | Nilai |
|---|---|
| Email | `admin@example.com` |
| Password | `Admin123!` |
| Role | `admin` |

### Deskripsi Role

Aplikasi mendukung empat role dengan hak akses berbeda:

| Role | Deskripsi | Halaman yang Dapat Diakses |
|---|---|---|
| **admin** | Akses penuh ke seluruh fitur | Dashboard, Manajemen Pengguna, Surveyors, Surveys, Responses, Reports, Map, Audit Log |
| **supervisor** | Mengelola survei dan surveyor, melihat laporan | Dashboard, Surveys, Surveyors, Responses, Reports, Map |
| **viewer** | Hanya membaca dan mengunduh laporan | Dashboard, Surveys, Reports, Map, Responses |
| **surveyor** | Mengisi survei melalui antarmuka surveyor | Halaman surveyor (`/surveyor`) |

### Membuat Akun Role Lain

Login sebagai admin, lalu buka halaman **Manajemen Pengguna** (`/users`) untuk membuat akun supervisor, viewer, atau admin baru.

Aturan password untuk semua akun:
- Minimal **8 karakter**
- Mengandung minimal satu **huruf besar**
- Mengandung minimal satu **huruf kecil**
- Mengandung minimal satu **angka**

Contoh password valid: `Supervisor1`, `Viewer123`, `Admin456`

---

## 7. Variabel Lingkungan

Semua variabel dikonfigurasi di file `backend/.env`. Berikut penjelasan lengkapnya:

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server backend |
| `NODE_ENV` | `development` | Environment: `development`, `test`, atau `production` |
| `DB_HOST` | `localhost` | Host PostgreSQL |
| `DB_PORT` | `5432` | Port PostgreSQL |
| `DB_NAME` | `web_survey_platform` | Nama database development |
| `DB_NAME_TEST` | `web_survey_platform_test` | Nama database test |
| `DB_USER` | `postgres` | Username PostgreSQL |
| `DB_PASSWORD` | `yourpassword` | Password PostgreSQL |
| `JWT_SECRET` | — | Secret key untuk signing JWT (wajib diganti di production) |
| `SESSION_SECRET` | — | Secret key untuk session (wajib diganti di production) |
| `REDIS_URL` | `redis://localhost:6379` | URL koneksi Redis |
| `UPLOAD_DIR` | `uploads/photos` | Direktori penyimpanan foto upload |
| `MAX_FILE_SIZE_MB` | `5` | Ukuran maksimum file upload (MB) |
| `FRONTEND_URL` | `http://localhost:5173` | URL frontend untuk konfigurasi CORS |

---

## 8. Fitur Utama

### 8.1 Pengaturan Field Tools per Survei

Admin dapat mengonfigurasi field tools (Tanda Tangan, Rekaman Audio, Pengambilan Foto, Lokasi GPS) untuk setiap survei secara independen. Setiap field tool memiliki tiga mode:

| Mode | Keterangan |
|---|---|
| **Wajib** | Surveyor harus mengisi field tool ini saat submit |
| **Opsional** | Field tool ditampilkan tapi boleh dikosongkan |
| **Nonaktif** | Field tool disembunyikan dari formulir surveyor |

**Cara mengonfigurasi:**
1. Buka halaman **Surveys** → klik **Builder** pada survei yang diinginkan
2. Di bawah bagian "Periode Pengisian Survei", terdapat bagian **Pengaturan Field Tools**
3. Pilih mode untuk setiap field tool (Wajib / Opsional / Nonaktif)
4. Klik **Simpan Pengaturan**

Default untuk survei baru: semua field tools berstatus **Wajib** (backward compatible).

### 8.2 Nomor Kuesioner

Nomor kuesioner otomatis di-generate dengan format: `{PREFIX}-{YYYYMMDD}-{NOMOR}`

- **PREFIX**: 6 karakter pertama dari judul survei (huruf besar)
- **YYYYMMDD**: tanggal submit
- **NOMOR**: Jika survei memiliki pertanyaan tipe **Nomor Kuesioner (Unik)**, nomor yang diinput surveyor akan digunakan sebagai suffix. Jika tidak ada, nomor auto-increment digunakan.

Contoh:
- Dengan unique_id `12345`: `SURVEI-20260426-12345`
- Tanpa unique_id (auto): `SURVEI-20260426-0015`

### 8.3 Skip Logic

Skip logic memungkinkan pertanyaan tertentu dilewati berdasarkan jawaban surveyor. Konfigurasi dilakukan di **Survey Builder** pada setiap pertanyaan.

Semantik "Lompat ke": Jika aturan "Lompat ke Q5" aktif pada Q1, maka Q2, Q3, Q4 akan disembunyikan dan surveyor langsung melihat Q5.

Operator yang didukung: `sama dengan`, `tidak sama dengan`, `mengandung`, `lebih dari`, `kurang dari`.

### 8.4 Dashboard Viewer

Role **viewer** sekarang dapat mengakses halaman Dashboard untuk melihat:
- Statistik ringkasan (survei aktif, surveyor aktif, responden hari ini, total responden)
- Tren responden 7 hari terakhir
- Top 5 surveyor
- Progres survei aktif

---

## 9. Deployment ke AWS EC2

Panduan ini menggunakan **Ubuntu 22.04 LTS** pada EC2 instance. Minimum rekomendasi: **t3.small** (2 vCPU, 2 GB RAM).

### 9.1 Persiapan EC2 Instance

**Launch instance di AWS Console:**
- AMI: Ubuntu Server 22.04 LTS
- Instance type: t3.small atau lebih besar
- Storage: minimal 20 GB gp3
- Security Group — buka port berikut:

| Port | Protokol | Sumber | Keterangan |
|---|---|---|---|
| 22 | TCP | IP Anda | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP (redirect ke HTTPS) |
| 443 | TCP | 0.0.0.0/0 | HTTPS |

**SSH ke instance:**
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

### 9.2 Install Software

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2

# Verifikasi
node --version && npm --version && psql --version && redis-cli ping
```

### 9.3 Setup Database

```bash
# Masuk ke PostgreSQL
sudo -u postgres psql

# Buat database dan user
CREATE USER surveyapp WITH PASSWORD 'ganti_password_aman';
CREATE DATABASE web_survey_platform OWNER surveyapp;
GRANT ALL PRIVILEGES ON DATABASE web_survey_platform TO surveyapp;
\q
```

### 9.4 Upload Kode Proyek

**Opsi 1 — Git clone (rekomendasi):**
```bash
cd /home/ubuntu
git clone <URL_REPO_ANDA> web-survey-platform
cd web-survey-platform
```

**Opsi 2 — SCP dari lokal:**
```bash
# Dari komputer lokal
scp -i your-key.pem -r ./backend ./frontend ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/web-survey-platform/
```

### 9.5 Konfigurasi Backend

```bash
cd /home/ubuntu/web-survey-platform/backend

# Install dependensi
npm install --production

# Buat file environment
cp .env.example .env
nano .env
```

Isi `.env` untuk production:

```env
PORT=3000
NODE_ENV=production

DB_HOST=localhost
DB_PORT=5432
DB_NAME=web_survey_platform
DB_USER=surveyapp
DB_PASSWORD=ganti_password_aman

JWT_SECRET=generate_random_string_minimal_64_karakter
SESSION_SECRET=generate_random_string_minimal_64_karakter

REDIS_URL=redis://localhost:6379

UPLOAD_DIR=uploads/photos
MAX_FILE_SIZE_MB=5

FRONTEND_URL=https://yourdomain.com
```

Generate random secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Jalankan migrasi dan seeder:
```bash
npm run migrate
npm run seed
```

### 9.6 Build Frontend

```bash
cd /home/ubuntu/web-survey-platform/frontend

# Install dependensi
npm install

# Build untuk production
npm run build
```

Hasil build ada di `frontend/dist/`.

### 9.7 Jalankan Backend dengan PM2

```bash
cd /home/ubuntu/web-survey-platform/backend

# Jalankan API server
pm2 start src/app.js --name "survey-api" -i 2

# Jalankan export worker
pm2 start src/workers/index.js --name "survey-worker"

# Simpan konfigurasi PM2 agar auto-start saat reboot
pm2 save
pm2 startup
# Ikuti instruksi yang ditampilkan (copy-paste perintah sudo)
```

Verifikasi:
```bash
pm2 status
pm2 logs survey-api --lines 20
```

### 9.8 Konfigurasi Nginx

```bash
sudo nano /etc/nginx/sites-available/survey-platform
```

Isi konfigurasi:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend (static files)
    root /home/ubuntu/web-survey-platform/frontend/dist;
    index index.html;

    # Upload file size limit
    client_max_body_size 10M;

    # API proxy
    location /auth { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /admins { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /supervisors { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /viewers { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /surveyors { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /surveys { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /responses { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /reports { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /dashboard { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /map { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /upload { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /audit-logs { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /cleanup { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /health { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /uploads/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }

    # SPA fallback — semua route lain ke index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Aktifkan site:
```bash
sudo ln -s /etc/nginx/sites-available/survey-platform /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 9.9 Setup HTTPS dengan Let's Encrypt (Opsional tapi Direkomendasikan)

Prasyarat: domain sudah mengarah ke IP EC2 (A record di DNS).

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Ikuti instruksi interaktif. Certbot akan otomatis mengubah konfigurasi Nginx untuk HTTPS dan setup auto-renewal.

Verifikasi auto-renewal:
```bash
sudo certbot renew --dry-run
```

### 9.10 Verifikasi Deployment

```bash
# Cek backend
curl http://localhost:3000/health

# Cek Nginx
curl http://yourdomain.com/health

# Cek PM2
pm2 status

# Cek logs jika ada masalah
pm2 logs survey-api --lines 50
sudo tail -f /var/log/nginx/error.log
```

Buka browser dan akses `http://yourdomain.com` (atau `https://` jika sudah setup SSL).

### 9.11 Update Aplikasi

Saat ada update kode baru:

```bash
cd /home/ubuntu/web-survey-platform

# Pull kode terbaru
git pull

# Update backend
cd backend
npm install --production
npm run migrate
pm2 restart survey-api survey-worker

# Update frontend
cd ../frontend
npm install
npm run build

# Selesai — Nginx otomatis serve file baru dari dist/
```

---

## 10. Troubleshooting

### Backend tidak bisa terhubung ke database

**Gejala:** Error `ECONNREFUSED` atau `password authentication failed`

**Solusi:**
1. Pastikan PostgreSQL berjalan: `pg_isready`
2. Periksa nilai `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` di `backend/.env`
3. Pastikan database sudah dibuat (langkah 3.1)

---

### Backend tidak bisa terhubung ke Redis

**Gejala:** Error `Redis connection refused` di log backend

**Solusi:**
1. Pastikan Redis berjalan: `redis-cli ping` (harus menjawab `PONG`)
2. Periksa nilai `REDIS_URL` di `backend/.env`
3. Jalankan Redis: `redis-server`

---

### Migrasi gagal

**Gejala:** Error saat menjalankan `npm run migrate`

**Solusi:**
1. Pastikan database sudah dibuat
2. Pastikan koneksi database di `.env` sudah benar
3. Untuk reset total dan mulai ulang:
   ```bash
   cd backend
   npm run migrate:undo   # rollback semua migrasi
   npm run migrate        # jalankan ulang migrasi
   npm run seed           # buat ulang data awal
   ```

---

### Frontend tidak bisa mengakses API

**Gejala:** Error CORS atau network error di browser

**Solusi:**
1. Pastikan backend sudah berjalan di port 3000
2. Pastikan `FRONTEND_URL=http://localhost:5173` sudah diset di `backend/.env`
3. Restart backend setelah mengubah `.env`

---

### Port sudah digunakan

**Gejala:** Error `EADDRINUSE: address already in use`

**Solusi:**

Windows:
```bash
# Cari proses yang menggunakan port 3000
netstat -ano | findstr :3000
# Hentikan proses berdasarkan PID
taskkill /PID <PID> /F
```

macOS/Linux:
```bash
# Cari dan hentikan proses di port 3000
lsof -ti:3000 | xargs kill -9
```

Atau ubah port di `backend/.env`: `PORT=3001`

---

### Test backend gagal karena database test tidak ada

**Gejala:** Error `database "web_survey_platform_test" does not exist`

**Solusi:**
```bash
psql -U postgres -c "CREATE DATABASE web_survey_platform_test;"
```
