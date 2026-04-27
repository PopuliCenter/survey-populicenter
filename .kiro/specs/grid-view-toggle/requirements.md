# Dokumen Persyaratan (Requirements)

## Pendahuluan

Fitur ini menyempurnakan tampilan grid/card pada halaman Manajemen Survei (`Surveys.jsx`) dan Manajemen Surveyor (`Surveyors.jsx`) agar menyerupai gaya file explorer atau macOS Finder. Pengguna dapat beralih antara tampilan tabel (list) dan tampilan grid (card) melalui tombol toggle di header halaman. Tampilan grid menampilkan data dalam bentuk kartu yang lebih visual, kompak, dan mudah di-scan — mirip dengan ikon folder/file pada Finder — sehingga pengelolaan survei dan surveyor terasa lebih rapi dan terorganisir. Preferensi tampilan disimpan di `localStorage` agar tetap konsisten antar sesi.

## Glosarium

- **Sistem**: Aplikasi platform survei web secara keseluruhan (backend + frontend)
- **Frontend**: Aplikasi React yang menyediakan antarmuka pengguna
- **Admin**: Pengguna dengan role `admin` yang memiliki akses penuh ke semua fitur manajemen
- **Supervisor**: Pengguna dengan role `supervisor` yang mengelola surveyor dan survei
- **Halaman_Survei**: Halaman manajemen survei (`Surveys.jsx`) yang menampilkan daftar semua survei
- **Halaman_Surveyor**: Halaman manajemen surveyor (`Surveyors.jsx`) yang menampilkan daftar semua surveyor
- **Tampilan_Tabel**: Mode tampilan berupa tabel dengan kolom-kolom data (tampilan list)
- **Tampilan_Grid**: Mode tampilan berupa grid kartu bergaya file explorer yang menampilkan informasi ringkas per item
- **Toggle_Tampilan**: Komponen tombol yang memungkinkan pengguna beralih antara Tampilan_Tabel dan Tampilan_Grid
- **Kartu_Survei**: Komponen card pada Tampilan_Grid di Halaman_Survei yang menampilkan informasi ringkas satu survei, bergaya ikon folder/file
- **Kartu_Surveyor**: Komponen card pada Tampilan_Grid di Halaman_Surveyor yang menampilkan informasi ringkas satu surveyor, bergaya ikon folder/file
- **Preferensi_Tampilan**: Nilai yang disimpan di `localStorage` untuk mengingat pilihan mode tampilan pengguna
- **Ikon_Visual**: Ikon besar di bagian atas kartu yang merepresentasikan tipe item (ikon dokumen untuk survei, ikon orang untuk surveyor), mirip ikon file/folder pada Finder

## Persyaratan

### Persyaratan 1: Komponen Toggle Tampilan

**User Story:** Sebagai Admin/Supervisor, saya ingin memiliki tombol untuk beralih antara tampilan tabel dan grid, sehingga saya dapat memilih cara melihat data yang paling nyaman.

#### Kriteria Penerimaan

1. THE Frontend SHALL menampilkan Toggle_Tampilan berupa dua tombol ikon (ikon tabel dan ikon grid) di area header halaman, sejajar dengan judul halaman dan tombol aksi yang sudah ada
2. THE Toggle_Tampilan SHALL menandai tombol yang aktif dengan gaya visual yang berbeda (warna latar belakang dan warna ikon yang kontras) untuk menunjukkan mode tampilan yang sedang dipilih
3. WHEN pengguna mengklik tombol ikon tabel pada Toggle_Tampilan, THE Frontend SHALL menampilkan data dalam Tampilan_Tabel
4. WHEN pengguna mengklik tombol ikon grid pada Toggle_Tampilan, THE Frontend SHALL menampilkan data dalam Tampilan_Grid
5. THE Toggle_Tampilan SHALL menyertakan atribut `aria-label` pada setiap tombol dan atribut `aria-pressed` yang sesuai dengan status aktif untuk mendukung aksesibilitas
6. THE Frontend SHALL menggunakan Toggle_Tampilan yang sama (komponen reusable) pada Halaman_Survei dan Halaman_Surveyor

