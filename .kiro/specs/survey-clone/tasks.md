# Implementation Plan: Clone/Duplikasi Survei

## Overview

Implementasi fitur duplikasi survei. Mencakup satu endpoint baru `POST /surveys/:id/clone` di backend yang berjalan secara atomik menggunakan transaksi Sequelize, fungsi helper `remapSkipLogic` untuk memperbarui referensi UUID di skip logic, pencatatan audit log `CLONE_SURVEY`, dan tombol "Duplikasi" di frontend `Surveys.jsx` yang redirect ke `SurveyBuilder` setelah berhasil.

## Tasks

- [ ] 1. Tambah fungsi helper `remapSkipLogic` dan endpoint `POST /surveys/:id/clone` di backend
  - Tambahkan fungsi `remapSkipLogic(skipLogic, idMap)` di bagian atas `backend/src/routes/surveys.js` (sebelum definisi router)
  - Fungsi menerima array skip_logic dan peta `{ oldId: newId }`, mengembalikan array baru dengan `condition.question_id` dan `target_question_id` diperbarui ke UUID baru
  - Fungsi harus mengembalikan `null`/`undefined` jika input bukan array
  - Tambahkan `require('uuid')` di bagian import (atau gunakan `crypto.randomUUID()` jika Node.js ≥ 14.17)
  - Tambahkan route handler `router.post('/:id/clone', authMiddleware, requireRole(['admin', 'supervisor']), ...)` di `backend/src/routes/surveys.js`
  - Urutan operasi dalam transaksi: `Survey.findOne` (return null jika tidak ada) → `Survey.create` (title="Salinan dari {asli}", status='draft', created_by=req.user.id) → `Question.findAll` → build idMap → remap skip_logic → `Question.bulkCreate` (jika ada pertanyaan)
  - Setelah transaksi commit: `AuditLog.create` dengan action `CLONE_SURVEY`, entity_type `survey`, entity_id = ID survei baru
  - Kembalikan HTTP 201 dengan `{ id, title, description, status, created_at, question_count }`
  - Kembalikan HTTP 404 jika `Survey.findOne` mengembalikan null
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 6.4_

  - [ ] 1.1 Tambah unit test `POST /surveys/:id/clone` di `backend/tests/unit/surveys.test.js`
    - Tambahkan mock `Question.bulkCreate` di blok `jest.mock('../../src/models', ...)` yang sudah ada
    - Tambahkan mock `sequelize.transaction` yang mengeksekusi callback dengan mock transaction object
    - Test: admin berhasil clone survei aktif → 201, `res.body.title` mengandung "Salinan dari", `res.body.status === 'draft'`
    - Test: supervisor berhasil clone survei → 201
    - Test: clone survei dengan 3 pertanyaan → `Question.bulkCreate` dipanggil dengan array 3 item, setiap item memiliki `survey_id` baru
    - Test: clone survei tanpa pertanyaan → 201, `question_count: 0`, `Question.bulkCreate` tidak dipanggil
    - Test: survei tidak ditemukan → 404, `{ error: 'Survei tidak ditemukan' }`
    - Test: viewer mencoba clone → 403
    - Test: surveyor mencoba clone → 403
    - Test: request tanpa token → 401
    - Test: audit log dibuat dengan `action: 'CLONE_SURVEY'`, `entity_type: 'survey'`, `entity_id` = ID survei baru
    - Test: `created_by` pada survei baru = ID user yang melakukan request
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.3, 3.1, 3.2_

- [ ] 2. Checkpoint — Pastikan semua unit test backend lulus
  - Jalankan `npm test -- --testPathPattern=surveys.test.js` di direktori `backend`
  - Pastikan semua test pass sebelum melanjutkan

- [ ] 3. Buat property-based tests backend di `backend/tests/properties/surveyClone.property.test.js`
  - [ ] 3.1 Tulis property test untuk Property 2: Status clone selalu draft
    - Gunakan `fc.constantFrom('draft', 'active', 'inactive')` untuk generate status source survey
    - Setup: mock `Survey.findOne` dengan survei yang memiliki status yang di-generate, mock `Question.findAll` dengan array kosong, mock `Survey.create` yang mengembalikan survei baru
    - Assert: `Survey.create` selalu dipanggil dengan `status: 'draft'` terlepas dari status source
    - Annotasi: `// Feature: survey-clone, Property 2: Status clone selalu draft`
    - `numRuns: 100`
    - _Requirements: 1.4, 6.1, 6.2, 6.3, 6.4_

  - [ ] 3.2 Tulis property test untuk Property 5: Role non-admin/supervisor selalu ditolak
    - Gunakan `fc.constantFrom('viewer', 'surveyor')` untuk generate role
    - Setup: generate token JWT untuk role tersebut
    - Act: panggil `POST /surveys/any-id/clone` dengan token tersebut
    - Assert: `response.status === 403` untuk semua kombinasi
    - Annotasi: `// Feature: survey-clone, Property 5: Role non-admin/supervisor selalu ditolak`
    - `numRuns: 100`
    - _Requirements: 1.1, 1.10_

  - [ ] 3.3 Tulis property test untuk Property 6: Judul clone selalu mengandung prefix "Salinan dari"
    - Gunakan `fc.string({ minLength: 1, maxLength: 400 })` untuk generate judul survei
    - Setup: mock `Survey.findOne` dengan survei yang memiliki judul yang di-generate
    - Assert: judul yang dikirim ke `Survey.create` selalu dimulai dengan `"Salinan dari "` diikuti judul asli
    - Annotasi: `// Feature: survey-clone, Property 6: Judul clone selalu mengandung prefix "Salinan dari"`
    - `numRuns: 100`
    - _Requirements: 1.3_

  - [ ] 3.4 Tulis property test untuk Property 4: remapSkipLogic mempertahankan jumlah rule
    - Ekstrak fungsi `remapSkipLogic` ke file terpisah atau test langsung dari module
    - Gunakan `fc.array(fc.record({ condition: fc.record({ question_id: fc.uuid(), operator: fc.string(), value: fc.string() }), action: fc.constant('jump_to'), target_question_id: fc.uuid() }))` untuk generate skip logic
    - Bangun idMap dari semua UUID yang muncul di skip logic
    - Assert: `remapSkipLogic(rules, idMap).length === rules.length`
    - Assert: setiap `target_question_id` hasil remap ada di `Object.values(idMap)`
    - Annotasi: `// Feature: survey-clone, Property 4: remapSkipLogic mempertahankan struktur`
    - `numRuns: 100`
    - _Requirements: 4.3_

