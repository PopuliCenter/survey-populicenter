# Dokumen Persyaratan (Requirements)

## Pendahuluan

Fitur ini memungkinkan semua pengguna platform (admin, supervisor, viewer, surveyor) untuk mengelola profil mereka secara mandiri tanpa bantuan admin. Pengguna dapat mengganti password sendiri dengan verifikasi password lama, serta memperbarui nama tampilan mereka. Setiap perubahan dicatat dalam audit log untuk keperluan keamanan dan pelacakan.

## Glosarium

- **Sistem**: Aplikasi platform survei web secara keseluruhan (backend + frontend)
- **Backend**: Server API Express.js yang menangani logika bisnis dan akses database
- **Frontend**: Aplikasi React yang menyediakan antarmuka pengguna
- **Pengguna**: Setiap user yang terautentikasi di sistem, terlepas dari role (admin, supervisor, viewer, surveyor)
- **Password_Lama**: Password yang saat ini aktif dan tersimpan sebagai hash di database
- **Password_Baru**: Password pengganti yang harus memenuhi aturan keamanan sebelum diterima
- **Aturan_Password**: Persyaratan keamanan password: minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka
- **Nama_Tampilan**: Field `name` pada tabel users yang ditampilkan di antarmuka pengguna
- **Audit_Log**: Catatan aktivitas yang disimpan di tabel `audit_logs` untuk pelacakan perubahan
- **Halaman_Profil**: Halaman frontend (`Profile.jsx`) yang menampilkan informasi profil dan form pengelolaan akun
- **Token**: JSON Web Token (JWT) yang digunakan untuk autentikasi sesi pengguna

## Persyaratan

### Persyaratan 1: Endpoint Profil Pengguna (GET /auth/me)

**User Story:** Sebagai Pengguna, saya ingin mendapatkan data profil saya yang lengkap, sehingga halaman profil dapat menampilkan informasi terkini.

#### Kriteria Penerimaan

1. WHEN Pengguna yang terautentikasi memanggil endpoint `GET /auth/me`, THE Backend SHALL mengembalikan data lengkap berupa `id`, `name`, `email`, `role`, `is_active`, dan `created_at`
2. IF Token yang dikirimkan tidak valid atau sudah expired, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 401

### Persyaratan 2: Ganti Password

**User Story:** Sebagai Pengguna, saya ingin mengganti password saya sendiri dengan memverifikasi password lama, sehingga saya dapat menjaga keamanan akun tanpa bantuan admin.

#### Kriteria Penerimaan

1. WHEN Pengguna mengirim permintaan ganti password ke endpoint `PATCH /auth/change-password` dengan body `{ current_password, new_password }`, THE Backend SHALL memverifikasi bahwa `current_password` cocok dengan hash password yang tersimpan di database
2. IF Password_Lama yang dikirimkan tidak cocok dengan hash di database, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 400 dan pesan error "Password lama tidak sesuai"
3. WHEN Password_Lama terverifikasi, THE Backend SHALL memvalidasi bahwa Password_Baru memenuhi Aturan_Password (minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka)
4. IF Password_Baru tidak memenuhi Aturan_Password, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 400 dan pesan error yang menjelaskan aturan password
5. IF Password_Baru sama dengan Password_Lama, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 400 dan pesan error "Password baru tidak boleh sama dengan password lama"
6. WHEN Password_Baru valid dan lolos semua validasi, THE Backend SHALL meng-hash Password_Baru menggunakan bcrypt dan memperbarui kolom `password_hash` di tabel users
7. WHEN password berhasil diganti, THE Backend SHALL mencatat Audit_Log dengan action `CHANGE_PASSWORD`, `user_id`, dan `ip_address`
8. WHEN password berhasil diganti, THE Backend SHALL mengembalikan respons sukses dengan kode HTTP 200 tanpa melakukan invalidasi Token yang sedang aktif
9. IF field `current_password` atau `new_password` kosong atau tidak ada dalam body, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 400 dan pesan error yang sesuai

