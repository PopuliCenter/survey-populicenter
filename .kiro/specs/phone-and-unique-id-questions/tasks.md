# Implementation Plan: Phone Number dan Unique ID Question Types

## Overview

Implementasi dua tipe pertanyaan baru `phone_number` dan `unique_id`. Mencakup satu migration database untuk memperbarui CHECK constraint, update validasi backend di `questions.js` dan model `Question.js`, validasi jawaban di `responses.js` termasuk endpoint baru `check-unique`, komponen konfigurasi di `SurveyBuilder.jsx`, komponen input `PhoneNumberField` dan `UniqueIdField` di `SurveyForm.jsx`, dan tampilan di `ResponseDetail.jsx`.

## Tasks

- [x] 1. Buat migration database untuk menambahkan `phone_number` dan `unique_id` ke CHECK constraint
  - Buat file `backend/src/migrations/20240104000001-add-phone-and-unique-id-types.js`
  - Fungsi `up`: dalam satu transaksi, hapus constraint `questions_type_check` lama, lalu buat constraint baru yang mencakup semua tipe lama ditambah `'phone_number'` dan `'unique_id'`
  - Fungsi `down`: dalam satu transaksi, hapus baris dengan `type IN ('phone_number', 'unique_id')`, hapus constraint baru, lalu kembalikan constraint lama tanpa `phone_number` dan `unique_id`
  - Gunakan pola yang sama dengan `backend/src/migrations/20240103000001-add-rating-scale-type.js`
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Update model dan validasi backend
  - [x] 2.1 Update `backend/src/models/Question.js`: tambahkan `'phone_number'` dan `'unique_id'` ke array `QUESTION_TYPES`
    - _Requirements: 2.1, 3.1_

  - [x] 2.2 Update `backend/src/routes/questions.js`: tambahkan validasi phone_number dan unique_id
    - Tambahkan `'phone_number'` dan `'unique_id'` ke array `VALID_QUESTION_TYPES`
    - Tambahkan fungsi helper `validatePhoneConfig(options)` yang memvalidasi: `options` tidak null, `min_length` dan `max_length` adalah integer, `min_length >= 1`, `max_length >= min_length`
    - Tambahkan fungsi helper `validateUniqueIdConfig(options)` yang memvalidasi: jika `options` disertakan dan memiliki `min_length`/`max_length`, keduanya harus integer, `min_length >= 1`, `max_length >= min_length`; jika `options` null/tidak ada, terima (opsional)
    - Di handler POST: jika `type === 'phone_number'` panggil `validatePhoneConfig(options)`, jika `type === 'unique_id'` panggil `validateUniqueIdConfig(options)`, kembalikan 422 jika tidak valid
    - Di handler PUT: validasi serupa dengan mempertimbangkan tipe efektif dan options efektif
    - Ekspor `validatePhoneConfig` dan `validateUniqueIdConfig` untuk testing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4_

  - [x] 2.3 Update `backend/src/routes/responses.js`: tambahkan validasi jawaban dan endpoint check-unique
    - Di handler `POST /responses/submit`, setelah validasi pertanyaan wajib:
      - Fetch semua pertanyaan survei dengan config (`type`, `options`)
      - Untuk jawaban `phone_number`: validasi hanya digit (`/^\d+$/`), validasi panjang sesuai `options.min_length` dan `options.max_length`
      - Untuk jawaban `unique_id`: validasi hanya digit, validasi panjang (jika config ada), cek duplikat di tabel `answers` untuk `question_id` yang sama dalam survei yang sama
    - Tambahkan endpoint baru `POST /responses/check-unique`:
      - Menerima `{ survey_id, question_id, value }`
      - Cek apakah `answer_value` sudah ada di `answers` untuk `question_id` tersebut dalam survei yang sama
      - Kembalikan `{ available: boolean }`
      - Requires: `authMiddleware` + `requireRole('surveyor')`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

  - [x] 2.4 Tambahkan unit test untuk validasi phone_number dan unique_id di `backend/tests/unit/questions.test.js`
    - Tambahkan describe block `"phone_number question type"` dengan test cases:
    - Test: POST dengan tipe `phone_number` dan options `{ min_length: 10, max_length: 13 }` -> 201
    - Test: POST dengan `max_length < min_length` (misalnya min_length=13, max_length=10) -> 422, error "Panjang maksimum harus lebih besar atau sama dengan panjang minimum"
    - Test: POST dengan `min_length < 1` (misalnya min_length=0) -> 422, error "Panjang minimum harus minimal 1"
    - Test: POST dengan `min_length` bukan integer (misalnya "abc") -> 422, error "Panjang minimum dan maksimum harus berupa bilangan bulat"
    - Test: POST tanpa `options` untuk `phone_number` -> 422, error "Konfigurasi panjang (options) wajib diisi untuk tipe phone_number"
    - Tambahkan describe block `"unique_id question type"` dengan test cases:
    - Test: POST dengan tipe `unique_id` dan options `{ min_length: 1, max_length: 20 }` -> 201
    - Test: POST dengan tipe `unique_id` tanpa options -> 201 (options opsional)
    - Test: POST dengan `max_length < min_length` -> 422
    - _Requirements: 2.1-2.6, 3.1-3.4_

  - [x] 2.5 Tambahkan unit test untuk validasi jawaban di `backend/tests/unit/responses.test.js`
    - Tambahkan describe block `"phone_number answer validation"`:
    - Test: Submit jawaban phone_number dengan angka valid (panjang dalam rentang) -> 201
    - Test: Submit jawaban phone_number dengan karakter non-digit -> 422, error "Nomor telepon hanya boleh berisi angka"
    - Test: Submit jawaban phone_number dengan panjang kurang dari min_length -> 422
    - Test: Submit jawaban phone_number dengan panjang lebih dari max_length -> 422
    - Tambahkan describe block `"unique_id answer validation"`:
    - Test: Submit jawaban unique_id dengan angka valid -> 201
    - Test: Submit jawaban unique_id dengan karakter non-digit -> 422, error "Nomor kuesioner hanya boleh berisi angka"
    - Test: Submit jawaban unique_id duplikat dalam survei yang sama -> 422, error "Nomor kuesioner sudah digunakan dalam survei ini"
    - Test: Submit jawaban unique_id yang sama di survei berbeda -> 201
    - Tambahkan describe block `"POST /responses/check-unique"`:
    - Test: Cek nilai yang belum ada -> `{ available: true }`
    - Test: Cek nilai yang sudah ada -> `{ available: false }`
    - Test: Tanpa parameter lengkap -> 422
    - _Requirements: 4.1-4.4, 5.1-5.5, 6.1-6.4_

