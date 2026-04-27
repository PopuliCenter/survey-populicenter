# Implementation Plan: Dashboard Progress Survei

## Overview

Implementasi fitur progress survei di dashboard admin/supervisor. Mencakup: dua endpoint baru di `backend/src/routes/dashboard.js` (`GET /dashboard/survey-progress/:surveyId` dan `GET /dashboard/surveyor-summary`), tiga fungsi helper (`calculatePercentage`, `calculateRemaining`, `resolveSurveyorStatus`) yang diekspor untuk testing, dua komponen frontend baru (`SurveyProgressCard.jsx` dan `SurveyorProgressTable.jsx`), serta update `Dashboard.jsx` dengan section "Progress Survei Aktif" dan dropdown filter survei. Tidak ada perubahan database/migration — menggunakan tabel yang sudah ada.

## Tasks

- [x] 1. Tambahkan fungsi helper dan endpoint `GET /dashboard/survey-progress/:surveyId` di backend
  - [x] 1.1 Tambahkan fungsi helper `isValidUUID`, `calculatePercentage`, `calculateRemaining`, dan `resolveSurveyorStatus` di `backend/src/routes/dashboard.js`
    - Tambahkan import `SurveyorQuota` dari `../models` di bagian atas file (tambahkan ke destructuring yang sudah ada)
    - Tambahkan fungsi `isValidUUID(str)` yang memvalidasi format UUID v4 menggunakan regex
    - Tambahkan fungsi `calculatePercentage(collected, quota)` yang mengembalikan `0` jika `quota <= 0`, menghitung `(collected / quota) * 100` dibulatkan ke 1 desimal, dan cap di `100.0`
    - Tambahkan fungsi `calculateRemaining(quota, collected)` yang mengembalikan `Math.max(0, quota - collected)`
    - Tambahkan fungsi `resolveSurveyorStatus(totalCollected, totalQuota)` yang mengembalikan `'on-track'` jika `totalQuota === 0`, `'completed'` jika `totalCollected >= totalQuota`, `'on-track'` jika rasio `>= 0.5`, `'behind'` jika rasio `< 0.5`
    - Ekspor keempat fungsi di `module.exports` bersama `router` agar dapat diuji: `module.exports = router; module.exports.calculatePercentage = calculatePercentage; module.exports.calculateRemaining = calculateRemaining; module.exports.resolveSurveyorStatus = resolveSurveyorStatus;`
    - _Requirements: 1.4, 1.5, 1.6, 2.3, 2.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 1.2 Tambahkan route handler `GET /dashboard/survey-progress/:surveyId` di `backend/src/routes/dashboard.js`
    - Gunakan middleware `authMiddleware` dan `requireRole(['admin', 'supervisor'])`
    - Validasi `surveyId` dengan `isValidUUID`, kembalikan 422 jika tidak valid
    - Cek survei ada dengan `Survey.findOne`, kembalikan 404 jika tidak ditemukan
    - Ambil kuota surveyor dengan `SurveyorQuota.findAll` (include `User` as `surveyor`)
    - Hitung `totalQuota` sebagai penjumlahan `quota` dari semua baris kuota
    - Hitung `totalCollected` dengan `Response.count` berdasarkan `survey_id`
    - Hitung responden per surveyor dengan `Response.findAll` (GROUP BY `surveyor_id`)
    - Build array `surveyors` dengan field: `surveyorId`, `surveyorName`, `quota`, `collected`, `percentage`, `remaining`
    - Urutkan array `surveyors` berdasarkan `percentage` descending
    - Kembalikan JSON: `{ surveyId, surveyTitle, totalQuota, totalCollected, completionPercentage, surveyors }`
    - Error database ditangkap oleh `try/catch` dan diteruskan ke `next(error)`
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 1.8, 1.9, 2.1, 2.2, 2.5, 2.6, 8.1, 8.2, 8.3, 9.1, 9.3_

  - [x] 1.3 Tambahkan unit test untuk endpoint `survey-progress` di `backend/tests/unit/dashboard.test.js`
    - Tambahkan mock `SurveyorQuota` (findAll) dan `Survey` (findOne) di blok `jest.mock('../../src/models', ...)` yang sudah ada
    - Tambahkan describe block `"GET /dashboard/survey-progress/:surveyId"` dengan test cases:
    - Test: mengembalikan 401 tanpa token
    - Test: mengembalikan 403 untuk role surveyor
    - Test: mengembalikan 403 untuk role viewer
    - Test: mengembalikan 200 untuk admin dengan data progress yang benar (surveyId, surveyTitle, totalQuota, totalCollected, completionPercentage, surveyors array)
    - Test: mengembalikan 200 untuk supervisor
    - Test: mengembalikan 404 untuk surveyId yang tidak ditemukan
    - Test: mengembalikan 422 untuk surveyId bukan UUID valid
    - Test: completionPercentage bernilai 0 ketika tidak ada kuota (totalQuota = 0)
    - Test: completionPercentage maksimum 100.0 ketika collected > quota
    - Test: array surveyors terurut berdasarkan percentage descending
    - Test: hanya surveyor dengan kuota yang muncul di array surveyors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1, 9.3_

