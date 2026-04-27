# Requirements Document

## Introduction

Fitur ini menambahkan kemampuan admin/supervisor untuk menetapkan tanggal mulai (`start_date`) dan tanggal berakhir (`end_date`) pada setiap survei. Survei otomatis tidak bisa diisi ketika belum dimulai atau sudah melewati deadline. Fitur ini mencakup:

1. **Database:** Dua kolom baru `start_date` dan `end_date` (TIMESTAMPTZ, nullable) pada tabel `surveys` melalui migration baru.
2. **Backend:** Validasi periode aktif saat memulai pengisian (`POST /responses/start`), filter survei berdasarkan periode aktif untuk surveyor (`GET /surveys`), dan penambahan field `start_date`, `end_date`, `is_expired` di response `GET /surveys/:id`.
3. **Frontend:** Date picker di `SurveyBuilder.jsx` untuk mengatur tanggal, badge status temporal ("Akan Datang", "Aktif", "Berakhir") di `Surveys.jsx`, informasi sisa hari di `SurveyList.jsx` (surveyor), dan pemblokiran tombol "Mulai Isi" jika survei di luar periode aktif.

## Glossary

- **Survey_Migration**: File Sequelize migration baru di `backend/src/migrations/` yang menambahkan kolom `start_date` dan `end_date` ke tabel `surveys`.
- **Survey_Model**: Model Sequelize `Survey` di `backend/src/models/Survey.js` yang merepresentasikan tabel `surveys`.
- **Survey_Router**: Router Express di `backend/src/routes/surveys.js` yang menangani endpoint CRUD survei.
- **Response_Router**: Router Express di `backend/src/routes/responses.js` yang menangani endpoint pengisian survei.
- **Date_Validator**: Logika validasi di backend yang memverifikasi konsistensi `start_date` dan `end_date` (end_date harus lebih besar dari start_date jika keduanya diisi).
- **Period_Checker**: Logika pengecekan di backend yang menentukan apakah survei berada dalam periode aktif berdasarkan `start_date`, `end_date`, dan waktu saat ini.
- **Survey_Builder**: Halaman `frontend/src/pages/SurveyBuilder.jsx` untuk membuat dan mengedit survei beserta pertanyaannya.
- **Surveys_Page**: Halaman `frontend/src/pages/Surveys.jsx` yang menampilkan daftar survei untuk admin/supervisor.
- **Survey_List**: Halaman `frontend/src/surveyor/pages/SurveyList.jsx` yang menampilkan daftar survei aktif untuk surveyor.
- **Temporal_Badge**: Komponen badge visual yang menampilkan status temporal survei: "Akan Datang" (biru), "Aktif" (hijau), "Berakhir" (merah).
- **Date_Picker_Section**: Bagian dari form survei di Survey_Builder yang menampilkan input tanggal untuk `start_date` dan `end_date`.

---

## Requirements

### Requirement 1: Kolom start_date dan end_date di Database

**User Story:** Sebagai admin, saya ingin database mendukung penyimpanan tanggal mulai dan tanggal berakhir survei, sehingga sistem dapat menentukan periode aktif pengisian survei.

#### Acceptance Criteria

1. THE Survey_Migration SHALL menambahkan kolom `start_date` bertipe `TIMESTAMPTZ` (nullable, default NULL) ke tabel `surveys` melalui file migration baru tanpa mengubah migration yang sudah ada.
2. THE Survey_Migration SHALL menambahkan kolom `end_date` bertipe `TIMESTAMPTZ` (nullable, default NULL) ke tabel `surveys` dalam file migration yang sama.
3. THE Survey_Migration SHALL menyediakan fungsi `down` yang menghapus kolom `start_date` dan `end_date` dari tabel `surveys`.
4. THE Survey_Model SHALL mendefinisikan field `start_date` dan `end_date` bertipe `DataTypes.DATE` dengan `allowNull: true`.

---

### Requirement 2: Validasi Konsistensi start_date dan end_date

**User Story:** Sebagai admin, saya ingin sistem memvalidasi bahwa tanggal berakhir selalu lebih besar dari tanggal mulai, sehingga tidak terjadi konfigurasi periode yang tidak logis.

#### Acceptance Criteria

1. WHEN admin mengirimkan `start_date` dan `end_date` yang keduanya terisi, THE Date_Validator SHALL memverifikasi bahwa `end_date` lebih besar dari `start_date`.
2. WHEN `end_date` kurang dari atau sama dengan `start_date`, THE Date_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Tanggal berakhir harus lebih besar dari tanggal mulai"`.
3. WHEN hanya `start_date` yang diisi tanpa `end_date`, THE Date_Validator SHALL menerima konfigurasi tersebut (survei tanpa batas akhir).
4. WHEN hanya `end_date` yang diisi tanpa `start_date`, THE Date_Validator SHALL menerima konfigurasi tersebut (survei langsung aktif hingga end_date).
5. WHEN `start_date` dan `end_date` keduanya null, THE Date_Validator SHALL menerima konfigurasi tersebut (survei tanpa batasan waktu).

