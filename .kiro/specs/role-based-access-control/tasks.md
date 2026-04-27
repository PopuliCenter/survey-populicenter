# Implementation Plan: Role-Based Access Control (RBAC)

## Overview

Implementasi perluasan RBAC dari dua role (`admin`, `surveyor`) menjadi empat role (`admin`, `supervisor`, `viewer`, `surveyor`). Perubahan bersifat additive — migration database baru, update middleware, route baru, update route yang ada, dan update frontend. Semua akun lama tetap berfungsi tanpa perubahan data.

## Tasks

- [x] 1. Database migration dan model update
  - Buat file `backend/src/migrations/20240102000001-update-role-constraint.js` yang menjalankan ALTER TABLE dalam satu transaksi: DROP CONSTRAINT lama lalu ADD CONSTRAINT baru dengan empat nilai valid (`admin`, `supervisor`, `viewer`, `surveyor`)
  - Implementasikan fungsi `down` untuk rollback ke constraint dua role
  - Gunakan `DROP CONSTRAINT IF EXISTS` agar idempoten
  - Update `backend/src/models/User.js`: ubah `validate.isIn` dari `[['admin', 'surveyor']]` menjadi `[['admin', 'supervisor', 'viewer', 'surveyor']]`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 1.1 Tulis smoke test migrasi
    - Buat `backend/tests/integration/rbac-migration.test.js`
    - Verifikasi CHECK constraint setelah migration menerima keempat nilai role
    - Verifikasi data lama (admin, surveyor) tidak berubah
    - Verifikasi migration idempoten (tidak error jika dijalankan ulang)
    - _Requirements: 12.1, 12.3, 12.5_

- [x] 2. Update middleware `requireRole` agar mendukung array role
  - Edit `backend/src/middleware/auth.js`: ubah parameter `role` (string) menjadi `roles` (string | string[])
  - Normalisasi ke array: `const allowedRoles = Array.isArray(roles) ? roles : [roles];`
  - Ubah pengecekan dari `req.user.role !== role` menjadi `!allowedRoles.includes(req.user.role)`
  - Pastikan semua call site yang ada (`requireRole('admin')`) tetap berfungsi tanpa perubahan
  - Tambahkan helper `isValidRole(roleStr)` yang mengembalikan `true` hanya untuk keempat nilai valid — digunakan oleh property test dan validasi input
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 11.3_

  - [ ]* 2.1 Tulis property test untuk `requireRole` dan `isValidRole`
    - Buat `backend/tests/properties/rbac.property.test.js`
    - **Property 1: Validasi Role — Hanya Empat Nilai Valid**
      - `fc.assert(fc.property(fc.string(), (roleStr) => isValidRole(roleStr) === ['admin','supervisor','viewer','surveyor'].includes(roleStr)), { numRuns: 100 })`
      - **Validates: Requirements 1.1, 1.3**
    - **Property 2: Access Matrix — Unauthorized Role Selalu Mendapat 403**
      - Enumerate semua kombinasi (role, allowedRoles) di mana role tidak ada dalam allowedRoles; verifikasi `requireRole` mengembalikan 403
      - **Validates: Requirements 6.3, 7.1, 7.2, 11.1**
    - **Property 3: Access Matrix — Authorized Role Tidak Pernah Mendapat 403**
      - Enumerate semua kombinasi (role, allowedRoles) di mana role ada dalam allowedRoles; verifikasi `requireRole` meneruskan ke `next()`
      - **Validates: Requirements 6.2, 7.1, 11.2**
    - **Property 4: Idempotency `requireRole`**
      - `fc.assert(fc.property(fc.constantFrom('admin','supervisor','viewer','surveyor'), fc.subarray([...], {minLength:1}), (userRole, allowedRoles) => evaluateRequireRole(userRole, allowedRoles) === evaluateRequireRole(userRole, allowedRoles)), { numRuns: 100 })`
      - **Validates: Requirements 11.3**
    - _Requirements: 1.1, 1.3, 6.2, 6.3, 7.1, 11.1, 11.2, 11.3_

