# Requirements Document

## Introduction

Fitur ini menambahkan dua role baru — **supervisor** dan **viewer** — ke dalam sistem Role-Based Access Control (RBAC) aplikasi survei web yang sudah ada. Saat ini aplikasi hanya memiliki dua role: `admin` (akses penuh) dan `surveyor` (mengisi survei). Penambahan role baru memungkinkan delegasi akses yang lebih granular: supervisor dapat mengelola kuesioner dan surveyor tanpa bisa menyentuh akun admin lain, sedangkan viewer hanya dapat membaca dan mengunduh laporan tanpa mengubah data apapun.

Perubahan ini berdampak pada: model database `users`, middleware otorisasi backend, semua route API yang saat ini hanya mengizinkan `admin`, dan komponen navigasi/UI frontend yang perlu menyembunyikan atau menonaktifkan elemen berdasarkan role pengguna yang sedang login.

## Glossary

- **RBAC_System**: Sistem kontrol akses berbasis role yang menentukan hak akses setiap pengguna berdasarkan role yang ditetapkan.
- **Admin**: Pengguna dengan akses penuh ke seluruh fitur, termasuk manajemen akun admin lain.
- **Supervisor**: Pengguna yang dapat mengelola kuesioner (survei & pertanyaan), mengelola surveyor, dan melihat laporan, tetapi tidak dapat mengelola akun admin.
- **Viewer**: Pengguna yang hanya dapat membaca data dan mengunduh laporan; tidak dapat mengubah data apapun.
- **Surveyor**: Pengguna yang hanya dapat mengisi survei melalui antarmuka surveyor; tidak berubah dari implementasi saat ini.
- **Permission_Guard**: Middleware backend yang memvalidasi apakah role pengguna yang sedang login memiliki izin untuk mengakses endpoint tertentu.
- **UI_Guard**: Komponen atau logika frontend yang menyembunyikan atau menonaktifkan elemen antarmuka berdasarkan role pengguna.
- **Audit_Logger**: Komponen yang mencatat semua aktivitas penting ke tabel `audit_logs`.
- **Access_Matrix**: Tabel yang mendefinisikan kombinasi role dan resource beserta operasi yang diizinkan.

---

## Requirements

### Requirement 1: Perluasan Model Role Pengguna

**User Story:** Sebagai admin, saya ingin sistem mendukung empat role pengguna (admin, supervisor, viewer, surveyor), sehingga saya dapat mendelegasikan akses secara granular tanpa memberikan hak penuh kepada semua pengguna.

#### Acceptance Criteria

1. THE RBAC_System SHALL mendukung tepat empat nilai role yang valid: `admin`, `supervisor`, `viewer`, dan `surveyor`.
2. WHEN pengguna baru dibuat dengan role `supervisor` atau `viewer`, THE RBAC_System SHALL menyimpan nilai role tersebut ke kolom `role` pada tabel `users`.
3. IF nilai role yang diberikan bukan salah satu dari `admin`, `supervisor`, `viewer`, atau `surveyor`, THEN THE RBAC_System SHALL menolak pembuatan akun dengan HTTP 422 dan pesan error yang deskriptif.
4. THE RBAC_System SHALL mempertahankan kompatibilitas mundur sehingga semua akun `admin` dan `surveyor` yang sudah ada tetap berfungsi tanpa perubahan data.
5. WHEN migrasi database dijalankan, THE RBAC_System SHALL memperbarui constraint CHECK pada kolom `role` di tabel `users` untuk menerima keempat nilai role yang valid.

---

### Requirement 2: Hak Akses Role Admin

**User Story:** Sebagai admin, saya ingin memiliki akses penuh ke seluruh fitur termasuk manajemen akun admin lain, sehingga saya dapat mengelola seluruh platform tanpa batasan.

#### Acceptance Criteria

