# Implementation Plan: Rating Scale Question

## Overview

Implementasi tipe pertanyaan baru `rating_scale`. Mencakup satu migration database untuk memperbarui CHECK constraint, update validasi backend di `questions.js` dan model `Question.js`, update ekspor di `exportWorker.js`, komponen konfigurasi `RatingConfigEditor` di `SurveyBuilder.jsx`, komponen input `RatingScaleField` di `SurveyForm.jsx`, dan tampilan visual di `ResponseDetail.jsx`.

## Tasks

- [x] 1. Buat migration database untuk menambahkan `rating_scale` ke CHECK constraint
  - Buat file `backend/src/migrations/20240103000001-add-rating-scale-type.js`
  - Fungsi `up`: dalam satu transaksi, hapus constraint `questions_type_check` lama, lalu buat constraint baru yang mencakup semua tipe lama ditambah `'rating_scale'`
  - Fungsi `down`: dalam satu transaksi, hapus baris dengan `type = 'rating_scale'` (untuk mencegah constraint violation), hapus constraint baru, lalu kembalikan constraint lama tanpa `rating_scale`
  - Gunakan pola yang sama dengan `backend/src/migrations/20240102000001-update-role-constraint.js`
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Update model dan validasi backend
  - [x] 2.1 Update `backend/src/models/Question.js`: tambahkan `'rating_scale'` ke array `QUESTION_TYPES`
    - _Requirements: 2.1_

  - [x] 2.2 Update `backend/src/routes/questions.js`: tambahkan validasi rating scale
    - Tambahkan `'rating_scale'` ke array `VALID_QUESTION_TYPES`
    - Tambahkan fungsi helper `validateRatingConfig(options)` yang memvalidasi: `options` tidak null, `min` dan `max` adalah integer, `min >= 1`, `max <= 10`, `max > min`, `display` adalah `'stars'` atau `'numbers'`
    - Di handler POST `/surveys/:surveyId/questions`: setelah validasi tipe, jika `type === 'rating_scale'` panggil `validateRatingConfig(options)` dan kembalikan 422 jika tidak valid
    - Di handler PUT `/surveys/:surveyId/questions/:qid`: setelah validasi tipe, jika tipe efektif adalah `rating_scale` (baik dari body maupun dari pertanyaan yang ada), panggil `validateRatingConfig` dengan options efektif
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 2.3 Tambahkan unit test untuk validasi rating scale di `backend/tests/unit/questions.test.js`
    - Tambahkan describe block `"rating_scale question type"` dengan test cases:
    - Test: POST dengan tipe `rating_scale` dan options `{ min: 1, max: 5, display: 'stars' }` → 201
    - Test: POST dengan `max <= min` (misalnya min=5, max=3) → 422, error "Nilai max harus lebih besar dari min"
    - Test: POST dengan `min < 1` (misalnya min=0) → 422, error "Nilai min harus minimal 1"
    - Test: POST dengan `max > 10` (misalnya max=11) → 422, error "Nilai max tidak boleh lebih dari 10"
    - Test: POST dengan `display: 'emoji'` → 422, error "Display harus 'stars' atau 'numbers'"
    - Test: POST tanpa `options` untuk `rating_scale` → 422, error "Konfigurasi rating (options) wajib diisi untuk tipe rating_scale"
    - Test: POST dengan `options.labels` opsional `{ min: 'Buruk', max: 'Bagus' }` → 201, labels tersimpan di JSONB
    - Test: POST dengan `display: 'numbers'` dan min=1, max=10 → 201
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 3. Checkpoint — Pastikan semua unit test backend lulus
  - Jalankan `npm test -- --testPathPattern=questions.test.js` di direktori `backend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 4. Buat property-based tests backend di `backend/tests/properties/ratingScale.property.test.js`
  - [x] 4.1 Tulis property test untuk Property 2: Konfigurasi dengan max ≤ min selalu ditolak
    - Gunakan `fc.integer({ min: 1, max: 10 })` untuk generate `min`, lalu `fc.integer({ min: 1, max: 10 }).filter(v => v <= min)` untuk generate `max` yang tidak valid
    - Assert: `validateRatingConfig({ min, max, display: 'stars' }).valid === false` untuk semua kombinasi
    - Annotasi: `// Feature: rating-scale-question, Property 2: Konfigurasi dengan max <= min selalu ditolak`
    - `numRuns: 100`
    - _Requirements: 2.3_

  - [x] 4.2 Tulis property test untuk Property 3: Konfigurasi valid selalu diterima
    - Gunakan `fc.integer({ min: 1, max: 9 })` untuk `min`, `fc.integer({ min: 2, max: 10 }).filter(v => v > min)` untuk `max`, `fc.constantFrom('stars', 'numbers')` untuk `display`
    - Assert: `validateRatingConfig({ min, max, display }).valid === true` untuk semua kombinasi valid
    - Annotasi: `// Feature: rating-scale-question, Property 3: Konfigurasi valid selalu diterima`
    - `numRuns: 100`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 4.3 Tulis property test untuk Property 1: Nilai di luar rentang selalu ditolak (via HTTP)
    - Gunakan `fc.integer({ min: 1, max: 9 })` untuk `min`, `fc.integer({ min: 2, max: 10 }).filter(v => v > min)` untuk `max`
    - Generate nilai di luar rentang: `fc.oneof(fc.integer({ max: min - 1 }), fc.integer({ min: max + 1 }))`
    - Setup: buat pertanyaan `rating_scale` dengan konfigurasi tersebut, lalu coba submit jawaban dengan nilai di luar rentang
    - Assert: response status 422
    - Annotasi: `// Feature: rating-scale-question, Property 1: Nilai rating di luar rentang selalu ditolak`
    - `numRuns: 50` (karena melibatkan HTTP call)
    - _Requirements: 3.2_

