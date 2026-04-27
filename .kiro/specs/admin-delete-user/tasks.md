# Implementation Plan: Admin Delete User

## Overview

Implementasi fitur penghapusan permanen akun pengguna oleh admin. Mencakup empat endpoint DELETE baru di backend (admins, supervisors, viewers, surveyors), pencatatan audit log sebelum penghapusan, self-delete guard, dan tombol "Hapus" dengan inline confirmation di frontend (UserManagement.jsx dan Surveyors.jsx).

## Tasks

- [x] 1. Tambah endpoint `DELETE /admins/:id` di backend
  - Tambahkan route handler `router.delete('/:id', ...)` di `backend/src/routes/admins.js`
  - Urutan operasi: self-delete guard (403) → `User.findOne` (404 jika tidak ada) → snapshot `old_value` → `AuditLog.create` → `user.destroy()` → 200
  - Gunakan `requireRole('admin')` yang sudah ada via `router.use` di file ini
  - Kembalikan `{ message: "Akun {name} berhasil dihapus" }` saat sukses
  - Tangani constraint violation database dengan HTTP 409
  - _Requirements: 1.1, 1.5, 1.6, 1.7, 2.1, 2.2, 3.1, 3.2, 3.6, 3.7, 5.1, 6.3_

  - [x] 1.1 Tambah unit test DELETE /admins/:id di `backend/tests/unit/admins.test.js`
    - Test: admin berhasil menghapus admin lain → 200, `User.destroy` dipanggil
    - Test: self-delete → 403, `User.destroy` tidak dipanggil
    - Test: admin tidak ditemukan → 404
    - Test: non-admin (supervisor/viewer/surveyor) → 403
    - Test: request tanpa token → 401
    - Test: audit log dibuat dengan field yang benar (`action: 'DELETE_ADMIN'`, `old_value`, `entity_id`)
    - Test: `AuditLog.create` gagal → 500, `User.destroy` tidak dipanggil
    - _Requirements: 1.1, 1.6, 1.7, 2.1, 3.1, 3.2, 3.6, 3.7, 5.1_

- [x] 2. Tambah endpoint `DELETE /supervisors/:id` di backend
  - Tambahkan route handler `router.delete('/:id', authMiddleware, requireRole('admin'), ...)` di `backend/src/routes/supervisors.js`
  - Pola sama dengan task 1: self-delete guard → findOne → snapshot → AuditLog → destroy → 200
  - Action audit log: `DELETE_SUPERVISOR`, entity_type: `supervisor`
  - _Requirements: 1.2, 1.5, 1.6, 1.7, 3.1, 3.3, 3.6, 3.7, 5.1, 6.3_

  - [x] 2.1 Tambah unit test DELETE /supervisors/:id di `backend/tests/unit/supervisors.test.js`
    - Test: admin berhasil menghapus supervisor → 200
    - Test: supervisor tidak ditemukan → 404
    - Test: non-admin → 403
    - Test: request tanpa token → 401
    - Test: audit log dibuat dengan `action: 'DELETE_SUPERVISOR'`
    - Test: `AuditLog.create` gagal → 500, `User.destroy` tidak dipanggil
    - _Requirements: 1.2, 1.6, 1.7, 3.1, 3.3, 3.6, 3.7, 5.1_

- [x] 3. Tambah endpoint `DELETE /viewers/:id` di backend
  - Tambahkan route handler `router.delete('/:id', authMiddleware, requireRole('admin'), ...)` di `backend/src/routes/viewers.js`
  - Pola sama: self-delete guard → findOne → snapshot → AuditLog → destroy → 200
  - Action audit log: `DELETE_VIEWER`, entity_type: `viewer`
  - _Requirements: 1.3, 1.5, 1.6, 1.7, 3.1, 3.4, 3.6, 3.7, 5.1, 6.3_

  - [x] 3.1 Tambah unit test DELETE /viewers/:id di `backend/tests/unit/viewers.test.js` (buat file baru jika belum ada)
    - Test: admin berhasil menghapus viewer → 200
    - Test: viewer tidak ditemukan → 404
    - Test: non-admin → 403
    - Test: request tanpa token → 401
    - Test: audit log dibuat dengan `action: 'DELETE_VIEWER'`
    - Test: `AuditLog.create` gagal → 500, `User.destroy` tidak dipanggil
    - _Requirements: 1.3, 1.6, 1.7, 3.1, 3.4, 3.6, 3.7, 5.1_

