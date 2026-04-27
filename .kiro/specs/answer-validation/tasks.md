# Implementation Plan: Answer Validation

## Overview

Implementasi fitur validasi jawaban survei yang mencakup aturan validasi per pertanyaan (min/max value, min/max length, regex pattern, pesan error kustom). Rencana ini memecah desain menjadi langkah-langkah inkremental: utilitas backend terlebih dahulu, lalu modifikasi route backend, kemudian utilitas frontend, dan diakhiri dengan komponen dan integrasi frontend.

## Tasks

- [x] 1. Buat utilitas backend untuk validasi jawaban dan konfigurasi validasi
  - [x] 1.1 Buat file `backend/src/utils/answerValidator.js` dengan fungsi `validateAnswer` dan `validateAllAnswers`
    - Implementasi `validateAnswer(answerValue, question)` sebagai pure function
    - Validasi `min_value` dan `max_value` untuk tipe `numeric_scale` dan `rating_scale` menggunakan `parseFloat`
    - Validasi `min_length` dan `max_length` untuk tipe `short_text` dan `long_text` menggunakan `answer.length`
    - Validasi `pattern` untuk tipe `short_text`, `long_text`, dan `numeric_scale` menggunakan full match regex (`^(pattern)$`)
    - Gunakan `custom_error` sebagai pesan error jika tersedia, jika tidak gunakan pesan default sesuai tabel di desain
    - Jika `options.validation` tidak ada atau kosong, return `{ valid: true }`
    - Implementasi `validateAllAnswers(answers, questions)` yang memvalidasi semua jawaban dan mengembalikan daftar error
    - Export kedua fungsi
    - _Requirements: 1.4, 2.5, 2.6, 2.7, 3.5, 3.6, 3.7, 4.4, 4.5, 4.6, 5.2, 5.3, 5.4, 7.1, 7.6_

  - [x] 1.2 Buat file `backend/src/utils/validationConfigValidator.js` dengan fungsi `validateValidationConfig`
    - Implementasi `validateValidationConfig(validation, questionType)` sebagai pure function
    - Validasi `min_value` dan `max_value` adalah bilangan numerik jika disertakan
    - Validasi `min_value <= max_value` jika keduanya disertakan
    - Validasi `min_length` dan `max_length` adalah bilangan bulat positif jika disertakan
    - Validasi `min_length <= max_length` jika keduanya disertakan
    - Validasi `pattern` dapat dikompilasi sebagai RegExp yang valid
    - Validasi `custom_error` tidak melebihi 500 karakter
    - Return `{ valid: boolean, error?: string }` dengan pesan error spesifik sesuai tabel di desain
    - Export fungsi
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [ ]* 1.3 Tulis property test untuk validasi konfigurasi aturan validasi (Property 2)
    - **Property 2: Validasi Konfigurasi Aturan Validasi**
    - Generate random konfigurasi validasi (valid dan invalid) menggunakan `fast-check`
    - Verifikasi `validateValidationConfig` menolak konfigurasi jika dan hanya jika salah satu kondisi error terpenuhi
    - Verifikasi konfigurasi yang tidak melanggar kondisi apapun diterima
    - File: `backend/tests/properties/answerValidation.property.test.js`
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9**

  - [ ]* 1.4 Tulis property test untuk kebenaran validasi jawaban (Property 3)
    - **Property 3: Kebenaran Validasi Jawaban**
    - Generate random pertanyaan dengan aturan validasi dan random jawaban menggunakan `fast-check`
    - Verifikasi `validateAnswer` menolak jawaban jika dan hanya jika jawaban melanggar setidaknya satu aturan validasi
    - Verifikasi pertanyaan tanpa aturan validasi selalu menerima jawaban apapun
    - File: `backend/tests/properties/answerValidation.property.test.js`
    - **Validates: Requirements 1.4, 2.5, 2.6, 2.7, 3.5, 3.6, 3.7, 4.4, 4.5, 4.6, 7.1, 7.6**

  - [ ]* 1.5 Tulis property test untuk pesan error kustom (Property 4)
    - **Property 4: Pesan Error Kustom Menggantikan Pesan Default**
    - Generate random pertanyaan dengan `custom_error` dan jawaban yang gagal validasi
    - Verifikasi fungsi mengembalikan `custom_error` sebagai pesan error
    - Generate random pertanyaan tanpa `custom_error` dan jawaban yang gagal validasi
    - Verifikasi fungsi mengembalikan pesan error default yang non-empty
    - File: `backend/tests/properties/answerValidation.property.test.js`
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [ ]* 1.6 Tulis unit test untuk `answerValidator.js` dan `validationConfigValidator.js`
    - Test validasi min_value/max_value untuk numeric_scale dan rating_scale
    - Test validasi min_length/max_length untuk short_text dan long_text
    - Test validasi regex pattern (full match)
    - Test pertanyaan tanpa validasi → selalu lolos
    - Test pesan error kustom vs default
    - Test konfigurasi valid diterima, konfigurasi invalid ditolak
    - File: `backend/tests/unit/answerValidator.test.js` dan `backend/tests/unit/validationConfigValidator.test.js`
    - _Requirements: 2.3, 2.4, 3.3, 3.4, 4.2, 4.3, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

