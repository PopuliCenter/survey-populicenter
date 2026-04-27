# Implementation Plan: Deadline & Status Survei

## Overview

Implementasi fitur deadline survei yang mencakup: satu migration database untuk menambahkan kolom `start_date` dan `end_date` ke tabel `surveys`, update model `Survey.js`, validasi konsistensi tanggal dan penyimpanan di `surveys.js`, pengecekan periode aktif di `responses.js`, filter survei berdasarkan periode untuk surveyor, date picker di `SurveyBuilder.jsx`, badge status temporal di `Surveys.jsx`, informasi sisa hari dan pemblokiran tombol di `SurveyList.jsx`, serta reset tanggal pada clone survei.

## Tasks

- [x] 1. Buat migration database untuk menambahkan kolom `start_date` dan `end_date`
  - Buat file `backend/src/migrations/20240105000001-add-survey-deadline.js`
  - Fungsi `up`: tambahkan kolom `start_date` bertipe `Sequelize.DATE` (TIMESTAMPTZ di PostgreSQL), `allowNull: true`, `defaultValue: null` ke tabel `surveys`
  - Tambahkan kolom `end_date` dengan konfigurasi yang sama
  - Fungsi `down`: hapus kolom `end_date` lalu `start_date` dari tabel `surveys`
  - Gunakan pola yang sama dengan migration yang sudah ada (misalnya `20240104000001-add-phone-and-unique-id-types.js`)
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Update model dan validasi backend
  - [x] 2.1 Update `backend/src/models/Survey.js`: tambahkan field `start_date` dan `end_date`
    - Tambahkan `start_date: { type: DataTypes.DATE, allowNull: true, defaultValue: null }` ke definisi model
    - Tambahkan `end_date: { type: DataTypes.DATE, allowNull: true, defaultValue: null }` ke definisi model
    - _Requirements: 1.4_

  - [x] 2.2 Update `backend/src/routes/surveys.js`: tambahkan validasi tanggal dan penyimpanan
    - Tambahkan fungsi helper `validateSurveyDates(startDate, endDate)` yang mengembalikan `{ valid: boolean, error?: string }`
    - Jika keduanya terisi dan `end_date <= start_date`, kembalikan `{ valid: false, error: 'Tanggal berakhir harus lebih besar dari tanggal mulai' }`
    - Jika hanya salah satu terisi, keduanya null, atau `end_date > start_date`, kembalikan `{ valid: true }`
    - Di handler `POST /surveys`: terima `start_date` dan `end_date` dari `req.body`, jalankan `validateSurveyDates`, kembalikan 422 jika tidak valid, simpan ke database, sertakan di response dan audit log
    - Di handler `PUT /surveys/:id`: terima `start_date` dan `end_date`, tentukan nilai final (gunakan nilai existing jika field tidak dikirim), jalankan `validateSurveyDates`, kembalikan 422 jika tidak valid, update di database, sertakan di response dan audit log
    - Ekspor `validateSurveyDates` untuk testing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3, 6.4_

  - [x] 2.3 Update `backend/src/routes/surveys.js`: filter survei berdasarkan periode aktif untuk surveyor
    - Di handler `GET /surveys`, untuk role `surveyor`: tambahkan WHERE clause tambahan menggunakan `Op.and`, `Op.or` untuk memfilter survei yang memenuhi: (`start_date` null ATAU `start_date <= now`) DAN (`end_date` null ATAU `end_date > now`)
    - Untuk role `admin`, `supervisor`, `viewer`: tidak ada filter tambahan (perilaku existing dipertahankan)
    - Tambahkan `start_date` dan `end_date` ke `attributes` pada semua query `Survey.findAll` di `GET /surveys`
    - Tambahkan `start_date` dan `end_date` ke response mapping (`result`) untuk semua role
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.4 Update `backend/src/routes/surveys.js`: tambahkan field `is_expired` di `GET /surveys/:id`
    - Tambahkan `start_date` dan `end_date` ke `attributes` pada `Survey.findOne`
    - Hitung `is_expired`: `true` jika `end_date` terisi dan `end_date < now`, `false` untuk kondisi lainnya
    - Sertakan `start_date`, `end_date`, dan `is_expired` di response JSON
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 2.5 Update `backend/src/routes/surveys.js`: reset tanggal pada clone survei
    - Di handler `POST /surveys/:id/clone`, saat membuat survei baru via `Survey.create`, tambahkan `start_date: null` dan `end_date: null` secara eksplisit
    - _Requirements: 10.1_

  - [x] 2.6 Update `backend/src/routes/responses.js`: pengecekan periode aktif di `POST /responses/start`
    - Setelah memverifikasi survei aktif, tambahkan pengecekan periode:
    - Jika `survey.end_date` terisi dan `end_date <= now`, kembalikan HTTP 409 dengan pesan `"Survei sudah berakhir"`
    - Jika `survey.start_date` terisi dan `start_date > now`, kembalikan HTTP 409 dengan pesan `"Survei belum dimulai"`
    - Jika dalam periode aktif atau tanpa batasan waktu, lanjutkan proses pembuatan sesi
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.7 Tambahkan unit test untuk validasi tanggal dan penyimpanan di `backend/tests/unit/surveys.test.js`
    - Tambahkan describe block `"survey deadline"` dengan test cases:
    - Test: POST /surveys dengan `start_date` dan `end_date` valid → 201, kedua field tersimpan
    - Test: POST /surveys dengan `end_date <= start_date` → 422, error "Tanggal berakhir harus lebih besar dari tanggal mulai"
    - Test: POST /surveys tanpa `start_date` dan `end_date` → 201, kedua field null
    - Test: POST /surveys dengan hanya `start_date` → 201
    - Test: POST /surveys dengan hanya `end_date` → 201
    - Test: PUT /surveys/:id update `start_date` dan `end_date` → 200, field diperbarui
    - Test: PUT /surveys/:id dengan `end_date <= start_date` → 422
    - Test: GET /surveys sebagai surveyor → hanya survei dalam periode aktif
    - Test: GET /surveys sebagai admin → semua survei termasuk expired dan belum dimulai
    - Test: GET /surveys/:id → response mengandung `start_date`, `end_date`, `is_expired`
    - Test: GET /surveys/:id dengan `end_date` di masa lalu → `is_expired: true`
    - Test: GET /surveys/:id dengan `end_date` di masa depan → `is_expired: false`
    - Test: GET /surveys/:id tanpa `end_date` → `is_expired: false`
    - _Requirements: 2.1-2.5, 4.1-4.3, 5.1-5.3, 6.1-6.4_

  - [x] 2.8 Tambahkan unit test untuk pengecekan periode di `backend/tests/unit/responses.test.js`
    - Tambahkan describe block `"survey deadline enforcement"` dengan test cases:
    - Test: POST /responses/start untuk survei dengan `end_date` di masa lalu → 409 "Survei sudah berakhir"
    - Test: POST /responses/start untuk survei dengan `start_date` di masa depan → 409 "Survei belum dimulai"
    - Test: POST /responses/start untuk survei dalam periode aktif → 201
    - Test: POST /responses/start untuk survei tanpa `start_date`/`end_date` → 201
    - Test: POST /responses/start untuk survei aktif tapi expired → 409 (periode lebih prioritas)
    - _Requirements: 3.1-3.5_

  - [x] 2.9 Tambahkan unit test untuk clone reset tanggal di `backend/tests/unit/surveys.test.js`
    - Tambahkan test case di describe block `"POST /surveys/:id/clone"`:
    - Test: Clone survei dengan `start_date` dan `end_date` → survei baru memiliki keduanya null
    - _Requirements: 10.1_