1. THE Admin SHALL memiliki akses baca dan tulis ke semua endpoint: `/admins`, `/supervisors`, `/viewers`, `/surveyors`, `/surveys`, `/surveys/:id/questions`, `/responses`, `/reports`, `/map`, `/audit-log`, dan `/dashboard`.
2. WHEN Admin mengakses endpoint `/admins`, THE Admin SHALL dapat membuat, membaca, memperbarui, dan menonaktifkan akun admin lain.
3. THE Admin SHALL dapat membuat akun dengan role `supervisor` dan `viewer`.
4. THE Admin SHALL dapat menonaktifkan akun dengan role `supervisor` dan `viewer`.
5. IF Admin mencoba menonaktifkan akun miliknya sendiri, THEN THE RBAC_System SHALL menolak operasi dengan HTTP 403 dan pesan "Tidak dapat menonaktifkan akun sendiri".

---

### Requirement 3: Hak Akses Role Supervisor

**User Story:** Sebagai supervisor, saya ingin dapat mengelola kuesioner dan surveyor serta melihat laporan, sehingga saya dapat menjalankan operasional survei tanpa memerlukan akses admin penuh.

#### Acceptance Criteria

1. THE Supervisor SHALL dapat membaca, membuat, memperbarui, mengaktifkan, dan menonaktifkan survei melalui endpoint `/surveys`.
2. THE Supervisor SHALL dapat membaca, membuat, memperbarui, menghapus, dan mengurutkan ulang pertanyaan melalui endpoint `/surveys/:id/questions`.
3. THE Supervisor SHALL dapat membaca daftar surveyor, membuat akun surveyor baru, memperbarui data surveyor, mengaktifkan, dan menonaktifkan akun surveyor melalui endpoint `/surveyors`.
4. THE Supervisor SHALL dapat membaca dan mengunduh laporan melalui endpoint `/reports/surveys/:id`, `/reports/surveys/:id/export/xlsx`, dan `/reports/surveys/:id/export/csv`.
5. THE Supervisor SHALL dapat membaca data responden melalui endpoint `/responses` dan `/responses/:id`.
6. THE Supervisor SHALL dapat membaca data peta melalui endpoint `/map/points`.
7. THE Supervisor SHALL dapat membaca statistik dashboard melalui endpoint `/dashboard/stats`, `/dashboard/trend`, dan `/dashboard/top-surveyors`.
8. IF Supervisor mencoba mengakses endpoint `/admins`, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
9. IF Supervisor mencoba mengakses endpoint untuk membuat, memperbarui, atau menonaktifkan akun dengan role `admin`, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
10. IF Supervisor mencoba mengakses endpoint `/audit-log`, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
11. THE Supervisor SHALL dapat membaca dan mengelola kuota surveyor melalui endpoint `/surveyors/:id/quota`.

---

### Requirement 4: Hak Akses Role Viewer

**User Story:** Sebagai viewer, saya ingin dapat melihat dan mengunduh laporan survei, sehingga saya dapat menganalisis data tanpa risiko mengubah atau menghapus data apapun.

#### Acceptance Criteria

1. THE Viewer SHALL dapat membaca laporan melalui endpoint `GET /reports/surveys/:id` dengan filter tanggal, surveyor, dan geo_status.
2. THE Viewer SHALL dapat mengunduh laporan melalui endpoint `POST /reports/surveys/:id/export/xlsx` dan `POST /reports/surveys/:id/export/csv`.
3. THE Viewer SHALL dapat memeriksa status dan mengunduh hasil ekspor asinkron melalui endpoint `GET /reports/exports/:jobId` dan `GET /reports/exports/:jobId/download`.
4. THE Viewer SHALL dapat membaca daftar survei melalui endpoint `GET /surveys` (hanya survei aktif dan nonaktif, tidak termasuk draft).
5. THE Viewer SHALL dapat membaca data responden melalui endpoint `GET /responses` dan `GET /responses/:id`.
6. THE Viewer SHALL dapat membaca data peta melalui endpoint `GET /map/points`.
7. IF Viewer mencoba mengakses endpoint yang melakukan operasi tulis (POST, PUT, PATCH, DELETE) selain endpoint ekspor laporan, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
8. IF Viewer mencoba mengakses endpoint `/admins`, `/surveyors` (operasi tulis), `/surveys` (operasi tulis), atau `/audit-log`, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
9. IF Viewer mencoba mengakses endpoint `/dashboard`, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.

---

### Requirement 5: Pembuatan Akun Supervisor dan Viewer

