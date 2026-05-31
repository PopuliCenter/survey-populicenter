# Arsitektur — Populi Survey Platform

Dokumen ini menjelaskan arsitektur teknis lengkap platform, mulai dari komponen infrastruktur, alur data, pola desain, hingga keputusan teknologi yang diambil.

---

## 1. Gambaran Umum

```
┌────────────────────────────────────────────────────────────┐
│                    Browser / Android APK                   │
│                                                            │
│  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │   Admin / Supervisor │  │    TPD (Surveyor)        │   │
│  │   Dashboard (React)  │  │    SurveyList / Form     │   │
│  └──────────┬───────────┘  └────────────┬─────────────┘   │
│             │ HTTPS / JSON REST          │ HTTPS + offline │
└─────────────┼──────────────────────────┼─────────────────┘
              │                          │
┌─────────────▼──────────────────────────▼─────────────────┐
│                        nginx (alpine)                      │
│   - Serve React SPA (dist/)                               │
│   - Reverse proxy → backend:3000                          │
│   - Cache: sw.js & index.html no-cache, assets 30d        │
│   - Upload media: proxy_timeout 120s                      │
└──────────────────────┬────────────────────────────────────┘
                       │ proxy_pass
┌──────────────────────▼────────────────────────────────────┐
│              Node.js / Express Backend                     │
│            (Cluster 2 worker di produksi)                  │
│                                                            │
│   ┌──────────┐  ┌──────────┐  ┌────────────────────────┐  │
│   │  Routes  │  │  Models  │  │  Utils / Middleware    │  │
│   │ auth     │  │ Sequelize│  │  JWT · bcrypt · Helmet │  │
│   │ surveys  │  │ ORM      │  │  rate-limit · Sentry   │  │
│   │ responses│  │          │  │  auditLog · statistics │  │
│   │ upload   │  └────┬─────┘  └────────────────────────┘  │
│   │ dashboard│       │                                     │
│   │ analytics│  ┌────▼─────┐  ┌──────────────────────┐   │
│   └──────────┘  │Sequelize │  │  BullMQ Worker       │   │
│                 │ Pool 15  │  │  (ekspor async)       │   │
│                 └────┬─────┘  └──────────┬───────────┘   │
└──────────────────────┼────────────────────┼───────────────┘
                       │                    │
              ┌────────▼────────┐   ┌───────▼──────┐
              │  PostgreSQL 16  │   │   Redis 7    │
              │  (pgdata volume)│   │  Queue + Cache│
              └─────────────────┘   └──────────────┘
```

---

## 2. Komponen Utama

### 2.1 nginx (Reverse Proxy + Frontend Server)

- **Image**: `nginx:alpine` (multi-stage build dari `node:20-alpine`)
- **Tugas**: Serve React SPA, meneruskan `/auth`, `/surveys`, `/responses`, dll. ke backend.
- **Caching**:
  - `sw.js` & `index.html` → `no-cache, no-store` (wajib agar update UI terdeteksi pada refresh biasa).
  - Aset ber-hash (`assets/*.js/css`) → `Cache-Control: public, immutable, max-age=30d`.
- **Timeout upload media**: `proxy_send_timeout 120s`, `proxy_read_timeout 120s` — untuk rekaman audio/foto di koneksi lapangan lambat.
- **Body size**: `client_max_body_size 10M`.

### 2.2 Backend — Node.js + Express

**Cluster multi-worker (produksi)**
- `cluster.fork()` sejumlah `min(cpu, 2)` di produksi (KVM 2 vCPU → 2 worker).
- Worker yang mati auto-restart. Dev/test tetap single-process.
- Dapat diatur via `WEB_CONCURRENCY`.

**Connection Pool**
- Sequelize pool: `max: 15, min: 2` per worker → total 30 koneksi ke Postgres (aman di bawah default `max_connections = 100`).

**Statistik pra-hitung**
- Tabel `survey_statistics` & `surveyor_statistics` di-increment atomik via SQL `UPSERT` setiap submit.
- Semua perhitungan "hari ini" menggunakan **zona waktu WIB (Asia/Jakarta)**, bukan UTC.
- Setelah cleanup (hapus respons), statistik di-reconcile (`recomputeSurveyStats`) langsung dari data nyata (idempoten, menyembuhkan drift).