- [x] 2. Modifikasi route backend untuk validasi konfigurasi saat simpan pertanyaan
  - [x] 2.1 Modifikasi `backend/src/routes/questions.js` — tambahkan validasi konfigurasi pada `POST` dan `PUT`
    - Import `validateValidationConfig` dari `utils/validationConfigValidator.js`
    - Pada `POST /surveys/:surveyId/questions`: setelah validasi tipe pertanyaan yang sudah ada, cek apakah `options` mengandung key `validation`
    - Jika ada, jalankan `validateValidationConfig(options.validation, type)` — jika gagal return 422 dengan pesan error
    - Pada `PUT /surveys/:surveyId/questions/:qid`: logika yang sama, gunakan `effectiveType` untuk menentukan tipe pertanyaan
    - Pastikan validasi konfigurasi berjalan sebelum menyimpan ke database
    - _Requirements: 1.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [ ]* 2.2 Tulis property test untuk round-trip penyimpanan aturan validasi (Property 1)
    - **Property 1: Round-trip Penyimpanan Aturan Validasi**
    - Generate random objek aturan validasi yang valid
    - Simpan ke pertanyaan melalui endpoint, baca kembali, verifikasi identik
    - File: `backend/tests/properties/answerValidation.property.test.js`
    - **Validates: Requirements 1.1, 1.2, 1.3, 9.10**

  - [ ]* 2.3 Tulis unit test untuk endpoint questions dengan validasi konfigurasi
    - Test POST/PUT dengan validation config valid → 201/200
    - Test POST/PUT dengan validation config invalid (min > max, regex invalid, dll.) → 422
    - Test POST/PUT tanpa validation config → tetap berhasil (backward compatible)
    - File: `backend/tests/unit/questions.test.js` (tambahan)
    - _Requirements: 1.2, 9.1, 9.8, 9.10_

- [x] 3. Modifikasi route backend untuk validasi jawaban saat submit
  - [x] 3.1 Modifikasi `backend/src/routes/responses.js` — tambahkan validasi jawaban pada `POST /responses/submit`
    - Import `validateAllAnswers` dari `utils/answerValidator.js`
    - Setelah validasi pertanyaan wajib yang sudah ada, jalankan `validateAllAnswers(answers, questions)`
    - Jika ada jawaban yang gagal validasi → return 422 dengan `{ error: "Validasi jawaban gagal", validation_errors: [...] }`
    - Jika semua jawaban valid → lanjutkan alur submit yang sudah ada
    - Pastikan validasi hanya dijalankan untuk pertanyaan yang memiliki `options.validation`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 3.2 Tulis property test untuk penolakan atomik submission (Property 6)
    - **Property 6: Penolakan Atomik Submission yang Tidak Valid**
    - Generate submissions dengan campuran jawaban valid dan invalid
    - Verifikasi seluruh submission ditolak dengan HTTP 422
    - Verifikasi daftar `validation_errors` mencakup semua pertanyaan yang gagal
    - File: `backend/tests/properties/answerValidation.property.test.js`
    - **Validates: Requirements 7.2**

  - [ ]* 3.3 Tulis unit test untuk endpoint responses/submit dengan validasi jawaban
    - Test submit dengan jawaban valid → 201
    - Test submit dengan jawaban numerik di luar rentang → 422 dengan validation_errors
    - Test submit dengan jawaban teks di luar batas panjang → 422 dengan validation_errors
    - Test submit dengan jawaban tidak cocok regex → 422 dengan validation_errors
    - Test submit dengan pertanyaan tanpa validasi → tetap berhasil
    - File: `backend/tests/unit/responses.test.js` (tambahan)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 4. Checkpoint — Pastikan semua test backend lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

