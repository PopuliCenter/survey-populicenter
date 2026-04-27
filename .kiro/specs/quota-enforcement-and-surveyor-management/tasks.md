# Implementation Plan: Quota Enforcement and Surveyor Management

## Overview

Implementasi fitur penegakan kuota, upload massal surveyor, penugasan massal, dan tampilan kuota pada antarmuka surveyor. Rencana ini memecah desain menjadi langkah-langkah inkremental yang dimulai dari utilitas backend, lalu endpoint API, dan diakhiri dengan integrasi frontend.

## Tasks

- [x] 1. Buat utilitas backend baru dan perluas validator
  - [x] 1.1 Buat file `backend/src/utils/fileParser.js` dengan fungsi `parseUploadFile`
    - Implementasi parsing CSV menggunakan string splitting (split baris dan kolom)
    - Implementasi parsing Excel (.xlsx) menggunakan library `exceljs` yang sudah ada
    - Validasi header kolom sesuai parameter `expectedColumns`
    - Return `{ rows: object[], errors: string[] }` — rows berisi array of objects dengan key sesuai header
    - Tangani edge case: file kosong, header tidak sesuai, baris kosong
    - _Requirements: 4.4, 5.2_

  - [x] 1.2 Tambahkan fungsi validasi baru di `backend/src/utils/validators.js`
    - Tambahkan `validateEmail(email)` — validasi format email menggunakan regex
    - Tambahkan `validateBulkSurveyorRow(row)` — validasi satu baris data surveyor: nama tidak kosong, email valid, password memenuhi aturan keamanan
    - Tambahkan `validateBulkAssignRow(row)` — validasi satu baris penugasan: email tidak kosong, kuota bilangan bulat positif > 0
    - Export semua fungsi baru
    - _Requirements: 4.5, 5.3, 5.4_

  - [ ]* 1.3 Tulis property test untuk validasi kuota (Property 3)
    - **Property 3: Validasi Nilai Kuota**
    - Verifikasi `validateQuota` mengembalikan `true` hanya untuk bilangan bulat positif > 0
    - Verifikasi mengembalikan `false` untuk float, negatif, nol, string, null, undefined
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 2.2, 5.4**

  - [ ]* 1.4 Tulis property test untuk validasi baris data surveyor (Property 6)
    - **Property 6: Validasi Baris Data Surveyor untuk Bulk Upload**
    - Verifikasi fungsi validasi mendeteksi semua field tidak valid: nama kosong, email format tidak valid, password tidak memenuhi aturan
    - Verifikasi baris dengan semua field valid lolos validasi
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 4.5**

- [x] 2. Implementasi penegakan kuota pada endpoint respons
  - [x] 2.1 Modifikasi `POST /responses/start` di `backend/src/routes/responses.js`
    - Import model `SurveyorQuota` dan `Op` dari sequelize
    - Sebelum membuat record PENDING, query `SurveyorQuota` untuk mendapatkan batas kuota surveyor
    - Jika tidak ada record kuota → return 403 "Anda tidak memiliki kuota untuk survei ini"
    - Hitung respons ter-commit (`questionnaire_number NOT LIKE 'PENDING-%'`) untuk surveyor dan survei tersebut
    - Jika jumlah >= kuota → return 403 "Kuota pengisian survei Anda sudah tercapai"
    - Jika masih ada sisa → lanjutkan membuat record PENDING seperti biasa
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 2.2 Modifikasi `POST /responses/submit` di `backend/src/routes/responses.js`
    - Di dalam transaksi database (sebelum commit response), hitung ulang respons ter-commit
    - Jika jumlah >= kuota → rollback transaksi, hapus record PENDING, return 403 "Kuota pengisian survei Anda sudah tercapai"
    - Jika masih ada sisa → lanjutkan commit seperti biasa
    - Pengecekan ini mencegah race condition saat dua submit bersamaan
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ]* 2.3 Tulis property test untuk keputusan penegakan kuota (Property 1)
    - **Property 1: Keputusan Penegakan Kuota**
    - Untuk surveyor dengan kuota Q dan jumlah respons ter-commit C, pengiriman diizinkan jika dan hanya jika C < Q
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 2.4 Tulis property test untuk penghitungan respons ter-commit (Property 2)
    - **Property 2: Penghitungan Respons Ter-commit Mengecualikan PENDING**
    - Verifikasi fungsi penghitungan hanya menghitung respons dengan questionnaire_number yang tidak dimulai dengan 'PENDING-'
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 1.5**

  - [ ]* 2.5 Tulis unit test untuk endpoint `/responses/start` dan `/responses/submit` dengan kuota
    - Test case: surveyor tanpa kuota → 403
    - Test case: surveyor dengan kuota tercapai → 403
    - Test case: surveyor dengan sisa kuota → 201
    - File: `backend/tests/unit/responses.test.js`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Checkpoint — Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

