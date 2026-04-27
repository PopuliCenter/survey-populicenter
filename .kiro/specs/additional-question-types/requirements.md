# Dokumen Persyaratan (Requirements)

## Pendahuluan

Fitur ini menambahkan tipe pertanyaan baru ke platform survei untuk memperkaya kemampuan pengumpulan data: **date picker** (dengan konfigurasi min/max tanggal), **time picker** (format 24 jam), dan **matrix/grid question** (tabel baris × kolom). Saat ini tipe `date` sudah ada di CHECK constraint database tetapi implementasinya masih dasar (hanya input `type="date"` tanpa konfigurasi min/max). Fitur ini melengkapi implementasi date picker dengan konfigurasi, menambahkan tipe `time` dan `matrix` ke CHECK constraint, serta mengimplementasikan komponen UI dan logika backend untuk ketiga tipe tersebut. Jawaban date disimpan dalam format `YYYY-MM-DD`, jawaban time dalam format `HH:mm` (24 jam), dan jawaban matrix disimpan sebagai objek JSON yang memetakan setiap baris ke kolom yang dipilih.

## Glosarium

- **Sistem**: Aplikasi platform survei web secara keseluruhan (backend + frontend)
- **Backend**: Server API Express.js yang menangani logika bisnis dan akses database
- **Frontend**: Aplikasi React + Vite yang menyediakan antarmuka pengguna
- **Admin**: Pengguna dengan role `admin` yang memiliki akses penuh ke semua fitur manajemen
- **Supervisor**: Pengguna dengan role `supervisor` yang mengelola surveyor dan survei
- **Surveyor**: Pengguna dengan role `surveyor` yang bertugas mengumpulkan respons survei di lapangan
- **Survey_Builder**: Halaman UI (`SurveyBuilder.jsx`) yang digunakan Admin dan Supervisor untuk membuat dan mengedit pertanyaan survei
- **Survey_Form**: Halaman UI (`SurveyForm.jsx`) yang digunakan Surveyor untuk mengisi formulir survei di lapangan
- **Response_Detail**: Halaman UI (`ResponseDetail.jsx`) yang menampilkan detail jawaban responden
- **Pertanyaan**: Record di tabel `questions` yang merepresentasikan satu pertanyaan dalam survei
- **Options_JSONB**: Kolom bertipe JSONB pada tabel `questions` yang menyimpan konfigurasi pertanyaan
- **Date_Picker**: Tipe pertanyaan yang jawabannya berupa tanggal dengan komponen pemilih tanggal (date picker UI)
- **Time_Picker**: Tipe pertanyaan yang jawabannya berupa waktu dalam format 24 jam dengan komponen pemilih waktu (time picker UI)
- **Matrix_Question**: Tipe pertanyaan berbentuk tabel/grid di mana baris adalah sub-pertanyaan dan kolom adalah opsi jawaban, surveyor memilih satu jawaban per baris
- **Min_Date**: Tanggal minimum yang diperbolehkan sebagai jawaban pada Date_Picker
- **Max_Date**: Tanggal maksimum yang diperbolehkan sebagai jawaban pada Date_Picker
- **Matrix_Rows**: Daftar sub-pertanyaan yang ditampilkan sebagai baris pada Matrix_Question
- **Matrix_Columns**: Daftar opsi jawaban yang ditampilkan sebagai kolom pada Matrix_Question
- **Matrix_Answer**: Objek JSON yang memetakan setiap Matrix_Rows ke Matrix_Columns yang dipilih oleh Surveyor
- **CHECK_Constraint**: Constraint pada kolom `type` di tabel `questions` yang membatasi nilai tipe pertanyaan yang valid
- **Export_Data**: Fungsi `buildExportData` di `reports.js` yang membangun data ekspor CSV/Excel dari jawaban responden

## Persyaratan

### Persyaratan 1: Melengkapi Implementasi Date Picker dengan Konfigurasi Min/Max

**User Story:** Sebagai Admin/Supervisor, saya ingin mengonfigurasi tanggal minimum dan maksimum pada pertanyaan bertipe date, sehingga surveyor hanya dapat memilih tanggal dalam rentang yang valid sesuai kebutuhan survei.

#### Kriteria Penerimaan