- [x] 5. Buat utilitas frontend untuk validasi jawaban
  - [x] 5.1 Buat file `frontend/src/utils/answerValidation.js` dengan fungsi `validateAnswer` dan `getValidationFieldsForType`
    - Implementasi `validateAnswer(answerValue, question)` dengan logika identik dengan backend `answerValidator.js`
    - Validasi min_value/max_value, min_length/max_length, dan regex pattern dengan logika yang sama
    - Gunakan custom_error jika tersedia, pesan default jika tidak
    - Implementasi `getValidationFieldsForType(questionType)` yang mengembalikan daftar field validasi yang relevan per tipe pertanyaan sesuai mapping di desain
    - Export kedua fungsi sebagai named exports
    - _Requirements: 6.1, 6.5, 7.7_

  - [ ]* 5.2 Tulis property test untuk konsistensi validasi frontend dan backend (Property 5)
    - **Property 5: Konsistensi Validasi Frontend dan Backend**
    - Generate random pertanyaan dengan aturan validasi dan random jawaban
    - Jalankan fungsi validasi frontend dan backend
    - Verifikasi keduanya menghasilkan keputusan yang sama (keduanya menerima atau keduanya menolak)
    - File: `backend/tests/properties/answerValidation.property.test.js`
    - **Validates: Requirements 7.7**

  - [ ]* 5.3 Tulis unit test untuk `answerValidation.js` (frontend)
    - Test validasi semua jenis aturan (min/max value, min/max length, pattern)
    - Test pesan error kustom vs default
    - Test pertanyaan tanpa validasi → selalu lolos
    - Test `getValidationFieldsForType` mengembalikan field yang benar per tipe
    - File: `frontend/src/utils/__tests__/answerValidation.test.js`
    - _Requirements: 6.1, 6.5_