- [x] 4. Implementasi endpoint bulk upload dan bulk assign
  - [x] 4.1 Tambahkan endpoint `POST /surveyors/bulk-upload` di `backend/src/routes/surveyors.js`
    - Konfigurasi multer untuk menerima file CSV/Excel (memory storage, batas ukuran)
    - Validasi format file (ekstensi .csv atau .xlsx)
    - Parse file menggunakan `parseUploadFile` dari `utils/fileParser.js` dengan expectedColumns `['nama', 'email', 'password']`
    - Batasi maksimal 500 baris
    - Validasi setiap baris menggunakan `validateBulkSurveyorRow`: nama tidak kosong, email valid & unik (cek database), password memenuhi aturan
    - Jika ada error → return 422 dengan daftar error per baris tanpa menyimpan data apapun
    - Jika semua valid → buat semua akun surveyor dalam satu transaksi database (hash password, role='surveyor', is_active=true)
    - Return `{ created_count, emails: [...] }`
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 4.2 Tambahkan endpoint `POST /surveyors/bulk-assign/:surveyId` di `backend/src/routes/surveyors.js`
    - Konfigurasi multer untuk menerima file CSV/Excel
    - Parse file dengan expectedColumns `['email_surveyor', 'kuota']`
    - Validasi: email terdaftar sebagai surveyor aktif, kuota bilangan bulat positif > 0
    - Jika ada error → return 422 dengan daftar error per baris
    - Jika semua valid → upsert SurveyorQuota dalam satu transaksi database
    - Return `{ assigned_count }`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 4.3 Modifikasi `GET /surveyors/:id/quota` di `backend/src/routes/surveyors.js`
    - Ubah penghitungan `response_count` agar hanya menghitung respons ter-commit (questionnaire_number NOT LIKE 'PENDING-%')
    - Ganti nama field response menjadi `filled` (bukan `response_count`) agar konsisten dengan desain
    - _Requirements: 6.1_

  - [ ]* 4.4 Tulis property test untuk atomisitas operasi bulk (Property 7)
    - **Property 7: Atomisitas Operasi Bulk**
    - Untuk batch yang mengandung setidaknya satu baris tidak valid, sistem tidak menyimpan data apapun dan mengembalikan daftar error
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 4.6, 5.5**

  - [ ]* 4.5 Tulis property test untuk keberhasilan operasi bulk (Property 8)
    - **Property 8: Keberhasilan Operasi Bulk**
    - Untuk batch yang semua barisnya valid, jumlah record yang dibuat sama dengan jumlah baris input
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 4.7, 5.6**

  - [ ]* 4.6 Tulis unit test untuk endpoint bulk upload dan bulk assign
    - Test case: file format tidak valid → 422
    - Test case: file melebihi 500 baris → 422
    - Test case: baris dengan data tidak valid → 422 dengan daftar error
    - Test case: semua baris valid → 201 dengan created_count
    - Test case: email duplikat dalam file → error per baris
    - File: `backend/tests/unit/surveyors.test.js`
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 5. Checkpoint — Pastikan semua test backend lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