- [ ] 4. Tambah tombol "Duplikasi" di `frontend/src/pages/Surveys.jsx`
  - Tambahkan state `cloningId` (string | null) di komponen `Surveys`
  - Tambahkan handler `handleClone(survey)`:
    - Set `setCloningId(survey.id)` dan `setActionError(null)`
    - Panggil `await api.post('/surveys/${survey.id}/clone')`
    - Jika berhasil: set `successMsg` dengan teks `"Survei "${survey.title}" berhasil diduplikasi."`, lalu `navigate('/surveys/${res.data.id}/builder')`
    - Jika gagal: set `actionError` dengan pesan dari `err.response?.data?.error || err.message`
    - Di `finally`: set `setCloningId(null)`
  - Tambahkan tombol "Duplikasi" di kolom aksi setiap baris, **setelah** tombol "Builder" dan **sebelum** tombol Aktifkan/Nonaktifkan:
    - `onClick={() => handleClone(survey)}`
    - `disabled={cloningId === survey.id}`
    - Teks: `cloningId === survey.id ? 'Menduplikasi…' : 'Duplikasi'`
    - Style: `text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-60`
    - `aria-label={`Duplikasi survei ${survey.title}`}`
  - Tombol ditampilkan untuk semua survei terlepas dari statusnya
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 4.1 Buat unit test frontend di `frontend/src/pages/__tests__/Surveys.test.jsx`
    - Buat file test baru jika belum ada
    - Setup: mock `../services/api` dan `react-router-dom` (`useNavigate`)
    - Test: tombol "Duplikasi" muncul di setiap baris survei (untuk semua status)
    - Test: klik "Duplikasi" memanggil `api.post('/surveys/{id}/clone')`
    - Test: saat loading (`cloningId === survey.id`), tombol disabled dan teks berubah menjadi "Menduplikasi…"
    - Test: setelah sukses, `navigate` dipanggil dengan `/surveys/{newId}/builder`
    - Test: setelah sukses, pesan sukses ditampilkan di halaman
    - Test: setelah error, pesan error ditampilkan dan tombol kembali ke kondisi normal (tidak disabled)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 5. Checkpoint — Pastikan semua unit test frontend lulus
  - Jalankan `npx vitest run src/pages/__tests__/Surveys.test.jsx` di direktori `frontend`
  - Pastikan semua test pass sebelum melanjutkan

- [ ] 6. Final checkpoint — Pastikan semua tests lulus
  - Jalankan seluruh test suite backend: `npm test` di direktori `backend`
  - Jalankan seluruh test suite frontend: `npx vitest run` di direktori `frontend`
  - Pastikan tidak ada regresi pada test yang sudah ada

## Notes

- Fungsi `remapSkipLogic` harus didefinisikan **sebelum** definisi `router` di `surveys.js` agar dapat digunakan di dalam route handler
- Gunakan `require('uuid').v4` atau `crypto.randomUUID()` untuk generate UUID baru — periksa versi Node.js yang digunakan (`crypto.randomUUID()` tersedia sejak Node.js 14.17.0)
- `Question.bulkCreate` harus menggunakan opsi `{ transaction: t }` agar masuk dalam transaksi yang sama
- Audit log dibuat **di luar** transaksi (setelah `await sequelize.transaction(...)` selesai) — ini adalah trade-off yang dapat diterima karena kegagalan audit log tidak boleh membatalkan duplikasi yang sudah berhasil
- Untuk mock `sequelize.transaction` di unit test, gunakan pola: `sequelize.transaction.mockImplementation(async (cb) => cb({}))` — ini mengeksekusi callback dengan mock transaction object
- Tombol "Duplikasi" menggunakan warna ungu (`purple`) untuk membedakannya dari tombol aksi lain (biru untuk Builder, hijau untuk Aktifkan, kuning untuk Nonaktifkan, merah untuk Hapus)
- Setiap task mereferensikan requirements spesifik untuk traceability
