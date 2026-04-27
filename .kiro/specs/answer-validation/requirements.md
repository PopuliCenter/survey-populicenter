# Dokumen Persyaratan (Requirements)

## Pendahuluan

Fitur ini menambahkan kemampuan untuk menetapkan aturan validasi pada setiap pertanyaan survei, sehingga jawaban yang dikumpulkan surveyor selalu memenuhi kriteria yang ditetapkan oleh admin atau supervisor. Aturan validasi mencakup batas nilai minimum/maksimum untuk pertanyaan numerik dan rating scale, batas panjang karakter untuk pertanyaan teks, pola regex kustom untuk validasi format jawaban (misalnya NIK, kode pos), serta pesan error kustom yang ditampilkan saat validasi gagal. Validasi dijalankan secara real-time di frontend saat surveyor mengisi formulir, dan juga divalidasi ulang di backend saat submit untuk mencegah data tidak valid masuk ke database. Admin dan supervisor dapat mengonfigurasi aturan validasi per pertanyaan melalui UI Survey Builder. Aturan validasi disimpan dalam kolom `options` (JSONB) pada tabel `questions` di bawah key `validation`.

## Glosarium

- **Sistem**: Aplikasi platform survei web secara keseluruhan (backend + frontend)
- **Backend**: Server API Express.js yang menangani logika bisnis dan akses database
- **Frontend**: Aplikasi React + Vite yang menyediakan antarmuka pengguna
- **Admin**: Pengguna dengan role `admin` yang memiliki akses penuh ke semua fitur manajemen
- **Supervisor**: Pengguna dengan role `supervisor` yang mengelola surveyor dan survei
- **Surveyor**: Pengguna dengan role `surveyor` yang bertugas mengumpulkan respons survei di lapangan
- **Survey_Builder**: Halaman UI (`SurveyBuilder.jsx`) yang digunakan Admin dan Supervisor untuk membuat dan mengedit pertanyaan survei
- **Survey_Form**: Halaman UI (`SurveyForm.jsx`) yang digunakan Surveyor untuk mengisi formulir survei di lapangan
- **Aturan_Validasi**: Konfigurasi yang menentukan kriteria yang harus dipenuhi oleh jawaban surveyor, disimpan dalam kolom `options` JSONB di bawah key `validation`
- **Pertanyaan**: Record di tabel `questions` yang merepresentasikan satu pertanyaan dalam survei
- **Options_JSONB**: Kolom bertipe JSONB pada tabel `questions` yang menyimpan konfigurasi pertanyaan termasuk Aturan_Validasi
- **Min_Value**: Aturan validasi yang menetapkan nilai numerik minimum yang diperbolehkan untuk jawaban
- **Max_Value**: Aturan validasi yang menetapkan nilai numerik maksimum yang diperbolehkan untuk jawaban
- **Min_Length**: Aturan validasi yang menetapkan jumlah karakter minimum yang diperbolehkan untuk jawaban teks
- **Max_Length**: Aturan validasi yang menetapkan jumlah karakter maksimum yang diperbolehkan untuk jawaban teks
- **Regex_Pattern**: Pola ekspresi reguler (regular expression) yang digunakan untuk memvalidasi format jawaban
- **Pesan_Error_Kustom**: Teks pesan error yang ditulis oleh Admin atau Supervisor untuk ditampilkan saat validasi gagal
- **Validasi_Frontend**: Proses pengecekan jawaban terhadap Aturan_Validasi yang dijalankan secara real-time di browser Surveyor sebelum submit
- **Validasi_Backend**: Proses pengecekan jawaban terhadap Aturan_Validasi yang dijalankan di server saat endpoint submit dipanggil

## Persyaratan

### Persyaratan 1: Penyimpanan Aturan Validasi dalam Konfigurasi Pertanyaan

**User Story:** Sebagai Admin/Supervisor, saya ingin aturan validasi tersimpan sebagai bagian dari konfigurasi pertanyaan, sehingga aturan validasi selalu terkait langsung dengan pertanyaan yang bersangkutan dan dapat diakses oleh frontend maupun backend.

#### Kriteria Penerimaan

