# Requirements Document

## Introduction

Web Survey Platform adalah aplikasi survei berbasis web yang memungkinkan admin mengelola survei, pertanyaan, dan surveyor; serta memungkinkan surveyor login untuk mengisi data responden secara online. Platform ini dirancang untuk mendukung pengumpulan data lapangan secara terstruktur dengan fitur skip logic, randomisasi jawaban, upload foto, dan ekspor laporan.

## Glossary

- **Admin**: Pengguna dengan hak akses penuh untuk mengelola platform, termasuk survei, pertanyaan, surveyor, dan laporan.
- **Surveyor**: Pengguna lapangan yang login ke platform untuk mengisi data responden.
- **Responden**: Individu yang menjadi subjek survei dan datanya diisi oleh Surveyor.
- **Survei**: Kumpulan pertanyaan yang dikelompokkan untuk tujuan pengumpulan data tertentu.
- **Pertanyaan**: Satu unit pertanyaan dalam survei yang dapat memiliki berbagai tipe jawaban.
- **Skip Logic**: Mekanisme yang menentukan pertanyaan mana yang ditampilkan atau dilewati berdasarkan jawaban sebelumnya.
- **Random List Jawaban**: Fitur pengacakan urutan pilihan jawaban untuk mengurangi bias urutan.
- **Dashboard**: Halaman utama admin yang menampilkan ringkasan statistik dan aktivitas platform.
- **Report**: Laporan hasil survei yang dapat diekspor dalam format tertentu.
- **Session**: Sesi autentikasi pengguna yang aktif setelah login berhasil.
- **JWT**: JSON Web Token yang digunakan sebagai token autentikasi.
- **Platform**: Sistem web survey secara keseluruhan.
- **Nomor Kuesioner**: Nomor unik yang diberikan secara otomatis kepada setiap pengisian data responden dalam satu survei, digunakan untuk identifikasi dan penelusuran.
- **Kuota Responden**: Target jumlah responden yang ditetapkan Admin untuk setiap Surveyor dalam satu survei.
- **Timestamp Mulai**: Waktu yang dicatat secara otomatis oleh Platform ketika Surveyor membuka formulir pengisian data responden.
- **Timestamp Selesai**: Waktu yang dicatat secara otomatis oleh Platform ketika Surveyor berhasil menyimpan data responden.
- **Durasi Pengisian**: Selisih waktu antara Timestamp Mulai dan Timestamp Selesai dalam satuan detik.
- **Geolokasi**: Koordinat geografis berupa latitude dan longitude yang diperoleh dari browser Surveyor pada saat penyimpanan data responden.
- **Peta Sebaran**: Visualisasi peta interaktif yang menampilkan titik-titik lokasi wawancara berdasarkan data Geolokasi.

---

## Requirements

### Requirement 1: Autentikasi Admin

**User Story:** Sebagai admin, saya ingin login ke dashboard dengan kredensial yang aman, sehingga saya dapat mengelola platform survei.

#### Acceptance Criteria

1. WHEN admin memasukkan email dan password yang valid, THE Platform SHALL mengautentikasi admin dan mengarahkan ke halaman dashboard.
2. WHEN admin memasukkan email atau password yang tidak valid, THE Platform SHALL menampilkan pesan kesalahan yang deskriptif tanpa mengungkap detail keamanan.
3. THE Platform SHALL menerbitkan JWT dengan masa berlaku 8 jam setelah autentikasi berhasil.
4. WHEN JWT admin telah kedaluwarsa, THE Platform SHALL mengarahkan admin ke halaman login.
5. WHEN admin menekan tombol logout, THE Platform SHALL menginvalidasi Session dan mengarahkan ke halaman login.
6. IF percobaan login gagal sebanyak 5 kali berturut-turut dari IP yang sama dalam 15 menit, THEN THE Platform SHALL memblokir percobaan login dari IP tersebut selama 15 menit.

---

### Requirement 2: Manajemen Admin (Kelola Pengguna Admin)