1. THE Backend SHALL menyimpan konfigurasi Date_Picker di dalam kolom Options_JSONB dengan struktur `{ "min_date": "YYYY-MM-DD" | null, "max_date": "YYYY-MM-DD" | null }`
2. WHEN Admin atau Supervisor membuat atau mengedit Pertanyaan bertipe `date`, THE Survey_Builder SHALL menampilkan field input untuk Min_Date dan Max_Date
3. WHEN Min_Date dan Max_Date keduanya diisi, THE Backend SHALL memvalidasi bahwa Min_Date lebih kecil dari atau sama dengan Max_Date
4. IF Min_Date atau Max_Date memiliki format yang bukan `YYYY-MM-DD`, THEN THE Backend SHALL menolak penyimpanan Pertanyaan dengan kode HTTP 422 dan pesan error "Format tanggal harus YYYY-MM-DD"
5. WHEN Surveyor mengisi Pertanyaan bertipe `date`, THE Survey_Form SHALL menampilkan komponen date picker dengan batasan Min_Date dan Max_Date yang dikonfigurasi
6. WHEN Surveyor memilih tanggal di luar rentang Min_Date dan Max_Date, THE Survey_Form SHALL menampilkan pesan error validasi dan mencegah pemilihan tanggal tersebut
7. THE Backend SHALL memvalidasi bahwa jawaban bertipe `date` memiliki format `YYYY-MM-DD` yang valid dan berada dalam rentang Min_Date sampai Max_Date jika dikonfigurasi
8. IF jawaban tanggal di luar rentang yang dikonfigurasi, THEN THE Backend SHALL menolak jawaban dengan kode HTTP 422 dan pesan error yang menjelaskan rentang tanggal yang diperbolehkan
9. WHEN Pertanyaan bertipe `date` tidak memiliki konfigurasi Min_Date dan Max_Date, THE Survey_Form SHALL menampilkan date picker tanpa batasan rentang (perilaku default saat ini)

### Persyaratan 2: Tipe Pertanyaan Time Picker

**User Story:** Sebagai Admin/Supervisor, saya ingin menambahkan pertanyaan bertipe waktu (time picker), sehingga surveyor dapat mencatat data waktu dengan format yang konsisten menggunakan komponen pemilih waktu.

#### Kriteria Penerimaan

1. THE Backend SHALL menambahkan nilai `time` ke CHECK_Constraint pada kolom `type` di tabel `questions` melalui migration database baru
2. THE Backend SHALL menerima dan memvalidasi tipe pertanyaan `time` pada endpoint `POST /surveys/:surveyId/questions` dan `PUT /surveys/:surveyId/questions/:qid`
3. WHEN Admin atau Supervisor membuat Pertanyaan baru di Survey_Builder, THE Survey_Builder SHALL menampilkan opsi "Waktu" dalam daftar tipe pertanyaan
4. WHEN Surveyor mengisi Pertanyaan bertipe `time`, THE Survey_Form SHALL menampilkan komponen time picker dengan format 24 jam (HH:mm)
5. THE Backend SHALL memvalidasi bahwa jawaban bertipe `time` memiliki format `HH:mm` yang valid dengan jam dalam rentang 00-23 dan menit dalam rentang 00-59
6. IF jawaban waktu memiliki format yang bukan `HH:mm` atau nilai di luar rentang valid, THEN THE Backend SHALL menolak jawaban dengan kode HTTP 422 dan pesan error "Format waktu harus HH:mm (24 jam)"
7. WHEN Pertanyaan bertipe `time` ditampilkan di Response_Detail, THE Response_Detail SHALL menampilkan nilai waktu dalam format HH:mm
8. WHEN data diekspor ke CSV/Excel, THE Export_Data SHALL menampilkan jawaban bertipe `time` sebagai string dalam format HH:mm

### Persyaratan 3: Tipe Pertanyaan Matrix/Grid

**User Story:** Sebagai Admin/Supervisor, saya ingin menambahkan pertanyaan bertipe matrix/grid, sehingga surveyor dapat menilai beberapa aspek sekaligus dalam satu pertanyaan menggunakan tabel baris dan kolom.

#### Kriteria Penerimaan

