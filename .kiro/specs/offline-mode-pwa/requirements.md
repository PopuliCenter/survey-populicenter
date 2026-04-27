# Dokumen Persyaratan (Requirements)

## Pendahuluan

Fitur ini memungkinkan surveyor untuk menggunakan aplikasi survei secara offline di daerah tanpa koneksi internet. Aplikasi dibangun sebagai Progressive Web App (PWA) yang dapat di-install di perangkat mobile surveyor langsung dari browser, tampil dan berfungsi seperti aplikasi native. Dengan dukungan Service Worker, halaman dan aset aplikasi di-cache agar tetap dapat diakses tanpa internet. Surveyor dapat mengisi kuesioner saat offline dengan data tersimpan di IndexedDB, dan data akan otomatis disinkronkan ke server saat koneksi internet kembali tersedia. Indikator status online/offline serta jumlah data yang belum tersinkron ditampilkan secara real-time agar surveyor selalu mengetahui kondisi koneksi dan status data mereka.

## Glosarium

- **Sistem**: Aplikasi platform survei web secara keseluruhan (backend + frontend)
- **Backend**: Server API Express.js yang menangani logika bisnis dan akses database
- **Frontend**: Aplikasi React + Vite yang menyediakan antarmuka pengguna
- **Surveyor**: Pengguna dengan role `surveyor` yang bertugas mengumpulkan respons survei di lapangan
- **Admin**: Pengguna dengan role `admin` yang memiliki akses penuh ke semua fitur manajemen
- **Supervisor**: Pengguna dengan role `supervisor` yang mengelola surveyor dan survei
- **PWA**: Progressive Web App — teknologi web yang memungkinkan aplikasi di-install di perangkat dan berjalan seperti aplikasi native
- **Service_Worker**: Script background yang berjalan terpisah dari halaman web, bertanggung jawab untuk caching aset, menangani request jaringan, dan memungkinkan fungsionalitas offline
- **IndexedDB**: Database berbasis key-value di browser yang digunakan untuk menyimpan data respons survei secara lokal saat offline
- **Offline_Queue**: Kumpulan data respons yang tersimpan di IndexedDB dan menunggu untuk disinkronkan ke Backend saat koneksi tersedia
- **Sync_Manager**: Modul frontend yang bertanggung jawab mendeteksi koneksi internet dan mengirim data dari Offline_Queue ke Backend secara otomatis
- **Pre_Cache**: Proses mengunduh dan menyimpan data survei (daftar survei, pertanyaan, opsi) ke IndexedDB saat Surveyor sedang online, agar data tersedia saat offline
- **Manifest**: File `manifest.json` yang mendefinisikan metadata PWA seperti nama aplikasi, ikon, warna tema, dan mode tampilan
- **Status_Indikator**: Komponen UI yang menampilkan status koneksi (online/offline) dan jumlah data di Offline_Queue yang belum tersinkron
- **Respons**: Satu set jawaban lengkap yang disubmit oleh Surveyor untuk suatu survei
- **Kuota**: Jumlah maksimum respons yang boleh dikumpulkan oleh seorang Surveyor untuk suatu survei tertentu

## Persyaratan

### Persyaratan 1: Konfigurasi PWA dan Web App Manifest

**User Story:** Sebagai Surveyor, saya ingin dapat meng-install aplikasi survei di HP saya langsung dari browser, sehingga saya dapat membuka aplikasi seperti native app tanpa perlu mengakses URL setiap kali.

#### Kriteria Penerimaan

1. THE Frontend SHALL menyediakan file `manifest.json` dengan field `name`, `short_name`, `start_url` (bernilai `/surveyor`), `display` (bernilai `standalone`), `theme_color`, `background_color`, dan array `icons` yang berisi ikon berukuran 192x192 dan 512x512 piksel
2. THE Frontend SHALL mendaftarkan file `manifest.json` melalui tag `<link rel="manifest">` di `index.html`
3. THE Frontend SHALL mengintegrasikan plugin `vite-plugin-pwa` pada konfigurasi Vite untuk menghasilkan Service_Worker secara otomatis saat proses build
4. WHEN Surveyor membuka aplikasi melalui browser mobile, THE Frontend SHALL memenuhi kriteria installability PWA sehingga browser menampilkan prompt "Add to Home Screen"
5. WHEN Surveyor membuka aplikasi yang sudah di-install, THE Frontend SHALL menampilkan aplikasi dalam mode standalone tanpa address bar browser

### Persyaratan 2: Service Worker dan Caching Aset

**User Story:** Sebagai Surveyor, saya ingin halaman aplikasi tetap bisa dibuka meskipun tidak ada koneksi internet, sehingga saya tidak terhambat saat berada di daerah tanpa sinyal.

#### Kriteria Penerimaan