### Persyaratan 2: Persistensi Preferensi Tampilan

**User Story:** Sebagai Admin/Supervisor, saya ingin pilihan tampilan saya tersimpan, sehingga ketika saya kembali ke halaman tersebut, tampilan yang saya pilih sebelumnya tetap aktif.

#### Kriteria Penerimaan

1. WHEN pengguna memilih mode tampilan melalui Toggle_Tampilan, THE Frontend SHALL menyimpan Preferensi_Tampilan ke `localStorage` dengan key yang berbeda untuk setiap halaman
2. WHEN Halaman_Survei dimuat, THE Frontend SHALL membaca Preferensi_Tampilan dari `localStorage` dan menampilkan mode tampilan yang tersimpan
3. WHEN Halaman_Surveyor dimuat, THE Frontend SHALL membaca Preferensi_Tampilan dari `localStorage` dan menampilkan mode tampilan yang tersimpan
4. IF Preferensi_Tampilan tidak ditemukan di `localStorage`, THEN THE Frontend SHALL menampilkan Tampilan_Tabel sebagai mode default

### Persyaratan 3: Tampilan Grid Bergaya Finder pada Halaman Survei

**User Story:** Sebagai Admin/Supervisor, saya ingin melihat daftar survei dalam bentuk kartu grid bergaya file explorer, sehingga saya dapat dengan cepat memindai dan mengelola survei secara visual seperti mengelola file di Finder.

#### Kriteria Penerimaan

1. WHEN Tampilan_Grid aktif pada Halaman_Survei, THE Frontend SHALL menampilkan setiap survei sebagai Kartu_Survei dalam layout grid yang responsif
2. THE Kartu_Survei SHALL menampilkan Ikon_Visual berupa ikon dokumen/clipboard besar di bagian atas kartu sebagai representasi visual survei, mirip ikon file pada Finder
3. THE Kartu_Survei SHALL menampilkan informasi berikut di bawah Ikon_Visual: judul survei, badge status survei (draft/aktif/nonaktif), badge temporal (akan datang/aktif/berakhir), jumlah pertanyaan, jumlah responden, dan tanggal pembuatan
4. THE Kartu_Survei SHALL menyediakan tombol aksi yang sama dengan Tampilan_Tabel: Builder, Duplikasi, Aktifkan/Nonaktifkan, dan Hapus (sesuai kondisi yang berlaku)
5. THE Frontend SHALL menampilkan grid dengan layout responsif: 1 kolom pada layar kecil, 2 kolom pada layar sedang, dan 3 kolom pada layar besar
6. WHEN survei dalam status draft tanpa responden, THE Kartu_Survei SHALL menampilkan tombol Hapus dengan konfirmasi inline
7. WHEN survei dalam status aktif, THE Kartu_Survei SHALL menampilkan tombol Nonaktifkan dengan konfirmasi inline
8. THE Kartu_Survei SHALL menggunakan warna aksen pada Ikon_Visual yang berbeda berdasarkan status survei (misalnya biru untuk draft, hijau untuk aktif, abu-abu untuk nonaktif) agar pengguna dapat membedakan status secara visual dengan cepat

### Persyaratan 4: Tampilan Grid Bergaya Finder pada Halaman Surveyor

**User Story:** Sebagai Admin/Supervisor, saya ingin melihat daftar surveyor dalam bentuk kartu grid bergaya file explorer, sehingga saya dapat dengan cepat memindai dan mengelola surveyor secara visual.

#### Kriteria Penerimaan

