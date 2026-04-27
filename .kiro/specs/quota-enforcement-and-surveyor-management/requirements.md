# Dokumen Persyaratan (Requirements)

## Pendahuluan

Fitur ini mengatasi beberapa masalah dan peningkatan pada platform survei web terkait manajemen surveyor dan penegakan kuota. Saat ini, sistem memiliki tabel `surveyor_quotas` dengan kolom `survey_id`, `surveyor_id`, dan `quota`, namun batas kuota **tidak ditegakkan** saat pengiriman respons — surveyor masih bisa mengirim respons melebihi kuota yang ditetapkan. Selain itu, fitur ini menambahkan kemampuan untuk menetapkan kuota saat menugaskan surveyor, penomoran kuesioner otomatis (auto-numbering), dan fitur upload massal (bulk upload) surveyor melalui file CSV/Excel agar tidak perlu input satu per satu.

## Glosarium

- **Sistem**: Aplikasi platform survei web secara keseluruhan (backend + frontend)
- **Backend**: Server API Express.js yang menangani logika bisnis dan akses database
- **Frontend**: Aplikasi React yang menyediakan antarmuka pengguna
- **Surveyor**: Pengguna dengan role `surveyor` yang bertugas mengumpulkan respons survei di lapangan
- **Admin**: Pengguna dengan role `admin` yang memiliki akses penuh ke semua fitur manajemen
- **Supervisor**: Pengguna dengan role `supervisor` yang mengelola surveyor dan survei
- **Kuota**: Jumlah maksimum respons yang boleh dikumpulkan oleh seorang Surveyor untuk suatu survei tertentu
- **Respons**: Satu set jawaban lengkap yang disubmit oleh Surveyor untuk suatu survei
- **Nomor_Kuesioner**: Identifikasi unik yang diberikan secara otomatis untuk setiap respons yang disubmit
- **SurveyorQuota**: Record di tabel `surveyor_quotas` yang menghubungkan Surveyor dengan survei beserta batas kuotanya
- **File_Upload**: File berformat CSV atau Excel (.xlsx) yang berisi data surveyor untuk diimpor secara massal
- **Penugasan_Surveyor**: Proses menambahkan Surveyor ke suatu survei beserta penetapan kuota

## Persyaratan

### Persyaratan 1: Penegakan Batas Kuota pada Pengiriman Respons

**User Story:** Sebagai Admin/Supervisor, saya ingin sistem menolak pengiriman respons ketika surveyor sudah mencapai batas kuota, sehingga data yang dikumpulkan tidak melebihi target yang ditetapkan.

#### Kriteria Penerimaan

1. WHEN seorang Surveyor mengirim respons untuk suatu survei, THE Backend SHALL menghitung jumlah respons yang sudah disubmit oleh Surveyor tersebut untuk survei yang sama dan membandingkannya dengan nilai Kuota di tabel SurveyorQuota
2. WHEN jumlah respons yang sudah disubmit oleh Surveyor sama dengan atau melebihi nilai Kuota, THE Backend SHALL menolak pengiriman respons dengan kode HTTP 403 dan pesan error "Kuota pengisian survei Anda sudah tercapai"
3. WHEN seorang Surveyor memulai sesi respons baru (endpoint `/responses/start`), THE Backend SHALL memeriksa apakah Surveyor masih memiliki sisa Kuota sebelum membuat record respons pending
4. IF seorang Surveyor tidak memiliki record SurveyorQuota untuk survei tertentu, THEN THE Backend SHALL menolak pengiriman respons dengan kode HTTP 403 dan pesan error "Anda tidak memiliki kuota untuk survei ini"
5. THE Backend SHALL menghitung Kuota menggunakan jumlah respons yang sudah ter-commit (bukan termasuk record PENDING) untuk menghindari race condition

### Persyaratan 2: Penetapan Kuota saat Penugasan Surveyor

**User Story:** Sebagai Admin/Supervisor, saya ingin dapat menetapkan jumlah kuota saat menugaskan surveyor ke suatu survei, sehingga setiap surveyor memiliki target pengumpulan data yang jelas.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor menambahkan Surveyor ke suatu survei, THE Frontend SHALL menampilkan field input untuk memasukkan nilai Kuota yang wajib diisi
2. THE Backend SHALL memvalidasi bahwa nilai Kuota adalah bilangan bulat positif lebih dari 0
3. WHEN nilai Kuota tidak valid atau kosong, THE Frontend SHALL menampilkan pesan validasi "Kuota harus berupa bilangan bulat positif lebih dari 0"
4. WHEN Penugasan_Surveyor berhasil disimpan, THE Backend SHALL membuat record SurveyorQuota dengan survey_id, surveyor_id, dan quota yang sesuai
5. WHEN Admin atau Supervisor mengubah Kuota yang sudah ada, THE Backend SHALL memperbarui nilai Kuota pada record SurveyorQuota yang sesuai
6. IF nilai Kuota baru lebih kecil dari jumlah respons yang sudah dikumpulkan, THEN THE Frontend SHALL menampilkan peringatan bahwa kuota baru lebih kecil dari jumlah respons yang sudah ada, namun tetap mengizinkan perubahan

