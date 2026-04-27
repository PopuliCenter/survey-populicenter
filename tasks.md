# Implementation Plan: Web Survey Platform

## Overview

Implementasi platform survei berbasis web full-stack menggunakan Node.js + Express (backend), React + Vite + Tailwind CSS (frontend), PostgreSQL + Sequelize (database), dan fast-check (property-based testing). Setiap task dibangun secara inkremental, dimulai dari fondasi database dan autentikasi, kemudian fitur inti, hingga integrasi penuh.

## Tasks

- [x] 1. Setup proyek dan struktur database
  - Inisialisasi proyek Node.js backend dengan Express, Sequelize, dan dependensi inti (jsonwebtoken, bcrypt, bull, redis, exceljs, csv-stringify, fast-check, jest)
  - Inisialisasi proyek React frontend (Vite + Tailwind CSS) untuk Admin Dashboard dan Surveyor Interface
  - Buat file migrasi Sequelize untuk semua tabel: `users`, `surveys`, `questions`, `surveyor_quotas`, `responses`, `answers`, `audit_logs`, `export_jobs`
  - Implementasikan constraint database: UUID primary keys, UNIQUE constraints, CHECK constraints (role, status, geo_status, quota > 0), dan foreign keys dengan ON DELETE CASCADE
  - Buat seed data awal: satu akun admin default
  - _Requirements: 1.1, 2.2, 3.2, 7.2, 13.1, 14.1, 15.1, 16.2_

- [x] 2. Implementasi Auth Module (Backend)
  - [x] 2.1 Implementasikan endpoint `POST /auth/login` dengan bcrypt.compare, penerbitan JWT (8 jam admin / 12 jam surveyor), dan pengecekan status akun aktif
    - Gunakan Redis untuk rate limiting: blokir IP setelah 5 kali gagal dalam 15 menit
    - Return JWT dengan payload: `{id, role, email}`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 8.1, 8.2, 8.3, 8.4_

  - [x] 2.2 Implementasikan endpoint `POST /auth/logout` (blacklist token di Redis) dan `GET /auth/me`
    - _Requirements: 1.5_

  - [x] 2.3 Buat middleware autentikasi JWT (`authMiddleware`) dan middleware otorisasi berbasis peran (`requireRole('admin')`, `requireRole('surveyor')`)
    - Kembalikan 401 untuk token tidak valid/kedaluwarsa, 403 untuk akses ditolak
    - _Requirements: 1.4, 8.5, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 2.4 Tulis property test untuk validasi password
    - **Property 8: Validasi Password Konsisten**
    - **Validates: Requirements 2.7**
    - Gunakan `fc.string()` untuk menghasilkan string acak; verifikasi fungsi validasi menerima semua password valid (≥8 karakter, huruf besar, huruf kecil, angka) dan menolak semua yang tidak memenuhi syarat

  - [x] 2.5 Tulis unit tests untuk Auth Module
    - Test: login sukses admin, login sukses surveyor, kredensial salah, akun nonaktif, token expired, rate limiting (5 kali gagal), logout invalidasi token
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 3. Implementasi Admin Management Module (Backend)
  - [x] 3.1 Implementasikan CRUD endpoint untuk `/admins`: GET (daftar), POST (buat baru dengan bcrypt hash), PUT (update), PATCH (deactivate)
    - Validasi password: minimal 8 karakter, huruf besar, huruf kecil, angka
    - Tolak email duplikat dengan HTTP 409
    - Cegah admin menonaktifkan/menghapus akun sendiri
    - Catat perubahan di `audit_logs`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.2 Tulis unit tests untuk Admin Management Module
    - Test: buat admin baru, email duplikat, password tidak valid, nonaktifkan admin lain, cegah nonaktifkan diri sendiri
    - _Requirements: 2.2, 2.3, 2.6, 2.7_

