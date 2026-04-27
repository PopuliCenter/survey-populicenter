# Dokumen Persyaratan (Requirements)

## Pendahuluan

Fitur ini memungkinkan supervisor dan admin untuk melakukan quality control terhadap data lapangan dengan menandai (flag) responden yang mencurigakan dan menambahkan catatan review. Setiap respons memiliki status review (`unreviewed`, `flagged`, `verified`) yang dapat diubah oleh admin atau supervisor, disertai catatan teks dan informasi siapa yang melakukan review serta kapan review dilakukan. Surveyor tidak dapat melihat status review dan catatan pada respons yang dikumpulkannya, sehingga proses quality control bersifat internal.

## Glosarium

- **Sistem**: Aplikasi platform survei web secara keseluruhan (backend + frontend)
- **Backend**: Server API Express.js yang menangani logika bisnis dan akses database
- **Frontend**: Aplikasi React yang menyediakan antarmuka pengguna
- **Admin**: Pengguna dengan role `admin` yang memiliki akses penuh ke semua fitur manajemen
- **Supervisor**: Pengguna dengan role `supervisor` yang mengelola surveyor dan survei
- **Surveyor**: Pengguna dengan role `surveyor` yang bertugas mengumpulkan respons survei di lapangan
- **Viewer**: Pengguna dengan role `viewer` yang hanya dapat melihat data tanpa mengubah
- **Respons**: Satu set jawaban lengkap yang disubmit oleh Surveyor untuk suatu survei, tersimpan di tabel `responses`
- **Review_Status**: Status review pada Respons, berupa salah satu dari tiga nilai: `unreviewed` (belum ditinjau), `flagged` (ditandai mencurigakan), atau `verified` (terverifikasi valid)
- **Review_Note**: Catatan teks yang ditambahkan oleh Admin atau Supervisor saat melakukan review terhadap Respons
- **Reviewer**: Admin atau Supervisor yang melakukan review terhadap suatu Respons
- **Audit_Log**: Catatan aktivitas yang disimpan di tabel `audit_logs` untuk pelacakan perubahan
- **Panel_Review**: Bagian pada halaman detail respons yang menampilkan dropdown status review dan textarea catatan review

## Persyaratan

### Persyaratan 1: Skema Database untuk Review Respons

**User Story:** Sebagai Admin/Supervisor, saya ingin data review tersimpan secara terstruktur di database, sehingga status review, catatan, dan informasi reviewer dapat dilacak untuk setiap respons.

#### Kriteria Penerimaan

1. THE Backend SHALL menambahkan kolom `review_status` bertipe ENUM dengan nilai `unreviewed`, `flagged`, dan `verified` ke tabel `responses` dengan nilai default `unreviewed`
2. THE Backend SHALL menambahkan kolom `review_note` bertipe TEXT (nullable) ke tabel `responses` untuk menyimpan catatan review
3. THE Backend SHALL menambahkan kolom `reviewed_by` bertipe UUID (nullable) ke tabel `responses` sebagai foreign key yang mereferensikan tabel `users`
4. THE Backend SHALL menambahkan kolom `reviewed_at` bertipe TIMESTAMPTZ (nullable) ke tabel `responses` untuk mencatat waktu review terakhir
5. THE Backend SHALL membuat perubahan skema melalui migration baru tanpa mengubah migration yang sudah ada

### Persyaratan 2: Endpoint Update Review Respons

**User Story:** Sebagai Admin/Supervisor, saya ingin dapat mengubah status review dan menambahkan catatan pada respons, sehingga saya dapat menandai data yang mencurigakan dan mendokumentasikan hasil review.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor mengirim permintaan ke endpoint `PATCH /responses/:id/review` dengan body `{ review_status, review_note }`, THE Backend SHALL memperbarui kolom `review_status`, `review_note`, `reviewed_by`, dan `reviewed_at` pada Respons yang sesuai
2. THE Backend SHALL memvalidasi bahwa nilai `review_status` adalah salah satu dari `unreviewed`, `flagged`, atau `verified`
3. IF nilai `review_status` tidak valid, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 400 dan pesan error "Status review tidak valid. Gunakan: unreviewed, flagged, atau verified"
4. WHEN review berhasil disimpan, THE Backend SHALL mengisi kolom `reviewed_by` dengan ID pengguna yang melakukan review dan kolom `reviewed_at` dengan timestamp saat ini
5. WHEN review berhasil disimpan, THE Backend SHALL mencatat Audit_Log dengan action `REVIEW_RESPONSE`, `entity_type` bernilai `response`, `entity_id` berisi ID respons, serta `old_value` dan `new_value` yang berisi status review sebelum dan sesudah perubahan
6. IF Respons dengan ID yang diberikan tidak ditemukan, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 404 dan pesan error "Data responden tidak ditemukan"
7. THE Backend SHALL mengizinkan field `review_note` bernilai kosong atau null untuk memungkinkan review tanpa catatan