**User Story:** Sebagai admin, saya ingin mengelola akun admin lainnya, sehingga saya dapat mengontrol siapa yang memiliki akses ke platform.

#### Acceptance Criteria

1. THE Platform SHALL menyediakan halaman daftar admin yang menampilkan nama, email, status aktif, dan tanggal dibuat.
2. WHEN admin membuat akun admin baru dengan email unik dan password yang memenuhi syarat, THE Platform SHALL menyimpan akun baru dengan password yang di-hash menggunakan bcrypt.
3. IF admin mencoba membuat akun dengan email yang sudah terdaftar, THEN THE Platform SHALL menolak permintaan dan menampilkan pesan kesalahan.
4. WHEN admin memperbarui data akun admin lain, THE Platform SHALL menyimpan perubahan dan mencatat aktivitas di audit log.
5. WHEN admin menonaktifkan akun admin lain, THE Platform SHALL mencabut akses login akun tersebut tanpa menghapus data historis.
6. THE Platform SHALL mencegah admin menghapus atau menonaktifkan akun admin miliknya sendiri.
7. THE Platform SHALL memvalidasi password baru memiliki minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka.

---

### Requirement 3: Manajemen Survei

**User Story:** Sebagai admin, saya ingin membuat dan mengelola survei, sehingga saya dapat mengorganisir pengumpulan data sesuai kebutuhan.

#### Acceptance Criteria

1. THE Platform SHALL menyediakan halaman daftar survei yang menampilkan judul, status (aktif/nonaktif/draft), jumlah pertanyaan, dan jumlah responden.
2. WHEN admin membuat survei baru dengan judul yang valid, THE Platform SHALL menyimpan survei dengan status draft.
3. WHEN admin mengaktifkan survei, THE Platform SHALL mengubah status survei menjadi aktif dan membuatnya tersedia untuk Surveyor.
4. WHEN admin menonaktifkan survei yang sedang aktif, THE Platform SHALL mengubah status menjadi nonaktif dan mencegah Surveyor mengisi data baru.
5. WHILE survei berstatus aktif dan memiliki minimal 1 pertanyaan, THE Platform SHALL menampilkan survei tersebut di daftar survei Surveyor.
6. WHEN admin menghapus survei berstatus draft, THE Platform SHALL menghapus survei beserta semua pertanyaan terkait.
7. IF admin mencoba menghapus survei yang memiliki data responden, THEN THE Platform SHALL menolak penghapusan dan menampilkan pesan peringatan.

---

### Requirement 4: Manajemen Pertanyaan dengan Skip Logic

**User Story:** Sebagai admin, saya ingin membuat pertanyaan dengan skip logic, sehingga alur survei dapat disesuaikan berdasarkan jawaban responden.

#### Acceptance Criteria

1. THE Platform SHALL mendukung tipe pertanyaan: pilihan ganda (single choice), pilihan ganda (multiple choice), teks pendek, teks panjang, skala numerik, tanggal, dan upload foto.
2. WHEN admin menambahkan pertanyaan ke survei, THE Platform SHALL menyimpan pertanyaan dengan urutan yang dapat diatur.
3. WHEN admin mengonfigurasi skip logic pada pertanyaan, THE Platform SHALL menyimpan aturan: jika jawaban pertanyaan X adalah nilai Y, maka lewati ke pertanyaan Z.
4. WHILE Surveyor mengisi survei dan menjawab pertanyaan yang memiliki skip logic, THE Platform SHALL menampilkan atau menyembunyikan pertanyaan berikutnya sesuai aturan yang dikonfigurasi.
5. THE Platform SHALL mendukung skip logic berantai (chained skip logic) di mana hasil skip dari satu pertanyaan dapat memicu skip logic pertanyaan lainnya.
6. IF admin mengonfigurasi skip logic yang membentuk siklus (circular reference), THEN THE Platform SHALL menolak konfigurasi dan menampilkan pesan kesalahan.
7. WHEN admin menghapus pertanyaan yang menjadi target skip logic, THE Platform SHALL menghapus semua aturan skip logic yang merujuk ke pertanyaan tersebut.

---

