# Dokumen Persyaratan — PWA Survey Field Tools

## Pendahuluan

Dokumen ini mendefinisikan persyaratan untuk empat kapabilitas lapangan baru pada platform survei PWA Populi Center: **Perekaman Audio Real-time**, **Pelacakan Geolokasi yang Ditingkatkan**, **Pengambilan Foto**, dan **Tanda Tangan Digital**. Keempat fitur ini dirancang untuk surveyor yang melakukan wawancara di lapangan menggunakan perangkat mobile (Android/iOS) dengan konektivitas yang sering tidak stabil. Semua fitur menggunakan browser API (MediaRecorder, Geolocation, Canvas, File/Camera input) dan mengikuti pola offline-first yang sudah ada di aplikasi.

## Glosarium

- **Surveyor**: Pengguna dengan role `surveyor` yang melakukan wawancara dan mengisi formulir survei di lapangan
- **Respons**: Satu set jawaban lengkap yang disubmit oleh Surveyor untuk satu survei, direpresentasikan oleh model `Response`
- **SurveyForm**: Halaman formulir survei (`SurveyForm.jsx`) tempat Surveyor mengisi jawaban
- **AudioRecorder**: Komponen dan hook yang mengelola perekaman audio menggunakan browser MediaRecorder API
- **OfflineDB**: Modul IndexedDB (`offlineDB.js`) yang menyimpan data secara lokal untuk penggunaan offline
- **SyncManager**: Hook (`useSyncManager.js`) yang mengelola sinkronisasi data offline ke backend saat koneksi tersedia
- **GeolocationHook**: Hook (`useGeolocation.js`) yang membungkus browser Geolocation API untuk mendapatkan koordinat GPS
- **PhotoCapture**: Komponen yang memungkinkan pengambilan foto melalui kamera atau pemilihan dari galeri
- **SignaturePad**: Komponen canvas untuk menangkap tanda tangan digital
- **MediaBlob**: Objek Blob yang berisi data audio hasil perekaman dari MediaRecorder API
- **Backend**: Server Express + Sequelize yang menangani penyimpanan dan pengambilan data survei

## Persyaratan

### Persyaratan 1: Perekaman Audio Real-time

**User Story:** Sebagai Surveyor, saya ingin merekam audio selama wawancara berlangsung sambil mengisi formulir survei, sehingga saya memiliki bukti rekaman wawancara yang terhubung dengan data respons.

#### Kriteria Penerimaan

1. WHEN Surveyor menekan tombol "Mulai Rekam" pada SurveyForm, THE AudioRecorder SHALL meminta izin mikrofon melalui browser MediaRecorder API dan memulai perekaman audio
2. WHILE perekaman audio sedang berlangsung, THE AudioRecorder SHALL menampilkan indikator visual berupa durasi rekaman yang berjalan dan status "Merekam"
3. WHILE perekaman audio sedang berlangsung, THE SurveyForm SHALL tetap dapat diisi oleh Surveyor tanpa gangguan pada perekaman
4. WHEN Surveyor menekan tombol "Jeda", THE AudioRecorder SHALL menghentikan perekaman sementara dan menampilkan status "Dijeda"
5. WHEN Surveyor menekan tombol "Lanjutkan" setelah jeda, THE AudioRecorder SHALL melanjutkan perekaman audio dari titik terakhir
6. WHEN Surveyor menekan tombol "Berhenti", THE AudioRecorder SHALL menghentikan perekaman dan menghasilkan MediaBlob dalam format WebM atau MP4
7. WHEN perekaman selesai, THE AudioRecorder SHALL menyimpan MediaBlob ke OfflineDB dengan referensi ke Respons yang sedang diisi
8. IF browser tidak mendukung MediaRecorder API, THEN THE AudioRecorder SHALL menampilkan pesan "Perekaman audio tidak didukung pada perangkat ini" dan menyembunyikan kontrol perekaman
9. IF Surveyor menolak izin mikrofon, THEN THE AudioRecorder SHALL menampilkan pesan "Izin mikrofon diperlukan untuk merekam audio" dan menonaktifkan tombol rekam
10. WHEN koneksi internet tersedia dan terdapat rekaman audio yang belum disinkronkan di OfflineDB, THE SyncManager SHALL mengunggah file audio ke Backend dan menghubungkannya dengan Respons terkait
11. THE Backend SHALL menyediakan endpoint `POST /upload/audio` yang menerima file audio (WebM, MP4) dengan ukuran maksimal 50 MB dan menyimpannya di direktori `uploads/audio/`
12. THE Backend SHALL menyimpan path file audio pada kolom `audio_path` di model Response