**Job Queue (BullMQ + Redis)**
- Ekspor Excel/CSV besar (>1000 responden) diproses async oleh worker terpisah.
- Worker berjalan dalam container `worker` yang sama kodenya dengan `backend` (CMD berbeda).

### 2.3 PostgreSQL 16

Tabel utama dan hubungannya:

```
users ──────────────────────────────────────────────┐
  │                                                  │
  ├─< surveys (created_by)                           │
  │     │  type: nasional|daerah|lainnya             │
  │     │  population_size (opsional, untuk MoE)     │
  │     │                                            │
  │     ├─< questions (skip_logic JSONB)             │
  │     ├─< surveyor_quotas ──────────────────> users│
  │     │     assigned_numbers JSONB                 │
  │     │                                            │
  │     ├─< responses ──────────────────────── users │
  │     │     questionnaire_number                   │
  │     │     latitude, longitude, geo_status        │
  │     │     start_latitude, start_longitude        │
  │     │     audio_path, photo_paths, signature_path│
  │     │     review_status, reviewed_by             │
  │     │                                            │
  │     │     └─< answers                            │
  │     │           answer_value (TEXT)              │
  │     │           answer_json  (JSONB)             │
  │     │           photo_path   (STRING)            │
  │     │                                            │
  │     ├── survey_statistics   (pra-hitung WIB)     │
  │     └── surveyor_statistics (pra-hitung per TPD) │
  │                                                  │
  ├─< audit_logs                                     │
  └─< export_jobs                                    │
```

**Indeks penting**:
- `responses(survey_id, created_at)` — untuk dashboard & laporan.
- `responses(surveyor_id, survey_id)` — untuk kuota & progress.
- `answers(response_id)` — untuk GET detail respons.
- `survey_statistics(survey_id)` — untuk dashboard stats.

### 2.4 Redis 7

- **Job queue**: BullMQ untuk ekspor async.
- **Cache (opsional)**: siap untuk caching hasil analitik (TTL pendek 5–10 mnt).

### 2.5 Frontend — React SPA

**Dua antarmuka dalam satu SPA**:

```
/login          → Login (login 2 peran)
/dashboard      → Admin/Supervisor (Layout + sidebar gelap)
/surveys        → Manajemen survei (explorer + folder-toggle)
/responses      → Data responden (pagination server-side)
/reports        → Ekspor
/map            → Peta sebaran GPS
/audit-log      → Log aktivitas
...

/surveyor       → SurveyList (TPD)
/surveyor/survey/:id  → SurveyForm (wizard pertanyaan)
```

**Role-based rendering**: `Layout.jsx` menyesuaikan item sidebar berdasarkan role JWT.

**Routing perlindungan**: `ProtectedRoute` cek token & role sebelum render halaman.

### 2.6 Android APK — Capacitor 8

**Alur build**:
```
npm run cap:build
  → vite build        (menghasilkan dist/)
  → npx cap sync      (salin dist/ ke android/app/src/main/assets/public/)

Android Studio
  → Build → Generate Signed APK
  → app-release.apk
```

**Akses native** (hanya aktif di platform native, fallback ke Web API di browser):
- **Kamera**: `@capacitor/camera` — buka kamera langsung, kompresi quality 80, maks 1280px saat capture.
- **GPS**: `@capacitor/geolocation` — `requestPermissions()` + `watchPosition()` sejak form dibuka (mendapat fix satelit selama wawancara berlangsung, hemat baterai).
- **Network**: `@capacitor/network` — status koneksi andal (tidak bergantung `navigator.onLine` yang unreliable di WebView).
- **SQLite**: `@capacitor-community/sqlite` — penyimpanan antrian offline di Android (lebih stabil dari IndexedDB di WebView).

**Security produksi**:
- `webContentsDebuggingEnabled` → `false` (otomatis di build release).
- `allowMixedContent` → `false` (build release).
- `network_security_config.xml` → cleartext diblokir secara default, hanya diizinkan ke IP lokal (dev).
- `READ/WRITE_EXTERNAL_STORAGE` dihapus (usang di Android 13+).

---

## 3. Alur Data Kritis

### 3.1 Submit Respons Online

```
TPD (Android/Browser)
  │
  ├── POST /responses/start          → session_token (JWT pendek)
  │     [catat start_time, simpan PENDING]
  │
  ├── (isi pertanyaan di wizard)
  │
  ├── POST /upload/photo|audio|sig   → path file media
  │     [multer → disk /uploads/]
  │
  └── POST /responses/submit
        [transaksi Postgres]:
          - validasi kuota (re-check inside tx)
          - generate questionnaire_number (sequence)
          - update PENDING → committed
          - bulkCreate answers
        [fire-and-forget]:
          - incrementResponseStats() → UPSERT atomik
```