**User Story:** Sebagai admin atau supervisor, saya ingin dapat membuat akun supervisor dan viewer, sehingga saya dapat mendelegasikan akses kepada anggota tim yang tepat.

#### Acceptance Criteria

1. THE Admin SHALL dapat membuat akun dengan role `supervisor` melalui endpoint `POST /users` atau endpoint manajemen pengguna yang sesuai.
2. THE Admin SHALL dapat membuat akun dengan role `viewer` melalui endpoint yang sama.
3. THE Supervisor SHALL dapat membuat akun dengan role `viewer`.
4. IF Supervisor mencoba membuat akun dengan role `admin` atau `supervisor`, THEN THE Permission_Guard SHALL menolak operasi dengan HTTP 403.
5. IF Supervisor mencoba membuat akun dengan role `surveyor`, THE Supervisor SHALL diizinkan karena pembuatan surveyor termasuk dalam hak akses supervisor.
6. WHEN akun `supervisor` atau `viewer` baru dibuat, THE Audit_Logger SHALL mencatat aksi `CREATE_SUPERVISOR` atau `CREATE_VIEWER` beserta ID pembuat, timestamp UTC, dan IP address ke tabel `audit_logs`.
7. WHEN akun `supervisor` atau `viewer` dinonaktifkan, THE Audit_Logger SHALL mencatat aksi `DEACTIVATE_SUPERVISOR` atau `DEACTIVATE_VIEWER` ke tabel `audit_logs`.
8. WHEN akun `supervisor` atau `viewer` diperbarui, THE Audit_Logger SHALL mencatat aksi `UPDATE_SUPERVISOR` atau `UPDATE_VIEWER` ke tabel `audit_logs`.
9. THE RBAC_System SHALL memvalidasi password akun supervisor dan viewer menggunakan aturan yang sama: minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka.
10. IF email yang digunakan untuk membuat akun supervisor atau viewer sudah terdaftar di sistem, THEN THE RBAC_System SHALL menolak pembuatan dengan HTTP 409.

---

### Requirement 6: Middleware Otorisasi Multi-Role

**User Story:** Sebagai developer, saya ingin middleware otorisasi mendukung pengecekan multi-role, sehingga satu endpoint dapat diakses oleh beberapa role yang berbeda tanpa duplikasi kode.

#### Acceptance Criteria

1. THE Permission_Guard SHALL mendukung pengecekan role tunggal maupun array role, contoh: `requireRole(['admin', 'supervisor'])`.
2. WHEN pengguna dengan role yang valid mengakses endpoint yang dilindungi, THE Permission_Guard SHALL meneruskan request ke handler berikutnya.
3. IF pengguna dengan role yang tidak diizinkan mengakses endpoint yang dilindungi, THEN THE Permission_Guard SHALL mengembalikan HTTP 403 dengan pesan "Anda tidak memiliki izin untuk mengakses resource ini".
4. IF token JWT tidak ada atau tidak valid saat mengakses endpoint yang dilindungi, THEN THE Permission_Guard SHALL mengembalikan HTTP 401 dengan pesan "Sesi telah berakhir, silakan login kembali".
5. THE Permission_Guard SHALL mengevaluasi role dari payload JWT (`req.user.role`) yang sudah diverifikasi oleh `authMiddleware`.
6. WHEN JWT diterbitkan saat login untuk pengguna dengan role `supervisor` atau `viewer`, THE RBAC_System SHALL menyertakan nilai role yang benar dalam payload JWT.
7. WHEN pengguna dengan role `supervisor` login, THE RBAC_System SHALL menerbitkan JWT dengan masa berlaku 8 jam.
8. WHEN pengguna dengan role `viewer` login, THE RBAC_System SHALL menerbitkan JWT dengan masa berlaku 8 jam.

---

### Requirement 7: Access Matrix — Tabel Hak Akses Lengkap

**User Story:** Sebagai tim pengembang, saya ingin ada dokumentasi yang jelas tentang hak akses setiap role untuk setiap resource, sehingga implementasi backend dan frontend konsisten.

#### Acceptance Criteria

Tabel berikut mendefinisikan hak akses yang harus diterapkan oleh THE Permission_Guard:

| Resource / Endpoint | Admin | Supervisor | Viewer | Surveyor |
|---|---|---|---|---|
| `GET /dashboard/stats` | ✅ | ✅ | ❌ | ❌ |
| `GET /dashboard/trend` | ✅ | ✅ | ❌ | ❌ |
| `GET /dashboard/top-surveyors` | ✅ | ✅ | ❌ | ❌ |
| `GET /admins` | ✅ | ❌ | ❌ | ❌ |
| `POST /admins` | ✅ | ❌ | ❌ | ❌ |
| `PUT /admins/:id` | ✅ | ❌ | ❌ | ❌ |
| `PATCH /admins/:id/deactivate` | ✅ | ❌ | ❌ | ❌ |
| `GET /supervisors` | ✅ | ✅ | ❌ | ❌ |
| `POST /supervisors` | ✅ | ❌ | ❌ | ❌ |
| `PUT /supervisors/:id` | ✅ | ✅ (diri sendiri) | ❌ | ❌ |
| `PATCH /supervisors/:id/deactivate` | ✅ | ❌ | ❌ | ❌ |
| `GET /viewers` | ✅ | ✅ | ❌ | ❌ |
| `POST /viewers` | ✅ | ✅ | ❌ | ❌ |
| `PUT /viewers/:id` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /viewers/:id/deactivate` | ✅ | ✅ | ❌ | ❌ |
| `GET /surveyors` | ✅ | ✅ | ❌ | ❌ |
| `POST /surveyors` | ✅ | ✅ | ❌ | ❌ |
| `PUT /surveyors/:id` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /surveyors/:id/deactivate` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /surveyors/:id/activate` | ✅ | ✅ | ❌ | ❌ |
| `POST /surveyors/:id/quota` | ✅ | ✅ | ❌ | ❌ |
| `GET /surveys` | ✅ | ✅ | ✅ (aktif+nonaktif) | ✅ (aktif saja) |
| `POST /surveys` | ✅ | ✅ | ❌ | ❌ |
| `GET /surveys/:id` | ✅ | ✅ | ✅ | ✅ (aktif saja) |
| `PUT /surveys/:id` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /surveys/:id/activate` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /surveys/:id/deactivate` | ✅ | ✅ | ❌ | ❌ |
| `DELETE /surveys/:id` | ✅ | ✅ | ❌ | ❌ |
| `GET /surveys/:id/questions` | ✅ | ✅ | ✅ | ✅ |
| `POST /surveys/:id/questions` | ✅ | ✅ | ❌ | ❌ |
| `PUT /surveys/:id/questions/:qid` | ✅ | ✅ | ❌ | ❌ |
| `DELETE /surveys/:id/questions/:qid` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /surveys/:id/questions/reorder` | ✅ | ✅ | ❌ | ❌ |
| `GET /responses` | ✅ | ✅ | ✅ | ✅ (milik sendiri) |
| `GET /responses/:id` | ✅ | ✅ | ✅ | ✅ (milik sendiri) |
| `GET /reports/surveys/:id` | ✅ | ✅ | ✅ | ❌ |
| `POST /reports/surveys/:id/export/xlsx` | ✅ | ✅ | ✅ | ❌ |
| `POST /reports/surveys/:id/export/csv` | ✅ | ✅ | ✅ | ❌ |
| `GET /reports/exports/:jobId` | ✅ | ✅ | ✅ | ❌ |
| `GET /reports/exports/:jobId/download` | ✅ | ✅ | ✅ | ❌ |
| `GET /map/points` | ✅ | ✅ | ✅ | ❌ |
| `GET /audit-log` | ✅ | ❌ | ❌ | ❌ |
| `POST /upload/photo` | ✅ | ✅ | ❌ | ✅ |

1. THE Permission_Guard SHALL menerapkan hak akses sesuai tabel di atas untuk setiap kombinasi role dan endpoint.
2. IF role pengguna tidak tercantum sebagai diizinkan (✅) untuk suatu endpoint, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.

---

### Requirement 8: Adaptasi UI — Navigasi dan Kontrol Berbasis Role