### Persyaratan 2: Pelacakan Geolokasi yang Ditingkatkan

**User Story:** Sebagai Surveyor, saya ingin koordinat GPS ditangkap secara otomatis saat memulai dan menyelesaikan pengisian survei, sehingga lokasi wawancara tercatat dengan akurat.

#### Kriteria Penerimaan

1. WHEN Surveyor membuka SurveyForm untuk mengisi survei, THE GeolocationHook SHALL secara otomatis menangkap koordinat GPS (latitude, longitude) sebagai `start_latitude` dan `start_longitude`
2. WHEN Surveyor mengirimkan Respons, THE GeolocationHook SHALL menangkap koordinat GPS sebagai `end_latitude` dan `end_longitude` (perilaku yang sudah ada, disimpan sebagai `latitude` dan `longitude`)
3. THE Backend SHALL menyimpan koordinat awal pada kolom `start_latitude` dan `start_longitude` di model Response
4. IF GeolocationHook mengembalikan status `lokasi_tidak_tersedia` atau `tidak_didukung` atau `timeout` saat pengambilan koordinat awal, THEN THE SurveyForm SHALL menyimpan status geolokasi awal sebagai `start_geo_status` dan melanjutkan pengisian tanpa memblokir Surveyor
5. WHEN Respons disimpan secara offline, THE OfflineDB SHALL menyimpan koordinat awal (`start_latitude`, `start_longitude`, `start_geo_status`) bersama data Respons untuk disinkronkan kemudian
6. THE Backend SHALL menyertakan `start_latitude`, `start_longitude`, dan `start_geo_status` pada endpoint `GET /responses/:id`

### Persyaratan 3: Pengambilan Foto

**User Story:** Sebagai Surveyor, saya ingin mengambil foto selama pengisian survei (misalnya foto lokasi, bukti persetujuan, atau dokumentasi), sehingga foto-foto tersebut terlampir pada data Respons.

#### Kriteria Penerimaan

1. WHEN Surveyor menekan tombol "Ambil Foto" pada SurveyForm, THE PhotoCapture SHALL membuka dialog pemilihan yang menawarkan opsi kamera perangkat atau galeri foto
2. WHEN Surveyor mengambil foto melalui kamera atau memilih dari galeri, THE PhotoCapture SHALL menampilkan pratinjau foto dalam bentuk thumbnail
3. THE PhotoCapture SHALL mendukung penyimpanan lebih dari satu foto per Respons
4. WHILE Surveyor melihat pratinjau foto, THE PhotoCapture SHALL menyediakan tombol hapus untuk menghapus foto yang tidak diinginkan sebelum pengiriman
5. WHEN foto ditambahkan atau dihapus, THE PhotoCapture SHALL memperbarui daftar pratinjau foto secara langsung
6. WHEN Respons disimpan secara offline, THE OfflineDB SHALL menyimpan data foto (sebagai Blob) bersama data Respons untuk disinkronkan kemudian
7. WHEN koneksi internet tersedia dan terdapat foto yang belum disinkronkan di OfflineDB, THE SyncManager SHALL mengunggah foto ke Backend melalui endpoint `POST /upload/photo` yang sudah ada dan menghubungkan path foto dengan Respons terkait
8. THE PhotoCapture SHALL menerima file dengan format JPEG, PNG, atau WEBP dengan ukuran maksimal 5 MB per foto
9. IF file yang dipilih melebihi 5 MB, THEN THE PhotoCapture SHALL menampilkan pesan "Ukuran foto melebihi batas maksimal 5 MB"
10. IF file yang dipilih bukan format JPEG, PNG, atau WEBP, THEN THE PhotoCapture SHALL menampilkan pesan "Format foto tidak didukung. Gunakan JPEG, PNG, atau WEBP"
11. THE Backend SHALL menyimpan daftar path foto pada model Response atau tabel terkait sehingga beberapa foto dapat dihubungkan dengan satu Respons

### Persyaratan 4: Tanda Tangan Digital

**User Story:** Sebagai Surveyor, saya ingin menangkap tanda tangan responden atau surveyor pada canvas digital, sehingga tanda tangan tersebut tersimpan sebagai bukti persetujuan yang terhubung dengan data Respons.

#### Kriteria Penerimaan