### Requirement 5: Randomisasi Urutan Jawaban

**User Story:** Sebagai admin, saya ingin mengaktifkan randomisasi urutan pilihan jawaban, sehingga bias urutan dapat diminimalkan dalam pengumpulan data.

#### Acceptance Criteria

1. WHEN admin mengaktifkan fitur random list jawaban pada pertanyaan pilihan ganda, THE Platform SHALL menyimpan konfigurasi randomisasi untuk pertanyaan tersebut.
2. WHILE Surveyor membuka pertanyaan dengan randomisasi aktif, THE Platform SHALL menampilkan pilihan jawaban dalam urutan acak yang berbeda setiap kali halaman dimuat.
3. THE Platform SHALL memastikan semua pilihan jawaban tetap ditampilkan meskipun urutannya diacak.
4. WHERE fitur random list jawaban diaktifkan, THE Platform SHALL menyimpan jawaban berdasarkan nilai pilihan, bukan posisi urutan tampilan.

---

### Requirement 6: Upload Foto pada Pertanyaan

**User Story:** Sebagai admin, saya ingin menambahkan pertanyaan bertipe upload foto, sehingga Surveyor dapat mendokumentasikan bukti visual dari responden.

#### Acceptance Criteria

1. WHEN admin membuat pertanyaan bertipe upload foto, THE Platform SHALL menyimpan konfigurasi tipe pertanyaan tersebut.
2. WHEN Surveyor mengunggah foto pada pertanyaan upload foto, THE Platform SHALL menerima file dengan format JPEG, PNG, atau WEBP dengan ukuran maksimal 5 MB.
3. IF Surveyor mengunggah file dengan format atau ukuran yang tidak sesuai, THEN THE Platform SHALL menolak file dan menampilkan pesan kesalahan yang menjelaskan batasan yang berlaku.
4. THE Platform SHALL menyimpan foto yang diunggah di penyimpanan server dan menyimpan referensi path file di database.
5. WHEN admin melihat laporan, THE Platform SHALL menampilkan foto yang diunggah sebagai thumbnail yang dapat diperbesar.

---

### Requirement 7: Manajemen Surveyor

**User Story:** Sebagai admin, saya ingin mengelola akun surveyor, sehingga saya dapat mengontrol siapa yang dapat mengisi data survei.

#### Acceptance Criteria

1. THE Platform SHALL menyediakan halaman daftar surveyor yang menampilkan nama, email, status aktif, jumlah responden yang telah diisi, dan tanggal bergabung.
2. WHEN admin membuat akun surveyor baru dengan nama, email unik, dan password, THE Platform SHALL menyimpan akun surveyor.
3. IF admin mencoba membuat akun surveyor dengan email yang sudah terdaftar, THEN THE Platform SHALL menolak permintaan dan menampilkan pesan kesalahan.
4. WHEN admin menonaktifkan akun surveyor, THE Platform SHALL mencabut akses login surveyor tersebut tanpa menghapus data responden yang sudah diisi.
5. WHEN admin mengaktifkan kembali akun surveyor yang nonaktif, THE Platform SHALL memulihkan akses login surveyor tersebut.
6. THE Platform SHALL menampilkan ringkasan aktivitas surveyor termasuk jumlah responden per survei.

---

### Requirement 8: Autentikasi Surveyor

**User Story:** Sebagai surveyor, saya ingin login ke platform dengan kredensial saya, sehingga saya dapat mengisi data responden.

#### Acceptance Criteria

1. WHEN Surveyor memasukkan email dan password yang valid, THE Platform SHALL mengautentikasi Surveyor dan mengarahkan ke halaman daftar survei yang tersedia.
2. WHEN Surveyor memasukkan email atau password yang tidak valid, THE Platform SHALL menampilkan pesan kesalahan tanpa mengungkap detail keamanan.
3. THE Platform SHALL menerbitkan JWT dengan masa berlaku 12 jam setelah autentikasi Surveyor berhasil.
4. WHILE akun Surveyor berstatus nonaktif, THE Platform SHALL menolak percobaan login dan menampilkan pesan bahwa akun tidak aktif.
5. WHEN JWT Surveyor telah kedaluwarsa, THE Platform SHALL mengarahkan Surveyor ke halaman login.