**User Story:** Sebagai pengguna dengan role supervisor atau viewer, saya ingin antarmuka hanya menampilkan menu dan tombol yang sesuai dengan hak akses saya, sehingga saya tidak bingung dengan fitur yang tidak dapat saya gunakan.

#### Acceptance Criteria

1. WHEN pengguna dengan role `supervisor` login, THE UI_Guard SHALL menampilkan menu: Dashboard, Survei, Pertanyaan, Surveyor, Laporan, Peta, dan menyembunyikan menu: Manajemen Admin, Audit Log.
2. WHEN pengguna dengan role `viewer` login, THE UI_Guard SHALL menampilkan menu: Laporan, Peta, Responden, dan menyembunyikan semua menu lainnya termasuk Dashboard, Survei, Surveyor, Manajemen Admin, dan Audit Log.
3. WHEN pengguna dengan role `supervisor` mengakses halaman Survei, THE UI_Guard SHALL menampilkan tombol "Tambah Survei", "Edit", "Aktifkan", "Nonaktifkan", dan "Hapus" (hanya untuk draft).
4. WHEN pengguna dengan role `viewer` mengakses halaman Laporan, THE UI_Guard SHALL menampilkan tombol "Unduh XLSX" dan "Unduh CSV" tetapi menyembunyikan semua tombol yang melakukan perubahan data.
5. WHEN pengguna dengan role `supervisor` mengakses halaman Surveyor, THE UI_Guard SHALL menampilkan tombol "Tambah Surveyor", "Edit", "Aktifkan", dan "Nonaktifkan".
6. THE UI_Guard SHALL membaca role pengguna dari data yang tersimpan di `localStorage` setelah login berhasil.
7. WHEN token JWT kedaluwarsa atau tidak valid, THE UI_Guard SHALL mengarahkan pengguna ke halaman login tanpa memperlihatkan konten yang dilindungi.
8. THE UI_Guard SHALL menerapkan pengecekan role di komponen `ProtectedRoute` pada `App.jsx` untuk mencegah akses langsung melalui URL ke halaman yang tidak diizinkan.
9. IF pengguna dengan role `supervisor` atau `viewer` mencoba mengakses URL halaman yang tidak diizinkan secara langsung, THEN THE UI_Guard SHALL mengarahkan pengguna ke halaman utama yang sesuai dengan role mereka.

---

### Requirement 9: Halaman Manajemen Pengguna Terpadu

**User Story:** Sebagai admin, saya ingin ada halaman manajemen pengguna yang menampilkan semua role (admin, supervisor, viewer) dalam satu antarmuka, sehingga saya dapat mengelola seluruh pengguna dengan efisien.

#### Acceptance Criteria

1. THE Admin SHALL dapat mengakses halaman manajemen pengguna yang menampilkan daftar pengguna dengan filter berdasarkan role (`admin`, `supervisor`, `viewer`).
2. WHEN Admin memilih tab atau filter "Supervisor", THE UI_Guard SHALL menampilkan daftar akun supervisor beserta nama, email, status aktif, dan tanggal dibuat.
3. WHEN Admin memilih tab atau filter "Viewer", THE UI_Guard SHALL menampilkan daftar akun viewer beserta nama, email, status aktif, dan tanggal dibuat.
4. THE Admin SHALL dapat membuat akun supervisor baru melalui form modal yang sama dengan pembuatan admin, dengan pilihan role yang dapat dipilih.
5. THE Admin SHALL dapat membuat akun viewer baru melalui form modal yang sama.
6. THE Admin SHALL dapat menonaktifkan akun supervisor dan viewer melalui tombol "Nonaktifkan" dengan konfirmasi.
7. IF Admin mencoba menonaktifkan akun miliknya sendiri dari halaman manajemen pengguna, THEN THE UI_Guard SHALL menonaktifkan tombol "Nonaktifkan" dan menampilkan tooltip "Tidak dapat menonaktifkan akun sendiri".
8. WHEN Supervisor mengakses halaman manajemen pengguna, THE UI_Guard SHALL hanya menampilkan tab "Viewer" dan menyembunyikan tab "Admin" dan "Supervisor".

---

### Requirement 10: Keamanan Akses — Validasi Server-Side