- [x] 4. Tambah endpoint `DELETE /surveyors/:id` di backend
  - Tambahkan route handler `router.delete('/:id', requireRole('admin'), ...)` di `backend/src/routes/surveyors.js`
  - Perhatian: route ini berada di bawah `router.use(authMiddleware, requireRole(['admin', 'supervisor']))` — override dengan `requireRole('admin')` eksplisit per-route agar supervisor tidak bisa delete
  - Pola sama: self-delete guard → findOne → snapshot → AuditLog → destroy → 200
  - Action audit log: `DELETE_SURVEYOR`, entity_type: `surveyor`
  - `surveyor_quotas` akan terhapus otomatis via `ON DELETE CASCADE` — tidak perlu kode tambahan
  - _Requirements: 1.4, 1.5, 1.6, 1.7, 3.1, 3.5, 3.6, 3.7, 5.1, 6.1, 6.3_

  - [x] 4.1 Tambah unit test DELETE /surveyors/:id di `backend/tests/unit/surveyors.test.js`
    - Test: admin berhasil menghapus surveyor → 200
    - Test: surveyor tidak ditemukan → 404
    - Test: supervisor mencoba delete surveyor → 403 (override requireRole)
    - Test: non-admin lainnya → 403
    - Test: request tanpa token → 401
    - Test: audit log dibuat dengan `action: 'DELETE_SURVEYOR'`
    - Test: `AuditLog.create` gagal → 500, `User.destroy` tidak dipanggil
    - _Requirements: 1.4, 1.6, 1.7, 3.1, 3.5, 3.6, 3.7, 5.1, 8.1, 8.2_

- [x] 5. Checkpoint — Pastikan semua unit test backend lulus
  - Pastikan semua tests pass, tanyakan ke user jika ada pertanyaan.

- [x] 6. Buat property-based tests backend di `backend/tests/properties/adminDeleteUser.property.test.js`
  - [x] 6.1 Tulis property test untuk Property 2: Self-delete selalu ditolak
    - Gunakan `fc.record({ name: fc.string(), email: fc.emailAddress() })` untuk generate data admin
    - Setup: mock `User.findOne` dengan admin yang di-generate, buat token untuk admin tersebut
    - Act: panggil `DELETE /admins/{id}` dengan token admin yang sama
    - Assert: `response.status === 403` untuk semua input
    - Annotasi: `// Feature: admin-delete-user, Property 2: Self-delete selalu ditolak`
    - `numRuns: 100`
    - _Requirements: 2.1, 2.2_

  - [x] 6.2 Tulis property test untuk Property 5: Non-admin selalu ditolak di semua endpoint delete
    - Gunakan `fc.record({ role: fc.constantFrom('supervisor', 'viewer', 'surveyor'), endpoint: fc.constantFrom('/admins', '/supervisors', '/viewers', '/surveyors'), targetId: fc.uuid() })`
    - Setup: generate token untuk role non-admin
    - Act: panggil `DELETE {endpoint}/{targetId}`
    - Assert: `response.status === 403` untuk semua kombinasi
    - Annotasi: `// Feature: admin-delete-user, Property 5: Non-admin selalu ditolak`
    - `numRuns: 100`
    - _Requirements: 5.1, 5.2, 5.3, 8.1, 8.2_

- [x] 7. Tambah tombol "Hapus" di `frontend/src/pages/UserManagement.jsx`
  - Tambahkan state `confirmDeleteId` (string | null) untuk menyimpan ID user yang sedang dikonfirmasi
  - Tambahkan handler `handleDelete(user)` yang memanggil `api.delete(activeTab.endpoint + '/' + user.id)`, lalu `fetchUsers()` dan set `successMsg`
  - Tambahkan tombol "Hapus" di kolom Aksi setiap baris, mengikuti pola inline confirmation yang sama dengan tombol "Nonaktifkan":
    - Klik pertama: `setConfirmDeleteId(user.id)` → tampilkan "Hapus permanen?" + tombol "Ya, Hapus" (merah) + "Batal"
    - Klik "Ya, Hapus": panggil `handleDelete(user)`
    - Klik "Batal": `setConfirmDeleteId(null)`
  - Self-delete guard: jika `isSelf === true`, render tombol "Hapus" sebagai `disabled` dengan `title="Tidak dapat menghapus akun sendiri"`
  - Visibility guard: tombol "Hapus" hanya dirender jika `currentUser.role === 'admin'`
  - Tombol "Hapus" tampil terlepas dari status `is_active` akun target
  - Reset `confirmDeleteId` saat tab berubah (tambahkan ke `handleTabChange`)
  - _Requirements: 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.5, 7.1, 7.3, 7.4, 7.5_

  - [x] 7.1 Update unit test di `frontend/src/pages/__tests__/UserManagement.test.jsx`
    - Test: tombol "Hapus" muncul untuk setiap baris ketika `currentUser.role === 'admin'`
    - Test: tombol "Hapus" tidak muncul ketika `currentUser.role === 'supervisor'`
    - Test: tombol "Hapus" tidak muncul ketika `currentUser.role === 'viewer'`
    - Test: tombol "Hapus" disabled untuk baris `currentUser` (self) dengan `title` yang benar
    - Test: klik tombol "Hapus" menampilkan confirmation inline dengan nama user
    - Test: klik "Batal" menutup confirmation tanpa memanggil `api.delete`
    - Test: klik "Ya, Hapus" memanggil `api.delete` dengan endpoint yang sesuai
    - Test: setelah sukses — pesan sukses muncul, `api.get` dipanggil ulang
    - Test: setelah error — pesan error muncul, dialog ditutup
    - _Requirements: 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.5, 7.1, 7.3, 7.4, 7.5_

