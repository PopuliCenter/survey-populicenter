# Implementation Plan: Additional Question Types

## Overview

Implementasi tipe pertanyaan tambahan untuk platform survei: **Date Picker** (dengan konfigurasi min/max), **Time Picker** (format 24 jam), dan **Matrix/Grid Question** (tabel baris × kolom). Rencana ini memecah pekerjaan menjadi lapisan-lapisan inkremental: migrasi database terlebih dahulu, lalu logika validasi backend, kemudian ekspor data, diikuti komponen frontend (SurveyBuilder, SurveyForm, ResponseDetail), dan diakhiri dengan pengujian serta checkpoint integrasi.

## Tasks

- [ ] 1. Migrasi Database dan Update Model
  - [x] 1.1 Buat file migrasi `backend/src/migrations/20240106000001-add-time-and-matrix-types.js`
    - Tambahkan `time` dan `matrix` ke CHECK constraint pada kolom `type` di tabel `questions`
    - Method `up`: DROP constraint lama, ADD constraint baru dengan semua tipe termasuk `time` dan `matrix`
    - Method `down`: DROP constraint baru, ADD constraint lama tanpa `time` dan `matrix`
    - Ikuti pola migration yang ada (`add-rating-scale-type.js`, `add-phone-and-unique-id-types.js`)
    - _Requirements: 2.1, 3.1_

  - [x] 1.2 Modifikasi `backend/src/models/Question.js` — tambahkan tipe baru ke array `QUESTION_TYPES`
    - Tambahkan `'time'` dan `'matrix'` ke array `QUESTION_TYPES`
    - Pastikan urutan konsisten dengan CHECK constraint di migration
    - _Requirements: 2.1, 3.1_

- [x] 2. Backend — Validasi Konfigurasi Pertanyaan
  - [x] 2.1 Modifikasi `backend/src/utils/validators.js` — tambahkan fungsi validasi format
    - Implementasi `validateDateFormat(dateStr)`: validasi format `YYYY-MM-DD` dan pastikan tanggal nyata (misalnya tolak `2024-02-30`)
    - Implementasi `validateTimeFormat(timeStr)`: validasi format `HH:mm` dengan jam 00-23 dan menit 00-59
    - Implementasi `validateDateAnswer(dateStr, config)`: validasi format + rentang min_date/max_date, return `{ valid, error? }`
    - Implementasi `validateMatrixAnswer(answer, config, isRequired)`: validasi key ada di rows, value ada di columns, kelengkapan jika wajib, return `{ valid, error? }`
    - Export semua fungsi baru sebagai named exports
    - _Requirements: 1.7, 2.5, 3.10, 6.1, 6.7, 6.8, 6.9_

  - [x] 2.2 Modifikasi `backend/src/routes/questions.js` — validasi konfigurasi saat simpan pertanyaan
    - Tambahkan `'time'` dan `'matrix'` ke array `VALID_QUESTION_TYPES`
    - Implementasi fungsi `validateDateConfig(options)`:
      - `min_date` dan `max_date` opsional (boleh null atau tidak ada)
      - Jika diisi, harus format `YYYY-MM-DD` yang valid (gunakan `validateDateFormat`)
      - Jika keduanya diisi, `min_date <= max_date`
      - Return `{ valid: boolean, error?: string }`
    - Implementasi fungsi `validateMatrixConfig(options)`:
      - `options` harus memiliki property `rows` (array, minimal 1 elemen) dan `columns` (array, minimal 2 elemen)
      - Setiap elemen harus string non-kosong setelah trim
      - Tidak boleh ada elemen duplikat dalam `rows` maupun `columns`
      - Return `{ valid: boolean, error?: string }`
    - Panggil `validateDateConfig` pada endpoint POST dan PUT saat `type === 'date'` dan `options` ada
    - Panggil `validateMatrixConfig` pada endpoint POST dan PUT saat `type === 'matrix'` (wajib ada options)
    - Return HTTP 422 dengan pesan error spesifik jika validasi gagal
    - _Requirements: 1.1, 1.3, 1.4, 3.2, 3.4, 3.5, 3.6, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Backend — Validasi Jawaban pada Submit Respons
  - [x] 3.1 Modifikasi `backend/src/routes/responses.js` — validasi jawaban tipe baru
    - Tambahkan validasi jawaban `date` di dalam loop validasi yang sudah ada:
      - Format harus `YYYY-MM-DD` yang valid (gunakan `validateDateFormat`)
      - Jika pertanyaan memiliki `min_date`/`max_date` di options, jawaban harus dalam rentang (gunakan `validateDateAnswer`)
      - Return HTTP 422 jika format tidak valid atau di luar rentang
    - Tambahkan validasi jawaban `time`:
      - Format harus `HH:mm` yang valid (gunakan `validateTimeFormat`)
      - Return HTTP 422 dengan pesan "Format waktu harus HH:mm (24 jam)" jika tidak valid
    - Tambahkan validasi jawaban `matrix`:
      - Jawaban harus ada di `answer_json` (bukan `answer_value`)
      - Setiap key harus ada di `options.rows`, setiap value harus ada di `options.columns`
      - Jika `is_required`, semua rows harus memiliki jawaban
      - Return HTTP 422 dengan pesan error spesifik jika tidak valid (gunakan `validateMatrixAnswer`)
    - _Requirements: 1.7, 1.8, 2.5, 2.6, 3.9, 3.10, 3.11, 3.12, 6.7, 6.8, 6.9_