**User Story:** Sebagai tim keamanan, saya ingin semua validasi akses dilakukan di sisi server, sehingga pengguna tidak dapat membypass pembatasan akses dengan memanipulasi frontend.

#### Acceptance Criteria

1. THE Permission_Guard SHALL memvalidasi role dari payload JWT yang sudah diverifikasi, bukan dari header atau body request yang dapat dimanipulasi klien.
2. WHEN request masuk ke endpoint yang dilindungi tanpa header `Authorization`, THE Permission_Guard SHALL menolak dengan HTTP 401 sebelum memproses request lebih lanjut.
3. IF token JWT yang dikirim sudah masuk daftar hitam (blacklist) di Redis, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 401.
4. THE RBAC_System SHALL tidak mengungkap informasi sensitif (stack trace, query database, detail internal) dalam response error untuk semua role.
5. WHEN pengguna dengan role `supervisor` atau `viewer` melakukan login, THE Audit_Logger SHALL mencatat aksi `LOGIN` ke tabel `audit_logs` dengan timestamp UTC dan IP address.
6. WHEN pengguna dengan role `supervisor` atau `viewer` melakukan logout, THE Audit_Logger SHALL mencatat aksi `LOGOUT` ke tabel `audit_logs`.
7. THE RBAC_System SHALL menerapkan rate limiting yang sama (blokir setelah 5 kali gagal dalam 15 menit) untuk login semua role termasuk `supervisor` dan `viewer`.

---

### Requirement 11: Property-Based Testing untuk Validasi Akses

**User Story:** Sebagai developer, saya ingin ada property-based test yang memverifikasi konsistensi sistem RBAC, sehingga saya yakin tidak ada kombinasi role dan endpoint yang lolos dari validasi.

#### Acceptance Criteria

1. THE RBAC_System SHALL memiliki property test yang memverifikasi: untuk setiap kombinasi role yang tidak diizinkan dan endpoint yang dilindungi, THE Permission_Guard selalu mengembalikan HTTP 403.
2. THE RBAC_System SHALL memiliki property test yang memverifikasi: untuk setiap role yang diizinkan mengakses suatu endpoint, THE Permission_Guard tidak pernah mengembalikan HTTP 403 karena alasan role.
3. THE RBAC_System SHALL memiliki property test yang memverifikasi: fungsi `requireRole` bersifat idempoten — memanggil `requireRole(['admin', 'supervisor'])` dua kali berturut-turut pada request yang sama menghasilkan keputusan akses yang identik.
4. THE RBAC_System SHALL memiliki property test yang memverifikasi: tidak ada role yang dapat mengeskalasi hak aksesnya sendiri — pengguna dengan role `viewer` tidak dapat membuat akun dengan role apapun selain melalui endpoint yang diizinkan.
5. FOR ALL kombinasi (role, endpoint) yang terdefinisi dalam Access_Matrix, THE Permission_Guard SHALL menghasilkan keputusan akses yang konsisten dengan tabel hak akses pada Requirement 7.

---

### Requirement 12: Migrasi Database dan Kompatibilitas

**User Story:** Sebagai developer, saya ingin migrasi database dilakukan secara aman tanpa downtime atau kehilangan data, sehingga penambahan role baru tidak mengganggu pengguna yang sudah ada.

#### Acceptance Criteria

1. WHEN migrasi database dijalankan, THE RBAC_System SHALL mengubah constraint CHECK pada kolom `role` di tabel `users` dari `IN ('admin', 'surveyor')` menjadi `IN ('admin', 'supervisor', 'viewer', 'surveyor')`.
2. THE RBAC_System SHALL menjalankan migrasi dalam satu transaksi database sehingga jika migrasi gagal, perubahan akan di-rollback sepenuhnya.
3. WHEN migrasi dijalankan pada database yang sudah berisi data pengguna dengan role `admin` dan `surveyor`, THE RBAC_System SHALL mempertahankan semua data yang ada tanpa modifikasi.
4. THE RBAC_System SHALL menyediakan migration file Sequelize baru (bukan mengubah migration yang sudah ada) untuk perubahan constraint role.
5. IF migrasi dijalankan ulang (idempoten), THE RBAC_System SHALL tidak menghasilkan error dan tidak menduplikasi perubahan.