---

### Requirement 3: Penolakan Pengisian Survei di Luar Periode Aktif

**User Story:** Sebagai developer, saya ingin backend menolak permintaan memulai pengisian survei yang belum dimulai atau sudah berakhir, sehingga data yang dikumpulkan hanya berasal dari periode yang valid.

#### Acceptance Criteria

1. WHEN surveyor mengirimkan `POST /responses/start` untuk survei dengan `end_date` di masa lalu, THE Response_Router SHALL mengembalikan HTTP 409 dengan pesan `"Survei sudah berakhir"`.
2. WHEN surveyor mengirimkan `POST /responses/start` untuk survei dengan `start_date` di masa depan, THE Response_Router SHALL mengembalikan HTTP 409 dengan pesan `"Survei belum dimulai"`.
3. WHEN surveyor mengirimkan `POST /responses/start` untuk survei dengan `start_date` di masa lalu dan `end_date` di masa depan, THE Response_Router SHALL menerima permintaan dan melanjutkan proses pembuatan sesi.
4. WHEN surveyor mengirimkan `POST /responses/start` untuk survei dengan `start_date` dan `end_date` keduanya null, THE Response_Router SHALL menerima permintaan tanpa pengecekan periode.
5. WHEN survei memiliki status `active` tetapi `end_date` sudah terlewati, THE Response_Router SHALL tetap menolak permintaan dengan HTTP 409 (pengecekan periode lebih prioritas daripada status).

---

### Requirement 4: Filter Survei Berdasarkan Periode Aktif untuk Surveyor

**User Story:** Sebagai surveyor, saya ingin hanya melihat survei yang sedang dalam periode aktif, sehingga saya tidak melihat survei yang belum dimulai atau sudah berakhir.

#### Acceptance Criteria

1. WHEN surveyor mengakses `GET /surveys`, THE Survey_Router SHALL menyaring survei sehingga hanya menampilkan survei yang memenuhi kondisi: `start_date` null ATAU `start_date` kurang dari atau sama dengan waktu saat ini, DAN `end_date` null ATAU `end_date` lebih besar dari waktu saat ini.
2. WHEN admin atau supervisor mengakses `GET /surveys`, THE Survey_Router SHALL menampilkan semua survei tanpa filter periode (perilaku yang sudah ada tetap dipertahankan).
3. THE Survey_Router SHALL menyertakan field `start_date` dan `end_date` dalam response `GET /surveys` untuk semua role.

---

### Requirement 5: Field start_date, end_date, dan is_expired di Detail Survei

**User Story:** Sebagai pengguna, saya ingin melihat informasi tanggal mulai, tanggal berakhir, dan status kedaluwarsa survei di halaman detail, sehingga saya mengetahui periode pengisian survei.

#### Acceptance Criteria

1. THE Survey_Router SHALL menyertakan field `start_date` (TIMESTAMPTZ atau null) dalam response `GET /surveys/:id`.
2. THE Survey_Router SHALL menyertakan field `end_date` (TIMESTAMPTZ atau null) dalam response `GET /surveys/:id`.
3. THE Survey_Router SHALL menyertakan field `is_expired` (boolean) dalam response `GET /surveys/:id` yang bernilai `true` jika `end_date` terisi dan kurang dari waktu saat ini, dan `false` untuk kondisi lainnya.

---

### Requirement 6: Penyimpanan start_date dan end_date saat Membuat/Mengedit Survei

**User Story:** Sebagai admin, saya ingin dapat menetapkan dan mengubah tanggal mulai dan tanggal berakhir saat membuat atau mengedit survei, sehingga saya dapat mengontrol periode pengisian.

#### Acceptance Criteria

1. WHEN admin mengirimkan `POST /surveys` dengan field `start_date` dan `end_date`, THE Survey_Router SHALL menyimpan kedua nilai tersebut ke database.
2. WHEN admin mengirimkan `PUT /surveys/:id` dengan field `start_date` dan `end_date`, THE Survey_Router SHALL memperbarui kedua nilai tersebut di database.
3. WHEN admin mengirimkan `POST /surveys` atau `PUT /surveys/:id` tanpa field `start_date` dan `end_date`, THE Survey_Router SHALL menyimpan nilai null untuk kedua kolom (tanpa batasan waktu).
4. THE Survey_Router SHALL menjalankan validasi Date_Validator sebelum menyimpan data ke database pada endpoint `POST /surveys` dan `PUT /surveys/:id`.

---

### Requirement 7: Date Picker di Survey Builder