1. THE Service_Worker SHALL melakukan precache terhadap semua aset statis hasil build (file HTML, CSS, JavaScript, dan gambar) menggunakan strategi cache-first
2. THE Service_Worker SHALL menerapkan strategi network-first untuk request ke API Backend, dengan fallback ke cache jika jaringan tidak tersedia
3. WHEN Surveyor membuka halaman `/surveyor` atau `/surveyor/survey/:id` tanpa koneksi internet, THE Service_Worker SHALL menyajikan halaman dari cache sehingga halaman tetap dapat ditampilkan
4. WHEN versi baru aplikasi tersedia, THE Service_Worker SHALL mengunduh aset terbaru di background dan menampilkan notifikasi kepada Surveyor bahwa pembaruan tersedia
5. THE Service_Worker SHALL membatasi ukuran runtime cache API maksimal 50 entri dengan kebijakan Least Recently Used (LRU) dan masa berlaku cache 24 jam

### Persyaratan 3: Pre-cache Data Survei untuk Penggunaan Offline

**User Story:** Sebagai Surveyor, saya ingin data survei dan pertanyaan sudah tersedia di perangkat saya sebelum pergi ke lapangan, sehingga saya bisa langsung mengisi kuesioner meskipun tidak ada internet.

#### Kriteria Penerimaan

1. WHEN Surveyor membuka halaman daftar survei (`/surveyor`) dan perangkat dalam kondisi online, THE Frontend SHALL mengunduh dan menyimpan data daftar survei beserta kuota ke IndexedDB
2. WHEN Surveyor membuka halaman formulir survei (`/surveyor/survey/:id`) dan perangkat dalam kondisi online, THE Frontend SHALL mengunduh dan menyimpan data detail survei beserta semua pertanyaan ke IndexedDB
3. WHILE perangkat dalam kondisi offline, THE Frontend SHALL memuat data daftar survei dari IndexedDB pada halaman `/surveyor`
4. WHILE perangkat dalam kondisi offline, THE Frontend SHALL memuat data detail survei dan pertanyaan dari IndexedDB pada halaman `/surveyor/survey/:id`
5. WHEN data survei di server berubah dan Surveyor kembali online, THE Frontend SHALL memperbarui data di IndexedDB dengan data terbaru dari Backend
6. IF IndexedDB tidak memiliki data survei yang diminta dan perangkat offline, THEN THE Frontend SHALL menampilkan pesan "Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu."

### Persyaratan 4: Pengisian Kuesioner Offline

**User Story:** Sebagai Surveyor, saya ingin bisa mengisi kuesioner saat tidak ada koneksi internet, sehingga pekerjaan pengumpulan data di lapangan tidak terganggu oleh masalah sinyal.

#### Kriteria Penerimaan

1. WHILE perangkat dalam kondisi offline, THE Frontend SHALL memungkinkan Surveyor mengisi formulir survei dengan semua tipe pertanyaan yang didukung (single_choice, multiple_choice, short_text, long_text, numeric_scale, date, rating_scale, phone_number)
2. WHEN Surveyor menekan tombol "Simpan Data Responden" saat offline, THE Frontend SHALL menyimpan data respons lengkap (survey_id, answers, timestamp, geolocation jika tersedia) ke Offline_Queue di IndexedDB
3. WHEN respons berhasil disimpan ke Offline_Queue, THE Frontend SHALL menampilkan halaman konfirmasi dengan pesan "Data tersimpan secara lokal. Data akan otomatis dikirim saat koneksi internet tersedia."
4. THE Frontend SHALL menyimpan setiap respons di Offline_Queue dengan status `pending` dan menyertakan timestamp penyimpanan lokal
5. WHILE perangkat dalam kondisi offline, THE Frontend SHALL melewatkan langkah upload foto dan menandai pertanyaan bertipe `photo` sebagai opsional dengan pesan "Upload foto memerlukan koneksi internet"
6. WHILE perangkat dalam kondisi offline, THE Frontend SHALL melewatkan pengecekan ketersediaan nomor kuesioner (unique_id) dan menampilkan pesan "Validasi ketersediaan nomor akan dilakukan saat sinkronisasi"

### Persyaratan 5: Sinkronisasi Otomatis Data Offline

**User Story:** Sebagai Surveyor, saya ingin data yang saya isi saat offline otomatis terkirim ke server saat koneksi internet kembali tersedia, sehingga saya tidak perlu mengirim ulang secara manual.

#### Kriteria Penerimaan