- [x] 4. Backend — Ekspor Data (Reports & Export Worker)
  - [x] 4.1 Modifikasi `backend/src/routes/reports.js` — update fungsi `buildExportData` untuk matrix
    - Modifikasi header generation:
      - Untuk pertanyaan non-matrix: satu kolom dengan header = `question.text` (tidak berubah)
      - Untuk pertanyaan matrix: N kolom, satu per baris, dengan header = `{question.text} - {rowName}`
    - Modifikasi data population:
      - Untuk pertanyaan non-matrix: tidak berubah
      - Untuk pertanyaan matrix: ambil `answer_json`, untuk setiap row ambil value yang dipilih, isi ke kolom yang sesuai; jika tidak ada jawaban untuk row tertentu, isi string kosong
    - Jawaban `date` dan `time` sudah tersimpan di `answer_value` sebagai string, tidak perlu perubahan khusus
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.2 Modifikasi `backend/src/workers/exportWorker.js` — update fungsi `buildExportData` untuk matrix
    - Terapkan perubahan yang sama persis dengan `routes/reports.js` (task 4.1)
    - Pastikan logika header generation dan data population identik di kedua tempat
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5. Frontend — SurveyBuilder (Pembuatan Pertanyaan)
  - [x] 5.1 Tambahkan komponen `DateConfigEditor` di `frontend/src/pages/SurveyBuilder.jsx`
    - Input `min_date` (type="date", opsional) dengan label "Tanggal Minimum"
    - Input `max_date` (type="date", opsional) dengan label "Tanggal Maksimum"
    - Validasi frontend: jika keduanya diisi, `min_date <= max_date`
    - Tampilkan info: "Kosongkan untuk tanpa batasan tanggal"
    - Props: `{ config, onChange }` — `config` berupa `{ min_date, max_date }`
    - _Requirements: 1.2, 1.9_

  - [x] 5.2 Tambahkan komponen `MatrixConfigEditor` di `frontend/src/pages/SurveyBuilder.jsx`
    - Daftar baris (rows) dengan tombol tambah, hapus, dan edit inline
    - Daftar kolom (columns) dengan tombol tambah, hapus, dan edit inline
    - Validasi frontend: minimal 1 baris, minimal 2 kolom, elemen tidak boleh kosong, tidak boleh duplikat
    - Preview tabel matrix di bawah editor
    - Props: `{ config, onChange }` — `config` berupa `{ rows: [...], columns: [...] }`
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 5.3 Modifikasi `frontend/src/pages/SurveyBuilder.jsx` — integrasi tipe baru
    - Tambahkan `{ value: 'time', label: 'Waktu' }` dan `{ value: 'matrix', label: 'Matrix/Grid' }` ke array `QUESTION_TYPES`
    - Tambahkan state `dateConfig` dan `matrixConfig` di `QuestionFormModal`
    - Render `DateConfigEditor` saat `type === 'date'`
    - Render `MatrixConfigEditor` saat `type === 'matrix'`
    - Kirim config sebagai `options` di payload API saat simpan pertanyaan
    - Reset config saat tipe berubah (ikuti pola `ratingConfig`, `phoneConfig` yang sudah ada)
    - Saat edit pertanyaan yang sudah ada, populate config dari `options` yang tersimpan
    - _Requirements: 1.2, 2.3, 3.3, 7.1_