**User Story:** Sebagai admin, saya ingin dapat memilih tanggal mulai dan tanggal berakhir melalui date picker di halaman Survey Builder, sehingga saya dapat mengatur periode pengisian survei dengan mudah.

#### Acceptance Criteria

1. THE Date_Picker_Section SHALL menampilkan dua input tanggal berlabel "Tanggal Mulai" dan "Tanggal Berakhir" di halaman Survey_Builder, di bawah field deskripsi survei.
2. WHEN admin mengisi kedua tanggal, THE Date_Picker_Section SHALL mengirimkan field `start_date` dan `end_date` dalam format ISO 8601 ke endpoint backend.
3. WHEN admin mengosongkan salah satu atau kedua tanggal, THE Date_Picker_Section SHALL mengirimkan nilai null untuk field yang dikosongkan.
4. WHEN survei yang sudah ada dibuka untuk diedit, THE Date_Picker_Section SHALL menampilkan nilai `start_date` dan `end_date` yang tersimpan sebagai nilai awal input.
5. WHEN `end_date` diisi dengan nilai kurang dari atau sama dengan `start_date`, THE Date_Picker_Section SHALL menampilkan pesan error `"Tanggal berakhir harus setelah tanggal mulai"` di bawah input dan mencegah pengiriman form.

---

### Requirement 8: Badge Status Temporal di Halaman Daftar Survei (Admin)

**User Story:** Sebagai admin, saya ingin melihat badge status temporal pada setiap survei di halaman daftar survei, sehingga saya dapat dengan cepat mengetahui survei mana yang akan datang, sedang aktif, atau sudah berakhir.

#### Acceptance Criteria

1. WHEN survei memiliki `start_date` di masa depan, THE Surveys_Page SHALL menampilkan Temporal_Badge berwarna biru dengan teks "Akan Datang".
2. WHEN survei memiliki `start_date` di masa lalu (atau null) dan `end_date` di masa depan (atau null), THE Surveys_Page SHALL menampilkan Temporal_Badge berwarna hijau dengan teks "Aktif".
3. WHEN survei memiliki `end_date` di masa lalu, THE Surveys_Page SHALL menampilkan Temporal_Badge berwarna merah dengan teks "Berakhir".
4. WHEN survei tidak memiliki `start_date` dan `end_date` (keduanya null), THE Surveys_Page SHALL menampilkan Temporal_Badge berwarna hijau dengan teks "Aktif" (tanpa batasan waktu dianggap selalu aktif).
5. THE Surveys_Page SHALL menampilkan Temporal_Badge di samping badge status yang sudah ada (Draft/Aktif/Nonaktif) tanpa menggantikannya.

---

### Requirement 9: Informasi Sisa Hari dan Pemblokiran Tombol di Halaman Surveyor

**User Story:** Sebagai surveyor, saya ingin melihat sisa hari sebelum deadline dan tidak dapat memulai pengisian survei yang sudah berakhir atau belum dimulai, sehingga saya dapat memprioritaskan survei yang mendekati deadline.

#### Acceptance Criteria

1. WHEN survei memiliki `end_date` di masa depan, THE Survey_List SHALL menampilkan teks "Sisa X hari" di bawah judul survei, di mana X adalah selisih hari antara `end_date` dan waktu saat ini (dibulatkan ke bawah).
2. WHEN survei memiliki `end_date` yang kurang dari 3 hari dari waktu saat ini, THE Survey_List SHALL menampilkan teks "Sisa X hari" dengan warna merah sebagai peringatan.
3. WHEN survei memiliki `end_date` di masa lalu, THE Survey_List SHALL menampilkan teks "Berakhir" dengan warna merah dan menonaktifkan tombol "Mulai Isi".
4. WHEN survei memiliki `start_date` di masa depan, THE Survey_List SHALL menampilkan teks "Dimulai dalam X hari" dan menonaktifkan tombol "Mulai Isi".
5. WHEN survei tidak memiliki `end_date` (null), THE Survey_List SHALL tidak menampilkan informasi sisa hari (tanpa batasan waktu).
6. WHEN tombol "Mulai Isi" dinonaktifkan, THE Survey_List SHALL menampilkan atribut `disabled` pada tombol dan mengubah tampilan visual menjadi abu-abu.

---

### Requirement 10: Penambahan start_date dan end_date pada Clone Survei

**User Story:** Sebagai admin, saya ingin survei hasil clone tidak mewarisi tanggal mulai dan tanggal berakhir dari survei asli, sehingga saya dapat mengatur periode baru untuk survei duplikat.

#### Acceptance Criteria

1. WHEN survei di-clone melalui `POST /surveys/:id/clone`, THE Survey_Router SHALL menetapkan `start_date` dan `end_date` bernilai null pada survei hasil clone, terlepas dari nilai pada survei asli.