- [x] 3. Buat route `/supervisors`
  - Buat `backend/src/routes/supervisors.js` dengan pola yang sama seperti `admins.js` dan `surveyors.js`
  - Implementasikan endpoint:
    - `GET /supervisors` — `requireRole(['admin', 'supervisor'])` — list semua supervisor
    - `POST /supervisors` — `requireRole('admin')` — buat akun supervisor baru (validasi password, cek duplikat email, hash password, audit log `CREATE_SUPERVISOR`)
    - `PUT /supervisors/:id` — `requireRole(['admin', 'supervisor'])` — update data; jika role `supervisor`, validasi `req.params.id === req.user.id` (self-update only), kembalikan 403 jika bukan diri sendiri
    - `PATCH /supervisors/:id/deactivate` — `requireRole('admin')` — nonaktifkan; tolak self-deactivation dengan 403
    - `PATCH /supervisors/:id/activate` — `requireRole('admin')` — aktifkan
  - Setiap operasi tulis mencatat audit log dengan action yang sesuai (`CREATE_SUPERVISOR`, `UPDATE_SUPERVISOR`, `DEACTIVATE_SUPERVISOR`, `ACTIVATE_SUPERVISOR`)
  - Daftarkan route di `backend/src/app.js`: `app.use('/supervisors', require('./routes/supervisors'))`
  - _Requirements: 2.1, 2.3, 2.4, 3.8, 3.9, 5.1, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 7.1_

  - [ ]* 3.1 Tulis unit test untuk route `/supervisors`
    - Buat `backend/tests/unit/supervisors.test.js`
    - Test: admin dapat list supervisor, buat supervisor baru, deactivate supervisor
    - Test: supervisor dapat list supervisor, update diri sendiri (self-update)
    - Test: supervisor mendapat 403 saat mencoba update supervisor lain
    - Test: supervisor mendapat 403 saat mencoba deactivate supervisor
    - Test: duplikat email mengembalikan 409
    - Test: password tidak valid mengembalikan 422
    - Test: audit log dicatat untuk setiap operasi tulis
    - _Requirements: 2.3, 2.4, 3.8, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ]* 3.2 Tulis property test untuk supervisor tidak dapat membuat admin/supervisor
    - Di `backend/tests/properties/rbac.property.test.js` (tambahkan ke file yang sudah ada)
    - **Property 5: Supervisor Tidak Dapat Membuat Akun Admin atau Supervisor**
      - `fc.assert(fc.property(fc.record({name: fc.string({minLength:1}), email: fc.emailAddress(), password: validPasswordArb}), fc.constantFrom('admin','supervisor'), async (userData, targetRole) => { const res = await request(app).post(`/${targetRole}s`).set('Authorization', `Bearer ${supervisorToken}`).send({...userData, role: targetRole}); return res.status === 403; }), { numRuns: 100 })`
      - **Validates: Requirements 5.4, 11.4**
    - _Requirements: 5.4, 11.4_

- [x] 4. Buat route `/viewers`
  - Buat `backend/src/routes/viewers.js` dengan pola yang sama seperti `supervisors.js`
  - Implementasikan endpoint:
    - `GET /viewers` — `requireRole(['admin', 'supervisor'])` — list semua viewer
    - `POST /viewers` — `requireRole(['admin', 'supervisor'])` — buat akun viewer baru (validasi password, cek duplikat email, hash password, audit log `CREATE_VIEWER`)
    - `PUT /viewers/:id` — `requireRole(['admin', 'supervisor'])` — update data viewer (audit log `UPDATE_VIEWER`)
    - `PATCH /viewers/:id/deactivate` — `requireRole(['admin', 'supervisor'])` — nonaktifkan (audit log `DEACTIVATE_VIEWER`)
    - `PATCH /viewers/:id/activate` — `requireRole(['admin', 'supervisor'])` — aktifkan (audit log `ACTIVATE_VIEWER`)
  - Daftarkan route di `backend/src/app.js`: `app.use('/viewers', require('./routes/viewers'))`
  - _Requirements: 2.1, 2.2, 3.3, 4.7, 4.8, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10, 7.1_

  - [ ]* 4.1 Tulis unit test untuk route `/viewers`
    - Buat `backend/tests/unit/viewers.test.js`
    - Test: admin dan supervisor dapat list viewer, buat viewer baru, update viewer, deactivate viewer
    - Test: viewer mendapat 403 untuk semua operasi tulis
    - Test: duplikat email mengembalikan 409
    - Test: audit log dicatat untuk setiap operasi tulis
    - _Requirements: 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ]* 4.2 Tulis property test untuk audit log supervisor dan viewer
    - Di `backend/tests/properties/rbac.property.test.js` (tambahkan ke file yang sudah ada)
    - **Property 6: Audit Log Selalu Dicatat untuk Operasi Supervisor dan Viewer**
      - Untuk setiap operasi create/update/deactivate yang berhasil pada supervisor atau viewer, verifikasi entri baru di `audit_logs` dengan action yang sesuai, `user_id` pembuat, dan timestamp UTC
      - **Validates: Requirements 5.6, 5.7, 5.8**
    - _Requirements: 5.6, 5.7, 5.8_