- [x] 6. Frontend — SurveyForm (Pengisian Survei)
  - [x] 6.1 Tambahkan komponen `DatePickerField` di `frontend/src/pages/SurveyForm.jsx`
    - Menggunakan `<input type="date">` dengan atribut `min` dan `max` dari konfigurasi options
    - Validasi frontend: tanggal harus dalam rentang jika dikonfigurasi
    - Pesan error jika tanggal di luar rentang
    - Jika tidak ada konfigurasi min/max, tampilkan date picker tanpa batasan (backward compatible)
    - Props: `{ value, onChange, config, error }`
    - _Requirements: 1.5, 1.6, 1.9_

  - [x] 6.2 Tambahkan komponen `TimePickerField` di `frontend/src/pages/SurveyForm.jsx`
    - Menggunakan `<input type="time">` dengan format 24 jam
    - Nilai disimpan sebagai string `HH:mm`
    - Props: `{ value, onChange, error }`
    - _Requirements: 2.4_

  - [x] 6.3 Tambahkan komponen `MatrixField` di `frontend/src/pages/SurveyForm.jsx`
    - Tabel HTML dengan header kolom dan baris dari konfigurasi
    - Radio button per baris (satu pilihan per baris)
    - Responsive: horizontal scroll pada layar kecil (`overflow-x: auto`)
    - Highlight baris yang belum dijawab saat validasi gagal
    - Nilai disimpan sebagai objek `{ "NamaBaris": "NamaKolom", ... }`
    - Props: `{ rows, columns, value, onChange, error }`
    - _Requirements: 3.7, 3.8_

  - [x] 6.4 Modifikasi `frontend/src/pages/SurveyForm.jsx` — integrasi tipe baru di QuestionField dan fungsi pendukung
    - Update switch statement di `QuestionField`:
      - `case 'date'`: render `DatePickerField` (menggantikan `<input type="date">` yang ada)
      - `case 'time'`: render `TimePickerField`
      - `case 'matrix'`: render `MatrixField`
    - Modifikasi `buildEmptyAnswers`: untuk `type === 'matrix'`, inisialisasi sebagai objek kosong `{}`
    - Modifikasi `buildAnswersPayload`:
      - Untuk `type === 'matrix'`: kirim sebagai `answer_json` (bukan `answer_value`)
      - Untuk `type === 'time'`: kirim sebagai `answer_value`
    - Modifikasi `validateRequiredQuestions`:
      - Untuk `type === 'matrix'`: cek bahwa semua rows memiliki jawaban
      - Untuk `type === 'time'`: cek bahwa value tidak kosong
    - _Requirements: 1.5, 2.4, 3.7, 3.8, 7.2_

- [x] 7. Frontend — ResponseDetail (Tampilan Jawaban)
  - [x] 7.1 Modifikasi `frontend/src/pages/ResponseDetail.jsx` — rendering tipe baru
    - Tambahkan label tipe baru di `typeLabel`:
      - `time: 'Waktu'`
      - `matrix: 'Matrix/Grid'`
    - Tambahkan rendering jawaban `time` di `AnswerCard`: tampilkan `answer_value` langsung (sudah format HH:mm)
    - Tambahkan rendering jawaban `matrix` di `AnswerCard`:
      - Render tabel dari `answer_json` dengan header kolom dari `question_options.columns`
      - Baris dari `question_options.rows`, tandai sel yang dipilih (ikon ✓ atau background biru)
      - Jika `answer_json` kosong/null: tampilkan "Tidak ada jawaban" italic
    - _Requirements: 2.7, 4.1, 4.2, 4.3, 7.5_