- [x] 2. Tambahkan endpoint `GET /dashboard/surveyor-summary` di backend
  - [x] 2.1 Tambahkan route handler `GET /dashboard/surveyor-summary` di `backend/src/routes/dashboard.js`
    - Gunakan middleware `authMiddleware` dan `requireRole(['admin', 'supervisor'])`
    - Ambil semua surveyor aktif dengan `User.findAll` (role='surveyor', is_active=true)
    - Ambil survei aktif dengan `Survey.findAll` (status='active')
    - Ambil kuota per surveyor di survei aktif dengan `SurveyorQuota.findAll`
    - Hitung responses per surveyor di survei aktif dengan `Response.findAll` (GROUP BY surveyor_id)
    - Hitung responses hari ini per surveyor dengan `Response.findAll` (filter created_at hari ini UTC)
    - Build lookup maps: quotaMap, responseMap, todayMap
    - Build result array dengan field: `surveyorId`, `surveyorName`, `activeSurveyCount`, `responsesToday`, `status` (menggunakan `resolveSurveyorStatus`)
    - Error database ditangkap oleh `try/catch` dan diteruskan ke `next(error)`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 9.2_

  - [x] 2.2 Tambahkan unit test untuk endpoint `surveyor-summary` di `backend/tests/unit/dashboard.test.js`
    - Tambahkan describe block `"GET /dashboard/surveyor-summary"` dengan test cases:
    - Test: mengembalikan 401 tanpa token
    - Test: mengembalikan 403 untuk role surveyor
    - Test: mengembalikan 403 untuk role viewer
    - Test: mengembalikan 200 untuk admin dengan data ringkasan yang benar (array objek dengan surveyorId, surveyorName, activeSurveyCount, responsesToday, status)
    - Test: mengembalikan 200 untuk supervisor
    - Test: hanya menyertakan surveyor aktif (is_active = true)
    - Test: status "completed" ketika collected >= quota
    - Test: status "on-track" ketika rasio >= 0.5
    - Test: status "behind" ketika rasio < 0.5
    - Test: status "on-track" ketika surveyor tidak memiliki kuota di survei aktif
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 9.2_