- [x] 5. Checkpoint — Verifikasi backend baru
  - Pastikan semua unit test dan property test yang sudah ditulis lulus
  - Pastikan `requireRole('admin')` (string tunggal) masih berfungsi di semua route yang belum diubah
  - Pastikan tidak ada route yang mengekspos endpoint tanpa autentikasi
  - Tanyakan kepada user jika ada pertanyaan sebelum melanjutkan ke update route yang ada

- [x] 6. Update route yang ada sesuai access matrix
  - Edit `backend/src/routes/surveys.js`:
    - `GET /surveys` dan `GET /surveys/:id`: ubah ke `requireRole(['admin', 'supervisor', 'viewer', 'surveyor'])`
    - Semua write ops (`POST`, `PUT`, `PATCH`, `DELETE`): ubah ke `requireRole(['admin', 'supervisor'])`
  - Edit `backend/src/routes/questions.js`:
    - Read ops (`GET /surveys/:id/questions`): ubah ke `requireRole(['admin', 'supervisor', 'viewer', 'surveyor'])`
    - Write ops (`POST`, `PUT`, `DELETE`, `PATCH reorder`): ubah ke `requireRole(['admin', 'supervisor'])`
  - Edit `backend/src/routes/surveyors.js`:
    - Ubah `router.use(authMiddleware, requireRole('admin'))` menjadi `requireRole(['admin', 'supervisor'])`
    - Endpoint `GET /:id/quota` sudah memiliki logika role-check sendiri — tambahkan supervisor ke daftar yang diizinkan
  - Edit `backend/src/routes/responses.js`:
    - Read ops: ubah ke `requireRole(['admin', 'supervisor', 'viewer'])`
  - Edit `backend/src/routes/reports.js`:
    - Semua ops: ubah ke `requireRole(['admin', 'supervisor', 'viewer'])`
  - Edit `backend/src/routes/dashboard.js`:
    - Semua ops: ubah ke `requireRole(['admin', 'supervisor'])`
  - Edit `backend/src/routes/map.js`:
    - Read ops: ubah ke `requireRole(['admin', 'supervisor', 'viewer'])`
  - Edit `backend/src/routes/upload.js`:
    - `POST /upload/photo`: ubah ke `requireRole(['admin', 'supervisor', 'surveyor'])`
  - `backend/src/routes/audit-logs.js` dan `backend/src/routes/admins.js`: tidak berubah (tetap `requireRole('admin')`)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.10, 3.11, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1, 7.2_

  - [x] 6.1 Update unit test yang ada untuk mencakup role baru
    - Update `backend/tests/unit/surveyors.test.js`: tambahkan test supervisor dapat mengakses endpoint surveyors
    - Update `backend/tests/unit/surveys.test.js`: tambahkan test supervisor dapat write, viewer hanya read
    - Update `backend/tests/unit/reports.test.js`: tambahkan test supervisor dan viewer dapat mengakses reports
    - Update `backend/tests/unit/dashboard.test.js`: tambahkan test supervisor dapat akses, viewer mendapat 403
    - Update `backend/tests/unit/responses.test.js`: tambahkan test supervisor dan viewer dapat read responses
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.5, 4.6, 4.9_

