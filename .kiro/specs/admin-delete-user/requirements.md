# Requirements Document

## Introduction

Fitur ini menambahkan kemampuan bagi admin untuk menghapus akun pengguna lain secara permanen dari sistem. Saat ini platform sudah memiliki fitur deactivate (nonaktifkan) yang hanya menonaktifkan akun tanpa menghapus data. Fitur delete permanen diperlukan untuk kasus di mana akun perlu dihapus sepenuhnya dari database, misalnya karena data yang salah, permintaan penghapusan data (GDPR/privasi), atau pembersihan akun yang tidak terpakai.

Admin dapat menghapus akun dengan role apa pun (admin lain, supervisor, viewer, surveyor), **kecuali akun miliknya sendiri**. Setiap penghapusan dicatat di audit log sebelum data dihapus. Di sisi frontend, tombol "Hapus" ditambahkan ke halaman Manajemen Pengguna (`UserManagement.jsx`) dengan dialog konfirmasi sebelum eksekusi.

**Lingkup perubahan:**
1. Backend: endpoint `DELETE /{role-endpoint}/:id` baru di setiap route (admins, supervisors, viewers, surveyors)
2. Backend: audit log dicatat sebelum penghapusan permanen
3. Frontend: tombol "Hapus" dengan konfirmasi di `UserManagement.jsx`
4. Frontend: tombol "Hapus" di halaman `Surveyors.jsx` (untuk akun surveyor)

## Glossary

- **Delete_Service**: Komponen backend yang menangani penghapusan permanen akun pengguna dari database.
- **Admin**: Pengguna dengan role `admin` yang memiliki hak untuk menghapus akun pengguna lain.
- **Target_User**: Akun pengguna yang akan dihapus (dapat berole admin, supervisor, viewer, atau surveyor).
- **Audit_Logger**: Komponen yang mencatat semua aktivitas penting ke tabel `audit_logs` sebelum penghapusan dilakukan.
- **Permission_Guard**: Middleware backend yang memvalidasi apakah role pengguna yang sedang login memiliki izin untuk mengakses endpoint tertentu.
- **UI_Guard**: Komponen atau logika frontend yang menyembunyikan atau menonaktifkan elemen antarmuka berdasarkan role pengguna.
- **Confirmation_Dialog**: Elemen UI yang meminta konfirmasi eksplisit dari admin sebelum penghapusan permanen dieksekusi.
- **Self_Delete_Guard**: Logika yang mencegah admin menghapus akun miliknya sendiri, baik di backend maupun frontend.

---

## Requirements

### Requirement 1: Endpoint Hapus Permanen Akun Pengguna

**User Story:** Sebagai admin, saya ingin dapat menghapus akun pengguna lain secara permanen, sehingga saya dapat membersihkan akun yang tidak diperlukan atau memenuhi permintaan penghapusan data.

#### Acceptance Criteria

1. THE Delete_Service SHALL menyediakan endpoint `DELETE /admins/:id` yang hanya dapat diakses oleh pengguna dengan role `admin`.
2. THE Delete_Service SHALL menyediakan endpoint `DELETE /supervisors/:id` yang hanya dapat diakses oleh pengguna dengan role `admin`.
3. THE Delete_Service SHALL menyediakan endpoint `DELETE /viewers/:id` yang hanya dapat diakses oleh pengguna dengan role `admin`.
4. THE Delete_Service SHALL menyediakan endpoint `DELETE /surveyors/:id` yang hanya dapat diakses oleh pengguna dengan role `admin`.
5. WHEN endpoint delete dipanggil dengan ID yang valid, THE Delete_Service SHALL menghapus baris pengguna tersebut dari tabel `users` secara permanen.
6. WHEN penghapusan berhasil, THE Delete_Service SHALL mengembalikan HTTP 200 dengan pesan konfirmasi.
7. IF ID yang diberikan tidak ditemukan di database atau role-nya tidak sesuai dengan endpoint, THEN THE Delete_Service SHALL mengembalikan HTTP 404 dengan pesan error yang deskriptif.

---

### Requirement 2: Pencegahan Penghapusan Akun Sendiri