- [x] 3. Checkpoint — Pastikan semua unit test backend lulus
  - Jalankan `npm test` di direktori `backend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 4. Buat property-based tests backend di `backend/tests/properties/surveyDeadline.property.test.js`
  - [ ]* 4.1 Tulis property test untuk Property 1: Validasi konsistensi tanggal
    - Generate random `(start_date, end_date)` pairs termasuk null menggunakan `fc.option(fc.date())` untuk kedua field
    - Verifikasi `validateSurveyDates` mengembalikan `valid: true` jika keduanya null, hanya salah satu terisi, atau `end_date > start_date`
    - Verifikasi `valid: false` jika keduanya terisi dan `end_date <= start_date`
    - Annotasi: `// Feature: survey-deadline, Property 1: Validasi konsistensi tanggal`
    - `numRuns: 100`
    - **Property 1: Validasi konsistensi tanggal**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [ ]* 4.2 Tulis property test untuk Property 4: Komputasi is_expired
    - Generate random `end_date` (past/future/null) menggunakan `fc.option(fc.date())`
    - Verifikasi `is_expired` bernilai `true` jika dan hanya jika `end_date` terisi dan `end_date < now`
    - Verifikasi `is_expired` bernilai `false` jika `end_date` null
    - Annotasi: `// Feature: survey-deadline, Property 4: Komputasi is_expired`
    - `numRuns: 100`
    - **Property 4: Komputasi is_expired**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 4.3 Tulis property test untuk Property 5: Klasifikasi badge temporal
    - Generate random `(start_date, end_date)` pairs menggunakan `fc.option(fc.date())`
    - Verifikasi klasifikasi badge: `start_date` di masa depan → "Akan Datang", `end_date` di masa lalu → "Berakhir", selain itu → "Aktif"
    - Annotasi: `// Feature: survey-deadline, Property 5: Klasifikasi badge temporal`
    - `numRuns: 100`
    - **Property 5: Klasifikasi badge temporal**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [ ]* 4.4 Tulis property test untuk Property 6: Status temporal surveyor (canStart dan label)
    - Generate random `(start_date, end_date)` pairs menggunakan `fc.option(fc.date())`
    - Verifikasi `getSurveyTemporalStatus` mengembalikan `canStart: false` jika expired atau belum dimulai, `canStart: true` jika dalam periode aktif
    - Verifikasi label sesuai: "Berakhir", "Dimulai dalam X hari", "Sisa X hari", atau null
    - Annotasi: `// Feature: survey-deadline, Property 6: Status temporal surveyor`
    - `numRuns: 100`
    - **Property 6: Status temporal surveyor (canStart dan label)**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

  - [ ]* 4.5 Tulis property test untuk Property 7: Clone selalu mereset tanggal
    - Generate random survei dengan berbagai `(start_date, end_date)` termasuk null
    - Clone survei dan verifikasi hasil selalu memiliki `start_date = null` dan `end_date = null`
    - Annotasi: `// Feature: survey-deadline, Property 7: Clone selalu mereset tanggal`
    - `numRuns: 100`
    - **Property 7: Clone selalu mereset tanggal**
    - **Validates: Requirements 10.1**