### 3.2 Submit Respons Offline → Sinkron

```
TPD (Android — tidak ada internet)
  │
  ├── SurveyForm.submit()
  │     [navigator.onLine false]
  │     → enqueueResponse() → SQLite (Android) / IndexedDB (web)
  │     → saveMediaFile() → blob disimpan lokal
  │     → navigate ke SubmitSuccess (offline: true)
  │
  └── useSyncManager (background)
        [setiap event 'online' / saat mount]
        ├── getQueueByStatus('pending')
        ├── for entry of pending:
        │     ├── POST /upload/audio|photo|sig (timeout 120s)
        │     ├── POST /responses/start
        │     └── POST /responses/submit
        │           [sukses] updateQueueStatus → 'synced'
        │           [server error] updateQueueStatus → 'failed'
        │           [network error] break (retry berikutnya)
        └── clearSyncedQueue()
```

### 3.3 GPS Wajib — Penanganan Offline

```
SurveyForm mount
  │
  ├── watchLocation() [Capacitor Geolocation native, timeout 25s]
  │     [fix valid pertama] → setStartGeo({status:'available', lat, lng, accuracy})
  │     [watchPosition dihentikan setelah fix pertama — hemat baterai]
  │
  ├── (TPD mengisi pertanyaan — GPS punya waktu mengunci satelit)
  │
  └── handleSubmit()
        IF gps_mode === 'required' AND startGeo.status !== 'available'
          → blokir submit + tampilkan pesan + scroll ke GpsStatusPanel
          → tombol "Coba Ambil Lokasi" (one-shot getLocation())
        ELSE
          → lanjutkan submit
```

---

## 4. Offline Storage — Dua Backend

Abstraksi `storage.js` memilih backend secara otomatis:

```
isNativePlatform()
  true  → SQLite via @capacitor-community/sqlite
  false → IndexedDB via idb

API identik:
  enqueueResponse(payload)  → localId
  getQueueByStatus(status)  → entry[]
  updateQueueStatus(id, status, errorMsg)
  saveMediaFile({ localId, type, blob, filename })
  getMediaFilesByLocalId(localId) → file[]
  cacheSurvey(surveyData)
  getCachedSurvey(surveyId) → surveyData | null
```

**Mengapa dua backend?**
IndexedDB di Android WebView terkadang tidak persisten lintas sesi (tergantung versi Chrome/WebView). SQLite via plugin native lebih andal untuk data penting seperti antrian responden.

---

## 5. Pola Desain & Keputusan Teknis

### 5.1 Statistik Pra-hitung (CQRS-lite)

Dashboard membaca dari `survey_statistics` / `surveyor_statistics` (cepat, O(1)), bukan `COUNT(*)` pada tabel `responses` (lambat jika jutaan baris). Trade-off: statistik bisa sedikit di belakang data nyata → diatasi dengan:
- UPSERT atomik di setiap submit (race-safe).
- `recomputeSurveyStats()` setelah cleanup — reconcile dari data nyata (idempoten).

### 5.2 Pagination Server-side (Responses)

`GET /responses` mendukung `page`/`page_size` (default 25, maks 200) + `X-Total-Count` di header. Body tetap array (kompatibel mundur). Filter geo_status dipindahkan ke server agar total & halaman akurat.

### 5.3 Tipe Pertanyaan — Validasi Berlapis

1. **Frontend**: validasi via `validateAnswer()` sebelum next-step wizard.
2. **Backend**: `validateRequiredQuestions()` + `validateAllAnswers()` saat submit.
3. **Database**: CHECK constraint `questions_type_check` memastikan hanya tipe valid yang tersimpan.

> ⚠️ Saat menambah tipe baru, jalankan migrasi yang memperbarui CHECK constraint, lalu `docker compose run --rm backend npm run migrate`.

### 5.4 Nomor Kuesioner — PostgreSQL Sequence

Format: `{PREFIX}-{YYYYMMDD}-{UNIQUE_ID | SEQUENCE:04d}`

Sequence dibuat per survei saat aktivasi:
```sql
CREATE SEQUENCE questionnaire_seq_{survey_id_underscored} START 1
```
Atomic via transaksi — tidak ada nomor kembar meski multi-worker.