- [x] 8. Pengujian — Property-Based Tests
  - [x] 8.1 Buat file `backend/tests/properties/additionalQuestionTypes.property.test.js` — property tests
    - **Property 1: Validasi Konfigurasi Date** — Generate pasangan string acak untuk `min_date` dan `max_date`, verifikasi `validateDateConfig` menerima hanya konfigurasi dengan format `YYYY-MM-DD` valid dan `min_date <= max_date`
      - Tag: `Feature: additional-question-types, Property 1: Validasi Konfigurasi Date`
    - **Property 2: Validasi Jawaban Date terhadap Rentang** — Generate string tanggal acak dan konfigurasi date, verifikasi validasi menerima hanya jawaban dengan format valid dalam rentang
      - Tag: `Feature: additional-question-types, Property 2: Validasi Jawaban Date terhadap Rentang`
    - **Property 3: Validasi Format Waktu** — Generate string acak, verifikasi `validateTimeFormat` mengembalikan `true` hanya untuk format `HH:mm` dengan jam 00-23 dan menit 00-59
      - Tag: `Feature: additional-question-types, Property 3: Validasi Format Waktu`
    - **Property 4: Validasi Konfigurasi Matrix** — Generate objek konfigurasi acak dengan ukuran dan konten bervariasi, verifikasi `validateMatrixConfig` menerima hanya konfigurasi yang memenuhi semua aturan
      - Tag: `Feature: additional-question-types, Property 4: Validasi Konfigurasi Matrix`
    - **Property 5: Validasi Jawaban Matrix** — Generate jawaban dan konfigurasi matrix acak, verifikasi `validateMatrixAnswer` menerima hanya jawaban dengan key/value valid dan kelengkapan yang benar
      - Tag: `Feature: additional-question-types, Property 5: Validasi Jawaban Matrix`
    - **Property 6: Round-trip Konfigurasi Pertanyaan** — Generate konfigurasi valid (date config, matrix config), simpan ke model lalu baca kembali, verifikasi objek identik
      - Tag: `Feature: additional-question-types, Property 6: Round-trip Konfigurasi Pertanyaan`
    - **Property 7: Ekspor Data Matrix Menghasilkan Kolom yang Benar** — Generate konfigurasi matrix dengan N baris dan kumpulan jawaban (termasuk kosong/parsial), verifikasi `buildExportData` menghasilkan tepat N kolom tambahan dengan header dan data yang benar
      - Tag: `Feature: additional-question-types, Property 7: Ekspor Data Matrix Menghasilkan Kolom yang Benar`
    - **Property 8: Clone Survei Mempertahankan Konfigurasi Tipe Baru** — Generate survei dengan pertanyaan date/time/matrix, clone, verifikasi `options` JSONB identik
      - Tag: `Feature: additional-question-types, Property 8: Clone Survei Mempertahankan Konfigurasi Tipe Baru`
    - Setiap property test harus menggunakan library `fast-check` dan menjalankan minimal 100 iterasi
    - _Requirements: 1.3, 1.7, 2.5, 3.4, 3.5, 3.10, 5.3, 6.1, 6.6, 6.7, 6.8, 6.9, 7.3_

- [ ]* 9. Pengujian — Unit Tests Backend
  - [ ]* 9.1 Modifikasi `backend/tests/unit/questions.test.js` — tambahkan test tipe baru
    - Test membuat pertanyaan tipe `time` berhasil
    - Test membuat pertanyaan tipe `matrix` dengan konfigurasi valid berhasil
    - Test validasi konfigurasi date: min/max valid, min > max ditolak, format salah ditolak
    - Test validasi konfigurasi matrix: rows/columns valid, rows kosong ditolak, columns < 2 ditolak, elemen kosong ditolak, duplikat ditolak
    - Test menolak tipe pertanyaan yang tidak valid
    - _Requirements: 1.1, 1.3, 1.4, 2.2, 3.2, 3.4, 3.5, 3.6, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 9.2 Modifikasi `backend/tests/unit/responses.test.js` — tambahkan test validasi jawaban
    - Test validasi jawaban date: format valid diterima, format tidak valid ditolak
    - Test validasi jawaban date: dalam rentang diterima, di luar rentang ditolak
    - Test validasi jawaban time: format `HH:mm` valid diterima, format tidak valid ditolak
    - Test validasi jawaban time: jam > 23 atau menit > 59 ditolak
    - Test validasi jawaban matrix: key/value valid diterima, key tidak ada di rows ditolak, value tidak ada di columns ditolak
    - Test validasi jawaban matrix wajib: semua rows dijawab diterima, rows tidak lengkap ditolak
    - _Requirements: 1.7, 1.8, 2.5, 2.6, 3.10, 3.11, 3.12, 6.7, 6.8, 6.9_

  - [ ]* 9.3 Modifikasi `backend/tests/unit/reports.test.js` — tambahkan test ekspor data
    - Test ekspor data dengan jawaban date ditampilkan sebagai string YYYY-MM-DD
    - Test ekspor data dengan jawaban time ditampilkan sebagai string HH:mm
    - Test ekspor data matrix: kolom terpisah per baris dengan header `{TeksPertanyaan} - {NamaBaris}`
    - Test ekspor data matrix dengan jawaban kosong/parsial: kolom tanpa jawaban berisi string kosong
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 10. Pengujian — Unit Tests Frontend
  - [ ]* 10.1 Tambahkan test di `frontend/src/pages/__tests__/SurveyBuilder.test.jsx`
    - Test dropdown tipe pertanyaan menampilkan opsi "Waktu" dan "Matrix/Grid"
    - Test `DateConfigEditor` muncul saat tipe `date` dipilih
    - Test `MatrixConfigEditor` muncul saat tipe `matrix` dipilih
    - Test validasi frontend konfigurasi matrix (minimal 1 baris, minimal 2 kolom, tidak boleh duplikat)
    - Test config di-reset saat tipe pertanyaan berubah
    - _Requirements: 1.2, 2.3, 3.3, 7.1_

  - [ ]* 10.2 Tambahkan test di `frontend/src/pages/__tests__/ResponseDetail.test.jsx`
    - Test rendering jawaban time menampilkan format HH:mm
    - Test rendering jawaban matrix menampilkan tabel dengan baris dan kolom yang benar
    - Test badge tipe "Waktu" dan "Matrix/Grid" ditampilkan
    - Test jawaban matrix kosong menampilkan "Tidak ada jawaban" italic
    - _Requirements: 2.7, 4.1, 4.2, 4.3, 7.5_