- [x] 5. Update frontend: Date Picker di Survey Builder
  - [x] 5.1 Tambahkan komponen `DatePickerSection` dan logika simpan tanggal di `frontend/src/pages/SurveyBuilder.jsx`
    - Buat komponen `DatePickerSection` dengan props: `startDate`, `endDate`, `onStartDateChange`, `onEndDateChange`, `dateError`
    - Render dua input `type="datetime-local"` berlabel "Tanggal Mulai" dan "Tanggal Berakhir"
    - Tampilkan pesan error jika `end_date <= start_date`: "Tanggal berakhir harus setelah tanggal mulai"
    - Tampilkan teks bantuan: "Kosongkan untuk survei tanpa batasan waktu."
    - Di komponen `SurveyBuilder`, tambahkan state `startDate`, `endDate`, `dateError`
    - Inisialisasi dari `survey.start_date` dan `survey.end_date` saat data survei dimuat
    - Tambahkan tombol "Simpan Periode" atau auto-save yang memanggil `PUT /surveys/:id` dengan `start_date` dan `end_date`
    - Validasi frontend: jika keduanya terisi dan `end_date <= start_date`, tampilkan error dan cegah pengiriman
    - Render `<DatePickerSection>` di bawah header survei (setelah deskripsi)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 5.2 Tambahkan unit test untuk date picker di `frontend/src/pages/__tests__/SurveyBuilder.test.jsx`
    - Test: Date picker section menampilkan dua input tanggal dengan label "Tanggal Mulai" dan "Tanggal Berakhir"
    - Test: Mengisi kedua tanggal dan submit → payload mengandung `start_date` dan `end_date` dalam ISO 8601
    - Test: Mengosongkan tanggal → payload mengandung null
    - Test: Survei yang sudah ada menampilkan nilai tersimpan di date picker
    - Test: `end_date <= start_date` → pesan error "Tanggal berakhir harus setelah tanggal mulai" ditampilkan, submit dicegah
    - _Requirements: 7.1-7.5_

- [x] 6. Update frontend: Badge Status Temporal di Surveys.jsx
  - [x] 6.1 Tambahkan komponen `TemporalBadge` dan integrasikan di `frontend/src/pages/Surveys.jsx`
    - Buat komponen `TemporalBadge` dengan props: `startDate`, `endDate`
    - Logika klasifikasi: jika `startDate` di masa depan → badge biru "Akan Datang", jika `endDate` di masa lalu → badge merah "Berakhir", selain itu → badge hijau "Aktif"
    - Gunakan class Tailwind: `bg-blue-100 text-blue-700` (Akan Datang), `bg-green-100 text-green-700` (Aktif), `bg-red-100 text-red-700` (Berakhir)
    - Tempatkan `<TemporalBadge>` di samping `<SurveyStatusBadge>` yang sudah ada di kolom Status, tanpa menggantikannya
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 6.2 Tambahkan unit test untuk temporal badge di `frontend/src/pages/__tests__/Surveys.test.jsx`
    - Test: Temporal badge "Akan Datang" ditampilkan untuk survei dengan `start_date` di masa depan
    - Test: Temporal badge "Aktif" ditampilkan untuk survei dalam periode aktif
    - Test: Temporal badge "Berakhir" ditampilkan untuk survei dengan `end_date` di masa lalu
    - Test: Temporal badge "Aktif" ditampilkan untuk survei tanpa tanggal (keduanya null)
    - Test: Temporal badge ditampilkan di samping badge status yang sudah ada
    - _Requirements: 8.1-8.5_