### 5.5 Audio Recording — Kompresi di Sumbernya

`MediaRecorder` dikonfigurasi dengan `audioBitsPerSecond: 32000` + mono + noiseSuppression. Hasil: ~1 MB / 5 menit (turun ~75–80% dari default). Upload timeout 120s untuk koneksi lapangan lambat.

---

## 6. Keamanan

| Lapisan | Mekanisme |
|---|---|
| Autentikasi | JWT 8 jam, verifikasi di setiap request |
| Password | bcrypt (cost factor default) |
| Rate limiting | express-rate-limit + rate-limit-redis; 5 gagal/15 menit per IP diblokir |
| HTTP headers | Helmet (HSTS, CSP, X-Frame-Options, dll.) |
| CORS | Diizinkan semua origin (web + Capacitor native) |
| Upload | Multer validasi MIME + batas ukuran (foto 5MB, audio 50MB, tanda tangan 2MB) |
| Audit log | Setiap aksi admin tercatat (CREATE/UPDATE/DELETE survei, TPD, respons) |
| Android | Cleartext HTTP diblokir default (produksi); debugging WebView mati di build release |
| Error tracking | Sentry Node + Sentry React (sanitasi header Authorization sebelum kirim) |

---

## 7. Konfigurasi Lingkungan

### Variabel Backend (`.env`)

```env
PORT=3000
NODE_ENV=production
DB_HOST=postgres
DB_PORT=5432
DB_NAME=web_survey_platform
DB_USER=surveyapp
DB_PASSWORD=<kuat>
DB_POOL_MAX=15           # koneksi per worker (opsional, default 15)
WEB_CONCURRENCY=2        # jumlah worker cluster (opsional, default min(cpu,2))
JWT_SECRET=<64 byte hex>
SESSION_SECRET=<64 byte hex>
REDIS_URL=redis://redis:6379
FRONTEND_URL=https://risetcenter.com
UPLOAD_DIR=uploads/photos
MAX_FILE_SIZE_MB=5
SENTRY_DSN=              # opsional
```

### Variabel Frontend Build

```env
VITE_API_URL=            # kosong = relative URL (web); diisi = Android APK
VITE_SENTRY_DSN=         # opsional
```

### Android — URL Server

Diatur di `frontend/src/services/api.js`:
```js
const PRODUCTION_SERVER = 'https://risetcenter.com';
```
Atau via `VITE_API_URL` di `.env.production` sebelum `npm run cap:build`.

---

## 8. Alur Deploy

```
Lokal:
  git commit → git push origin main

VPS:
  cd /opt/survey-populicenter
  git pull
  docker compose build             # rebuild backend + frontend image
  docker compose run --rm backend npm run migrate   # WAJIB jika ada migrasi baru
  docker compose up -d
```

Untuk update nginx saja (tanpa build ulang backend):
```bash
docker compose up -d nginx
```

Lihat [DEPLOY.md](DEPLOY.md) untuk panduan lengkap dan troubleshooting.

---

## 9. Skalabilitas & Batasan

| Skenario | Kapasitas (KVM 2) |
|---|---|
| TPD aktif bersamaan | ~150 TPD (sinkron tersebar, offline-first) |
| Responden per survei | ~1.500 (tipikal survei nasional) |
| Storage media / survei | ~2.5–4 GB (audio 32kbps + foto terkompres) |
| Survei nasional sebelum storage penuh | ~25–40 survei |

**Bottleneck saat ini**: Single-node Postgres. Untuk skala lebih besar (>500 TPD atau multi-survei besar bersamaan), pertimbangkan:
- Read replica Postgres untuk dashboard & laporan.
- Object storage (R2/S3) untuk media (arsip survei lama).
- Horizontal scaling backend (load balancer + sticky session JWT atau stateless).

---

## 10. Roadmap Teknis

| Prioritas | Fitur | Status |
|---|---|---|
| P1 | Pagination server-side Responses + search | ✅ Selesai |
| P2 | Field tipe survei + explorer faset + folder-toggle | ✅ Selesai |
| P3 | Modul analisis statistik (deskriptif + MoE/CI + cross-tab) | 📝 Desain selesai |
| P4 | Export hasil analisis (Excel/PDF) | 🔜 Rencana |
| P5 | Object storage media (R2/S3) | 🔜 Rencana |