1. THE Backend SHALL menyimpan Aturan_Validasi di dalam kolom Options_JSONB pada tabel `questions` di bawah key `validation` dengan struktur `{ "validation": { "min_value": number|null, "max_value": number|null, "min_length": number|null, "max_length": number|null, "pattern": string|null, "custom_error": string|null } }`
2. WHEN Admin atau Supervisor menyimpan Pertanyaan melalui endpoint `POST /surveys/:surveyId/questions` atau `PUT /surveys/:surveyId/questions/:qid`, THE Backend SHALL menerima dan menyimpan objek `validation` di dalam field `options`
3. WHEN endpoint `GET /surveys/:surveyId/questions` dipanggil, THE Backend SHALL mengembalikan Aturan_Validasi sebagai bagian dari field `options` pada setiap Pertanyaan
4. IF field `validation` tidak disertakan dalam `options`, THEN THE Backend SHALL memperlakukan Pertanyaan tersebut sebagai tidak memiliki Aturan_Validasi (perilaku default tanpa validasi tambahan)

### Persyaratan 2: Validasi Nilai Minimum dan Maksimum untuk Pertanyaan Numerik

**User Story:** Sebagai Admin/Supervisor, saya ingin menetapkan batas nilai minimum dan maksimum pada pertanyaan bertipe numerik dan rating scale, sehingga surveyor hanya dapat memasukkan nilai dalam rentang yang valid.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor mengonfigurasi Aturan_Validasi pada Pertanyaan bertipe `numeric_scale`, THE Survey_Builder SHALL menampilkan field input untuk Min_Value dan Max_Value
2. WHEN Admin atau Supervisor mengonfigurasi Aturan_Validasi pada Pertanyaan bertipe `rating_scale`, THE Survey_Builder SHALL menampilkan field input untuk Min_Value dan Max_Value
3. THE Backend SHALL memvalidasi bahwa Min_Value dan Max_Value adalah bilangan numerik jika disertakan dalam Aturan_Validasi
4. IF Min_Value dan Max_Value keduanya disertakan, THEN THE Backend SHALL memvalidasi bahwa Min_Value lebih kecil dari atau sama dengan Max_Value
5. WHEN Surveyor memasukkan jawaban numerik yang lebih kecil dari Min_Value, THE Survey_Form SHALL menampilkan pesan error validasi
6. WHEN Surveyor memasukkan jawaban numerik yang lebih besar dari Max_Value, THE Survey_Form SHALL menampilkan pesan error validasi
7. WHEN Surveyor mengirim jawaban numerik di luar rentang Min_Value dan Max_Value, THE Backend SHALL menolak jawaban tersebut dengan kode HTTP 422 dan pesan error yang menjelaskan rentang yang diperbolehkan

### Persyaratan 3: Validasi Panjang Teks untuk Pertanyaan Teks

**User Story:** Sebagai Admin/Supervisor, saya ingin menetapkan batas panjang karakter minimum dan maksimum pada pertanyaan bertipe teks, sehingga jawaban yang dikumpulkan memiliki panjang yang sesuai dengan kebutuhan data.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor mengonfigurasi Aturan_Validasi pada Pertanyaan bertipe `short_text`, THE Survey_Builder SHALL menampilkan field input untuk Min_Length dan Max_Length
2. WHEN Admin atau Supervisor mengonfigurasi Aturan_Validasi pada Pertanyaan bertipe `long_text`, THE Survey_Builder SHALL menampilkan field input untuk Min_Length dan Max_Length
3. THE Backend SHALL memvalidasi bahwa Min_Length dan Max_Length adalah bilangan bulat positif jika disertakan dalam Aturan_Validasi
4. IF Min_Length dan Max_Length keduanya disertakan, THEN THE Backend SHALL memvalidasi bahwa Min_Length lebih kecil dari atau sama dengan Max_Length
5. WHEN Surveyor memasukkan jawaban teks dengan jumlah karakter kurang dari Min_Length, THE Survey_Form SHALL menampilkan pesan error validasi beserta jumlah karakter saat ini dan minimum yang dibutuhkan
6. WHEN Surveyor memasukkan jawaban teks dengan jumlah karakter lebih dari Max_Length, THE Survey_Form SHALL mencegah input melebihi Max_Length atau menampilkan pesan error validasi
7. WHEN Surveyor mengirim jawaban teks yang tidak memenuhi batas Min_Length atau Max_Length, THE Backend SHALL menolak jawaban tersebut dengan kode HTTP 422 dan pesan error yang menjelaskan batas panjang yang diperbolehkan

### Persyaratan 4: Validasi Pola Regex untuk Format Jawaban