- [x] 6. Buat komponen frontend ValidationRulesEditor dan integrasikan ke SurveyBuilder
  - [x] 6.1 Buat komponen `frontend/src/components/ValidationRulesEditor.jsx`
    - Implementasi section collapsible dengan judul "Aturan Validasi"
    - Tampilkan field input yang relevan berdasarkan `questionType` sesuai mapping di desain
    - Field `min_value` / `max_value`: input number untuk `numeric_scale` dan `rating_scale`
    - Field `min_length` / `max_length`: input number (integer) untuk `short_text` dan `long_text`
    - Field `pattern`: input text dengan placeholder contoh untuk `short_text`, `long_text`, dan `numeric_scale`
    - Field `custom_error`: textarea dengan penghitung karakter (maks 500) untuk semua tipe yang mendukung validasi
    - Jika semua field kosong, panggil `onChange` dengan `null`
    - Aksesibilitas: aria-expanded, aria-controls, label yang sesuai
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

  - [x] 6.2 Modifikasi `frontend/src/pages/SurveyBuilder.jsx` — integrasikan `ValidationRulesEditor` ke `QuestionFormModal`
    - Tambahkan state `validationConfig` untuk menyimpan konfigurasi validasi
    - Import dan render `ValidationRulesEditor` di dalam form modal pertanyaan
    - Saat inisialisasi (edit mode), baca `initial.options.validation` jika ada dan set ke `validationConfig`
    - Saat submit, gabungkan `validationConfig` ke dalam `options` sesuai tipe pertanyaan:
      - Untuk tipe choice: `{ choices: [...], validation: {...} }`
      - Untuk tipe rating_scale: `{ min, max, display, labels, validation: {...} }`
      - Untuk tipe lainnya: `{ validation: {...} }` atau `{ ...existingConfig, validation: {...} }`
    - Jika `validationConfig` null atau kosong, jangan sertakan key `validation` dalam options
    - _Requirements: 8.4, 8.5, 8.6_

  - [ ]* 6.3 Tulis unit test untuk `ValidationRulesEditor` dan integrasi SurveyBuilder
    - Test render field yang sesuai per tipe pertanyaan
    - Test collapsible behavior (buka/tutup)
    - Test perubahan nilai memicu onChange dengan objek yang benar
    - Test modal pertanyaan menampilkan section validasi
    - Test simpan pertanyaan dengan validasi menyertakan objek validation dalam options
    - File: `frontend/src/components/__tests__/ValidationRulesEditor.test.jsx` dan `frontend/src/pages/__tests__/SurveyBuilder.test.jsx` (tambahan)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 7. Modifikasi SurveyForm untuk validasi real-time dan penghitung karakter
  - [x] 7.1 Modifikasi `frontend/src/surveyor/pages/SurveyForm.jsx` — tambahkan validasi real-time
    - Import `validateAnswer` dari `utils/answerValidation.js`
    - Tambahkan state `validationErrors` (Map: question_id → error message)
    - Di `handleAnswerChange`: jalankan `validateAnswer()` untuk pertanyaan yang memiliki aturan validasi dan update `validationErrors`
    - Saat jawaban diperbaiki dan validasi lolos, hapus error dari `validationErrors`
    - Di render setiap pertanyaan: tampilkan pesan error dari `validationErrors` di bawah field dengan warna merah
    - Di `handleSubmit`: cek `validationErrors` — jika ada error, cegah pengiriman dan gulir ke pertanyaan pertama yang gagal
    - Tangani `validation_errors` dari response backend 422 — tampilkan error pada pertanyaan yang sesuai
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 7.2 Tambahkan penghitung karakter pada pertanyaan teks dengan `max_length`
    - Untuk pertanyaan bertipe `short_text` atau `long_text` yang memiliki `options.validation.max_length`
    - Tampilkan penghitung `{current}/{max}` di bawah field input
    - Ubah warna penghitung menjadi merah saat jumlah karakter mendekati atau melebihi batas
    - _Requirements: 6.6_

  - [ ]* 7.3 Tulis unit test untuk validasi real-time di SurveyForm
    - Test validasi real-time saat input berubah
    - Test pesan error ditampilkan dan dihapus saat jawaban diperbaiki
    - Test penghitung karakter untuk teks dengan max_length
    - Test submit dicegah saat ada error validasi
    - Test error dari backend ditampilkan pada pertanyaan yang sesuai
    - File: `frontend/src/surveyor/pages/__tests__/SurveyForm.test.jsx`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 8. Integrasi dan penyelesaian
  - [x] 8.1 Hubungkan semua komponen dan pastikan alur end-to-end berfungsi
    - Verifikasi alur: buat pertanyaan dengan validasi di SurveyBuilder → isi formulir di SurveyForm → validasi real-time berjalan → submit dengan jawaban valid berhasil
    - Verifikasi alur: submit dengan jawaban invalid → error ditampilkan → perbaiki jawaban → submit berhasil
    - Verifikasi backward compatibility: pertanyaan tanpa validasi tetap berfungsi normal
    - Pastikan tidak ada kode yang menggantung atau tidak terintegrasi
    - _Requirements: 1.4, 6.1, 7.1, 7.7, 8.4, 8.5_

- [x] 9. Checkpoint akhir — Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

## Notes

- Task yang ditandai dengan `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan persyaratan spesifik untuk traceability
- Checkpoint memastikan validasi inkremental di setiap tahap
- Property tests memvalidasi properti kebenaran universal (6 property dari dokumen desain)
- Unit tests memvalidasi contoh spesifik dan edge case
- Backend menggunakan Jest + fast-check untuk testing; Frontend menggunakan Vitest
- Tidak diperlukan migrasi database baru — aturan validasi disimpan di kolom `options` JSONB yang sudah ada