- [x] 7. Update frontend: Sisa Hari dan Pemblokiran Tombol di SurveyList.jsx
  - [x] 7.1 Tambahkan fungsi helper dan update tampilan di `frontend/src/surveyor/pages/SurveyList.jsx`
    - Tambahkan fungsi `daysUntil(dateStr)` yang menghitung selisih hari antara tanggal target dan waktu saat ini (dibulatkan ke bawah)
    - Tambahkan fungsi `getSurveyTemporalStatus(startDate, endDate)` yang mengembalikan `{ canStart, label, isUrgent }`
    - Logika: expired → `{ canStart: false, label: 'Berakhir', isUrgent: true }`, belum dimulai → `{ canStart: false, label: 'Dimulai dalam X hari', isUrgent: false }`, aktif dengan deadline → `{ canStart: true, label: 'Sisa X hari', isUrgent: days < 3 }`, tanpa deadline → `{ canStart: true, label: null, isUrgent: false }`
    - Tampilkan `temporal.label` di bawah judul survei dengan warna merah jika `isUrgent`
    - Disable tombol "Mulai Isi" jika `!temporal.canStart`, ubah tampilan menjadi abu-abu (`bg-gray-200 text-gray-400 cursor-not-allowed`)
    - Ekspor `daysUntil` dan `getSurveyTemporalStatus` untuk testing
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 7.2 Tambahkan unit test untuk sisa hari dan pemblokiran di `frontend/src/surveyor/pages/__tests__/SurveyList.test.jsx`
    - Test: "Sisa X hari" ditampilkan untuk survei dengan `end_date` di masa depan
    - Test: Teks sisa hari berwarna merah jika kurang dari 3 hari
    - Test: "Berakhir" ditampilkan dan tombol disabled untuk survei expired
    - Test: "Dimulai dalam X hari" ditampilkan dan tombol disabled untuk survei belum dimulai
    - Test: Tidak ada informasi sisa hari untuk survei tanpa `end_date`
    - Test: Tombol disabled memiliki atribut `disabled` dan tampilan abu-abu
    - _Requirements: 9.1-9.6_

- [x] 8. Checkpoint — Pastikan semua unit test frontend lulus
  - Jalankan `npx vitest run` di direktori `frontend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 9. Update `CreateSurveyModal` di `Surveys.jsx` untuk mendukung `start_date` dan `end_date`
  - Tambahkan state `startDate` dan `endDate` di `CreateSurveyModal`
  - Tambahkan dua input `type="datetime-local"` berlabel "Tanggal Mulai" dan "Tanggal Berakhir" di form modal
  - Validasi frontend: jika keduanya terisi dan `end_date <= start_date`, tampilkan error dan cegah submit
  - Sertakan `start_date` dan `end_date` dalam payload `POST /surveys`
  - _Requirements: 6.1, 7.1, 7.2, 7.3, 7.5_

- [x] 10. Final checkpoint — Pastikan semua tests lulus
  - Jalankan seluruh test suite backend: `npm test` di direktori `backend`
  - Jalankan seluruh test suite frontend: `npx vitest run` di direktori `frontend`
  - Pastikan tidak ada regresi pada test yang sudah ada

## Notes

- Fungsi `validateSurveyDates` diekspor dari `surveys.js` agar dapat diuji secara terisolasi di property-based tests
- Fungsi `daysUntil` dan `getSurveyTemporalStatus` diekspor dari `SurveyList.jsx` agar dapat diuji di property-based tests
- Kolom `start_date` dan `end_date` bertipe `TIMESTAMPTZ` di PostgreSQL, direpresentasikan sebagai `DataTypes.DATE` di Sequelize
- Kedua kolom nullable dengan default null — survei tanpa batasan waktu tidak perlu mengisi tanggal
- Pengecekan periode di `POST /responses/start` lebih prioritas daripada status survei (survei aktif tapi expired tetap ditolak)
- Filter surveyor di `GET /surveys` menggunakan `Op.and` dan `Op.or` untuk menangani kombinasi null dan non-null
- Badge temporal di `Surveys.jsx` ditampilkan di samping badge status existing, bukan menggantikannya
- Clone survei selalu mereset `start_date` dan `end_date` ke null
- Urutan task: migration (1) → backend model+validasi+filter (2) → backend tests (3) → property tests (4) → frontend builder (5) → frontend surveys (6) → frontend surveyor list (7) → frontend tests (8) → create modal (9) → final tests (10)
- Setiap task mereferensikan requirements spesifik untuk traceability
- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests validate universal correctness properties from the design document