**User Story:** Sebagai Admin/Supervisor, saya ingin menetapkan pola regex kustom pada pertanyaan, sehingga saya dapat memastikan jawaban sesuai format tertentu seperti NIK (16 digit), kode pos (5 digit), atau format lainnya.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor mengonfigurasi Aturan_Validasi pada Pertanyaan bertipe `short_text`, `long_text`, atau `numeric_scale`, THE Survey_Builder SHALL menampilkan field input untuk Regex_Pattern
2. THE Backend SHALL memvalidasi bahwa Regex_Pattern yang disertakan dalam Aturan_Validasi adalah ekspresi reguler yang valid (dapat dikompilasi tanpa error)
3. IF Regex_Pattern tidak valid (tidak dapat dikompilasi), THEN THE Backend SHALL menolak penyimpanan Pertanyaan dengan kode HTTP 422 dan pesan error "Pola regex tidak valid"
4. WHEN Surveyor memasukkan jawaban yang tidak cocok dengan Regex_Pattern, THE Survey_Form SHALL menampilkan pesan error validasi
5. WHEN Surveyor mengirim jawaban yang tidak cocok dengan Regex_Pattern, THE Backend SHALL menolak jawaban tersebut dengan kode HTTP 422 dan pesan error yang menjelaskan format yang diharapkan
6. THE Backend SHALL menjalankan pencocokan Regex_Pattern terhadap keseluruhan nilai jawaban (full match, bukan partial match)

### Persyaratan 5: Pesan Error Kustom

**User Story:** Sebagai Admin/Supervisor, saya ingin menulis pesan error kustom untuk setiap aturan validasi, sehingga surveyor mendapat petunjuk yang jelas dan spesifik saat jawaban tidak memenuhi kriteria.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor mengonfigurasi Aturan_Validasi pada Pertanyaan, THE Survey_Builder SHALL menampilkan field input teks untuk Pesan_Error_Kustom
2. WHEN Pesan_Error_Kustom telah diisi dan validasi gagal, THE Survey_Form SHALL menampilkan Pesan_Error_Kustom sebagai pengganti pesan error default
3. WHEN Pesan_Error_Kustom telah diisi dan validasi gagal di backend, THE Backend SHALL menyertakan Pesan_Error_Kustom dalam response error HTTP 422
4. IF Pesan_Error_Kustom tidak diisi dan validasi gagal, THEN THE Survey_Form SHALL menampilkan pesan error default yang dihasilkan secara otomatis berdasarkan jenis aturan validasi yang dilanggar
5. THE Backend SHALL memvalidasi bahwa Pesan_Error_Kustom tidak melebihi 500 karakter jika disertakan

### Persyaratan 6: Validasi Real-time di Frontend

**User Story:** Sebagai Surveyor, saya ingin mendapat umpan balik validasi secara langsung saat mengisi formulir, sehingga saya dapat memperbaiki jawaban sebelum menekan tombol submit.

#### Kriteria Penerimaan

1. WHEN Surveyor mengubah jawaban pada Pertanyaan yang memiliki Aturan_Validasi, THE Survey_Form SHALL menjalankan Validasi_Frontend secara real-time terhadap jawaban tersebut
2. WHEN Validasi_Frontend gagal, THE Survey_Form SHALL menampilkan pesan error di bawah field pertanyaan yang bersangkutan dengan warna merah
3. WHEN Surveyor memperbaiki jawaban sehingga memenuhi Aturan_Validasi, THE Survey_Form SHALL menghapus pesan error secara otomatis
4. WHEN Surveyor menekan tombol "Simpan Data Responden" dan terdapat Pertanyaan dengan Validasi_Frontend yang gagal, THE Survey_Form SHALL mencegah pengiriman dan menggulir halaman ke Pertanyaan pertama yang gagal validasi
5. THE Survey_Form SHALL menjalankan Validasi_Frontend untuk semua jenis aturan: Min_Value, Max_Value, Min_Length, Max_Length, dan Regex_Pattern
6. WHEN Pertanyaan bertipe `short_text` atau `long_text` memiliki Aturan_Validasi Max_Length, THE Survey_Form SHALL menampilkan penghitung karakter yang menunjukkan jumlah karakter saat ini dan batas maksimum

### Persyaratan 7: Validasi di Backend saat Submit

**User Story:** Sebagai Admin/Supervisor, saya ingin backend juga memvalidasi jawaban saat submit, sehingga data tidak valid tidak dapat masuk ke database meskipun validasi frontend dilewati.

#### Kriteria Penerimaan