---

### Requirement 9: Pengisian Data Responden oleh Surveyor

**User Story:** Sebagai surveyor, saya ingin mengisi data minimal 10 responden per survei, sehingga target pengumpulan data dapat terpenuhi.

#### Acceptance Criteria

1. WHEN Surveyor memilih survei aktif, THE Platform SHALL menampilkan formulir survei dengan semua pertanyaan yang berlaku berdasarkan skip logic.
2. THE Platform SHALL memungkinkan Surveyor mengisi data untuk lebih dari satu responden dalam satu sesi login.
3. WHEN Surveyor menyelesaikan pengisian data satu responden dan menekan tombol simpan, THE Platform SHALL menyimpan data responden dan menampilkan formulir kosong untuk responden berikutnya.
4. THE Platform SHALL menampilkan penghitung jumlah responden yang telah diisi oleh Surveyor dalam sesi aktif.
5. WHEN Surveyor mengisi pertanyaan wajib dan menekan tombol simpan, THE Platform SHALL memvalidasi semua pertanyaan wajib telah dijawab sebelum menyimpan data.
6. IF Surveyor mencoba menyimpan data tanpa mengisi pertanyaan wajib, THEN THE Platform SHALL menampilkan indikator visual pada pertanyaan yang belum dijawab.
7. THE Platform SHALL menyimpan data responden dengan timestamp, ID Surveyor, dan ID survei yang terkait.

---

### Requirement 10: Dashboard Admin

**User Story:** Sebagai admin, saya ingin melihat ringkasan statistik di dashboard, sehingga saya dapat memantau aktivitas platform secara keseluruhan.

#### Acceptance Criteria

1. THE Platform SHALL menampilkan di dashboard: jumlah total survei aktif, jumlah total surveyor aktif, jumlah total responden yang telah diisi hari ini, dan jumlah total responden keseluruhan.
2. THE Platform SHALL menampilkan grafik tren pengisian responden dalam 7 hari terakhir di dashboard.
3. THE Platform SHALL menampilkan daftar 5 surveyor dengan jumlah responden terbanyak di dashboard.
4. WHEN data baru ditambahkan, THE Platform SHALL memperbarui statistik dashboard dalam waktu tidak lebih dari 60 detik.

---

### Requirement 11: Laporan dan Ekspor Data

**User Story:** Sebagai admin, saya ingin melihat dan mengekspor hasil survei, sehingga saya dapat menganalisis data yang telah dikumpulkan.

#### Acceptance Criteria

1. THE Platform SHALL menyediakan halaman laporan yang menampilkan data responden per survei dengan filter berdasarkan tanggal, surveyor, dan status.
2. WHEN admin memilih survei dan menekan tombol ekspor, THE Platform SHALL menghasilkan file Excel (.xlsx) yang berisi semua data responden beserta jawaban per pertanyaan.
3. THE Platform SHALL menyertakan kolom metadata dalam ekspor: ID responden, nama surveyor, tanggal pengisian, dan waktu pengisian.
4. WHERE pertanyaan bertipe upload foto, THE Platform SHALL menyertakan URL atau path foto dalam file ekspor.
5. WHEN admin mengekspor data survei dengan lebih dari 1000 responden, THE Platform SHALL memproses ekspor secara asinkron dan memberikan notifikasi ketika file siap diunduh.
6. THE Platform SHALL mendukung ekspor data dalam format CSV sebagai alternatif dari format Excel.
7. WHEN admin menerapkan filter pada laporan, THE Platform SHALL menampilkan hanya data yang sesuai dengan kriteria filter yang dipilih.

---

### Requirement 12: Keamanan dan Otorisasi

**User Story:** Sebagai admin, saya ingin memastikan bahwa setiap pengguna hanya dapat mengakses fitur yang sesuai dengan perannya, sehingga keamanan data terjaga.

#### Acceptance Criteria