### Persyaratan 3: Penomoran Kuesioner Otomatis (Auto-Numbering)

**User Story:** Sebagai Surveyor, saya ingin nomor kuesioner dihasilkan secara otomatis dan berurutan, sehingga saya tidak perlu memasukkan nomor secara manual dan menghindari duplikasi.

#### Kriteria Penerimaan

1. THE Backend SHALL menghasilkan Nomor_Kuesioner secara otomatis menggunakan format `{PREFIX_SURVEI}-{YYYYMMDD}-{NOMOR_URUT:04d}` saat respons disubmit
2. THE Backend SHALL menjamin bahwa setiap Nomor_Kuesioner bersifat unik dalam satu survei menggunakan PostgreSQL sequence
3. WHEN respons berhasil disubmit, THE Backend SHALL mengembalikan Nomor_Kuesioner yang dihasilkan dalam response body
4. THE Frontend SHALL menampilkan Nomor_Kuesioner yang dihasilkan kepada Surveyor setelah pengiriman respons berhasil

### Persyaratan 4: Upload Massal Surveyor (Bulk Upload)

**User Story:** Sebagai Admin/Supervisor, saya ingin dapat mengupload daftar surveyor melalui file CSV atau Excel, sehingga saya tidak perlu menambahkan surveyor satu per satu.

#### Kriteria Penerimaan

1. THE Frontend SHALL menyediakan tombol "Upload Surveyor" pada halaman Manajemen Surveyor
2. WHEN Admin atau Supervisor mengklik tombol "Upload Surveyor", THE Frontend SHALL menampilkan dialog upload yang menerima file berformat CSV (.csv) atau Excel (.xlsx)
3. THE Frontend SHALL menyediakan tombol untuk mengunduh template file CSV/Excel yang berisi kolom: nama, email, password
4. WHEN file diupload, THE Backend SHALL memvalidasi format file dan memastikan file berformat CSV atau Excel yang valid
5. THE Backend SHALL memvalidasi setiap baris data: nama tidak boleh kosong, email harus valid dan unik, password harus memenuhi aturan keamanan (minimal 8 karakter, huruf besar, huruf kecil, dan angka)
6. IF terdapat baris dengan data tidak valid, THEN THE Backend SHALL mengembalikan daftar error per baris beserta nomor barisnya tanpa menyimpan data apapun (operasi atomik)
7. WHEN semua baris valid, THE Backend SHALL membuat semua akun Surveyor dalam satu transaksi database
8. WHEN upload berhasil, THE Backend SHALL mengembalikan jumlah surveyor yang berhasil dibuat dan daftar email yang didaftarkan
9. THE Backend SHALL membatasi jumlah baris dalam satu file upload maksimal 500 baris untuk mencegah beban berlebih pada server
10. IF file mengandung email yang sudah terdaftar di sistem, THEN THE Backend SHALL memasukkan email tersebut dalam daftar error dengan pesan "Email sudah terdaftar" beserta nomor barisnya

### Persyaratan 5: Penugasan Massal Surveyor ke Survei dengan Kuota (Bulk Assign)

**User Story:** Sebagai Admin/Supervisor, saya ingin dapat menugaskan beberapa surveyor sekaligus ke suatu survei beserta kuotanya melalui file upload, sehingga proses penugasan lebih efisien.

#### Kriteria Penerimaan

1. THE Frontend SHALL menyediakan tombol "Upload Penugasan" pada halaman pengelolaan surveyor per survei
2. WHEN Admin atau Supervisor mengupload file penugasan, THE Backend SHALL menerima file CSV/Excel dengan kolom: email_surveyor, kuota
3. THE Backend SHALL memvalidasi bahwa setiap email_surveyor terdaftar sebagai Surveyor aktif di sistem
4. THE Backend SHALL memvalidasi bahwa setiap nilai kuota adalah bilangan bulat positif lebih dari 0
5. IF terdapat baris dengan data tidak valid, THEN THE Backend SHALL mengembalikan daftar error per baris tanpa menyimpan data apapun
6. WHEN semua baris valid, THE Backend SHALL membuat atau memperbarui record SurveyorQuota untuk setiap baris dalam satu transaksi database
7. THE Frontend SHALL menyediakan tombol untuk mengunduh template file penugasan yang berisi kolom: email_surveyor, kuota

### Persyaratan 6: Tampilan Informasi Kuota pada Antarmuka Surveyor

**User Story:** Sebagai Surveyor, saya ingin melihat sisa kuota saya sebelum memulai pengisian survei, sehingga saya tahu berapa banyak respons yang masih perlu saya kumpulkan.

#### Kriteria Penerimaan

1. WHEN Surveyor membuka halaman daftar survei, THE Frontend SHALL menampilkan informasi kuota (terisi/total) untuk setiap survei yang ditugaskan
2. WHEN sisa Kuota Surveyor untuk suatu survei adalah 0, THE Frontend SHALL menonaktifkan tombol "Mulai Survei" dan menampilkan label "Kuota Tercapai"
3. WHEN Surveyor berhasil mengirim respons, THE Frontend SHALL memperbarui tampilan sisa kuota secara otomatis
