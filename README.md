# Populi Survey Platform

Platform survei lapangan full-stack untuk Populi Center — dirancang khusus untuk pengumpulan data nasional melalui jaringan TPD (Tenaga Pengumpul Data) yang tersebar di seluruh Indonesia, dengan kemampuan offline-first penuh dan distribusi via Android APK.

---

## Fitur Utama

| Kategori | Fitur |
|---|---|
| **Desain Survei** | Wizard pertanyaan, **skip logic** (percabangan `jump_to`), **randomisasi pilihan jawaban**, **randomisasi urutan pertanyaan** (blok acak per responden, dengan rekap & hapus per blok), 13 tipe pertanyaan |
| **Tipe Pertanyaan** | Pilihan tunggal/ganda, teks pendek/panjang, skala numerik, skala rating, tanggal, waktu, foto, matrix, wilayah Indonesia berjenjang, nomor telepon, ID unik |
| **Offline-First** | Survey diunduh & diisi tanpa internet; antrian sinkron otomatis saat online; **checklist pra-lapangan "siap offline"** di aplikasi TPD |
| **Field Tools** | GPS lokasi wawancara (start & submit), rekaman audio (multi-klip), foto kamera native, tanda tangan digital, **undian RT** (replika Form A + grid verifikasi visual, mode offline bertiket seed) |
| **Kontrol Lapangan** | **Kunci perangkat** (1 akun TPD = 1 HP), badge durasi wawancara, kuota + nomor kuesioner per TPD, kebijakan GPS wajib (APK hard-block, web best-effort + penanda kuning) |
| **Notifikasi** | **Lonceng dashboard** (pesan admin/SPV, respons ditandai review) + **push FCM** ke HP TPD (Firebase), cermin ke tray saat aplikasi terbuka |
| **Android** | APK native via Capacitor 8; kamera + kompresi otomatis, GPS watchPosition, notifikasi lokal + FCM |
| **Dashboard** | Statistik real-time (WIB), tren 7 hari, progress per survei & TPD, Top 5 TPD, peta sebaran GPS |
| **Laporan & Analisis** | Export Excel/CSV per survei (filter tanggal/TPD), **generator laporan PPTX otomatis** (template Populi), **hasil publik** (snapshot agregat opt-in + embed iframe ke website) |
| **Integritas Data** | **Kecualikan respons dari laporan** (oversampling/fraud — kuota tetap bebas, ekspor & snapshot bersih); **hapus permanen** khusus admin |
| **Random Sampling** | Microservice Python/FastAPI (engine MFD/BPS) — 3 metode: Proporsional + bobot desain, √N + bobot, PPS Sistematik |
| **Tampilan** | Font formulir per survei (skala normal/besar/lebih besar + jenis, termasuk **Atkinson Hyperlegible** yang dibundel) |
| **Manajemen** | Explorer survei (filter faset + grouping tahun-bulan + toggle folder), pagination server-side, penugasan TPD massal |
| **Keamanan** | JWT (TPD 30 hari, dashboard 8 jam), kunci perangkat, rate limiting dua lapis, audit log, bcrypt, Helmet, Sentry |
| **Role** | Admin · Supervisor · Asisten Supervisor · Viewer / Partner Lokal · Surveyor (TPD) — dengan pewarisan hak akses |

---

## Stack Teknologi

### Backend
| Teknologi | Versi | Keterangan |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| Express | 4.22 | HTTP framework |
| Sequelize | 6.37 | ORM |
| PostgreSQL | 16 | Database utama |
| Redis | 7 | Cache & job queue |
| BullMQ | 5.25 | Async job queue (ekspor) |
| JWT (jsonwebtoken) | 9.0 | Autentikasi |
| bcrypt | 5.1 | Hash password |
| Multer | 2.2 | Upload file media |
| MinIO | 8.0 | Klien object storage media (S3-compatible) |
| ExcelJS | 4.4 | Ekspor Excel |
| pptxgenjs | 4.0 | Generator laporan PPTX |
| firebase-admin | 14.2 | Push notification FCM ke HP TPD |
| archiver | 7.0 | Zip paket ekspor media |
| Winston | 3.13 | Logging |
| Sentry (Node) | 8.40 | Error tracking |
| Helmet | 7.1 | Security headers |
| express-rate-limit | 7.3 | Rate limiting (dua lapis) |

