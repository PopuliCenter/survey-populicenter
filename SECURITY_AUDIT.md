# Audit Pra-Produksi — Populi Survey Platform

Tanggal: 2026-05-30 · Lingkup: Keamanan, Skalabilitas, Arsitektur, Framework
Status: **BELUM SIAP produksi terbuka** sampai item 🔴 CRITICAL diperbaiki.

Ringkasan: 4 CRITICAL, 5 HIGH, 6 MEDIUM, beberapa catatan skalabilitas. Banyak fondasi sudah baik (lihat §5).

---

## 1. 🔴 CRITICAL — Wajib diperbaiki sebelum deploy ke klien

### C1. Secret default ter-hardcode di `docker-compose.yml`
**Bukti:** [docker-compose.yml:46-48](docker-compose.yml)
```yaml
DB_PASSWORD: ${DB_PASSWORD:}
JWT_SECRET: ${JWT_SECRET:}
SESSION_SECRET: ${SESSION_SECRET:}
```
**Dampak:** Nilai default ini **ada di repo publik/klien**. Jika deploy tanpa meng-override `.env`, siapa pun yang melihat repo dapat **memalsukan JWT admin** (akses penuh) dan tahu password DB. Ini kebocoran kredensial produksi.
**Perbaikan:**
- Hapus nilai default — buat env **wajib** ada (gunakan `${JWT_SECRET:?JWT_SECRET wajib di-set}` agar compose gagal bila kosong).
- **Rotate** semua secret ini sekarang (anggap sudah bocor). Generate baru: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.

