# Requirements Document

## Introduction

Fitur Clone/Duplikasi Survei memungkinkan admin dan supervisor menduplikasi survei yang sudah ada menjadi survei baru berstatus `draft`. Duplikasi mencakup seluruh konten survei: judul, deskripsi, semua pertanyaan beserta tipe, urutan, pilihan jawaban (`options`), dan konfigurasi skip logic. Survei hasil clone berdiri sendiri dan sepenuhnya independen dari survei aslinya — perubahan pada satu survei tidak mempengaruhi yang lain.

Di sisi backend, endpoint baru `POST /surveys/:id/clone` menangani proses duplikasi secara atomik dan mencatat aktivitas ke audit log. Di sisi frontend, tombol "Duplikasi" ditambahkan ke kolom aksi di halaman `Surveys.jsx`, dan setelah duplikasi berhasil pengguna diarahkan langsung ke `SurveyBuilder` survei baru.

**Lingkup perubahan:**
1. Backend: endpoint `POST /surveys/:id/clone` di `backend/src/routes/surveys.js`
2. Backend: audit log dengan action `CLONE_SURVEY`
3. Frontend: tombol "Duplikasi" di `frontend/src/pages/Surveys.jsx`
4. Frontend: redirect ke `SurveyBuilder` setelah duplikasi berhasil

## Glossary

- **Clone_Service**: Komponen backend yang menangani duplikasi survei beserta semua pertanyaannya secara atomik.
- **Source_Survey**: Survei asli yang dijadikan sumber duplikasi.
- **Cloned_Survey**: Survei baru hasil duplikasi yang selalu berstatus `draft`.
- **Audit_Logger**: Komponen yang mencatat aktivitas `CLONE_SURVEY` ke tabel `audit_logs`.
- **Permission_Guard**: Middleware backend yang memvalidasi bahwa hanya pengguna dengan role `admin` atau `supervisor` yang dapat mengakses endpoint clone.
- **Survey_Builder**: Halaman frontend (`SurveyBuilder.jsx`) tempat admin/supervisor mengedit pertanyaan survei.
- **Clone_Button**: Tombol "Duplikasi" di kolom aksi halaman `Surveys.jsx` yang memicu proses duplikasi.

---

## Requirements

### Requirement 1: Endpoint Duplikasi Survei

**User Story:** Sebagai admin atau supervisor, saya ingin menduplikasi survei yang sudah ada, sehingga saya dapat membuat survei baru berdasarkan template survei yang sudah dikonfigurasi tanpa harus membangun dari awal.

#### Acceptance Criteria

1. THE Clone_Service SHALL menyediakan endpoint `POST /surveys/:id/clone` yang hanya dapat diakses oleh pengguna dengan role `admin` atau `supervisor`.
2. WHEN endpoint clone dipanggil dengan ID survei yang valid, THE Clone_Service SHALL membuat survei baru dengan menyalin field `title`, `description` dari Source_Survey.
3. WHEN membuat Cloned_Survey, THE Clone_Service SHALL menetapkan judul survei baru menjadi `"Salinan dari {judul survei asli}"`.
4. WHEN membuat Cloned_Survey, THE Clone_Service SHALL selalu menetapkan `status` ke `draft` terlepas dari status Source_Survey.
5. WHEN membuat Cloned_Survey, THE Clone_Service SHALL menetapkan `created_by` ke ID pengguna yang melakukan request.
6. WHEN membuat Cloned_Survey, THE Clone_Service SHALL menyalin semua pertanyaan dari Source_Survey dengan mempertahankan field `text`, `type`, `order_index`, `is_required`, `randomize_options`, `options`, dan `skip_logic` yang identik.
7. WHEN duplikasi berhasil, THE Clone_Service SHALL mengembalikan HTTP 201 beserta data lengkap Cloned_Survey (id, title, description, status, created_at, question_count).
8. IF ID survei yang diberikan tidak ditemukan, THEN THE Clone_Service SHALL mengembalikan HTTP 404 dengan pesan `"Survei tidak ditemukan"`.
9. IF request ke endpoint clone tidak menyertakan token JWT yang valid, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 401.
10. IF pengguna dengan role `viewer` atau `surveyor` mencoba mengakses endpoint clone, THEN THE Permission_Guard SHALL menolak akses dengan HTTP 403.

---

### Requirement 2: Atomisitas Proses Duplikasi

**User Story:** Sebagai developer, saya ingin proses duplikasi berjalan secara atomik, sehingga tidak ada kondisi di mana survei baru terbuat tanpa pertanyaannya, atau sebaliknya.

#### Acceptance Criteria