- [x] 4. Implementasi Surveyor Management Module (Backend)
  - [x] 4.1 Implementasikan CRUD endpoint untuk `/surveyors`: GET (daftar + ringkasan aktivitas), POST (buat baru), PUT (update), PATCH deactivate/activate, GET quota summary
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.2 Implementasikan endpoint kuota: simpan/update `surveyor_quotas` dengan validasi bilangan bulat positif > 0
    - _Requirements: 14.1, 14.2, 14.7_

  - [x] 4.3 Tulis property test untuk validasi input kuota
    - **Property 5: Kuota Responden Hanya Menerima Bilangan Bulat Positif**
    - **Validates: Requirements 14.1, 14.2**
    - Gunakan `fc.integer()`, `fc.float()`, `fc.string()`, `fc.oneof()` untuk menghasilkan berbagai input; verifikasi hanya integer > 0 yang diterima

  - [x] 4.4 Tulis unit tests untuk Surveyor Management Module
    - Test: buat surveyor, email duplikat, nonaktifkan/aktifkan, ringkasan aktivitas, simpan kuota valid, tolak kuota tidak valid
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 14.1, 14.2_

- [x] 5. Checkpoint — Pastikan semua tests lulus
  - Pastikan semua tests lulus, tanyakan kepada user jika ada pertanyaan.

- [x] 6. Implementasi Survey Management Module (Backend)
  - [x] 6.1 Implementasikan CRUD endpoint untuk `/surveys`: GET (daftar dengan filter role), POST (buat draft), GET detail, PUT (update), PATCH activate/deactivate, DELETE (hanya draft tanpa data responden)
    - Saat aktivasi survei: buat PostgreSQL sequence `questionnaire_seq_{survey_id}` untuk nomor kuesioner
    - Tolak penghapusan survei yang memiliki data responden dengan HTTP 409
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 6.2 Tulis unit tests untuk Survey Management Module
    - Test: buat survei draft, aktivasi, deaktivasi, hapus draft, tolak hapus survei dengan responden, filter daftar berdasarkan role
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 7. Implementasi Question Management Module dengan Skip Logic (Backend)
  - [x] 7.1 Implementasikan CRUD endpoint untuk `/surveys/:id/questions`: GET, POST, PUT (termasuk skip_logic JSONB), DELETE, PATCH reorder
    - Dukung semua tipe pertanyaan: single_choice, multiple_choice, short_text, long_text, numeric_scale, date, photo
    - Saat DELETE pertanyaan: hapus semua aturan skip_logic yang merujuk ke pertanyaan tersebut di pertanyaan lain
    - _Requirements: 4.1, 4.2, 4.7_

  - [x] 7.2 Implementasikan validasi skip logic dengan algoritma DFS untuk deteksi siklus (circular reference)
    - Bangun graf pertanyaan dari konfigurasi skip_logic JSONB
    - Jalankan DFS; tolak dengan HTTP 422 jika siklus terdeteksi
    - Dukung skip logic berantai (chained)
    - _Requirements: 4.3, 4.5, 4.6_

  - [x] 7.3 Tulis property test untuk skip logic bebas siklus
    - **Property 3: Skip Logic Bebas Siklus**
    - **Validates: Requirements 4.6**
    - Gunakan `fc.array()` dan `fc.record()` untuk menghasilkan konfigurasi skip logic acak; verifikasi semua konfigurasi yang berhasil disimpan tidak mengandung siklus

  - [x] 7.4 Tulis unit tests untuk Question Management Module
    - Test: tambah pertanyaan semua tipe, konfigurasi skip logic valid, tolak skip logic siklus, hapus pertanyaan membersihkan referensi skip logic, reorder
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_

- [x] 8. Implementasi Upload Foto (Backend)
  - [x] 8.1 Implementasikan endpoint `POST /upload/photo` menggunakan multer untuk menerima file JPEG, PNG, WEBP maksimal 5 MB
    - Simpan file ke filesystem lokal di direktori `uploads/photos/`
    - Kembalikan path file yang tersimpan
    - Tolak format tidak didukung dengan HTTP 422, ukuran melebihi batas dengan HTTP 413
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 8.2 Tulis unit tests untuk Upload Module
    - Test: upload JPEG valid, upload PNG valid, upload WEBP valid, tolak format tidak didukung, tolak file > 5 MB
    - _Requirements: 6.2, 6.3_

