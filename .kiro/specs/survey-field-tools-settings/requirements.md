# Requirements Document

## Introduction

Fitur ini menambahkan pengaturan per-survei untuk mengontrol apakah field tools (tanda tangan, rekaman audio, pengambilan foto, dan lokasi GPS) bersifat wajib, opsional, atau dinonaktifkan. Saat ini, semua field tools selalu ditampilkan dan diwajibkan saat surveyor mengisi survei. Admin membutuhkan fleksibilitas untuk mengonfigurasi setiap field tool secara independen per survei, sehingga surveyor yang menggunakan perangkat tertentu (misalnya laptop tanpa layar sentuh yang baik untuk tanda tangan) tidak terhambat oleh field tool yang tidak relevan.

## Glossary

- **Admin**: Pengguna dengan role admin atau supervisor yang mengelola konfigurasi survei
- **Surveyor**: Pengguna dengan role surveyor yang mengisi formulir survei di lapangan
- **Field_Tool**: Komponen pengumpulan data tambahan pada formulir survei: Signature, Audio, Photo, atau GPS
- **Field_Tool_Mode**: Status konfigurasi sebuah Field_Tool pada survei tertentu, bernilai `required`, `optional`, atau `disabled`
- **Survey_Builder**: Halaman admin untuk membuat dan mengedit survei beserta pertanyaan dan pengaturannya
- **Survey_Form**: Halaman formulir yang digunakan Surveyor untuk mengisi survei di lapangan
- **Survey_Model**: Model data survei di backend yang menyimpan konfigurasi survei termasuk pengaturan Field_Tool
- **Submission_Validator**: Komponen backend yang memvalidasi data respons survei sebelum disimpan ke database
- **Field_Tools_Settings**: Objek konfigurasi pada Survey_Model yang menyimpan Field_Tool_Mode untuk setiap Field_Tool

## Requirements

### Requirement 1: Penyimpanan Konfigurasi Field Tools pada Survei

**User Story:** Sebagai Admin, saya ingin menyimpan pengaturan field tools per survei, sehingga setiap survei dapat memiliki konfigurasi field tools yang berbeda.

#### Acceptance Criteria

1. THE Survey_Model SHALL menyimpan Field_Tools_Settings sebagai objek JSONB dengan empat properti: `signature_mode`, `audio_mode`, `photo_mode`, dan `gps_mode`
2. WHEN sebuah survei baru dibuat, THE Survey_Model SHALL menetapkan nilai default `required` untuk setiap Field_Tool_Mode dalam Field_Tools_Settings
3. THE Survey_Model SHALL membatasi nilai setiap Field_Tool_Mode hanya pada `required`, `optional`, atau `disabled`
4. WHEN Field_Tools_Settings berisi nilai selain `required`, `optional`, atau `disabled`, THE Survey_Model SHALL menolak penyimpanan dan mengembalikan pesan error validasi

### Requirement 2: Antarmuka Admin untuk Mengonfigurasi Field Tools

**User Story:** Sebagai Admin, saya ingin mengonfigurasi field tools melalui Survey_Builder, sehingga saya dapat menentukan field tools mana yang wajib, opsional, atau dinonaktifkan untuk setiap survei.

#### Acceptance Criteria

1. THE Survey_Builder SHALL menampilkan bagian "Pengaturan Field Tools" yang berisi empat pengaturan: Tanda Tangan, Rekaman Audio, Pengambilan Foto, dan Lokasi GPS
2. WHEN Admin membuka bagian "Pengaturan Field Tools", THE Survey_Builder SHALL menampilkan tiga opsi untuk setiap Field_Tool: "Wajib", "Opsional", dan "Nonaktif"
3. WHEN Admin mengubah Field_Tool_Mode untuk sebuah Field_Tool, THE Survey_Builder SHALL menyimpan perubahan ke backend melalui endpoint PUT /surveys/:id
4. WHEN Survey_Builder dimuat untuk survei yang sudah ada, THE Survey_Builder SHALL menampilkan Field_Tool_Mode yang tersimpan untuk setiap Field_Tool

### Requirement 3: Endpoint API untuk Mengelola Field Tools Settings

**User Story:** Sebagai Admin, saya ingin endpoint API mendukung penyimpanan dan pengambilan konfigurasi field tools, sehingga frontend dapat mengelola pengaturan field tools.

#### Acceptance Criteria

1. WHEN Admin mengirim request PUT /surveys/:id dengan field `field_tools_settings`, THE Survey_Model SHALL memperbarui Field_Tools_Settings pada survei yang ditentukan
2. WHEN Admin mengirim request GET /surveys/:id, THE Survey_Model SHALL menyertakan Field_Tools_Settings dalam respons JSON
3. WHEN Surveyor mengirim request GET /surveys/:id, THE Survey_Model SHALL menyertakan Field_Tools_Settings dalam respons JSON
4. IF request PUT /surveys/:id berisi `field_tools_settings` dengan properti yang tidak valid, THEN THE Submission_Validator SHALL mengembalikan HTTP 422 dengan pesan error deskriptif
5. WHEN Admin mengkloning survei melalui POST /surveys/:id/clone, THE Survey_Model SHALL menyalin Field_Tools_Settings dari survei sumber ke survei hasil kloning