**User Story:** Sebagai sistem, saya ingin mencegah admin menghapus akun miliknya sendiri, sehingga tidak ada admin yang secara tidak sengaja menghapus akses mereka sendiri ke platform.

#### Acceptance Criteria

1. IF admin mencoba menghapus akun miliknya sendiri melalui endpoint `DELETE /admins/:id`, THEN THE Self_Delete_Guard SHALL menolak operasi dengan HTTP 403 dan pesan "Tidak dapat menghapus akun sendiri".
2. THE Self_Delete_Guard SHALL membandingkan `req.user.id` dari JWT dengan `:id` pada path parameter untuk mendeteksi self-delete.
3. WHEN admin mengakses halaman Manajemen Pengguna, THE UI_Guard SHALL menonaktifkan tombol "Hapus" pada baris akun milik admin yang sedang login.
4. WHEN tombol "Hapus" dinonaktifkan karena self-delete, THE UI_Guard SHALL menampilkan tooltip "Tidak dapat menghapus akun sendiri" pada tombol tersebut.

---

### Requirement 3: Pencatatan Audit Log Sebelum Penghapusan

**User Story:** Sebagai admin, saya ingin setiap penghapusan akun dicatat di audit log, sehingga ada jejak audit yang dapat ditelusuri jika diperlukan investigasi di kemudian hari.

#### Acceptance Criteria

1. WHEN admin menghapus akun pengguna, THE Audit_Logger SHALL mencatat entri ke tabel `audit_logs` **sebelum** penghapusan permanen dieksekusi.
2. THE Audit_Logger SHALL mencatat action `DELETE_ADMIN` ketika akun dengan role `admin` dihapus.
3. THE Audit_Logger SHALL mencatat action `DELETE_SUPERVISOR` ketika akun dengan role `supervisor` dihapus.
4. THE Audit_Logger SHALL mencatat action `DELETE_VIEWER` ketika akun dengan role `viewer` dihapus.
5. THE Audit_Logger SHALL mencatat action `DELETE_SURVEYOR` ketika akun dengan role `surveyor` dihapus.
6. THE Audit_Logger SHALL menyertakan `user_id` admin yang melakukan penghapusan, `entity_type` berisi role target, `entity_id` berisi ID akun yang dihapus, `old_value` berisi snapshot data akun sebelum dihapus (name, email, role, is_active), dan `ip_address` dari request.
7. IF pencatatan audit log gagal, THEN THE Delete_Service SHALL membatalkan penghapusan dan mengembalikan HTTP 500, sehingga tidak ada penghapusan yang terjadi tanpa jejak audit.

---

### Requirement 4: Konfirmasi Penghapusan di Frontend

**User Story:** Sebagai admin, saya ingin ada dialog konfirmasi sebelum penghapusan permanen dieksekusi, sehingga saya tidak secara tidak sengaja menghapus akun yang salah.

#### Acceptance Criteria

1. WHEN admin mengklik tombol "Hapus" pada baris pengguna di halaman Manajemen Pengguna, THE Confirmation_Dialog SHALL menampilkan pesan konfirmasi yang menyebutkan nama pengguna yang akan dihapus.
2. THE Confirmation_Dialog SHALL menampilkan dua pilihan: tombol "Ya, Hapus" (merah) dan tombol "Batal" (abu-abu).
3. WHEN admin mengklik "Batal" pada Confirmation_Dialog, THE UI_Guard SHALL menutup dialog tanpa melakukan penghapusan.
4. WHEN admin mengklik "Ya, Hapus" pada Confirmation_Dialog, THE UI_Guard SHALL memanggil endpoint `DELETE /{endpoint}/:id` yang sesuai.
5. WHEN penghapusan berhasil, THE UI_Guard SHALL menampilkan pesan sukses dan memperbarui daftar pengguna tanpa reload halaman penuh.
6. IF penghapusan gagal karena error server, THE UI_Guard SHALL menampilkan pesan error yang deskriptif dan menutup dialog konfirmasi.

---

### Requirement 5: Otorisasi — Hanya Admin yang Dapat Menghapus

**User Story:** Sebagai tim keamanan, saya ingin memastikan hanya admin yang dapat menghapus akun pengguna, sehingga role lain tidak dapat menyalahgunakan fitur ini.