- [x] 3. Checkpoint — Pastikan semua unit test backend lulus
  - Jalankan `npm test -- --testPathPattern=dashboard.test.js` di direktori `backend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 4. Buat property-based tests backend di `backend/tests/properties/dashboardProgress.property.test.js`
  - [x]* 4.1 Tulis property test untuk Property 1: Perhitungan completion percentage
    - Import `calculatePercentage` dari `../../src/routes/dashboard`
    - Generate random `(collected, quota)` pairs menggunakan `fc.nat()` untuk kedua field
    - Verifikasi: `calculatePercentage(collected, quota)` mengembalikan `0` ketika `quota === 0`
    - Verifikasi: hasil selalu dalam rentang `[0, 100.0]`
    - Verifikasi: ketika `collected <= quota` dan `quota > 0`, hasil sama dengan `Math.round((collected / quota) * 1000) / 10`
    - Verifikasi: ketika `collected > quota`, hasil bernilai `100.0`
    - `numRuns: 100`
    - **Property 1: Perhitungan completion percentage**
    - **Validates: Requirements 1.4, 1.5, 1.6, 2.3**

  - [x]* 4.2 Tulis property test untuk Property 2: Perhitungan remaining
    - Import `calculateRemaining` dari `../../src/routes/dashboard`
    - Generate random `(quota, collected)` pairs menggunakan `fc.nat()` untuk kedua field
    - Verifikasi: `calculateRemaining(quota, collected)` sama dengan `Math.max(0, quota - collected)`
    - Verifikasi: ketika `collected <= quota`, maka `collected + calculateRemaining(quota, collected) === quota`
    - Verifikasi: hasil selalu `>= 0`
    - `numRuns: 100`
    - **Property 2: Perhitungan remaining**
    - **Validates: Requirements 2.4, 8.4**

  - [x]* 4.3 Tulis property test untuk Property 3: Klasifikasi status surveyor
    - Import `resolveSurveyorStatus` dari `../../src/routes/dashboard`
    - Generate random `(totalCollected, totalQuota)` pairs menggunakan `fc.nat()` untuk kedua field
    - Verifikasi: `resolveSurveyorStatus(totalCollected, totalQuota)` mengembalikan `'on-track'` ketika `totalQuota === 0`
    - Verifikasi: mengembalikan `'completed'` ketika `totalCollected >= totalQuota` dan `totalQuota > 0`
    - Verifikasi: mengembalikan `'on-track'` ketika `totalCollected / totalQuota >= 0.5` dan `totalCollected < totalQuota`
    - Verifikasi: mengembalikan `'behind'` ketika `totalCollected / totalQuota < 0.5`
    - Verifikasi: hasil selalu salah satu dari `'completed'`, `'on-track'`, `'behind'`
    - `numRuns: 100`
    - **Property 3: Klasifikasi status surveyor**
    - **Validates: Requirements 3.5, 3.6, 3.7, 3.8**

  - [x]* 4.4 Tulis property test untuk Property 4: Konsistensi total collected dengan breakdown surveyor
    - Generate random array of `{ quota: fc.nat(), collected: fc.nat() }` per surveyor menggunakan `fc.array(fc.record({ quota: fc.nat(), collected: fc.nat() }), { minLength: 1, maxLength: 10 })`
    - Hitung `totalCollected` sebagai penjumlahan `collected` dari semua elemen
    - Verifikasi: `sum(surveyors.collected) === totalCollected`
    - Verifikasi: setiap elemen memiliki `percentage` yang konsisten dengan `calculatePercentage(collected, quota)`
    - `numRuns: 100`
    - **Property 4: Konsistensi total collected dengan breakdown surveyor**
    - **Validates: Requirements 2.2, 8.3**

  - [x]* 4.5 Tulis property test untuk Property 5: Hanya surveyor dengan kuota yang muncul
    - Generate random sets of surveyors: beberapa dengan kuota (`fc.nat({ min: 1 })`), beberapa tanpa kuota
    - Simulasikan logika filtering: hanya surveyor yang memiliki kuota yang muncul di output
    - Verifikasi: panjang array output sama dengan jumlah surveyor yang memiliki kuota
    - Verifikasi: setiap elemen di output memiliki `quota > 0`
    - `numRuns: 100`
    - **Property 5: Hanya surveyor dengan kuota yang muncul**
    - **Validates: Requirements 1.7, 2.5**

  - [x]* 4.6 Tulis property test untuk Property 6: Pengurutan surveyor berdasarkan persentase menurun
    - Generate random array of surveyor progress data menggunakan `fc.array(fc.record({ quota: fc.nat({ min: 1 }), collected: fc.nat() }), { minLength: 2, maxLength: 10 })`
    - Hitung `percentage` untuk setiap elemen menggunakan `calculatePercentage`
    - Urutkan berdasarkan `percentage` descending
    - Verifikasi: untuk setiap pasangan berurutan `(arr[i], arr[i+1])`, berlaku `arr[i].percentage >= arr[i+1].percentage`
    - `numRuns: 100`
    - **Property 6: Pengurutan surveyor berdasarkan persentase menurun**
    - **Validates: Requirements 2.6**

- [x] 5. Buat komponen frontend `SurveyProgressCard.jsx`
  - [x] 5.1 Buat file `frontend/src/components/SurveyProgressCard.jsx`
    - Komponen menerima props: `surveyTitle`, `totalQuota`, `totalCollected`, `completionPercentage`, `onClick`
    - Tampilkan judul survei (truncate jika terlalu panjang)
    - Tampilkan progress bar dengan `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`
    - Warna progress bar: hijau (`bg-green-500`) jika 100%, kuning (`bg-yellow-500`) jika 50-99%, merah (`bg-red-500`) jika < 50%
    - Lebar progress bar proporsional terhadap `completionPercentage` (cap di 100%)
    - Tampilkan teks `"{totalCollected} dari {totalQuota} responden"` dan persentase
    - Card clickable dengan `onClick`, `role="button"`, `tabIndex={0}`, keyboard handler (Enter/Space)
    - Gunakan Tailwind CSS sesuai pola komponen yang sudah ada
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 5.2 Buat unit test `frontend/src/components/__tests__/SurveyProgressCard.test.jsx`
    - Test: menampilkan judul survei, persentase, dan teks responden
    - Test: progress bar berwarna hijau ketika 100%
    - Test: progress bar berwarna kuning ketika 50-99%
    - Test: progress bar berwarna merah ketika < 50%
    - Test: atribut ARIA (role="progressbar", aria-valuenow, aria-valuemin, aria-valuemax) ada
    - Test: lebar progress bar proporsional terhadap persentase
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 6. Buat komponen frontend `SurveyorProgressTable.jsx`
  - [x] 6.1 Buat file `frontend/src/components/SurveyorProgressTable.jsx`
    - Komponen menerima props: `surveyors` (array of `{ surveyorId, surveyorName, quota, collected, percentage, remaining }`)
    - Tampilkan tabel dengan kolom: "No", "Nama Surveyor", "Kuota", "Terkumpul", "Persentase", "Sisa"
    - Elemen `<table>` dengan `role="table"`, header menggunakan `<th>` dengan `scope="col"`
    - Badge hijau "Selesai" untuk surveyor dengan percentage >= 100
    - Teks merah untuk surveyor dengan percentage < 50
    - Pesan "Belum ada surveyor yang ditugaskan untuk survei ini." ketika array kosong
    - Gunakan Tailwind CSS sesuai pola tabel yang sudah ada di `Dashboard.jsx`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 6.2 Buat unit test `frontend/src/components/__tests__/SurveyorProgressTable.test.jsx`
    - Test: menampilkan header kolom yang benar (No, Nama Surveyor, Kuota, Terkumpul, Persentase, Sisa)
    - Test: menampilkan satu baris per surveyor
    - Test: badge hijau "Selesai" untuk surveyor dengan 100%
    - Test: teks merah untuk surveyor dengan < 50%
    - Test: pesan kosong ketika array surveyors kosong
    - Test: atribut ARIA (role="table", scope="col") ada
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 7. Update `Dashboard.jsx` dengan section "Progress Survei Aktif" dan filter dropdown
  - [x] 7.1 Tambahkan state, fetch logic, dan section progress di `frontend/src/pages/Dashboard.jsx`
    - Import `SurveyProgressCard` dan `SurveyorProgressTable`
    - Tambahkan state: `activeSurveys`, `progressMap`, `selectedSurvey`, `progressLoading`, `progressError`, `detailLoading`, `selectedProgress`
    - Tambahkan `useEffect` independen untuk fetch data progress (tidak mengganggu fetch stats/trend/top-surveyors yang sudah ada)
    - Fetch daftar survei aktif dari `GET /surveys` (filter status active), lalu fetch progress untuk setiap survei aktif dari `GET /dashboard/survey-progress/:surveyId`
    - Tambahkan handler `handleSurveyFilter(surveyId)` untuk dropdown filter
    - Tambahkan section "Progress Survei Aktif" setelah section "Top 5 Surveyor"
    - Section berisi: dropdown filter survei (label "Pilih Survei", opsi "Semua Survei" + setiap survei aktif), grid card progress, tabel breakdown (saat survei dipilih)
    - Loading state: "Memuat data progress..." saat loading, dropdown disabled dengan "Memuat..."
    - Error state: alert merah di dalam section tanpa mengganggu section lain
    - Empty state: "Tidak ada survei aktif saat ini."
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.1, 7.2, 7.3, 7.4, 7.5, 9.4, 10.1, 10.2, 10.3, 10.4_

  - [ ]* 7.2 Tambahkan unit test untuk section progress di `frontend/src/pages/__tests__/Dashboard.test.jsx`
    - Buat file test baru
    - Setup: mock `../services/api` dengan response untuk stats, trend, top-surveyors, surveys, dan survey-progress
    - Test: section "Progress Survei Aktif" ditampilkan
    - Test: dropdown filter survei ditampilkan dengan label "Pilih Survei"
    - Test: card progress ditampilkan untuk setiap survei aktif
    - Test: pesan "Tidak ada survei aktif saat ini." ketika tidak ada survei aktif
    - Test: memilih survei dari dropdown menampilkan tabel breakdown
    - Test: memilih "Semua Survei" menampilkan semua card tanpa tabel
    - Test: loading state "Memuat data progress..." ditampilkan saat loading
    - Test: error alert ditampilkan tanpa mengganggu section lain
    - Test: dropdown disabled dengan "Memuat..." saat loading
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.1, 7.2, 7.3, 7.4, 7.5, 9.4, 10.1, 10.2, 10.3, 10.4_

- [x] 8. Checkpoint — Pastikan semua unit test frontend lulus
  - Jalankan `npx vitest run` di direktori `frontend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 9. Final checkpoint — Pastikan semua tests lulus
  - Jalankan seluruh test suite backend: `npm test` di direktori `backend`
  - Jalankan seluruh test suite frontend: `npx vitest run` di direktori `frontend`
  - Pastikan tidak ada regresi pada test yang sudah ada

## Notes

- Fungsi `calculatePercentage`, `calculateRemaining`, dan `resolveSurveyorStatus` diekspor dari `dashboard.js` agar dapat diuji secara terisolasi di property-based tests
- Tidak ada perubahan database/migration — fitur ini menggunakan tabel `surveys`, `surveyor_quotas`, `responses`, dan `users` yang sudah ada
- Section progress di `Dashboard.jsx` dimuat secara independen dari section lain (stats, trend, top-surveyors) sehingga kegagalan pada satu section tidak memblokir section lainnya
- Komponen `SurveyProgressCard` dan `SurveyorProgressTable` menerima data melalui props dan tidak melakukan fetch API secara mandiri
- Backend tests menggunakan Jest, frontend tests menggunakan Vitest, property-based tests menggunakan fast-check
- Urutan task: backend helpers + endpoint survey-progress (1) → backend endpoint surveyor-summary (2) → backend tests checkpoint (3) → property tests (4) → frontend SurveyProgressCard (5) → frontend SurveyorProgressTable (6) → frontend Dashboard update (7) → frontend tests checkpoint (8) → final tests (9)
- Setiap task mereferensikan requirements spesifik untuk traceability
- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