- [x] 11. Checkpoint — Verifikasi integrasi end-to-end
  - [x] 11.1 Verifikasi alur lengkap tipe pertanyaan baru
    - Verifikasi alur date: buat pertanyaan date dengan min/max → isi jawaban dalam rentang → lihat di ResponseDetail → ekspor
    - Verifikasi alur date: isi jawaban di luar rentang → validasi frontend menolak → validasi backend menolak (422)
    - Verifikasi alur time: buat pertanyaan time → isi jawaban format HH:mm → lihat di ResponseDetail → ekspor
    - Verifikasi alur matrix: buat pertanyaan matrix → isi jawaban semua baris → lihat di ResponseDetail → ekspor dengan kolom terpisah
    - Verifikasi alur matrix wajib: isi jawaban tidak lengkap → validasi frontend menolak → validasi backend menolak (422)
    - Verifikasi clone survei: clone survei dengan pertanyaan date/time/matrix → verifikasi konfigurasi options tersalin identik
    - Verifikasi backward compatibility: pertanyaan date lama tanpa konfigurasi min/max tetap berfungsi normal
    - _Requirements: 1.1, 1.5, 1.7, 1.9, 2.4, 2.5, 2.7, 3.7, 3.9, 3.10, 3.12, 4.1, 5.3, 6.6, 7.2, 7.3_

- [x] 12. Checkpoint akhir — Pastikan semua test lulus
  - Jalankan seluruh test suite (backend unit + property tests, frontend tests)
  - Pastikan semua test lulus tanpa error
  - Tanyakan ke pengguna jika ada pertanyaan atau masalah

## Notes

- Task yang ditandai dengan `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Tipe `date` sudah ada di CHECK constraint database — hanya perlu melengkapi implementasi (konfigurasi min/max, validasi). Tipe `time` dan `matrix` benar-benar baru dan perlu migration.
- Konfigurasi tipe baru disimpan di kolom `options` JSONB yang sudah ada — tidak perlu kolom baru di tabel `questions` maupun `answers`
- Jawaban date dan time disimpan di `answer_value` (string), jawaban matrix disimpan di `answer_json` (objek JSON)
- Fungsi `buildExportData` ada di dua tempat (`routes/reports.js` dan `workers/exportWorker.js`) — perubahan harus diterapkan di keduanya agar konsisten
- Komponen frontend baru (DateConfigEditor, MatrixConfigEditor, DatePickerField, TimePickerField, MatrixField) didefinisikan di dalam file halaman yang sama (SurveyBuilder.jsx, SurveyForm.jsx), mengikuti pola komponen yang sudah ada di project
- Property-based tests menggunakan library `fast-check` yang sudah ada di project, dengan minimal 100 iterasi per property
- Backward compatibility penting: pertanyaan date lama tanpa konfigurasi min/max harus tetap berfungsi tanpa perubahan