- [x] 7. Update auth route untuk login supervisor dan viewer
  - Edit `backend/src/routes/auth.js`: pastikan audit log `LOGIN` dan `LOGOUT` dicatat untuk semua role (termasuk supervisor dan viewer) — verifikasi logika audit log sudah generic berdasarkan `req.user.id`
  - Pastikan JWT payload menyertakan field `role` dengan nilai yang benar untuk supervisor dan viewer
  - Masa berlaku token 8 jam untuk semua role (tidak ada perubahan jika sudah generic)
  - _Requirements: 6.6, 6.7, 6.8, 10.5, 10.6_

  - [ ]* 7.1 Update unit test auth untuk role baru
    - Update `backend/tests/unit/auth.test.js`:
      - Test login dengan role supervisor: JWT payload mengandung `role: 'supervisor'`
      - Test login dengan role viewer: JWT payload mengandung `role: 'viewer'`
      - Test masa berlaku token 8 jam untuk supervisor dan viewer
      - Test audit log LOGIN dicatat untuk supervisor dan viewer
    - _Requirements: 6.6, 6.7, 6.8, 10.5_

  - [ ]* 7.2 Tulis property test untuk JWT payload
    - Di `backend/tests/properties/rbac.property.test.js` (tambahkan ke file yang sudah ada)
    - **Property 8: JWT Payload Mengandung Role yang Benar**
      - Untuk setiap akun dengan role `supervisor` atau `viewer` yang berhasil login, JWT yang diterbitkan mengandung field `role` identik dengan role di database
      - **Validates: Requirements 6.6**
    - **Property 9: Duplikasi Email Selalu Ditolak**
      - Untuk setiap email yang sudah terdaftar, upaya pembuatan akun baru dengan role apapun selalu ditolak dengan HTTP 409
      - **Validates: Requirements 5.10**
    - _Requirements: 6.6, 5.10_

- [x] 8. Checkpoint — Verifikasi backend lengkap
  - Jalankan seluruh test suite backend: `cd backend && npm test`
  - Pastikan semua unit test dan property test lulus
  - Pastikan access matrix dari Requirement 7 sudah terimplementasi penuh di semua route
  - Tanyakan kepada user jika ada pertanyaan sebelum melanjutkan ke frontend

- [x] 9. Update frontend `ProtectedRoute` di `App.jsx`
  - Edit `frontend/src/App.jsx`:
    - Update `ProtectedRoute`: ubah parameter `role` agar mendukung string atau array; normalisasi ke array dan gunakan `allowedRoles.includes(user.role)`
    - Tambahkan redirect ke halaman utama per role (bukan ke `/login`) ketika role tidak diizinkan: `{ admin: '/dashboard', supervisor: '/surveys', viewer: '/reports', surveyor: '/surveyor' }`
    - Import `UserManagement` (akan dibuat di task 11) dan tambahkan route `/users`
    - Update route `/dashboard`: ubah ke `role={['admin', 'supervisor']}`
    - Update route `/surveyors`: ubah ke `role={['admin', 'supervisor']}`
    - Update route `/surveys` dan `/surveys/:id/builder`: ubah ke `role={['admin', 'supervisor', 'viewer', 'surveyor']}`
    - Update route `/responses` dan `/responses/:id`: ubah ke `role={['admin', 'supervisor', 'viewer']}`
    - Update route `/reports`: ubah ke `role={['admin', 'supervisor', 'viewer']}`
    - Update route `/map`: ubah ke `role={['admin', 'supervisor', 'viewer']}`
    - Tambahkan `<Navigate from="/admin-users" to="/users" replace />` untuk backward compatibility URL
    - _Requirements: 8.8, 8.9, 10.1_