### Requirement 4: Tampilan Field Tools pada Survey Form Berdasarkan Konfigurasi

**User Story:** Sebagai Surveyor, saya ingin formulir survei menampilkan field tools sesuai konfigurasi survei, sehingga saya hanya melihat field tools yang relevan.

#### Acceptance Criteria

1. WHEN Survey_Form dimuat untuk survei dengan Field_Tool_Mode `disabled` pada sebuah Field_Tool, THE Survey_Form SHALL menyembunyikan komponen Field_Tool tersebut dari tampilan
2. WHEN Survey_Form dimuat untuk survei dengan Field_Tool_Mode `optional` pada sebuah Field_Tool, THE Survey_Form SHALL menampilkan komponen Field_Tool tersebut dengan label "(Opsional)"
3. WHEN Survey_Form dimuat untuk survei dengan Field_Tool_Mode `required` pada sebuah Field_Tool, THE Survey_Form SHALL menampilkan komponen Field_Tool tersebut dengan label "(Wajib)"
4. WHILE Field_Tool_Mode bernilai `optional` untuk Signature, THE Survey_Form SHALL mengizinkan pengiriman formulir tanpa tanda tangan
5. WHILE Field_Tool_Mode bernilai `optional` untuk Audio, THE Survey_Form SHALL mengizinkan pengiriman formulir tanpa rekaman audio
6. WHILE Field_Tool_Mode bernilai `optional` untuk Photo, THE Survey_Form SHALL mengizinkan pengiriman formulir tanpa foto
7. WHILE Field_Tool_Mode bernilai `optional` untuk GPS, THE Survey_Form SHALL mengizinkan pengiriman formulir tanpa data lokasi GPS

### Requirement 5: Validasi Pengiriman Respons Berdasarkan Konfigurasi Field Tools

**User Story:** Sebagai Admin, saya ingin backend memvalidasi pengiriman respons sesuai konfigurasi field tools, sehingga data yang dikumpulkan sesuai dengan persyaratan survei.

#### Acceptance Criteria

1. WHEN Surveyor mengirim respons untuk survei dengan Signature Field_Tool_Mode `required` tanpa signature_path, THEN THE Submission_Validator SHALL menolak pengiriman dengan HTTP 422 dan pesan "Tanda tangan wajib diisi"
2. WHEN Surveyor mengirim respons untuk survei dengan Audio Field_Tool_Mode `required` tanpa audio_path, THEN THE Submission_Validator SHALL menolak pengiriman dengan HTTP 422 dan pesan "Rekaman audio wajib diisi"
3. WHEN Surveyor mengirim respons untuk survei dengan Photo Field_Tool_Mode `required` tanpa photo_paths atau photo_paths kosong, THEN THE Submission_Validator SHALL menolak pengiriman dengan HTTP 422 dan pesan "Foto wajib diisi"
4. WHEN Surveyor mengirim respons untuk survei dengan GPS Field_Tool_Mode `required` tanpa data latitude dan longitude, THEN THE Submission_Validator SHALL menolak pengiriman dengan HTTP 422 dan pesan "Lokasi GPS wajib diisi"
5. WHILE Field_Tool_Mode bernilai `optional` untuk sebuah Field_Tool, THE Submission_Validator SHALL menerima pengiriman respons baik dengan maupun tanpa data Field_Tool tersebut
6. WHILE Field_Tool_Mode bernilai `disabled` untuk sebuah Field_Tool, THE Submission_Validator SHALL mengabaikan data Field_Tool tersebut dalam pengiriman respons

### Requirement 6: Migrasi Database untuk Field Tools Settings

**User Story:** Sebagai Admin, saya ingin pengaturan field tools tersimpan di database, sehingga konfigurasi persisten dan konsisten.

#### Acceptance Criteria

1. THE Survey_Model SHALL memiliki kolom `field_tools_settings` bertipe JSONB pada tabel `surveys`
2. WHEN migrasi dijalankan pada database yang sudah ada, THE Survey_Model SHALL menetapkan nilai default `{"signature_mode":"required","audio_mode":"required","photo_mode":"required","gps_mode":"required"}` untuk semua survei yang sudah ada
3. THE Survey_Model SHALL menetapkan nilai default yang sama untuk kolom `field_tools_settings` pada survei baru

### Requirement 7: Dukungan Offline untuk Field Tools Settings

**User Story:** Sebagai Surveyor, saya ingin pengaturan field tools tersedia saat offline, sehingga formulir survei tetap menampilkan field tools yang benar tanpa koneksi internet.

#### Acceptance Criteria

1. WHEN Survey_Form menyimpan data survei ke cache offline, THE Survey_Form SHALL menyertakan Field_Tools_Settings dalam data yang di-cache
2. WHILE Surveyor mengisi survei dalam mode offline, THE Survey_Form SHALL menerapkan Field_Tools_Settings dari data cache untuk menampilkan atau menyembunyikan Field_Tool
3. WHEN Surveyor mengirim respons secara offline, THE Survey_Form SHALL menyertakan informasi Field_Tools_Settings dalam antrian offline untuk validasi saat sinkronisasi