1. THE Platform SHALL membedakan hak akses antara peran Admin dan peran Surveyor.
2. WHILE pengguna berstatus Surveyor, THE Platform SHALL membatasi akses hanya pada halaman pengisian survei dan riwayat pengisian miliknya sendiri.
3. WHILE pengguna berstatus Admin, THE Platform SHALL memberikan akses ke semua fitur manajemen platform.
4. IF pengguna tanpa autentikasi mencoba mengakses halaman yang dilindungi, THEN THE Platform SHALL mengarahkan pengguna ke halaman login.
5. IF Surveyor mencoba mengakses endpoint API yang hanya diperuntukkan Admin, THEN THE Platform SHALL menolak permintaan dengan respons HTTP 403 Forbidden.
6. THE Platform SHALL mencatat semua aktivitas login, logout, dan perubahan data penting di audit log dengan timestamp dan ID pengguna.

---

### Requirement 13: Nomor Kuesioner untuk Setiap Pengisian Responden

**User Story:** Sebagai admin, saya ingin setiap pengisian responden memiliki nomor kuesioner yang unik dalam satu survei, sehingga saya dapat mengidentifikasi dan menelusuri setiap data responden secara akurat.

#### Acceptance Criteria

1. WHEN Surveyor menyimpan data responden, THE Platform SHALL menetapkan Nomor Kuesioner yang unik secara otomatis untuk pengisian tersebut dalam lingkup survei yang sama.
2. THE Platform SHALL memastikan tidak ada dua pengisian responden dalam satu survei yang memiliki Nomor Kuesioner yang sama.
3. THE Platform SHALL menampilkan Nomor Kuesioner kepada Surveyor setelah data responden berhasil disimpan.
4. THE Platform SHALL menyertakan Nomor Kuesioner sebagai kolom dalam file ekspor laporan.
5. WHEN admin melihat detail data responden, THE Platform SHALL menampilkan Nomor Kuesioner sebagai bagian dari informasi identifikasi responden.
6. IF terjadi kegagalan sistem saat penetapan Nomor Kuesioner, THEN THE Platform SHALL membatalkan penyimpanan data responden dan menampilkan pesan kesalahan kepada Surveyor.

---

### Requirement 14: Kuota Responden per Surveyor

**User Story:** Sebagai admin, saya ingin menetapkan kuota jumlah responden untuk setiap surveyor dalam satu survei, sehingga target pengumpulan data dapat direncanakan dan dipantau secara terstruktur.

#### Acceptance Criteria

1. WHEN admin menetapkan Kuota Responden untuk Surveyor pada survei tertentu, THE Platform SHALL menyimpan nilai kuota sebagai bilangan bulat positif yang lebih besar dari 0.
2. IF admin memasukkan nilai kuota yang bukan bilangan bulat positif, THEN THE Platform SHALL menolak input dan menampilkan pesan kesalahan yang menjelaskan format yang valid.
3. WHILE Surveyor login dan memilih survei yang memiliki Kuota Responden, THE Platform SHALL menampilkan informasi target responden beserta jumlah responden yang telah diisi oleh Surveyor tersebut.
4. THE Platform SHALL menampilkan indikator progres kepada Surveyor yang menunjukkan perbandingan antara jumlah responden yang telah diisi dengan Kuota Responden yang ditetapkan.
5. WHEN jumlah responden yang diisi oleh Surveyor telah mencapai Kuota Responden, THE Platform SHALL menampilkan notifikasi bahwa target telah terpenuhi.
6. THE Platform SHALL tetap mengizinkan Surveyor mengisi data responden melebihi Kuota Responden yang ditetapkan.
7. THE Platform SHALL menampilkan ringkasan kuota dan pencapaian setiap Surveyor per survei pada halaman manajemen Surveyor untuk Admin.
8. WHERE Kuota Responden tidak ditetapkan untuk Surveyor pada survei tertentu, THE Platform SHALL menampilkan pengisian tanpa batasan target kepada Surveyor tersebut.

---

### Requirement 15: Pencatatan Timestamp Pengisian Responden