1. WHEN perangkat Surveyor kembali online dan terdapat data di Offline_Queue, THE Sync_Manager SHALL secara otomatis mengirim setiap respons ke Backend melalui endpoint `POST /responses/start` dilanjutkan `POST /responses/submit`
2. THE Sync_Manager SHALL mengirim data dari Offline_Queue secara berurutan (satu per satu) sesuai urutan timestamp penyimpanan untuk menghindari race condition
3. WHEN satu respons berhasil disinkronkan, THE Sync_Manager SHALL mengubah status respons tersebut di Offline_Queue dari `pending` menjadi `synced` dan melanjutkan ke respons berikutnya
4. IF sinkronisasi satu respons gagal karena error jaringan (timeout, connection refused), THEN THE Sync_Manager SHALL menghentikan proses sinkronisasi sementara dan mencoba kembali saat koneksi tersedia
5. IF sinkronisasi satu respons gagal karena error server (HTTP 4xx atau 5xx), THEN THE Sync_Manager SHALL mengubah status respons tersebut di Offline_Queue menjadi `failed` dengan menyimpan pesan error dari Backend, dan melanjutkan ke respons berikutnya
6. THE Sync_Manager SHALL mendeteksi perubahan status koneksi menggunakan event `online` dan `offline` pada objek `window`
7. WHEN semua respons di Offline_Queue berhasil disinkronkan, THE Sync_Manager SHALL menghapus data respons yang berstatus `synced` dari IndexedDB

### Persyaratan 6: Penanganan Konflik Kuota saat Sinkronisasi

**User Story:** Sebagai Surveyor, saya ingin mendapat informasi yang jelas jika data saya gagal tersinkron karena kuota sudah tercapai, sehingga saya tahu data mana yang tidak berhasil dikirim dan alasannya.

#### Kriteria Penerimaan

1. IF Backend mengembalikan HTTP 403 dengan pesan "Kuota pengisian survei Anda sudah tercapai" saat sinkronisasi, THEN THE Sync_Manager SHALL mengubah status respons di Offline_Queue menjadi `failed` dengan pesan error "Kuota survei sudah tercapai"
2. WHEN terdapat respons dengan status `failed` di Offline_Queue, THE Frontend SHALL menampilkan daftar respons yang gagal beserta alasan kegagalan pada halaman daftar survei
3. THE Frontend SHALL menyediakan tombol "Hapus" pada setiap respons yang berstatus `failed` agar Surveyor dapat menghapus data yang tidak dapat disinkronkan dari Offline_Queue
4. IF Backend mengembalikan HTTP 403 dengan pesan "Anda tidak memiliki kuota untuk survei ini" saat sinkronisasi, THEN THE Sync_Manager SHALL mengubah status respons di Offline_Queue menjadi `failed` dengan pesan error "Anda tidak memiliki kuota untuk survei ini"

### Persyaratan 7: Indikator Status Koneksi dan Sinkronisasi

**User Story:** Sebagai Surveyor, saya ingin selalu mengetahui apakah perangkat saya online atau offline dan berapa banyak data yang belum tersinkron, sehingga saya dapat mengambil keputusan kapan harus mencari koneksi internet.

#### Kriteria Penerimaan

1. THE Frontend SHALL menampilkan Status_Indikator pada header halaman surveyor (`/surveyor` dan `/surveyor/survey/:id`) yang menunjukkan status koneksi saat ini
2. WHILE perangkat dalam kondisi online, THE Status_Indikator SHALL menampilkan badge hijau dengan teks "Online"
3. WHILE perangkat dalam kondisi offline, THE Status_Indikator SHALL menampilkan badge merah dengan teks "Offline"
4. WHEN terdapat data di Offline_Queue dengan status `pending`, THE Status_Indikator SHALL menampilkan jumlah respons yang belum tersinkron dengan format "N data menunggu sinkronisasi"
5. WHILE Sync_Manager sedang mengirim data, THE Status_Indikator SHALL menampilkan animasi loading dengan teks "Menyinkronkan data..."
6. WHEN semua data berhasil disinkronkan, THE Status_Indikator SHALL menampilkan notifikasi sementara "Semua data berhasil disinkronkan" selama 3 detik
7. THE Status_Indikator SHALL memperbarui tampilan secara real-time saat status koneksi berubah tanpa perlu refresh halaman

### Persyaratan 8: Validasi Offline dan Konsistensi Data

**User Story:** Sebagai Surveyor, saya ingin validasi formulir tetap berfungsi saat offline, sehingga data yang saya kumpulkan tetap berkualitas meskipun tanpa koneksi internet.

#### Kriteria Penerimaan

1. WHILE perangkat dalam kondisi offline, THE Frontend SHALL tetap menjalankan validasi pertanyaan wajib (is_required) sebelum menyimpan respons ke Offline_Queue
2. WHILE perangkat dalam kondisi offline, THE Frontend SHALL tetap menjalankan validasi tipe data (format nomor telepon, rentang rating scale, panjang teks) sebelum menyimpan respons ke Offline_Queue
3. WHILE perangkat dalam kondisi offline, THE Frontend SHALL tetap menjalankan evaluasi skip logic berdasarkan jawaban yang diisi Surveyor
4. THE Frontend SHALL menyimpan data respons di Offline_Queue dalam format yang identik dengan payload yang dikirim ke endpoint `POST /responses/submit` agar proses sinkronisasi tidak memerlukan transformasi data
5. FOR ALL respons yang tersimpan di Offline_Queue, membaca lalu menulis kembali data tersebut ke Offline_Queue SHALL menghasilkan data yang identik dengan data asli (round-trip property)