- [x] 9. Implementasi Response Module (Backend)
  - [x] 9.1 Implementasikan endpoint `POST /responses/start`: catat `start_time` menggunakan waktu server UTC, kembalikan session token
    - _Requirements: 15.1_

  - [x] 9.2 Implementasikan endpoint `POST /responses/submit` dalam transaksi atomik:
    - Validasi semua pertanyaan wajib telah dijawab; kembalikan daftar pertanyaan yang belum dijawab jika ada
    - Ambil koordinat geolokasi dari request body (lat, lng, geo_status)
    - Generate nomor kuesioner menggunakan `nextval('questionnaire_seq_{survey_id}')` dalam transaksi yang sama
    - Hitung `duration_seconds` = `end_time - start_time`
    - Simpan `responses` + `answers` secara atomik; rollback jika gagal generate nomor kuesioner
    - _Requirements: 9.3, 9.5, 9.6, 9.7, 13.1, 13.2, 13.6, 15.2, 15.3, 16.2, 16.3, 16.4, 16.5_

  - [x] 9.3 Implementasikan endpoint `GET /responses` (admin: semua; surveyor: milik sendiri) dan `GET /responses/:id`
    - _Requirements: 9.2, 9.4, 13.5, 15.5_

  - [x] 9.4 Tulis property test untuk nomor kuesioner unik per survei
    - **Property 1: Nomor Kuesioner Unik per Survei**
    - **Validates: Requirements 13.1, 13.2**
    - Simulasikan multiple submissions untuk survei yang sama; verifikasi semua nomor kuesioner yang dihasilkan adalah unik dalam satu survei

  - [x] 9.5 Tulis property test untuk konsistensi durasi pengisian
    - **Property 2: Durasi Pengisian Konsisten dengan Timestamp**
    - **Validates: Requirements 15.2, 15.3**
    - Gunakan `fc.date()` untuk menghasilkan pasangan start_time/end_time acak; verifikasi `duration_seconds === (end_time - start_time) / 1000` dan `end_time >= start_time`

  - [x] 9.6 Tulis property test untuk jawaban tersimpan berdasarkan nilai, bukan posisi
    - **Property 7: Jawaban Tersimpan Berdasarkan Nilai, Bukan Posisi**
    - **Validates: Requirements 5.4**
    - Gunakan `fc.shuffledSubarray()` untuk mensimulasikan urutan tampilan acak; verifikasi nilai yang tersimpan di database sama dengan nilai yang dipilih surveyor

  - [x] 9.7 Tulis unit tests untuk Response Module
    - Test: simpan responden lengkap, validasi pertanyaan wajib, geolokasi semua status (available, denied, timeout, unsupported), rollback saat gagal generate nomor kuesioner, surveyor hanya lihat data sendiri
    - _Requirements: 9.3, 9.5, 9.6, 9.7, 13.1, 13.6, 15.1, 15.2, 16.2, 16.3, 16.4, 16.5_

- [x] 10. Checkpoint — Pastikan semua tests lulus
  - Pastikan semua tests lulus, tanyakan kepada user jika ada pertanyaan.