### Persyaratan 3: Update Nama Tampilan

**User Story:** Sebagai Pengguna, saya ingin memperbarui nama tampilan saya, sehingga nama yang ditampilkan di sistem selalu sesuai dengan keinginan saya.

#### Kriteria Penerimaan

1. WHEN Pengguna mengirim permintaan update nama ke endpoint `PATCH /auth/update-profile` dengan body `{ name }`, THE Backend SHALL memvalidasi bahwa field `name` tidak kosong dan tidak hanya berisi spasi
2. IF field `name` kosong, hanya berisi spasi, atau tidak ada dalam body, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 400 dan pesan error "Nama tidak boleh kosong"
3. WHEN nama valid, THE Backend SHALL memperbarui kolom `name` di tabel users dan mengembalikan data profil terbaru (`id`, `name`, `email`, `role`)
4. WHEN nama berhasil diperbarui, THE Backend SHALL mencatat Audit_Log dengan action `UPDATE_PROFILE`, `user_id`, `ip_address`, serta `old_value` dan `new_value` yang berisi nama sebelum dan sesudah perubahan

### Persyaratan 4: Halaman Profil pada Frontend

**User Story:** Sebagai Pengguna, saya ingin memiliki halaman profil yang mudah diakses, sehingga saya dapat melihat informasi akun dan mengelola profil saya di satu tempat.

#### Kriteria Penerimaan

1. THE Frontend SHALL menyediakan Halaman_Profil yang dapat diakses oleh semua role (admin, supervisor, viewer, surveyor)
2. WHEN Pengguna membuka Halaman_Profil, THE Frontend SHALL menampilkan informasi profil terkini (nama, email, role) yang diambil dari endpoint `GET /auth/me`
3. THE Frontend SHALL menampilkan form ganti password dengan tiga field: password lama, password baru, dan konfirmasi password baru
4. WHEN Pengguna mengisi field konfirmasi password baru yang tidak sama dengan field password baru, THE Frontend SHALL menampilkan pesan validasi "Konfirmasi password tidak cocok" sebelum mengirim permintaan ke Backend
5. THE Frontend SHALL menampilkan form update nama dengan field nama yang sudah terisi nilai Nama_Tampilan saat ini
6. WHEN update nama berhasil, THE Frontend SHALL memperbarui data pengguna di `localStorage` agar nama terbaru langsung tampil di seluruh antarmuka tanpa perlu login ulang
7. WHEN ganti password berhasil, THE Frontend SHALL menampilkan pesan sukses dan mengosongkan semua field password

### Persyaratan 5: Navigasi Menu Profil

**User Story:** Sebagai Pengguna, saya ingin menu profil tersedia di navigasi, sehingga saya dapat mengakses halaman profil dengan mudah dari halaman manapun.

#### Kriteria Penerimaan

1. THE Frontend SHALL menambahkan menu "Profil" pada sidebar navigasi untuk role admin, supervisor, dan viewer
2. THE Frontend SHALL menambahkan menu "Profil" pada navigasi surveyor sehingga surveyor juga dapat mengakses Halaman_Profil
3. THE Frontend SHALL mendaftarkan route `/profile` yang dilindungi oleh autentikasi dan dapat diakses oleh semua role

### Persyaratan 6: Keamanan dan Konsistensi Sesi

**User Story:** Sebagai Pengguna, saya ingin sesi saya tetap aktif setelah mengganti password, sehingga saya tidak perlu login ulang setelah perubahan password.

#### Kriteria Penerimaan

1. WHEN Pengguna berhasil mengganti password, THE Backend SHALL mempertahankan validitas Token yang sedang aktif hingga Token tersebut expired secara alami
2. THE Backend SHALL menerapkan Aturan_Password yang sama untuk semua role tanpa pengecualian
3. WHEN Pengguna mengganti password, THE Backend SHALL memastikan bahwa login berikutnya menggunakan Password_Baru yang sudah tersimpan