- [x] 8. Tambah tombol "Hapus" di `frontend/src/pages/Surveyors.jsx`
  - Tambahkan state `confirmDeleteId` (string | null)
  - Tambahkan handler `handleDeleteSurveyor(surveyor)` yang memanggil `api.delete('/surveyors/' + surveyor.id)`, lalu `fetchSurveyors()` dan set `successMsg`
  - Tambahkan tombol "Hapus" di kolom Aksi setiap baris dengan pola inline confirmation yang sama
  - Tidak ada self-delete concern di halaman ini (admin tidak bisa menjadi surveyor) — tombol selalu enabled
  - Tombol "Hapus" hanya dirender jika `currentUser.role === 'admin'` (baca dari `localStorage`)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.2, 7.3, 7.5_

  - [x] 8.1 Buat atau update unit test di `frontend/src/pages/__tests__/Surveyors.test.jsx`
    - Test: tombol "Hapus" muncul untuk setiap baris ketika `currentUser.role === 'admin'`
    - Test: tombol "Hapus" tidak muncul ketika `currentUser.role === 'supervisor'`
    - Test: klik tombol "Hapus" menampilkan confirmation inline dengan nama surveyor
    - Test: klik "Batal" menutup confirmation tanpa memanggil `api.delete`
    - Test: klik "Ya, Hapus" memanggil `api.delete('/surveyors/{id}')`
    - Test: setelah sukses — pesan sukses muncul, list di-refresh
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.2, 7.3, 7.5_

- [x] 9. Checkpoint — Pastikan semua unit test frontend lulus
  - Pastikan semua tests pass, tanyakan ke user jika ada pertanyaan.

- [x] 10. Buat property-based tests frontend
  - [ ]* 10.1 Tulis property test untuk Property 6: Tombol Hapus ada untuk setiap baris user (sebagai admin)
    - Gunakan `fc.array(fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }), email: fc.emailAddress(), is_active: fc.boolean() }), { minLength: 1 })`
    - Render `UserManagement` dengan `currentUser.role = 'admin'` dan `currentUser.id` berbeda dari semua user
    - Assert: setiap baris memiliki tombol "Hapus" yang dapat diklik (tidak disabled)
    - Assert: tidak ada baris yang memiliki tombol "Hapus" disabled (karena currentUser bukan bagian dari list)
    - Annotasi: `// Feature: admin-delete-user, Property 6: Tombol Hapus ada untuk setiap baris user`
    - `numRuns: 50`
    - _Requirements: 7.1, 7.4, 7.5_

  - [ ]* 10.2 Tulis property test untuk Property 7: Confirmation dialog menampilkan nama user
    - Gunakan `fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }), email: fc.emailAddress(), is_active: fc.boolean() })`
    - Render `UserManagement` dengan satu user tersebut, `currentUser.role = 'admin'`, `currentUser.id` berbeda
    - Klik tombol "Hapus" pada baris user
    - Assert: teks konfirmasi yang muncul mengandung `user.name`
    - Annotasi: `// Feature: admin-delete-user, Property 7: Confirmation dialog menampilkan nama user`
    - `numRuns: 50`
    - _Requirements: 4.1_

- [x] 11. Final checkpoint — Pastikan semua tests lulus
  - Pastikan semua tests pass, tanyakan ke user jika ada pertanyaan.

## Notes

- Tasks bertanda `*` adalah opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirements spesifik untuk traceability
- Urutan operasi backend yang kritis: AuditLog.create **sebelum** user.destroy() — jika AuditLog gagal, destroy tidak dipanggil
- Tidak ada perubahan migrasi database — CASCADE dan SET NULL sudah ada di skema
- Untuk `surveyors.js`, route DELETE harus menggunakan `requireRole('admin')` eksplisit karena `router.use` mengizinkan supervisor
- Property tests backend menggunakan **fast-check** (sudah ada di `backend/tests/properties/`)
- Property tests frontend menggunakan **fast-check** (sudah ada di `frontend/src/utils/__tests__/`)