### Persyaratan 3: Otorisasi Akses Review

**User Story:** Sebagai Admin/Supervisor, saya ingin hanya pengguna dengan role admin atau supervisor yang dapat melakukan review, sehingga proses quality control hanya dilakukan oleh pihak yang berwenang.

#### Kriteria Penerimaan

1. THE Backend SHALL membatasi akses endpoint `PATCH /responses/:id/review` hanya untuk pengguna dengan role Admin atau Supervisor
2. IF Surveyor atau Viewer mencoba mengakses endpoint `PATCH /responses/:id/review`, THEN THE Backend SHALL menolak permintaan dengan kode HTTP 403 dan pesan error "Anda tidak memiliki izin untuk mengakses resource ini"
3. WHILE Surveyor mengakses endpoint `GET /responses` atau `GET /responses/:id`, THE Backend SHALL menyembunyikan field `review_status`, `review_note`, `reviewed_by`, dan `reviewed_at` dari response body
4. WHEN Admin, Supervisor, atau Viewer mengakses endpoint `GET /responses` atau `GET /responses/:id`, THE Backend SHALL menyertakan field `review_status`, `review_note`, `reviewed_by`, dan `reviewed_at` dalam response body

### Persyaratan 4: Filter Respons Berdasarkan Status Review

**User Story:** Sebagai Admin/Supervisor, saya ingin dapat memfilter daftar respons berdasarkan status review, sehingga saya dapat dengan mudah menemukan respons yang belum ditinjau, ditandai, atau sudah terverifikasi.

#### Kriteria Penerimaan

1. WHEN Admin, Supervisor, atau Viewer mengirim permintaan `GET /responses` dengan query parameter `review_status`, THE Backend SHALL memfilter hasil berdasarkan nilai Review_Status yang diberikan
2. THE Backend SHALL memvalidasi bahwa nilai query parameter `review_status` adalah salah satu dari `unreviewed`, `flagged`, atau `verified`
3. IF nilai query parameter `review_status` tidak valid, THEN THE Backend SHALL mengabaikan filter dan mengembalikan semua respons
4. WHEN query parameter `review_status` tidak disertakan, THE Backend SHALL mengembalikan semua respons tanpa filter status review

### Persyaratan 5: Tampilan Status Review pada Daftar Respons

**User Story:** Sebagai Admin/Supervisor, saya ingin melihat status review setiap respons pada halaman daftar respons, sehingga saya dapat dengan cepat mengidentifikasi respons yang perlu ditinjau.

#### Kriteria Penerimaan

1. THE Frontend SHALL menambahkan kolom "Status Review" pada tabel daftar respons di halaman `Responses.jsx` untuk role Admin, Supervisor, dan Viewer
2. THE Frontend SHALL menampilkan badge visual dengan warna merah dan label "Flagged" untuk respons dengan Review_Status `flagged`
3. THE Frontend SHALL menampilkan badge visual dengan warna hijau dan label "Verified" untuk respons dengan Review_Status `verified`
4. THE Frontend SHALL menampilkan badge visual dengan warna abu-abu dan label "Unreviewed" untuk respons dengan Review_Status `unreviewed`
5. THE Frontend SHALL menyediakan dropdown filter berdasarkan Review_Status pada halaman daftar respons dengan opsi: Semua, Unreviewed, Flagged, dan Verified
6. WHEN pengguna memilih opsi filter, THE Frontend SHALL memuat ulang daftar respons dengan query parameter `review_status` yang sesuai

### Persyaratan 6: Panel Review pada Detail Respons

**User Story:** Sebagai Admin/Supervisor, saya ingin dapat melakukan review langsung dari halaman detail respons, sehingga saya dapat meninjau jawaban dan langsung memberikan penilaian.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor membuka halaman detail respons (`ResponseDetail.jsx`), THE Frontend SHALL menampilkan Panel_Review di sidebar yang berisi dropdown status review dan textarea catatan review
2. THE Frontend SHALL menampilkan nilai Review_Status dan Review_Note yang sudah tersimpan pada Panel_Review saat halaman dimuat
3. WHEN Admin atau Supervisor mengubah status review atau catatan dan menekan tombol "Simpan Review", THE Frontend SHALL mengirim permintaan `PATCH /responses/:id/review` ke Backend
4. WHEN review berhasil disimpan, THE Frontend SHALL menampilkan notifikasi sukses dan memperbarui tampilan badge status review
5. IF review gagal disimpan, THEN THE Frontend SHALL menampilkan pesan error yang diterima dari Backend
6. WHEN Reviewer sebelumnya sudah ada, THE Frontend SHALL menampilkan informasi nama Reviewer dan waktu review terakhir pada Panel_Review
7. WHILE Surveyor membuka halaman detail respons, THE Frontend SHALL menyembunyikan Panel_Review sepenuhnya