**User Story:** Sebagai admin, saya ingin mengetahui waktu mulai dan waktu selesai setiap pengisian data responden, sehingga saya dapat memantau durasi wawancara dan mendeteksi anomali pengisian data.

#### Acceptance Criteria

1. WHEN Surveyor membuka formulir pengisian data responden baru, THE Platform SHALL mencatat Timestamp Mulai secara otomatis menggunakan waktu server dalam format ISO 8601 (UTC).
2. WHEN Surveyor berhasil menyimpan data responden, THE Platform SHALL mencatat Timestamp Selesai secara otomatis menggunakan waktu server dalam format ISO 8601 (UTC).
3. THE Platform SHALL menghitung dan menyimpan Durasi Pengisian sebagai selisih antara Timestamp Selesai dan Timestamp Mulai dalam satuan detik.
4. THE Platform SHALL menyertakan kolom Timestamp Mulai, Timestamp Selesai, dan Durasi Pengisian dalam file ekspor laporan.
5. WHEN admin melihat detail data responden, THE Platform SHALL menampilkan Timestamp Mulai, Timestamp Selesai, dan Durasi Pengisian sebagai bagian dari informasi metadata responden.
6. IF Surveyor membuka formulir tetapi tidak menyelesaikan pengisian (menutup halaman atau sesi habis), THEN THE Platform SHALL tidak menyimpan Timestamp Mulai sebagai data responden yang valid.
7. THE Platform SHALL menampilkan Timestamp Mulai dan Timestamp Selesai dalam zona waktu lokal pengguna pada antarmuka, meskipun data disimpan dalam UTC.

---

### Requirement 16: Pencatatan Geolokasi Wawancara

**User Story:** Sebagai admin, saya ingin mengetahui lokasi GPS di mana setiap wawancara dilakukan, sehingga saya dapat memantau sebaran lokasi wawancara setiap surveyor dan memverifikasi keabsahan pengumpulan data lapangan.

#### Acceptance Criteria

1. WHEN Surveyor menekan tombol simpan data responden, THE Platform SHALL meminta izin akses lokasi dari browser Surveyor menggunakan Geolocation API.
2. WHEN Surveyor memberikan izin lokasi dan browser berhasil memperoleh koordinat, THE Platform SHALL menyimpan nilai latitude dan longitude dengan presisi minimal 6 angka desimal bersama data responden.
3. IF Surveyor menolak izin lokasi di browser, THEN THE Platform SHALL tetap menyimpan data responden dan menandai kolom Geolokasi dengan nilai null serta status "lokasi_tidak_tersedia".
4. IF browser Surveyor tidak mendukung Geolocation API, THEN THE Platform SHALL tetap menyimpan data responden dan menandai kolom Geolokasi dengan status "tidak_didukung".
5. IF permintaan Geolokasi tidak mendapat respons dalam 10 detik, THEN THE Platform SHALL melanjutkan penyimpanan data responden dan menandai kolom Geolokasi dengan status "timeout".
6. THE Platform SHALL menyertakan kolom latitude, longitude, dan status Geolokasi dalam file ekspor laporan.
7. THE Platform SHALL menyediakan halaman Peta Sebaran pada bagian laporan yang menampilkan titik-titik lokasi wawancara berdasarkan data Geolokasi yang tersedia.
8. WHEN admin membuka halaman Peta Sebaran, THE Platform SHALL menampilkan filter berdasarkan survei, surveyor, dan rentang tanggal untuk menyaring titik lokasi yang ditampilkan.
9. WHEN admin mengklik titik lokasi pada Peta Sebaran, THE Platform SHALL menampilkan informasi ringkas berupa nama surveyor, Nomor Kuesioner, dan Timestamp Selesai untuk pengisian tersebut.
10. WHILE data Geolokasi berstatus "lokasi_tidak_tersedia", "tidak_didukung", atau "timeout", THE Platform SHALL tidak menampilkan titik lokasi tersebut pada Peta Sebaran dan menandainya secara eksplisit dalam file ekspor.