- [x] 10. Update `Layout.jsx` dengan navigasi dinamis per role
  - Edit `frontend/src/components/Layout.jsx`:
    - Ganti konstanta `navItems` (array statis) dengan objek `NAV_ITEMS_BY_ROLE` yang memetakan setiap role ke daftar item navigasinya sesuai desain
    - Baca `user.role` dari `localStorage` dan gunakan `NAV_ITEMS_BY_ROLE[user.role] || []` untuk merender navigasi
    - Update label sidebar dari "Admin Dashboard" menjadi label yang sesuai role (misal: "Supervisor Dashboard" untuk supervisor)
    - Pastikan surveyor tetap menggunakan layout terpisah (tidak ada perubahan untuk route surveyor)
    - _Requirements: 8.1, 8.2, 8.6_

  - [ ]* 10.1 Tulis property test untuk navigasi UI
    - Buat `frontend/src/components/__tests__/Layout.test.jsx` (atau update jika sudah ada)
    - **Property 7: Navigasi UI Konsisten dengan Role**
      - Untuk setiap nilai role valid (`admin`, `supervisor`, `viewer`), fungsi `getNavItemsForRole(role)` mengembalikan tepat himpunan item navigasi yang didefinisikan — tidak lebih, tidak kurang
      - **Validates: Requirements 8.1, 8.2**
    - Test: admin melihat semua 8 menu item termasuk Dashboard dan Audit Log
    - Test: supervisor melihat 6 menu item tanpa Manajemen Pengguna dan Audit Log
    - Test: viewer melihat 3 menu item (Reports, Map, Responses)
    - _Requirements: 8.1, 8.2, 8.6_

- [x] 11. Buat halaman `UserManagement.jsx`
  - Buat `frontend/src/pages/UserManagement.jsx` sebagai pengganti `AdminUsers.jsx`
  - Implementasikan tab navigation: Admin, Supervisor, Viewer
  - Visibilitas tab per role: admin melihat semua tab; supervisor hanya melihat tab Viewer
  - Setiap tab memanggil endpoint yang sesuai (`/admins`, `/supervisors`, `/viewers`) dan menampilkan tabel dengan kolom: Nama, Email, Status, Tanggal Dibuat, Aksi
  - Tombol "Tambah" membuka form modal dengan dropdown role yang difilter berdasarkan role pengguna yang login:
    - Admin: dapat memilih Admin, Supervisor, atau Viewer
    - Supervisor: hanya dapat memilih Viewer
  - Form modal memanggil endpoint yang sesuai berdasarkan role yang dipilih (`POST /admins`, `POST /supervisors`, atau `POST /viewers`)
  - Tombol Edit dan Nonaktifkan per baris; cegah self-deactivation (disable tombol + tooltip)
  - Pertahankan `AdminUsers.jsx` yang ada (jangan hapus) — `UserManagement.jsx` adalah halaman baru yang didaftarkan di route `/users`
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 11.1 Tulis unit test untuk `UserManagement.jsx`
    - Buat `frontend/src/pages/__tests__/UserManagement.test.jsx`
    - Test: admin melihat tiga tab (Admin, Supervisor, Viewer)
    - Test: supervisor hanya melihat tab Viewer
    - Test: form modal admin menampilkan dropdown role dengan tiga pilihan
    - Test: form modal supervisor menampilkan dropdown role dengan satu pilihan (Viewer)
    - Test: tombol Nonaktifkan dinonaktifkan untuk akun sendiri
    - _Requirements: 9.1, 9.4, 9.5, 9.7, 9.8_

- [x] 12. Final checkpoint — Verifikasi end-to-end
  - Jalankan seluruh test suite frontend: `cd frontend && npm test -- --run`
  - Jalankan seluruh test suite backend: `cd backend && npm test`
  - Pastikan semua test lulus
  - Verifikasi tidak ada import yang rusak setelah penambahan `UserManagement.jsx`
  - Tanyakan kepada user jika ada pertanyaan sebelum dianggap selesai

## Notes

- Task bertanda `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirements spesifik untuk traceability
- Checkpoint di task 5, 8, dan 12 memastikan validasi inkremental
- Property tests memvalidasi properti universal; unit tests memvalidasi contoh spesifik dan edge case
- Semua call site `requireRole('admin')` yang ada tetap berfungsi tanpa perubahan setelah update middleware (backward compatible)
- `AdminUsers.jsx` dipertahankan; `UserManagement.jsx` adalah halaman baru di route `/users`