- [x] 11. Implementasi Randomisasi Jawaban (Backend + Frontend Hook)
  - [x] 11.1 Implementasikan logika randomisasi di backend: saat menyimpan pertanyaan dengan `randomize_options: true`, pastikan konfigurasi tersimpan di kolom `questions.randomize_options`
    - _Requirements: 5.1_

  - [x] 11.2 Buat hook `useSkipLogic.js` di frontend Surveyor Interface untuk mengevaluasi aturan skip logic secara lokal berdasarkan jawaban yang sudah diisi
    - Dukung operator: equals, not_equals, contains, greater_than, less_than
    - Dukung chained skip logic
    - _Requirements: 4.4, 4.5_

  - [x] 11.3 Implementasikan logika randomisasi di frontend: saat memuat pertanyaan dengan `randomize_options: true`, acak urutan tampilan pilihan menggunakan Fisher-Yates shuffle; pastikan nilai yang dikirim ke API adalah nilai pilihan, bukan indeks posisi
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 11.4 Tulis property test untuk randomisasi jawaban mempertahankan kelengkapan
    - **Property 4: Randomisasi Jawaban Mempertahankan Kelengkapan**
    - **Validates: Requirements 5.2, 5.3**
    - Gunakan `fc.array(fc.record({value: fc.string(), label: fc.string()}), {minLength: 2})` untuk menghasilkan pilihan acak; verifikasi hasil shuffle mengandung semua elemen yang sama (tidak ada yang hilang atau duplikat)

  - [x] 11.5 Tulis unit tests untuk randomisasi dan skip logic frontend
    - Test: shuffle menghasilkan semua pilihan, nilai tersimpan berdasarkan value bukan posisi, skip logic linear, skip logic berantai
    - _Requirements: 5.2, 5.3, 5.4, 4.4, 4.5_

- [x] 12. Implementasi Dashboard Module (Backend)
  - [x] 12.1 Implementasikan endpoint `GET /dashboard/stats`: jumlah survei aktif, surveyor aktif, responden hari ini, total responden
    - _Requirements: 10.1_

  - [x] 12.2 Implementasikan endpoint `GET /dashboard/trend`: data tren pengisian responden 7 hari terakhir (agregasi per hari)
    - _Requirements: 10.2_

  - [x] 12.3 Implementasikan endpoint `GET /dashboard/top-surveyors`: 5 surveyor dengan jumlah responden terbanyak
    - _Requirements: 10.3_

  - [x] 12.4 Tulis unit tests untuk Dashboard Module
    - Test: statistik ringkasan akurat, tren 7 hari, top 5 surveyor
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 13. Implementasi Report & Export Module (Backend)
  - [x] 13.1 Implementasikan endpoint `GET /reports/surveys/:id` dengan filter berdasarkan tanggal, surveyor, dan status; sertakan kolom metadata (ID responden, nama surveyor, tanggal, waktu, nomor kuesioner, timestamp mulai/selesai, durasi, lat, lng, geo_status)
    - _Requirements: 11.1, 11.7, 13.4, 15.4, 16.6_

  - [x] 13.2 Implementasikan ekspor sinkron untuk ≤1000 responden: `POST /reports/surveys/:id/export/xlsx` dan `/export/csv` menggunakan exceljs dan csv-stringify
    - Sertakan semua kolom metadata dan URL/path foto untuk pertanyaan tipe photo
    - _Requirements: 11.2, 11.3, 11.4, 11.6_

  - [x] 13.3 Implementasikan ekspor asinkron untuk >1000 responden menggunakan Bull + Redis job queue:
    - `POST /reports/surveys/:id/export/xlsx` trigger job, kembalikan `jobId`
    - `GET /reports/exports/:jobId` untuk cek status (pending/processing/completed/failed)
    - `GET /reports/exports/:jobId/download` untuk download file yang sudah selesai
    - _Requirements: 11.5_

  - [x] 13.4 Tulis unit tests untuk Report & Export Module
    - Test: ekspor xlsx dengan filter, ekspor csv, ekspor asinkron trigger job, cek status job, download file, kolom metadata lengkap
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [x] 14. Implementasi Map Module (Backend)
  - [x] 14.1 Implementasikan endpoint `GET /map/points` dengan filter survei, surveyor, dan rentang tanggal; kembalikan hanya titik dengan `geo_status = 'available'`; sertakan nama surveyor, nomor kuesioner, dan timestamp selesai untuk setiap titik
    - _Requirements: 16.7, 16.8, 16.9, 16.10_

  - [x] 14.2 Tulis unit tests untuk Map Module
    - Test: filter berdasarkan survei/surveyor/tanggal, hanya titik available yang dikembalikan, data popup lengkap
    - _Requirements: 16.7, 16.8, 16.9, 16.10_

- [x] 15. Checkpoint — Pastikan semua tests lulus
  - Pastikan semua tests lulus, tanyakan kepada user jika ada pertanyaan.