- [x] 3. Checkpoint — Pastikan semua unit test backend lulus
  - Jalankan `npm test -- --testPathPattern="questions|responses"` di direktori `backend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 4. Buat property-based tests backend di `backend/tests/properties/phoneAndUniqueId.property.test.js`
  - [x] 4.1 Tulis property test untuk Property 1: Nomor telepon valid selalu diterima oleh validatePhoneConfig
    - Gunakan `fc.integer({ min: 1, max: 20 })` untuk `min_length`, `fc.integer({ min: 1, max: 20 }).filter(v => v >= min_length)` untuk `max_length`
    - Assert: `validatePhoneConfig({ min_length, max_length }).valid === true` untuk semua kombinasi valid
    - Annotasi: `// Feature: phone-and-unique-id-questions, Property 1: Konfigurasi phone valid selalu diterima`
    - `numRuns: 100`
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [x] 4.2 Tulis property test untuk Property 3: Konfigurasi dengan max_length < min_length selalu ditolak
    - Gunakan `fc.integer({ min: 2, max: 20 })` untuk `min_length`, `fc.integer({ min: 1, max: 19 }).filter(v => v < min_length)` untuk `max_length`
    - Assert: `validatePhoneConfig({ min_length, max_length }).valid === false` untuk semua kombinasi
    - Annotasi: `// Feature: phone-and-unique-id-questions, Property 3: Konfigurasi dengan max < min selalu ditolak`
    - `numRuns: 100`
    - _Requirements: 2.4, 3.4_

  - [x] 4.3 Tulis property test untuk Property 4: Input non-angka selalu ditolak
    - Gunakan `fc.string().filter(s => s.length > 0 && !/^\d+$/.test(s))` untuk generate string non-digit
    - Validasi bahwa regex `/^\d+$/` mengembalikan false untuk semua string tersebut
    - Annotasi: `// Feature: phone-and-unique-id-questions, Property 4: Input non-angka selalu ditolak`
    - `numRuns: 100`
    - _Requirements: 4.2, 5.2_

