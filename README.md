# Populi Survey Platform

Platform survei lapangan full-stack untuk Populi Center — dirancang khusus untuk pengumpulan data nasional melalui jaringan TPD (Tenaga Pengumpul Data) yang tersebar di seluruh Indonesia, dengan kemampuan offline-first penuh dan distribusi via Android APK.

---

## Fitur Utama

| Kategori | Fitur |
|---|---|
| **Pengumpulan Data** | Wizard pertanyaan, skip logic, randomisasi pilihan jawaban, 13 tipe pertanyaan |
| **Tipe Pertanyaan** | Pilihan tunggal/ganda, teks, numerik, skala rating, tanggal/waktu, foto, matrix, wilayah Indonesia berjenjang, nomor kuesioner, nomor telepon |
| **Offline-First** | Survey dapat diunduh & diisi tanpa internet; antrian sinkron otomatis saat online |
| **Field Tools** | GPS lokasi wawancara (start & submit), rekaman audio, foto kamera native (Android), tanda tangan digital |
| **Android** | APK native via Capacitor 8; kamera native + kompresi otomatis, GPS watchPosition |
| **Dashboard** | Statistik real-time (WIB), tren 7 hari, progress per survei & TPD, Top 5 TPD |
| **Analisis** | Export Excel/CSV per survei dengan filter tanggal/TPD |
| **Manajemen** | Explorer survei (filter faset + grouping tahun-bulan + toggle folder), pagination server-side |
| **Keamanan** | JWT 8 jam, rate limiting, audit log, bcrypt, Helmet, Sentry |
| **Role** | Admin · Supervisor · Viewer · Surveyor (TPD) |

---

## Stack Teknologi

### Backend
| Teknologi | Versi | Keterangan |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| Express | 4.19 | HTTP framework |
| Sequelize | 6.37 | ORM |
| PostgreSQL | 16 | Database utama |
| Redis | 7 | Cache & job queue |
| BullMQ | 5.25 | Async job queue (ekspor) |
| JWT (jsonwebtoken) | 9.0 | Autentikasi |
| bcrypt | 5.1 | Hash password |
| Multer | 1.4 | Upload file media |
| ExcelJS | 4.4 | Ekspor Excel |
| Winston | 3.13 | Logging |
| Sentry (Node) | 8.40 | Error tracking |
| Helmet | 7.1 | Security headers |
| express-rate-limit | 7.3 | Rate limiting |

### Frontend
| Teknologi | Versi | Keterangan |
|---|---|---|
| React | 18.3 | UI library |
| Vite | 5.3 | Build tool |
| Tailwind CSS | 3.4 | Styling |
| React Router | 6.24 | Client-side routing |
| Axios | 1.7 | HTTP client |
| Recharts | 2.12 | Grafik dashboard |
| React Leaflet | 4.2 | Peta sebaran GPS |
| idb | 8.0 | IndexedDB (antrian offline web) |
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
| Android SDK | 34 | Target API |

### Testing
| Teknologi | Keterangan |
|---|---|
| Jest 29 + Supertest | Unit & integrasi backend |
| Vitest 1.6 + Testing Library | Unit & integrasi frontend |
| fast-check 3.20 | Property-based testing (backend + frontend) |

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
│   │   ├── models/                # Sequelize models
│   │   ├── migrations/            # DB migrations
│   │   ├── routes/                # API route handlers
│   │   ├── middleware/            # Auth, audit log
│   │   ├── utils/                 # Helpers (statistics, time, validators)
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
| `users` | Akun admin, supervisor, viewer, TPD |
| `surveys` | Definisi survei (termasuk `type`: nasional/daerah/lainnya) |
| `questions` | Pertanyaan dengan skip logic & tipe |
| `surveyor_quotas` | Penugasan kuota + nomor kuesioner per TPD |
| `responses` | Data responden (GPS, timestamp, durasi) |
| `answers` | Jawaban per pertanyaan |
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