1. THE Clone_Service SHALL menjalankan pembuatan Cloned_Survey dan penyalinan semua pertanyaan dalam satu transaksi database.
2. IF terjadi error saat menyalin pertanyaan mana pun, THEN THE Clone_Service SHALL melakukan rollback seluruh transaksi sehingga tidak ada survei baru yang tersimpan di database.
3. IF transaksi berhasil, THEN THE Clone_Service SHALL mencatat satu entri audit log dengan action `CLONE_SURVEY` setelah transaksi selesai.

---

### Requirement 3: Pencatatan Audit Log

**User Story:** Sebagai admin, saya ingin setiap duplikasi survei dicatat di audit log, sehingga ada jejak aktivitas yang dapat ditelusuri.

#### Acceptance Criteria

1. WHEN duplikasi survei berhasil, THE Audit_Logger SHALL mencatat entri ke tabel `audit_logs` dengan action `CLONE_SURVEY`.
2. THE Audit_Logger SHALL menyertakan `user_id` pengguna yang melakukan duplikasi, `entity_type` berisi `"survey"`, dan `entity_id` berisi ID Cloned_Survey yang baru dibuat.
3. THE Audit_Logger SHALL menyertakan `old_value` berisi `{ source_survey_id: "{id}", source_survey_title: "{judul}" }` dan `new_value` berisi `{ id: "{id}", title: "{judul}", status: "draft", question_count: N }`.
4. THE Audit_Logger SHALL menyertakan `ip_address` dari request yang masuk.

---

### Requirement 4: Independensi Survei Hasil Clone

**User Story:** Sebagai admin, saya ingin survei hasil duplikasi sepenuhnya independen dari survei aslinya, sehingga perubahan pada satu survei tidak mempengaruhi yang lain.

#### Acceptance Criteria

1. THE Clone_Service SHALL membuat Cloned_Survey dengan UUID baru yang berbeda dari Source_Survey.
2. THE Clone_Service SHALL membuat setiap pertanyaan di Cloned_Survey dengan UUID baru yang berbeda dari pertanyaan di Source_Survey.
3. WHEN skip_logic pada pertanyaan Source_Survey mereferensikan `question_id` pertanyaan lain dalam survei yang sama, THE Clone_Service SHALL memperbarui referensi tersebut agar menunjuk ke UUID pertanyaan baru di Cloned_Survey.
4. WHEN pengguna mengubah judul, deskripsi, atau pertanyaan pada Cloned_Survey, THE Clone_Service SHALL memastikan perubahan tersebut tidak mempengaruhi data Source_Survey.

---

### Requirement 5: Tombol Duplikasi di Frontend

**User Story:** Sebagai admin atau supervisor, saya ingin ada tombol "Duplikasi" di daftar survei, sehingga saya dapat dengan mudah menduplikasi survei langsung dari halaman manajemen survei.

#### Acceptance Criteria

1. WHEN admin atau supervisor mengakses halaman Manajemen Survei, THE Clone_Button SHALL ditampilkan di kolom aksi setiap baris survei.
2. WHEN pengguna mengklik Clone_Button, THE Clone_Button SHALL menampilkan indikator loading dan menonaktifkan tombol untuk mencegah duplikasi ganda.
3. WHEN duplikasi berhasil, THE Clone_Button SHALL menampilkan notifikasi sukses dengan teks `"Survei berhasil diduplikasi"`.
4. WHEN duplikasi berhasil, THE Clone_Button SHALL mengarahkan pengguna ke halaman `SurveyBuilder` untuk Cloned_Survey yang baru dibuat (`/surveys/{id}/builder`).
5. IF duplikasi gagal karena error server, THE Clone_Button SHALL menampilkan pesan error yang deskriptif dan mengembalikan tombol ke kondisi normal.
6. THE Clone_Button SHALL ditampilkan untuk semua survei terlepas dari statusnya (`draft`, `active`, `inactive`).

---

### Requirement 6: Status Survei Hasil Clone Selalu Draft

**User Story:** Sebagai admin, saya ingin survei hasil duplikasi selalu berstatus draft, sehingga saya dapat meninjau dan memodifikasi sebelum mengaktifkannya.

#### Acceptance Criteria

1. WHEN Source_Survey berstatus `draft`, THE Clone_Service SHALL membuat Cloned_Survey dengan status `draft`.
2. WHEN Source_Survey berstatus `active`, THE Clone_Service SHALL membuat Cloned_Survey dengan status `draft`.
3. WHEN Source_Survey berstatus `inactive`, THE Clone_Service SHALL membuat Cloned_Survey dengan status `draft`.
4. THE Clone_Service SHALL tidak pernah membuat Cloned_Survey dengan status selain `draft`, terlepas dari status Source_Survey atau parameter request apapun.