- [x] 5. Tambah komponen config editors dan update `SurveyBuilder.jsx`
  - Tambahkan `{ value: 'phone_number', label: 'Nomor Telepon' }` dan `{ value: 'unique_id', label: 'Nomor Kuesioner (Unik)' }` ke array `QUESTION_TYPES`
  - Tambahkan komponen `PhoneConfigEditor` baru:
    - Props: `config` (objek dengan min_length, max_length) dan `onChange` (callback)
    - Render: input angka untuk min_length (default 10), input angka untuk max_length (default 13)
    - Gunakan background `bg-green-50 border-green-200`
    - Tampilkan teks bantuan "Menerima nomor telepon {min}-{max} digit (angka saja, tanpa +62)"
  - Tambahkan komponen `UniqueIdConfigEditor` baru:
    - Props: `config` (objek dengan min_length, max_length) dan `onChange` (callback)
    - Render: input angka untuk min_length (default 1), input angka untuk max_length (default 20)
    - Gunakan background `bg-purple-50 border-purple-200`
    - Tampilkan teks bantuan "Nomor kuesioner manual {min}-{max} digit (angka saja, unik per survei)"
  - Di `QuestionFormModal`:
    - Tambahkan state `phoneConfig` dan `uniqueIdConfig` dengan default masing-masing
    - Inisialisasi dari `initial.options` jika tipe sesuai
    - Di `handleTypeChange`: reset config ke default jika tipe berubah
    - Di `handleSubmit`: sertakan `options` yang sesuai dalam payload berdasarkan tipe
    - Render `<PhoneConfigEditor>` jika `type === 'phone_number'` dan `<UniqueIdConfigEditor>` jika `type === 'unique_id'`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 5.1 Tambahkan unit test untuk config editors di `frontend/src/pages/__tests__/SurveyBuilder.test.jsx`
    - Test: dropdown tipe menampilkan opsi "Nomor Telepon" dan "Nomor Kuesioner (Unik)"
    - Test: memilih "Nomor Telepon" menampilkan section konfigurasi phone (input min_length, max_length)
    - Test: memilih "Nomor Kuesioner (Unik)" menampilkan section konfigurasi unique_id
    - Test: mengubah tipe menyembunyikan editor yang tidak relevan
    - Test: saat submit dengan tipe `phone_number`, payload menyertakan `options: { min_length: 10, max_length: 13 }`
    - Test: saat submit dengan tipe `unique_id`, payload menyertakan `options: { min_length: 1, max_length: 20 }`
    - Test: saat edit pertanyaan phone_number yang sudah ada, nilai konfigurasi tersimpan ditampilkan
    - _Requirements: 7.1-7.5, 8.1-8.5_

- [x] 6. Tambah komponen `PhoneNumberField` dan `UniqueIdField` di `SurveyForm.jsx`
  - Tambahkan komponen `PhoneNumberField`:
    - Props: `question`, `answer`, `onChange`, `hasError`
    - Render input `type="tel"` dengan `inputMode="numeric"`
    - Filter karakter non-digit di onChange: `e.target.value.replace(/\D/g, '')`
    - Tampilkan pesan bantuan jika panjang di luar rentang [min_length, max_length]
    - Terapkan border merah jika `hasError`
    - Placeholder: "Masukkan nomor telepon"
  - Tambahkan komponen `UniqueIdField`:
    - Props: `question`, `answer`, `onChange`, `hasError`, `surveyId`
    - Render input dengan `inputMode="numeric"`
    - Filter karakter non-digit di onChange
    - Debounce 500ms: panggil `POST /responses/check-unique` untuk cek ketersediaan
    - Tampilkan indikator: "Memeriksa..." (gray), "Nomor tersedia" (green), "Nomor sudah digunakan" (red)
    - Terapkan border merah jika `hasError` atau nomor sudah digunakan
    - Placeholder: "Masukkan nomor kuesioner"
  - Di komponen `QuestionField`, tambahkan case `'phone_number'` dan `'unique_id'`
  - Pastikan `surveyId` diteruskan dari `SurveyForm` ke `QuestionField` ke `UniqueIdField`
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 6.1 Tambahkan unit test untuk PhoneNumberField dan UniqueIdField di `frontend/src/surveyor/pages/__tests__/SurveyForm.test.jsx`
    - Test: PhoneNumberField merender input type=tel
    - Test: input non-digit difilter (ketik "abc123" -> hanya "123" yang muncul)
    - Test: pesan panjang ditampilkan jika di luar rentang
    - Test: pertanyaan phone_number required tanpa nilai menampilkan border merah
    - Test: UniqueIdField merender input dengan placeholder "Masukkan nomor kuesioner"
    - Test: input non-digit difilter di UniqueIdField
    - Test: indikator ketersediaan ditampilkan setelah debounce (mock API)
    - _Requirements: 9.1-9.5, 10.1-10.7_