### Frontend
| Teknologi | Versi | Keterangan |
|---|---|---|
| React | 18.3 | UI library |
| Vite | 5.3 | Build tool |
| Tailwind CSS | 3.4 | Styling |
| React Router | 6.30 | Client-side routing |
| Axios | 1.8 | HTTP client |
| Recharts | 2.12 | Grafik dashboard |
| React Leaflet | 4.2 | Peta sebaran GPS |
| idb | 8.0 | IndexedDB (antrian offline web) |
| @fontsource/atkinson-hyperlegible | 5.3 | Font mudah dibaca (dibundel, tanpa CDN) |
| Sentry (React) | 8.40 | Error tracking frontend |
| vite-plugin-pwa | 0.20 | PWA & Service Worker |

### Mobile (Android)
| Teknologi | Versi | Keterangan |
|---|---|---|
| Capacitor | 8.3 | Native shell Android |
| @capacitor/android | 8.3 | Android bridge |
| @capacitor/camera | 8.2 | Kamera native + kompresi |
| @capacitor/geolocation | 8.2 | GPS native + watchPosition |
| @capacitor/network | 8.0 | Status jaringan native |
| @capacitor/filesystem | 8.1 | Penyimpanan file native |
| @capacitor-community/sqlite | 8.1 | SQLite (antrian offline Android) |
| @capacitor/push-notifications | 8.1 | Terima push FCM |
| @capacitor/local-notifications | 8.2 | Notifikasi lokal (cermin ke tray saat app terbuka) |
| Android SDK | 34 | Target API |
| @capacitor/ios | 8.4 | Scaffolding iOS (dalam persiapan) |

### Random Sampling (microservice)
| Teknologi | Keterangan |
|---|---|
| Python 3 + FastAPI | Engine metodologi sampling wilayah (MFD/BPS) sebagai API HTTP JSON |
| uvicorn | ASGI server |
| pandas / numpy | Alokasi proporsional + largest-remainder + PPS sistematik |
| openpyxl / xlsxwriter | Baca MFD & tulis output Excel |

> Layanan ini **tanpa auth & tanpa port ke host** — hanya diakses backend Node (JWT + role admin/supervisor) lewat jaringan internal Docker (`sampling:8000`). Lihat [sampling-service/README.md](sampling-service/README.md).

### Testing
| Teknologi | Keterangan |
|---|---|
| Jest 29 + Supertest | Unit & integrasi backend |
| Vitest 4.1 + Testing Library | Unit & integrasi frontend |
| fast-check 3.20 | Property-based testing (backend + frontend) |
| Python unittest | Metode sampling (`sampling-service/tests`) |

### Infrastruktur
| Teknologi | Keterangan |
|---|---|
| Docker + Docker Compose | Kontainerisasi semua layanan |
| nginx (alpine) | Reverse proxy + serve frontend (multi-stage build) |
| VPS Hostinger KVM 2 | 2 vCPU / 8 GB RAM / 100 GB NVMe |
| Node cluster (2 worker) | Memanfaatkan kedua vCPU di produksi |

---

## Struktur Proyek