1. WHEN Surveyor mengaktifkan area tanda tangan pada SurveyForm, THE SignaturePad SHALL menampilkan canvas kosong yang responsif terhadap sentuhan (touch) dan mouse
2. WHILE Surveyor atau responden menggambar pada canvas, THE SignaturePad SHALL merender goresan secara real-time dengan latensi yang tidak terasa oleh pengguna
3. WHEN pengguna menekan tombol "Hapus", THE SignaturePad SHALL menghapus seluruh goresan pada canvas dan mengembalikannya ke keadaan kosong
4. WHEN pengguna menekan tombol "Ulangi", THE SignaturePad SHALL menghapus goresan terakhir (undo) sehingga pengguna dapat memperbaiki tanda tangan
5. WHEN Surveyor mengirimkan Respons, THE SignaturePad SHALL mengekspor konten canvas sebagai gambar PNG
6. WHEN Respons disimpan secara offline, THE OfflineDB SHALL menyimpan data gambar tanda tangan (sebagai Blob PNG) bersama data Respons untuk disinkronkan kemudian
7. WHEN koneksi internet tersedia dan terdapat tanda tangan yang belum disinkronkan di OfflineDB, THE SyncManager SHALL mengunggah gambar tanda tangan ke Backend dan menghubungkannya dengan Respons terkait
8. THE Backend SHALL menyediakan endpoint atau memanfaatkan endpoint upload yang ada untuk menerima file gambar tanda tangan (PNG) dengan ukuran maksimal 2 MB
9. THE Backend SHALL menyimpan path file tanda tangan pada kolom `signature_path` di model Response
10. IF canvas kosong saat Surveyor mencoba mengirimkan Respons dan tanda tangan bersifat wajib, THEN THE SignaturePad SHALL menampilkan pesan "Tanda tangan wajib diisi"

### Persyaratan 5: Penyimpanan Offline dan Sinkronisasi

**User Story:** Sebagai Surveyor, saya ingin semua data lapangan (audio, foto, tanda tangan, geolokasi) tersimpan secara lokal saat offline dan tersinkronkan otomatis saat koneksi tersedia, sehingga saya tidak kehilangan data meskipun berada di area tanpa sinyal.

#### Kriteria Penerimaan

1. WHEN Surveyor mengirimkan Respons dalam keadaan offline, THE OfflineDB SHALL menyimpan seluruh data terkait (jawaban, audio, foto, tanda tangan, koordinat geolokasi) dalam satu entri antrian offline
2. THE OfflineDB SHALL menggunakan object store baru `media_files` untuk menyimpan Blob besar (audio, foto, tanda tangan) secara terpisah dari antrian offline, dengan referensi `localId` ke entri antrian terkait
3. WHEN koneksi internet tersedia, THE SyncManager SHALL mengunggah file media (audio, foto, tanda tangan) terlebih dahulu, kemudian mengirimkan data Respons dengan path file yang sudah diunggah
4. IF pengunggahan file media gagal karena kesalahan jaringan, THEN THE SyncManager SHALL menghentikan sinkronisasi untuk entri tersebut dan mencoba kembali saat koneksi tersedia berikutnya
5. IF pengunggahan file media gagal karena kesalahan server (4xx/5xx), THEN THE SyncManager SHALL menandai entri sebagai `failed` dengan pesan kesalahan yang deskriptif
6. WHILE sinkronisasi sedang berlangsung, THE SurveyForm SHALL menampilkan indikator sinkronisasi melalui komponen OfflineStatusBar yang sudah ada
7. WHEN seluruh file media dan data Respons berhasil disinkronkan, THE SyncManager SHALL menghapus data media dari OfflineDB untuk menghemat ruang penyimpanan perangkat

### Persyaratan 6: Integrasi pada Formulir Survei

**User Story:** Sebagai Surveyor, saya ingin semua fitur lapangan (audio, foto, tanda tangan) terintegrasi dengan baik pada halaman formulir survei, sehingga saya dapat menggunakannya dengan mudah selama wawancara.

#### Kriteria Penerimaan

1. THE SurveyForm SHALL menampilkan panel kontrol audio (mulai/jeda/berhenti) di bagian atas atau bawah formulir yang tetap terlihat saat Surveyor menggulir halaman
2. THE SurveyForm SHALL menampilkan tombol "Tambah Foto" yang dapat diakses kapan saja selama pengisian formulir
3. THE SurveyForm SHALL menampilkan area tanda tangan di bagian bawah formulir sebelum tombol submit
4. WHEN Surveyor mengisi formulir pada perangkat mobile, THE SurveyForm SHALL menampilkan semua kontrol fitur lapangan dengan ukuran sentuh minimal 44x44 piksel sesuai pedoman aksesibilitas
5. THE SurveyForm SHALL menyertakan label dan atribut ARIA yang sesuai pada semua kontrol fitur lapangan untuk mendukung aksesibilitas