- [x] 5. Tambah komponen `RatingConfigEditor` dan update `SurveyBuilder.jsx`
  - Tambahkan `{ value: 'rating_scale', label: 'Rating Scale' }` ke array `QUESTION_TYPES` di `SurveyBuilder.jsx`
  - Tambahkan komponen `RatingConfigEditor` baru sebelum `QuestionFormModal`:
    - Props: `config` (objek dengan min, max, display, labels) dan `onChange` (callback)
    - Render: input angka untuk min (default 1, range 1-9), input angka untuk max (default 5, range 2-10), select untuk display ("Bintang (Stars)" / "Angka (Numbers)"), input teks opsional untuk labels.min dan labels.max
    - Tampilkan preview teks "Skala: {min} – {max} ({count} nilai)"
    - Gunakan background `bg-amber-50 border-amber-200` untuk membedakan dari section lain
  - Di `QuestionFormModal`:
    - Tambahkan state `ratingConfig` dengan default `{ min: 1, max: 5, display: 'stars', labels: {} }`
    - Inisialisasi dari `initial.options` jika `initial.type === 'rating_scale'`
    - Di `handleTypeChange`: reset `ratingConfig` ke default jika tipe bukan `rating_scale`
    - Di `handleSubmit`: sertakan `options: ratingConfig` dalam payload jika `type === 'rating_scale'`; jangan sertakan `options` rating jika tipe bukan `rating_scale`
    - Render `<RatingConfigEditor config={ratingConfig} onChange={setRatingConfig} />` setelah type selector, hanya jika `type === 'rating_scale'`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.1 Tambahkan unit test untuk `RatingConfigEditor` di `frontend/src/pages/__tests__/SurveyBuilder.test.jsx`
    - Test: dropdown tipe menampilkan opsi "Rating Scale"
    - Test: memilih "Rating Scale" menampilkan section konfigurasi rating (input min, max, select display)
    - Test: mengubah tipe dari "Rating Scale" ke "Teks Pendek" menyembunyikan section konfigurasi
    - Test: nilai default yang ditampilkan: min=1, max=5, display=stars
    - Test: saat submit dengan tipe `rating_scale`, payload yang dikirim ke `api.post` menyertakan `options: { min: 1, max: 5, display: 'stars', labels: {} }`
    - Test: saat edit pertanyaan `rating_scale` yang sudah ada, nilai konfigurasi tersimpan ditampilkan sebagai nilai awal
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 6. Tambah komponen `RatingScaleField` dan update `SurveyForm.jsx`
  - Tambahkan komponen `RatingScaleField` baru sebelum `QuestionField` di `SurveyForm.jsx`:
    - Props: `question`, `answer`, `onChange`, `hasError`
    - Baca konfigurasi dari `question.options` dengan fallback ke `{ min: 1, max: 5, display: 'stars', labels: {} }`
    - Mode `stars`: render tombol bintang (★) dari min hingga max; bintang 1 s/d nilai terpilih berwarna `text-amber-400`, sisanya `text-gray-300`; klik memanggil `onChange(String(val))`
    - Mode `numbers`: render tombol angka dari min hingga max; tombol terpilih `bg-blue-600 text-white`, lainnya `bg-gray-100 text-gray-700`; klik memanggil `onChange(String(val))`
    - Tampilkan labels.min dan labels.max jika tersedia
    - Terapkan border merah dan background merah jika `hasError`
    - Semua tombol harus memiliki `aria-label` dan `aria-pressed` yang sesuai
  - Di komponen `QuestionField`, tambahkan case `'rating_scale'` dalam switch yang merender `<RatingScaleField />`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 6.1 Tambahkan unit test untuk `RatingScaleField` di `frontend/src/surveyor/pages/__tests__/SurveyForm.test.jsx`
    - Test: mode `stars` dengan max=5 merender 5 elemen bintang
    - Test: mode `numbers` dengan min=1, max=10 merender 10 tombol angka
    - Test: klik bintang ke-3 memanggil `onChange` dengan `"3"`
    - Test: klik tombol angka 7 memanggil `onChange` dengan `"7"`
    - Test: bintang 1-3 memiliki class `text-amber-400` ketika nilai terpilih adalah 3
    - Test: tombol angka 5 memiliki class `bg-blue-600` ketika nilai terpilih adalah 5
    - Test: labels.min dan labels.max ditampilkan jika tersedia di `options`
    - Test: pertanyaan `rating_scale` required tanpa nilai menampilkan border merah setelah submit
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 7. Checkpoint — Pastikan semua unit test frontend lulus
  - Jalankan `npx vitest run` di direktori `frontend`
  - Pastikan semua test pass sebelum melanjutkan