1. THE Backend SHALL menambahkan nilai `matrix` ke CHECK_Constraint pada kolom `type` di tabel `questions` melalui migration database baru (bersamaan dengan tipe `time`)
2. THE Backend SHALL menyimpan konfigurasi Matrix_Question di dalam kolom Options_JSONB dengan struktur `{ "rows": ["string", ...], "columns": ["string", ...] }`
3. WHEN Admin atau Supervisor membuat Pertanyaan bertipe `matrix` di Survey_Builder, THE Survey_Builder SHALL menampilkan editor untuk menambah, mengedit, dan menghapus Matrix_Rows dan Matrix_Columns
4. THE Backend SHALL memvalidasi bahwa konfigurasi `matrix` memiliki array `rows` dengan minimal 1 elemen dan array `columns` dengan minimal 2 elemen
5. THE Backend SHALL memvalidasi bahwa setiap elemen dalam `rows` dan `columns` adalah string yang tidak kosong
6. IF konfigurasi matrix tidak memenuhi validasi, THEN THE Backend SHALL menolak penyimpanan Pertanyaan dengan kode HTTP 422 dan pesan error yang menjelaskan kesalahan konfigurasi
7. WHEN Surveyor mengisi Pertanyaan bertipe `matrix`, THE Survey_Form SHALL menampilkan tabel grid dengan Matrix_Rows sebagai baris dan Matrix_Columns sebagai header kolom
8. THE Survey_Form SHALL memungkinkan Surveyor memilih tepat satu jawaban per baris menggunakan radio button
9. THE Backend SHALL menyimpan jawaban matrix sebagai Matrix_Answer dalam kolom `answer_json` pada tabel `answers` dengan format `{ "NamaBaris1": "NamaKolom", "NamaBaris2": "NamaKolom", ... }`
10. THE Backend SHALL memvalidasi bahwa setiap key dalam Matrix_Answer sesuai dengan salah satu elemen Matrix_Rows dan setiap value sesuai dengan salah satu elemen Matrix_Columns
11. IF Matrix_Answer mengandung key yang tidak ada di Matrix_Rows atau value yang tidak ada di Matrix_Columns, THEN THE Backend SHALL menolak jawaban dengan kode HTTP 422 dan pesan error "Jawaban matrix tidak valid"
12. WHEN Pertanyaan bertipe `matrix` bersifat wajib (`is_required = true`), THE Backend SHALL memvalidasi bahwa Matrix_Answer memiliki jawaban untuk setiap Matrix_Rows

### Persyaratan 4: Tampilan Jawaban Matrix di Response Detail

**User Story:** Sebagai Admin/Supervisor/Viewer, saya ingin melihat jawaban matrix dalam format tabel yang mudah dibaca, sehingga saya dapat meninjau data yang dikumpulkan dengan cepat.

#### Kriteria Penerimaan

1. WHEN Response_Detail menampilkan jawaban untuk Pertanyaan bertipe `matrix`, THE Response_Detail SHALL merender jawaban dalam format tabel dengan Matrix_Rows sebagai baris dan kolom yang dipilih ditandai secara visual
2. WHEN jawaban matrix kosong atau tidak tersedia, THE Response_Detail SHALL menampilkan teks "Tidak ada jawaban" dengan gaya italic
3. THE Response_Detail SHALL menampilkan label tipe "Matrix/Grid" pada badge tipe pertanyaan untuk jawaban bertipe `matrix`

### Persyaratan 5: Ekspor Data untuk Tipe Pertanyaan Baru

**User Story:** Sebagai Admin/Supervisor/Viewer, saya ingin jawaban dari tipe pertanyaan baru (date, time, matrix) diekspor dengan benar ke format CSV dan Excel, sehingga data dapat dianalisis di luar platform.

#### Kriteria Penerimaan

1. WHEN data diekspor ke CSV/Excel, THE Export_Data SHALL menampilkan jawaban bertipe `date` sebagai string dalam format YYYY-MM-DD
2. WHEN data diekspor ke CSV/Excel, THE Export_Data SHALL menampilkan jawaban bertipe `time` sebagai string dalam format HH:mm
3. WHEN data diekspor ke CSV/Excel dan Pertanyaan bertipe `matrix`, THE Export_Data SHALL membuat satu kolom terpisah untuk setiap Matrix_Rows dengan header format `{TeksPertanyaan} - {NamaBaris}`
4. WHEN data diekspor dan jawaban matrix tersedia, THE Export_Data SHALL mengisi setiap kolom baris matrix dengan nilai kolom yang dipilih oleh Surveyor
5. WHEN data diekspor dan jawaban matrix tidak tersedia untuk suatu baris, THE Export_Data SHALL mengisi kolom tersebut dengan string kosong