1. WHEN endpoint `POST /responses/submit` dipanggil, THE Backend SHALL memvalidasi setiap jawaban terhadap Aturan_Validasi yang terkonfigurasi pada Pertanyaan yang bersangkutan
2. WHEN satu atau lebih jawaban tidak memenuhi Aturan_Validasi, THE Backend SHALL menolak seluruh pengiriman respons dengan kode HTTP 422 dan menyertakan daftar pertanyaan yang gagal validasi beserta pesan error masing-masing
3. THE Backend SHALL memvalidasi Min_Value dan Max_Value untuk jawaban pada Pertanyaan bertipe `numeric_scale` dan `rating_scale`
4. THE Backend SHALL memvalidasi Min_Length dan Max_Length untuk jawaban pada Pertanyaan bertipe `short_text` dan `long_text`
5. THE Backend SHALL memvalidasi Regex_Pattern untuk jawaban pada Pertanyaan bertipe `short_text`, `long_text`, dan `numeric_scale`
6. IF Pertanyaan tidak memiliki Aturan_Validasi (field `validation` tidak ada atau kosong), THEN THE Backend SHALL melewatkan validasi tambahan untuk jawaban Pertanyaan tersebut
7. FOR ALL jawaban yang valid menurut Aturan_Validasi, memvalidasi jawaban tersebut di frontend lalu memvalidasi ulang di backend SHALL menghasilkan hasil validasi yang konsisten (keduanya lolos atau keduanya gagal)

### Persyaratan 8: Konfigurasi Validasi di Survey Builder

**User Story:** Sebagai Admin/Supervisor, saya ingin mengatur aturan validasi per pertanyaan melalui antarmuka Survey Builder yang intuitif, sehingga saya dapat dengan mudah menetapkan kriteria kualitas data tanpa perlu menulis kode.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor mengedit Pertanyaan di Survey_Builder, THE Survey_Builder SHALL menampilkan bagian "Aturan Validasi" yang dapat dibuka/ditutup (collapsible section)
2. THE Survey_Builder SHALL menampilkan field validasi yang relevan berdasarkan tipe Pertanyaan: Min_Value dan Max_Value untuk `numeric_scale` dan `rating_scale`; Min_Length dan Max_Length untuk `short_text` dan `long_text`; Regex_Pattern untuk `short_text`, `long_text`, dan `numeric_scale`
3. THE Survey_Builder SHALL menampilkan field Pesan_Error_Kustom untuk semua tipe Pertanyaan yang mendukung Aturan_Validasi
4. WHEN Admin atau Supervisor mengisi field validasi dan menyimpan Pertanyaan, THE Survey_Builder SHALL menyertakan objek `validation` di dalam field `options` pada request ke Backend
5. WHEN Admin atau Supervisor membuka Pertanyaan yang sudah memiliki Aturan_Validasi, THE Survey_Builder SHALL menampilkan nilai Aturan_Validasi yang sudah tersimpan pada field yang sesuai
6. IF Admin atau Supervisor mengosongkan semua field validasi, THEN THE Survey_Builder SHALL menghapus key `validation` dari objek `options` atau mengirim `validation` sebagai objek kosong

### Persyaratan 9: Validasi Konfigurasi Aturan Validasi saat Penyimpanan Pertanyaan

**User Story:** Sebagai Admin/Supervisor, saya ingin sistem mencegah saya menyimpan aturan validasi yang tidak konsisten atau tidak valid, sehingga surveyor tidak menghadapi aturan yang mustahil dipenuhi.

#### Kriteria Penerimaan

1. WHEN Admin atau Supervisor menyimpan Pertanyaan dengan Aturan_Validasi melalui endpoint `POST /surveys/:surveyId/questions` atau `PUT /surveys/:surveyId/questions/:qid`, THE Backend SHALL memvalidasi konsistensi Aturan_Validasi sebelum menyimpan
2. IF Min_Value disertakan dan bukan bilangan numerik, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "min_value harus berupa bilangan numerik"
3. IF Max_Value disertakan dan bukan bilangan numerik, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "max_value harus berupa bilangan numerik"
4. IF Min_Length disertakan dan bukan bilangan bulat positif, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "min_length harus berupa bilangan bulat positif"
5. IF Max_Length disertakan dan bukan bilangan bulat positif, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "max_length harus berupa bilangan bulat positif"
6. IF Min_Value lebih besar dari Max_Value, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "min_value tidak boleh lebih besar dari max_value"
7. IF Min_Length lebih besar dari Max_Length, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "min_length tidak boleh lebih besar dari max_length"
8. IF Regex_Pattern tidak dapat dikompilasi sebagai ekspresi reguler yang valid, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "Pola regex tidak valid"
9. IF Pesan_Error_Kustom melebihi 500 karakter, THEN THE Backend SHALL menolak penyimpanan dengan kode HTTP 422 dan pesan error "Pesan error kustom tidak boleh melebihi 500 karakter"
10. FOR ALL Aturan_Validasi yang valid, menyimpan lalu membaca kembali Aturan_Validasi dari database SHALL menghasilkan objek yang identik dengan yang disimpan (round-trip property)