- [x] 7. Checkpoint — Pastikan semua unit test frontend lulus
  - Jalankan `npx vitest run` di direktori `frontend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 8. Update `ResponseDetail.jsx` untuk menampilkan phone_number dan unique_id
  - Tambahkan `phone_number: 'Nomor Telepon'` dan `unique_id: 'Nomor Kuesioner (Unik)'` ke objek `typeLabel` di komponen `AnswerCard`
  - Tidak perlu case khusus di `renderValue` — kedua tipe menggunakan `answer_value` sebagai teks yang sudah ditangani oleh default case
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 8.1 Tambahkan unit test untuk tampilan di `frontend/src/pages/__tests__/ResponseDetail.test.jsx`
    - Test: badge tipe menampilkan "Nomor Telepon" untuk phone_number
    - Test: badge tipe menampilkan "Nomor Kuesioner (Unik)" untuk unique_id
    - Test: nilai answer_value ditampilkan sebagai teks angka
    - Test: answer_value kosong menampilkan em dash
    - _Requirements: 11.1-11.5_

- [x] 9. Buat property-based tests frontend di `frontend/src/surveyor/pages/__tests__/PhoneAndUniqueId.property.test.jsx`
  - [x] 9.1 Tulis property test: PhoneNumberField hanya meneruskan digit ke onChange
    - Gunakan `fc.string()` untuk generate input string acak
    - Render `<PhoneNumberField>` dan simulasi input
    - Assert: nilai yang diteruskan ke `onChange` hanya berisi digit (atau kosong)
    - Annotasi: `// Feature: phone-and-unique-id-questions, Property Frontend: Filter non-digit`
    - `numRuns: 100`
    - _Requirements: 9.1, 9.2_

- [x] 10. Final checkpoint — Pastikan semua tests lulus
  - Jalankan seluruh test suite backend: `npm test` di direktori `backend`
  - Jalankan seluruh test suite frontend: `npx vitest run` di direktori `frontend`
  - Pastikan tidak ada regresi pada test yang sudah ada

## Notes

- Fungsi `validatePhoneConfig` dan `validateUniqueIdConfig` diekspor dari `questions.js` agar dapat diuji secara terisolasi di property-based tests
- Untuk validasi duplikat `unique_id` di `responses.js`, query ke tabel `answers` harus join dengan `responses` untuk memfilter berdasarkan `survey_id`
- Komponen `UniqueIdField` memerlukan `surveyId` sebagai prop — pastikan diteruskan dari `SurveyForm` melalui `QuestionField`
- Debounce pada `UniqueIdField` menggunakan `setTimeout` 500ms dengan cleanup di `useEffect` return
- Kedua komponen input menggunakan `inputMode="numeric"` untuk menampilkan keyboard angka di perangkat mobile
- Nilai `answer_value` yang dikirim ke backend adalah string angka (misalnya `"08123456789"`), bukan integer
- Untuk `ResponseDetail`, tidak perlu case khusus karena default rendering `answer_value` sebagai teks sudah cukup
- Urutan task: migration (1) -> backend model+validasi (2) -> backend tests (3,4) -> frontend builder (5) -> frontend form (6) -> frontend tests (7) -> response detail (8) -> property tests frontend (9) -> final tests (10)
- Setiap task mereferensikan requirements spesifik untuk traceability
- Pola validasi mengikuti `validateRatingConfig` yang sudah ada di `questions.js`
- Endpoint `POST /responses/check-unique` ditempatkan sebelum route `/:id` di `responses.js` untuk menghindari konflik routing