### C2. Fallback `JWT_SECRET` yang diketahui publik di kode
**Bukti:** [auth.js:4](backend/src/middleware/auth.js#L4) & [routes/auth.js:11](backend/src/routes/auth.js#L11)
```js
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
```
**Dampak:** Jika `JWT_SECRET` tak ter-set saat runtime, server memakai secret yang diketahui umum → **pemalsuan token admin**.
**Perbaikan:** Hilangkan fallback. Saat boot, jika `process.env.JWT_SECRET` kosong → **throw & matikan proses** (fail-fast), jangan jalan dengan secret default.

### C3. Rate limiting login TIDAK terpasang
**Bukti:** Paket `express-rate-limit` & `rate-limit-redis` ada di `package.json`, tetapi **tidak ada satu pun pemakaian** di `backend/src` (hasil grep kosong). Requirement 1.6 (blokir 5 gagal/15 menit) **tidak terpenuhi**.
**Dampak:** Endpoint `/auth/login` terbuka terhadap **brute-force / credential stuffing**.
**Perbaikan:** Pasang `express-rate-limit` (store Redis) pada `/auth/login` (mis. 5–10 percobaan/15 menit per IP) + limiter global yang lebih longgar pada seluruh API.

### C4. File media responden (`/uploads`) dapat diakses publik tanpa autentikasi
**Bukti:** [app.js:68](backend/src/app.js#L68) `app.use('/uploads', express.static(...))` + [nginx.conf:147](nginx.conf) `location ^~ /uploads/ { alias ...; }` — keduanya **tanpa auth**.
**Dampak:** **Foto wajah responden, tanda tangan, dan rekaman audio = data pribadi (PII)** dapat diunduh siapa pun yang menebak/menemukan URL. Risiko privasi & kepatuhan serius untuk lembaga survei.
**Perbaikan (pilih sesuai kebutuhan):**
- Sajikan media lewat endpoint ber-auth (cek JWT + role) yang membaca file dari disk, **bukan** static publik; atau
- Gunakan signed URL berdurasi pendek; atau minimal
- Pindahkan ke object storage privat (R2/S3) dengan signed URL.

---

## 2. 🟠 HIGH

### H1. Kerentanan dependensi (npm audit)
- **Backend:** 19 kerentanan (8 high). Terutama `uuid` (bounds check) via `bullmq`, `exceljs`, dan langsung.
- **Frontend:** 14 kerentanan (7 high, 1 critical).
  - 🔴 **axios** (1.7.2) — SSRF & kebocoran kredensial via absolute URL, DoS. → bump ke ≥1.8.x (runtime, relevan).
  - 🔴 **react-router** — XSS via open redirect. → `react-router-dom@6.30.4`.
  - **vitest** (critical) — RCE, tetapi **dev-only** (tidak ikut ke build produksi) — tetap update.
  - babel/serialize-javascript/fast-uri — build/dev-time, dampak produksi rendah.
**Perbaikan:** `npm audit fix` (backend & frontend), lalu bump manual `axios` & `react-router-dom`, jalankan ulang test. Tetapkan proses audit rutin sebelum tiap rilis.

### H2. HTTPS belum terlihat di konfigurasi
**Bukti:** [nginx.conf:7](nginx.conf) hanya `listen 80;` — tidak ada blok `443`/`ssl_`.
**Dampak:** Jika TLS tidak diterminasi di lapis lain (Cloudflare/Certbot), **JWT & data responden lewat HTTP polos** → bisa disadap.
**Perbaikan:** Konfirmasi terminasi TLS. Jika via Cloudflare, set SSL mode **Full (strict)** + pastikan origin pakai sertifikat (ada `scripts/init-ssl.sh`). Tambah redirect 80→443 + header HSTS.

### H3. Versi `typescript` tidak valid
**Bukti:** [frontend/package.json](frontend/package.json) `"typescript": "^6.0.3"` — TypeScript 6.0.3 **belum pernah dirilis** (terbaru seri 5.x).
**Dampak:** Berisiko gagal `npm install` bersih / lock ke versi tak terduga di environment baru (mis. CI/VPS).
**Perbaikan:** Ganti ke versi nyata, mis. `"typescript": "^5.6.0"` (atau hapus jika tak dipakai — proyek ini JS, bukan TS).

### H4. Akun admin default + password lemah
**Bukti:** Seed `admin@populicenter.com` / `Admin123!`.
**Dampak:** Jika seed dijalankan di produksi dan tidak segera diganti, akun admin mudah ditebak.
**Perbaikan:** Paksa ganti password saat login pertama, atau jangan seed admin di produksi (buat manual via env saat provisioning). Dokumentasikan di runbook deploy.

### H5. CORS mengizinkan semua origin
**Bukti:** [app.js:44-50](backend/src/app.js) `cors({ origin: true, credentials: true })`.
**Dampak:** Karena auth berbasis token (header `Authorization`, bukan cookie), risiko CSRF rendah, tapi allow-all melemahkan defense-in-depth & membuka penyalahgunaan API lintas situs.
**Perbaikan:** Batasi origin ke daftar domain yang dikenal (web admin + skema Capacitor) via env `FRONTEND_URL`/allowlist. Pertahankan `*` hanya untuk skema native bila perlu.

---

## 3. 🟡 MEDIUM

| # | Isu | Lokasi | Perbaikan |
|---|-----|--------|-----------|
| M1 | Penyimpanan media di disk lokal (tanpa backup/lifecycle) | volume `uploads` | Object storage (R2/S3) + kebijakan retensi/arsip survei lama |
| M2 | PostgreSQL & Redis single-node, tanpa strategi backup tercantum | docker-compose | Backup `pg_dump` terjadwal + uji restore; pertimbangkan managed DB |
| M3 | `morgan('combined')` mencatat semua request | [app.js:64](backend/src/app.js) | Pastikan tidak mencatat body sensitif; rotasi log; jangan log query token |
| M4 | SQL string-interpolation untuk sequence kuesioner | [responses.js](backend/src/routes/responses.js) `questionnaire_seq_${id}` | Risiko rendah (UUID tervalidasi), tapi dokumentasikan & pertahankan validasi UUID ketat |
| M5 | Dashboard N+1: frontend fetch progress per survei aktif | [Dashboard.jsx](frontend/src/pages/Dashboard.jsx) | Endpoint agregat tunggal bila survei aktif banyak |
| M6 | `multer@1.4.5-lts.1` (seri lama) | backend | Pantau; pertimbangkan migrasi multer 2.x saat stabil |

---

## 4. ⚙️ Skalabilitas & Arsitektur (penilaian)

**Sudah baik (hasil hardening sebelumnya):**
- ✅ Cluster multi-worker (2 vCPU terpakai), auto-restart worker.
- ✅ Connection pool DB (15/worker), aman di bawah `max_connections`.
- ✅ Statistik pra-hitung atomik (UPSERT) + reconcile setelah cleanup.
- ✅ Pagination server-side Responses; offline-first dengan antrian sinkron.
- ✅ Timeout unggah nginx 120s untuk koneksi lapangan.

**Untuk skala lebih besar (>500 TPD / multi-survei besar):**
- Media → object storage (hilangkan ketergantungan disk lokal, aktifkan CDN).
- Postgres read-replica untuk dashboard/laporan berat.
- Caching hasil analitik di Redis (sudah ada Redis).
- Backend stateless (JWT) → mudah horizontal scaling di belakang load balancer.

**Kapasitas saat ini (KVM 2) memadai** untuk 1 survei nasional (~150 TPD, ~1.500 responden) — lihat ARCHITECTURE.md §9.

---

## 5. ✅ Yang sudah benar (tidak perlu tindakan)

- React meng-escape output secara default; **tidak ada `dangerouslySetInnerHTML`** (tidak ada sink XSS jelas).
- Helmet aktif (security headers).
- Query Sequelize ter-parameterisasi; raw query pakai `replacements` (anti SQL injection).
- Kebijakan password kuat (min 8, huruf besar/kecil, angka) + bcrypt.
- Audit log untuk aksi admin/supervisor.
- Sentry menyanitasi header `Authorization`/`Cookie` sebelum kirim.
- Error handler global tidak membocorkan stack trace ke klien.
- Validasi field tools & tipe pertanyaan berlapis (frontend + backend + DB CHECK).
- Android: cleartext diblokir di rilis, debugging WebView mati di rilis.

---

## 6. Rencana Tindakan (urutan disarankan)

**Sebelum buka ke klien (blocker):**
1. C1 — env wajib + rotate secret (compose `:?`).
2. C2 — fail-fast tanpa fallback JWT_SECRET.
3. C3 — pasang rate limiter login (Redis store).
4. C4 — lindungi `/uploads` (endpoint ber-auth / signed URL).
5. H2 — pastikan HTTPS + HSTS + redirect 80→443.

**Sprint berikutnya:**
6. H1 — `npm audit fix` + bump axios & react-router; test ulang.
7. H3 — perbaiki versi TypeScript.
8. H4/H5 — paksa ganti admin password; batasi CORS.

**Backlog:**
9. M1/M2 — object storage media + backup DB terjadwal.
10. M3–M6.

---

> Catatan: Item C1–C4 dapat saya implementasikan sebagai satu paket perbaikan keamanan bila disetujui. Beberapa (rate limit, proteksi /uploads) menyentuh backend & memerlukan redeploy + uji.