- [x] 16. Implementasi Frontend Admin Dashboard
  - [x] 16.1 Buat komponen `Layout.jsx`, halaman `Login.jsx` dengan form autentikasi, dan konfigurasi Axios instance (`services/api.js`) dengan interceptor untuk menyertakan Bearer JWT dan menangani 401 (redirect ke login)
    - _Requirements: 1.1, 1.2, 1.4, 12.4_

  - [x] 16.2 Buat halaman `Dashboard.jsx`: tampilkan statistik ringkasan (4 kartu), grafik tren 7 hari (menggunakan library chart), dan daftar top 5 surveyor
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 16.3 Buat halaman `AdminUsers.jsx`: tabel daftar admin (nama, email, status, tanggal dibuat), form buat/edit admin dengan validasi password, tombol nonaktifkan (dengan konfirmasi, cegah nonaktifkan diri sendiri)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 16.4 Buat halaman `Surveyors.jsx`: tabel daftar surveyor (nama, email, status, jumlah responden, tanggal bergabung), form buat/edit surveyor, tombol nonaktifkan/aktifkan, ringkasan kuota per survei
    - Buat komponen `QuotaProgress.jsx` untuk menampilkan indikator progres kuota
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 14.7_

  - [x] 16.5 Buat halaman `Surveys.jsx` (daftar survei: judul, status, jumlah pertanyaan, jumlah responden) dan `SurveyBuilder.jsx` (builder pertanyaan dengan semua tipe, konfigurasi skip logic, toggle randomisasi)
    - Buat komponen `SkipLogicEditor.jsx` untuk konfigurasi aturan skip logic secara visual
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.6, 5.1_

  - [x] 16.6 Buat halaman `Responses.jsx` (tabel laporan dengan filter tanggal/surveyor/status) dan `ResponseDetail.jsx` (detail responden: nomor kuesioner, metadata timestamp, durasi, geolokasi, semua jawaban termasuk thumbnail foto)
    - _Requirements: 11.1, 11.7, 13.5, 15.5, 15.7, 16.6_

  - [x] 16.7 Buat halaman `Reports.jsx` dengan tombol ekspor xlsx/csv, indikator status job ekspor asinkron, dan link download
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 16.8 Buat halaman `MapView.jsx` menggunakan Leaflet.js: tampilkan peta interaktif dengan titik-titik geolokasi, filter survei/surveyor/tanggal, popup info saat klik titik (nama surveyor, nomor kuesioner, timestamp selesai)
    - Buat komponen `GeoMap.jsx` sebagai wrapper Leaflet
    - _Requirements: 16.7, 16.8, 16.9_

- [x] 17. Implementasi Frontend Surveyor Interface
  - [x] 17.1 Buat halaman `SurveyList.jsx` untuk Surveyor: daftar survei aktif, tampilkan progres kuota (jumlah diisi vs target) menggunakan komponen `QuotaProgress.jsx`, penghitung responden sesi aktif
    - _Requirements: 9.4, 14.3, 14.4, 14.5, 14.6, 14.8_

  - [x] 17.2 Buat halaman `SurveyForm.jsx`: render semua tipe pertanyaan, integrasikan hook `useSkipLogic.js` untuk evaluasi skip logic real-time, implementasikan randomisasi urutan pilihan untuk pertanyaan dengan `randomize_options: true`, validasi pertanyaan wajib sebelum submit dengan indikator visual
    - Integrasikan hook `useGeolocation.js` untuk meminta izin lokasi saat submit
    - _Requirements: 9.1, 9.5, 9.6, 4.4, 5.2, 5.3, 5.4, 6.2, 16.1_

  - [x] 17.3 Buat halaman `SubmitSuccess.jsx`: tampilkan nomor kuesioner setelah berhasil simpan, tombol untuk mengisi responden berikutnya (reset form kosong)
    - _Requirements: 9.2, 9.3, 13.3_

  - [x] 17.4 Implementasikan hook `useGeolocation.js`: wrapper Geolocation API dengan timeout 10 detik, kembalikan `{status, lat, lng}` untuk semua skenario (available, lokasi_tidak_tersedia, tidak_didukung, timeout)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 17.5 Tulis property test untuk presisi geolokasi
    - **Property 6: Geolokasi Tersimpan dengan Presisi Minimal 6 Desimal**
    - **Validates: Requirements 16.2**
    - Gunakan `fc.float({min: -90, max: 90})` dan `fc.float({min: -180, max: 180})` untuk menghasilkan koordinat acak; verifikasi nilai yang tersimpan memiliki presisi minimal 6 angka desimal

  - [x] 17.6 Tulis unit tests untuk Surveyor Interface
    - Test: render pertanyaan semua tipe, skip logic menyembunyikan/menampilkan pertanyaan, validasi pertanyaan wajib, geolokasi semua status, tampil nomor kuesioner setelah submit, progres kuota
    - _Requirements: 9.1, 9.5, 9.6, 4.4, 5.2, 14.3, 14.4, 14.5, 16.1, 16.3, 16.4, 16.5_