```
.
├── backend/
│   ├── src/
│   │   ├── app.js                 # Express app (cluster multi-worker)
│   │   ├── config/
│   │   │   ├── database.js        # Sequelize config + pool
│   │   │   ├── redis.js           # Redis client
│   │   │   └── queue.js           # BullMQ queue
│   │   ├── models/                # Sequelize models (Survey, Response, RtSelection, TpdNotification, FcmToken, PublishedResult, MonitoringReport, …)
│   │   ├── migrations/            # DB migrations
│   │   ├── routes/                # API route handlers (surveys, responses, rt-selection, notifications, reports, published, sampling proxy)
│   │   ├── middleware/            # Auth, audit log
│   │   ├── utils/                 # Helpers (statistics, validators, aggregateResults, buildReportPptx, deviceLock, offlineReadiness)
│   │   └── workers/               # BullMQ export worker
│   ├── tests/
│   │   ├── unit/                  # Unit tests (mocked)
│   │   ├── integration/           # E2E tests
│   │   └── properties/            # Property-based tests
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── pages/                 # Halaman admin (Dashboard, Surveys, Responses, …)
│   │   ├── components/            # Komponen shared
│   │   ├── services/api.js        # Axios client
│   │   ├── surveyor/
│   │   │   ├── pages/             # Antarmuka TPD (SurveyList, SurveyForm)
│   │   │   ├── components/        # AudioRecorder, PhotoCapture, SignaturePad
│   │   │   └── hooks/             # useGeolocation, useSyncManager, …
│   │   └── utils/
│   │       ├── storage.js         # Abstraksi offline (IndexedDB/SQLite)
│   │       ├── offlineDB.js       # IndexedDB (web)
│   │       ├── sqliteDB.js        # SQLite via Capacitor (Android)
│   │       └── capacitorBridge.js # Wrapper plugin native
│   ├── android/                   # Project Android Studio (Capacitor)
│   ├── mockups/                   # Preview HTML desain
│   ├── vite.config.js
│   └── capacitor.config.ts
│
├── sampling-service/              # Microservice Random Sampling (Python/FastAPI)
│   ├── main.py                    # Endpoint HTTP (/inspect, /preview, /run, /template)
│   ├── sampling_engine.py         # Engine metodologi (di-vendor dari MFD/BPS)
│   └── tests/                     # Tes metode sampling
│
├── docs/                          # Dokumentasi (play-store, legal, ops, embed WordPress, iOS)
├── nginx.conf                     # Nginx reverse proxy
├── docker-compose.yml
├── ARCHITECTURE.md                # Arsitektur lengkap
├── DEPLOY.md                      # Panduan deploy + update
├── MANUAL.md                      # Manual pengguna
└── ROADMAP.md                     # Rencana fitur
```

---

## Quick Start (Development)

### Prasyarat
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (opsional, untuk jalankan semua sekaligus)

### Dengan Docker (disarankan)
```bash
cp .env.docker .env
docker compose up -d
# Backend: http://localhost:3000
# Frontend: http://localhost:80
```

### Manual

**Backend**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env — isi DB_PASSWORD, JWT_SECRET, SESSION_SECRET
npm run migrate
npm run seed
npm start          # produksi
# atau
npm run dev        # development (nodemon)
```

**Frontend**
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

**Build Android APK**
```bash
cd frontend
npm run cap:build        # vite build + cap sync android
npx cap open android     # buka di Android Studio → Build → Generate Signed APK
```

---

## Akun Default Setelah Seed
| Field | Value |
|---|---|
| Email | `admin@populicenter.com` |
| Password | `Admin123!` |
> **Ganti password segera setelah login pertama.**

---

## Skema Database

| Tabel | Keterangan |
|---|---|
| `users` | Akun admin, supervisor, asisten supervisor, viewer/partner lokal, TPD (+ `device_id` kunci perangkat) |
| `surveys` | Definisi survei (`type`, `field_tools_settings`, `randomize_order`, target wilayah, konfigurasi laporan, font formulir) |
| `questions` | Pertanyaan dengan skip logic & tipe |
| `surveyor_quotas` | Penugasan kuota + nomor kuesioner per TPD |
| `responses` | Data responden (GPS, timestamp, durasi, `excluded` untuk pengecualian laporan) |
| `answers` | Jawaban per pertanyaan |
| `rt_selections` | Hasil undian RT (replika Form A, deterministik per seed) |
| `rt_seed_tickets` | Tiket seed undian RT mode offline |
| `tpd_notifications` | Lonceng pemberitahuan per TPD (pesan admin/SPV, review) |
| `fcm_tokens` | Token perangkat FCM untuk push notification |
| `published_results` | Snapshot hasil agregat yang ditayangkan publik (embed) |
| `monitoring_reports` | Laporan PPTX termonitor per survei |
| `survey_statistics` | Statistik pra-hitung (WIB) per survei |
| `surveyor_statistics` | Statistik pra-hitung per TPD per survei |
| `audit_logs` | Log aktivitas admin |
| `export_jobs` | Status job ekspor async |

---

## Testing

```bash
# Backend — unit + property-based
cd backend && npm test

# Frontend — unit + property-based
cd frontend && npm test

# Frontend — satu file
cd frontend && npx vitest run src/pages/__tests__/Surveys.test.jsx
```

---

## Deploy ke VPS

Lihat [DEPLOY.md](DEPLOY.md) untuk panduan lengkap, termasuk:
- Urutan update aman: `git pull → build → migrate → restart`
- Troubleshooting error 500 pertanyaan wilayah (migrasi CHECK constraint)
- Setup SSL dengan Certbot

---

## Lisensi

Proprietary — © 2026 Populi Center. Seluruh hak cipta dilindungi.