- [x] 8. Update `ResponseDetail.jsx` untuk menampilkan rating scale
  - Tambahkan `rating_scale: 'Rating Scale'` ke objek `typeLabel` di komponen `AnswerCard`
  - Di fungsi `renderValue` dalam `AnswerCard`, tambahkan case untuk `answer.question_type === 'rating_scale'`:
    - Jika `answer_value` kosong/null: kembalikan `<span className="text-gray-400 italic">—</span>`
    - Parse `answer_value` ke integer dengan `parseInt`
    - Baca konfigurasi dari `answer.question_options` (atau fallback ke default)
    - Mode `stars`: render bintang ★ dari 1 hingga max; bintang ≤ nilai terpilih berwarna `text-amber-400`, sisanya `text-gray-200`; tampilkan teks "{nilai}/{max}" di samping
    - Mode `numbers`: render badge `<span>` dengan nilai terpilih dalam kotak biru, teks "dari {max}" di samping
    - Tampilkan labels.min dan labels.max jika tersedia
  - Pastikan endpoint `GET /responses/:id` di backend menyertakan field `options` dari tabel `questions` dalam join (periksa `backend/src/routes/responses.js` — jika atribut `Question` belum menyertakan `options`, tambahkan)
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.1 Tambahkan unit test untuk tampilan rating di `frontend/src/pages/__tests__/ResponseDetail.test.jsx`
    - Test: jawaban `rating_scale` mode `stars` dengan nilai "3" dan max=5 menampilkan 3 bintang terisi dan 2 bintang kosong
    - Test: jawaban `rating_scale` mode `numbers` dengan nilai "7" menampilkan badge angka "7"
    - Test: `answer_value` kosong menampilkan "—"
    - Test: badge tipe menampilkan teks "Rating Scale"
    - Test: labels.min dan labels.max ditampilkan jika tersedia di `question_options`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 9. Buat property-based tests frontend di `frontend/src/surveyor/pages/__tests__/RatingScale.property.test.jsx`
  - [x] 9.1 Tulis property test untuk Property 4: Jumlah elemen interaktif sesuai rentang
    - Gunakan `fc.integer({ min: 1, max: 9 })` untuk `min`, `fc.integer({ min: 2, max: 10 }).filter(v => v > min)` untuk `max`, `fc.constantFrom('stars', 'numbers')` untuk `display`
    - Render `<RatingScaleField>` dengan konfigurasi tersebut
    - Assert: jumlah tombol/bintang yang dirender = `max - min + 1`
    - Annotasi: `// Feature: rating-scale-question, Property 4: Jumlah elemen interaktif sesuai rentang`
    - `numRuns: 100`
    - _Requirements: 6.1, 6.2_

- [x] 10. Final checkpoint — Pastikan semua tests lulus
  - Jalankan seluruh test suite backend: `npm test` di direktori `backend`
  - Jalankan seluruh test suite frontend: `npx vitest run` di direktori `frontend`
  - Pastikan tidak ada regresi pada test yang sudah ada

## Notes

- Fungsi `validateRatingConfig` sebaiknya diekspor dari `questions.js` atau diekstrak ke `backend/src/utils/validators.js` agar dapat diuji secara terisolasi di property-based tests
- Untuk property test Property 1 (nilai di luar rentang via HTTP), gunakan mock database agar test tidak memerlukan koneksi database nyata — ikuti pola yang sudah ada di `backend/tests/unit/questions.test.js`
- Komponen `RatingScaleField` harus menggunakan `type="button"` pada semua tombol untuk mencegah submit form yang tidak disengaja
- Pastikan semua tombol rating memiliki atribut `aria-label` yang deskriptif untuk aksesibilitas
- Nilai `answer_value` yang dikirim ke backend adalah string (misalnya `"4"`), bukan integer — ini konsisten dengan semua tipe pertanyaan lain yang menggunakan `answer_value`
- Untuk `ResponseDetail`, field `question_options` perlu ditambahkan ke response API jika belum ada — periksa query di `backend/src/routes/responses.js` dan tambahkan `options` ke atribut `Question` dalam include
- Urutan task: migration (1) → backend model+validasi (2) → backend tests (3,4) → frontend builder (5) → frontend form (6) → frontend tests (7) → response detail (8) → final tests (10)
- Setiap task mereferensikan requirements spesifik untuk traceability