- [x] 18. Implementasi Audit Log dan Keamanan
  - [x] 18.1 Implementasikan middleware audit log yang mencatat semua aktivitas login, logout, dan perubahan data penting (create/update/deactivate admin, surveyor, survei) ke tabel `audit_logs` dengan timestamp UTC dan ID pengguna
    - _Requirements: 2.4, 12.6_

  - [x] 18.2 Buat halaman `AuditLog.jsx` di Admin Dashboard untuk menampilkan log aktivitas dengan filter
    - _Requirements: 12.6_

  - [x] 18.3 Tulis unit tests untuk Audit Log
    - Test: login tercatat, logout tercatat, perubahan data admin tercatat, perubahan data surveyor tercatat
    - _Requirements: 12.6_

- [ ] 19. Integrasi dan Wiring Akhir
  - [x] 19.1 Hubungkan semua route backend dengan middleware autentikasi dan otorisasi yang sesuai; pastikan endpoint admin hanya dapat diakses oleh role admin, dan endpoint surveyor hanya dapat diakses oleh role surveyor
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 19.2 Konfigurasi CORS di backend untuk mengizinkan request dari frontend; konfigurasi environment variables untuk semua konfigurasi sensitif (DB URL, JWT secret, Redis URL)
    - _Requirements: 12.1_

  - [x] 19.3 Implementasikan global error handler middleware di Express sesuai desain; pastikan semua error dikembalikan dalam format JSON yang konsisten tanpa mengungkap detail internal
    - _Requirements: 1.2, 2.3, 4.6, 6.3, 13.6_

  - [x] 19.4 Tulis integration tests untuk alur end-to-end utama
    - Test: login → pilih survei → isi responden → simpan → verifikasi nomor kuesioner unik
    - Test: ekspor data dengan filter tanggal dan surveyor
    - Test: rate limiting 5 kali gagal memblokir IP selama 15 menit
    - Test: geolokasi semua skenario tersimpan dengan benar di database
    - _Requirements: 1.6, 9.1, 9.3, 13.1, 13.2, 11.2, 16.2, 16.3, 16.4, 16.5_

- [x] 20. Final Checkpoint — Pastikan semua tests lulus
  - Pastikan semua tests lulus, tanyakan kepada user jika ada pertanyaan.

## Notes

- Tasks bertanda `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirement spesifik untuk keterlacakan
- Property tests menggunakan library **fast-check** dengan minimal 100 iterasi per properti
- Unit tests menggunakan **Jest** dengan target coverage 80% (branches, functions, lines, statements)
- Checkpoint memastikan validasi inkremental sebelum melanjutkan ke fase berikutnya
- Nomor kuesioner dibangkitkan menggunakan PostgreSQL sequence dalam transaksi atomik untuk menjamin keunikan
- Ekspor asinkron menggunakan Bull + Redis job queue untuk menangani dataset besar (>1000 responden)
- Timestamp selalu disimpan dalam UTC; konversi ke zona waktu lokal dilakukan di frontend