1. WHEN Tampilan_Grid aktif pada Halaman_Surveyor, THE Frontend SHALL menampilkan setiap surveyor sebagai Kartu_Surveyor dalam layout grid yang responsif
2. THE Kartu_Surveyor SHALL menampilkan Ikon_Visual berupa ikon orang/avatar besar di bagian atas kartu sebagai representasi visual surveyor, mirip ikon kontak pada Finder
3. THE Kartu_Surveyor SHALL menampilkan informasi berikut di bawah Ikon_Visual: nama surveyor, email, badge status (aktif/nonaktif), jumlah responden, dan tanggal bergabung
4. THE Kartu_Surveyor SHALL menyediakan tombol aksi yang sama dengan Tampilan_Tabel: Lihat Kuota, Edit, Nonaktifkan/Aktifkan, dan Hapus (sesuai kondisi yang berlaku untuk admin)
5. THE Frontend SHALL menampilkan grid dengan layout responsif: 1 kolom pada layar kecil, 2 kolom pada layar sedang, dan 3 kolom pada layar besar
6. WHEN tombol "Lihat Kuota" ditekan pada Kartu_Surveyor, THE Frontend SHALL menampilkan panel kuota di dalam kartu tersebut
7. WHEN tombol Nonaktifkan ditekan pada Kartu_Surveyor, THE Frontend SHALL menampilkan konfirmasi inline
8. THE Kartu_Surveyor SHALL menggunakan warna aksen pada Ikon_Visual yang berbeda berdasarkan status surveyor (misalnya hijau untuk aktif, abu-abu untuk nonaktif) agar pengguna dapat membedakan status secara visual dengan cepat

### Persyaratan 5: Konsistensi Fungsional antara Tampilan Tabel dan Grid

**User Story:** Sebagai Admin/Supervisor, saya ingin semua fungsi yang tersedia di tampilan tabel juga tersedia di tampilan grid, sehingga saya tidak kehilangan fungsionalitas saat beralih tampilan.

#### Kriteria Penerimaan

1. THE Frontend SHALL memastikan semua aksi yang tersedia pada Tampilan_Tabel (create, edit, activate, deactivate, delete, clone, lihat kuota) juga tersedia pada Tampilan_Grid
2. WHEN aksi berhasil dilakukan pada Tampilan_Grid, THE Frontend SHALL menampilkan pesan sukses yang sama seperti pada Tampilan_Tabel
3. IF aksi gagal dilakukan pada Tampilan_Grid, THEN THE Frontend SHALL menampilkan pesan error yang sama seperti pada Tampilan_Tabel
4. THE Frontend SHALL menampilkan state loading, error, dan empty state yang konsisten pada kedua mode tampilan
5. WHEN data sedang dimuat, THE Frontend SHALL menampilkan indikator loading yang sesuai dengan mode tampilan yang aktif

### Persyaratan 6: Desain Visual Kartu Bergaya File Explorer

**User Story:** Sebagai Admin/Supervisor, saya ingin kartu pada tampilan grid memiliki desain bergaya file explorer yang konsisten dengan tema aplikasi, sehingga tampilan terasa menyatu, profesional, dan mudah dikelola.

#### Kriteria Penerimaan

1. THE Kartu_Survei dan Kartu_Surveyor SHALL menampilkan Ikon_Visual yang besar dan terpusat di bagian atas kartu, diikuti oleh nama/judul item, metadata ringkas, dan tombol aksi di bagian bawah — mengikuti pola layout ikon file pada Finder
2. THE Kartu_Survei dan Kartu_Surveyor SHALL menggunakan gaya visual yang konsisten dengan komponen lain di aplikasi: background putih, rounded corners (`rounded-xl`), shadow, dan border halus
3. THE Kartu_Survei dan Kartu_Surveyor SHALL memiliki efek hover yang halus (misalnya perubahan shadow atau border highlight) untuk memberikan feedback visual saat pengguna mengarahkan kursor
4. THE Frontend SHALL memastikan teks panjang (judul survei, nama surveyor, email) ditampilkan dengan truncation dan atribut `title` untuk tooltip agar tidak merusak layout kartu