### Persyaratan 6: Validasi Konfigurasi Tipe Pertanyaan Baru saat Penyimpanan

**User Story:** Sebagai Admin/Supervisor, saya ingin sistem mencegah penyimpanan konfigurasi yang tidak valid untuk tipe pertanyaan baru, sehingga surveyor tidak menghadapi pertanyaan yang rusak atau tidak bisa dijawab.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor menyimpan Pertanyaan bertipe `date` dengan konfigurasi, THE Backend SHALL memvalidasi bahwa Min_Date dan Max_Date (jika diisi) memiliki format `YYYY-MM-DD` yang valid dan merepresentasikan tanggal yang benar
2. IF Min_Date lebih besar dari Max_Date, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "Tanggal minimum tidak boleh lebih besar dari tanggal maksimum"
3. WHEN Admin atau Supervisor menyimpan Pertanyaan bertipe `matrix`, THE Backend SHALL memvalidasi bahwa tidak ada elemen duplikat dalam array Matrix_Rows
4. WHEN Admin atau Supervisor menyimpan Pertanyaan bertipe `matrix`, THE Backend SHALL memvalidasi bahwa tidak ada elemen duplikat dalam array Matrix_Columns
5. IF terdapat elemen duplikat dalam Matrix_Rows atau Matrix_Columns, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "Elemen baris/kolom matrix tidak boleh duplikat"
6. FOR ALL konfigurasi tipe pertanyaan yang valid, menyimpan lalu membaca kembali konfigurasi dari database SHALL menghasilkan objek yang identik dengan yang disimpan (round-trip property)
7. FOR ALL jawaban date yang valid (format YYYY-MM-DD dalam rentang min/max), memvalidasi di frontend lalu memvalidasi ulang di backend SHALL menghasilkan hasil validasi yang konsisten
8. FOR ALL jawaban time yang valid (format HH:mm, jam 00-23, menit 00-59), memvalidasi di frontend lalu memvalidasi ulang di backend SHALL menghasilkan hasil validasi yang konsisten
9. FOR ALL jawaban matrix yang valid (setiap baris memiliki jawaban dari kolom yang dikonfigurasi), memvalidasi di frontend lalu memvalidasi ulang di backend SHALL menghasilkan hasil validasi yang konsisten

### Persyaratan 7: Integrasi dengan Fitur Survey Builder yang Ada

**User Story:** Sebagai Admin/Supervisor, saya ingin tipe pertanyaan baru terintegrasi dengan fitur Survey Builder yang sudah ada (skip logic, required, clone survei), sehingga tipe pertanyaan baru berfungsi konsisten dengan tipe yang sudah ada.

#### Kriteria Penerimaan

1. THE Survey_Builder SHALL menampilkan opsi "Tanggal" (untuk `date` yang sudah ada), "Waktu" (untuk `time`), dan "Matrix/Grid" (untuk `matrix`) dalam dropdown tipe pertanyaan
2. WHEN Pertanyaan bertipe `time` atau `matrix` ditandai sebagai wajib (`is_required = true`), THE Survey_Form SHALL memvalidasi bahwa jawaban telah diisi sebelum submit
3. WHEN survei yang mengandung Pertanyaan bertipe `time` atau `matrix` diduplikasi (clone), THE Backend SHALL menyalin konfigurasi Options_JSONB secara lengkap termasuk konfigurasi tipe pertanyaan baru
4. THE Backend SHALL mendukung skip logic pada Pertanyaan bertipe `date`, `time`, dan `matrix` sebagai sumber kondisi (source question) sesuai mekanisme skip logic yang sudah ada
5. WHEN Pertanyaan bertipe `time` ditampilkan di Response_Detail, THE Response_Detail SHALL menampilkan label tipe "Waktu" pada badge tipe pertanyaan