- [x] 6. Implementasi komponen frontend untuk bulk upload dan bulk assign
  - [x] 6.1 Buat komponen `frontend/src/components/BulkUploadModal.jsx`
    - Modal dialog dengan input file (accept: .csv, .xlsx)
    - Tombol download template CSV (generate di client-side dengan header: nama, email, password)
    - Tampilan progress upload (loading state)
    - Tampilan daftar error per baris jika ada (dari response backend)
    - Tampilan sukses dengan jumlah surveyor yang berhasil dibuat
    - Panggil `POST /surveyors/bulk-upload` dengan FormData
    - Aksesibilitas: aria-modal, aria-labelledby, role="dialog"
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 6.2 Buat komponen `frontend/src/components/BulkAssignModal.jsx`
    - Modal dialog dengan input file (accept: .csv, .xlsx)
    - Dropdown atau prop untuk memilih survei target (surveyId)
    - Tombol download template CSV (header: email_surveyor, kuota)
    - Tampilan daftar error per baris jika ada
    - Tampilan sukses dengan jumlah penugasan
    - Panggil `POST /surveyors/bulk-assign/:surveyId` dengan FormData
    - Aksesibilitas: aria-modal, aria-labelledby, role="dialog"
    - _Requirements: 5.1, 5.7_

  - [x] 6.3 Modifikasi `frontend/src/pages/Surveyors.jsx`
    - Tambahkan tombol "Upload Surveyor" di header halaman (di samping "Tambah Surveyor")
    - Tambahkan tombol "Upload Penugasan" di area aksi
    - Integrasikan `BulkUploadModal` — buka saat klik "Upload Surveyor", refresh daftar setelah sukses
    - Integrasikan `BulkAssignModal` — buka saat klik "Upload Penugasan", refresh daftar setelah sukses
    - _Requirements: 4.1, 5.1_

- [x] 7. Implementasi tampilan kuota pada antarmuka surveyor
  - [x] 7.1 Modifikasi `frontend/src/surveyor/pages/SurveyList.jsx`
    - Tampilkan informasi kuota (terisi/total) menggunakan komponen `QuotaProgress` yang sudah ada (sudah diimplementasi)
    - Nonaktifkan tombol "Mulai Isi" dan tampilkan label "Kuota Tercapai" saat sisa kuota = 0 (filled >= quota)
    - Pastikan `quotaMap` menggunakan field `filled` dari response API yang sudah diperbarui
    - _Requirements: 6.1, 6.2_

  - [x] 7.2 Modifikasi `frontend/src/surveyor/pages/SubmitSuccess.jsx`
    - Setelah submit berhasil, pastikan navigasi kembali ke daftar survei akan me-refresh data kuota
    - Tambahkan state flag atau gunakan mekanisme yang sudah ada (`fetchData` di SurveyList) untuk memastikan kuota terbaru ditampilkan
    - _Requirements: 6.3_

- [x] 8. Integrasi dan penyelesaian
  - [x] 8.1 Hubungkan semua komponen dan pastikan alur end-to-end berfungsi
    - Verifikasi alur: assign surveyor → submit respons → kuota berkurang → tombol disabled saat kuota tercapai
    - Verifikasi alur: bulk upload surveyor → surveyor baru muncul di daftar
    - Verifikasi alur: bulk assign → kuota muncul di panel kuota surveyor
    - Pastikan tidak ada kode yang menggantung atau tidak terintegrasi
    - _Requirements: 1.1, 1.2, 2.4, 4.7, 5.6, 6.1, 6.2, 6.3_

  - [ ]* 8.2 Tulis property test untuk format nomor kuesioner (Property 5)
    - **Property 5: Format Nomor Kuesioner**
    - Verifikasi fungsi `formatQuestionnaireNumber` menghasilkan string yang cocok dengan pola regex `^[A-Z0-9]{1,6}-\d{8}-\d{4,}$`
    - Verifikasi bagian tanggal sesuai dengan tanggal input dalam format YYYYMMDD
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 3.1**

  - [ ]* 8.3 Tulis property test untuk round-trip upsert kuota (Property 4)
    - **Property 4: Round-trip Upsert Kuota**
    - Verifikasi setelah operasi upsert pada SurveyorQuota, membaca kembali record mengembalikan nilai quota yang sama
    - File: `backend/tests/properties/quotaEnforcement.property.test.js`
    - **Validates: Requirements 2.4, 2.5**

- [x] 9. Checkpoint akhir — Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

## Notes

- Task yang ditandai dengan `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan persyaratan spesifik untuk traceability
- Checkpoint memastikan validasi inkremental di setiap tahap
- Property tests memvalidasi properti kebenaran universal (8 property dari dokumen desain)
- Unit tests memvalidasi contoh spesifik dan edge case
- Backend menggunakan Jest + fast-check untuk testing; Frontend menggunakan Vitest