#### Acceptance Criteria

1. IF pengguna dengan role `supervisor` mencoba mengakses endpoint `DELETE /admins/:id`, `DELETE /supervisors/:id`, `DELETE /viewers/:id`, atau `DELETE /surveyors/:id`, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
2. IF pengguna dengan role `viewer` mencoba mengakses endpoint delete manapun, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
3. IF pengguna dengan role `surveyor` mencoba mengakses endpoint delete manapun, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
4. IF request ke endpoint delete tidak menyertakan token JWT yang valid, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 401.
5. WHEN pengguna dengan role `supervisor` atau `viewer` mengakses halaman Manajemen Pengguna, THE UI_Guard SHALL tidak menampilkan tombol "Hapus" sama sekali.

---

### Requirement 6: Integritas Data — Penanganan Relasi

**User Story:** Sebagai developer, saya ingin penghapusan akun menangani relasi data dengan benar, sehingga tidak ada data orphan atau constraint violation di database.

#### Acceptance Criteria

1. WHEN akun surveyor dihapus, THE Delete_Service SHALL menangani atau menghapus data terkait (kuota surveyor di tabel `surveyor_quotas`) sesuai dengan constraint database yang berlaku.
2. WHEN akun pengguna dihapus, THE Delete_Service SHALL menangani referensi di tabel `audit_logs` (kolom `user_id`) dengan menggunakan `SET NULL` atau mekanisme yang sesuai agar entri audit log historis tetap terjaga.
3. IF penghapusan gagal karena constraint database (foreign key violation), THEN THE Delete_Service SHALL mengembalikan HTTP 409 dengan pesan error yang menjelaskan bahwa akun tidak dapat dihapus karena masih memiliki data terkait.

---

### Requirement 7: Tampilan Tombol Hapus di Frontend

**User Story:** Sebagai admin, saya ingin tombol "Hapus" ditampilkan dengan jelas di halaman Manajemen Pengguna, sehingga saya dapat dengan mudah menemukan dan menggunakan fitur ini.

#### Acceptance Criteria

1. WHEN admin mengakses halaman Manajemen Pengguna, THE UI_Guard SHALL menampilkan tombol "Hapus" pada setiap baris pengguna di semua tab (Admin, Supervisor, Viewer).
2. WHEN admin mengakses halaman Surveyors, THE UI_Guard SHALL menampilkan tombol "Hapus" pada setiap baris surveyor.
3. THE UI_Guard SHALL menampilkan tombol "Hapus" dengan warna merah untuk membedakannya dari tombol aksi lain (Edit, Nonaktifkan).
4. WHEN akun pada baris tersebut adalah akun admin yang sedang login, THE UI_Guard SHALL menonaktifkan (disabled) tombol "Hapus" dan menampilkan tooltip "Tidak dapat menghapus akun sendiri".
5. THE UI_Guard SHALL menampilkan tombol "Hapus" terlepas dari status aktif/nonaktif akun target (akun nonaktif pun dapat dihapus).

---

### Requirement 8: Access Matrix — Pembaruan Tabel Hak Akses

**User Story:** Sebagai tim pengembang, saya ingin tabel hak akses diperbarui untuk mencerminkan endpoint delete yang baru, sehingga implementasi backend dan frontend konsisten.

#### Acceptance Criteria

Tabel berikut mendefinisikan hak akses endpoint delete yang harus diterapkan oleh THE Permission_Guard:

| Endpoint | Admin | Supervisor | Viewer | Surveyor |
|---|---|---|---|---|
| `DELETE /admins/:id` | ✅ (kecuali diri sendiri) | ❌ | ❌ | ❌ |
| `DELETE /supervisors/:id` | ✅ | ❌ | ❌ | ❌ |
| `DELETE /viewers/:id` | ✅ | ❌ | ❌ | ❌ |
| `DELETE /surveyors/:id` | ✅ | ❌ | ❌ | ❌ |

1. THE Permission_Guard SHALL menerapkan hak akses sesuai tabel di atas untuk setiap kombinasi role dan endpoint delete.
2. IF role pengguna tidak tercantum sebagai diizinkan (✅) untuk suatu endpoint delete, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.
