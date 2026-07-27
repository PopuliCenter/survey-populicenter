# Kebijakan Privasi — Survei Populi Center

> **Catatan untuk pengelola (hapus sebelum dipublikasikan):**
> Dokumen ini adalah DRAFT sumber. Google Play mewajibkan Kebijakan Privasi dapat
> diakses di **URL publik** (bukan file di dalam aplikasi). Publikasikan isinya
> sebagai halaman di website lembaga, mis. `https://populicenter.org/kebijakan-privasi`,
> lalu cantumkan URL itu di Play Console → Kebijakan aplikasi → Kebijakan Privasi.
> Lengkapi semua bagian bertanda **[ISI: …]** dengan data resmi lembaga, dan
> **selaraskan dengan formulir Data Safety** di Play Console. Ini bukan nasihat hukum —
> tinjau bersama pihak yang berwenang di lembaga sebelum terbit.

**Terakhir diperbarui:** [ISI: tanggal terbit, mis. 25 Juli 2026]

## 1. Tentang kami

Aplikasi **Survei Populi Center** ("Aplikasi") dikembangkan dan dikelola oleh
**Yayasan Populi Indonesia** (dikenal dengan merek **Populi Center**) ("kami"),
sebagai alat pengumpulan data survei oleh petugas lapangan resmi kami. Kebijakan
ini menjelaskan data apa yang kami kumpulkan melalui Aplikasi, untuk apa, dengan
siapa dibagikan, dan bagaimana kami melindunginya.

- Pengelola data: Yayasan Populi Indonesia
- Alamat: [ISI: alamat kantor resmi]
- Kontak privasi: [ISI: email resmi, mis. privasi@populicenter.org]

## 2. Ringkasan singkat

- Aplikasi ini **hanya untuk petugas survei resmi (TPD)** kami, bukan untuk umum.
- Aplikasi mengumpulkan **jawaban wawancara** beserta bukti pendukung (lokasi GPS,
  rekaman audio, foto, tanda tangan) demi mutu dan keabsahan data survei.
- Kami **tidak menjual** data pribadi Anda maupun data responden kepada siapa pun.
- Kami **tidak menampilkan iklan** dan **tidak melacak** Anda untuk periklanan.

## 3. Data yang kami kumpulkan

Aplikasi melibatkan dua kelompok orang. Kami membedakannya dengan jelas.

### 3a. Data PETUGAS SURVEI (pengguna Aplikasi/TPD)

- **Identitas akun:** nama dan alamat email yang didaftarkan admin kami.
- **Pengenal perangkat:** identitas perangkat (device ID) dan label perangkat —
  dipakai untuk fitur "kunci perangkat" (1 akun = 1 perangkat) agar akun tidak
  disalahgunakan di HP lain.
- **Token notifikasi:** token Firebase Cloud Messaging perangkat Anda — agar kami
  dapat mengirim pemberitahuan tugas/peringatan.
- **Lokasi saat bertugas:** titik GPS saat memulai dan menyimpan wawancara
  (kendali mutu — memastikan wawancara dilakukan di lokasi yang semestinya).
- **Data teknis & diagnostik:** informasi perangkat/aplikasi dan catatan error
  bila Aplikasi mengalami gangguan (lihat Bagian 6, Sentry).

### 3b. Data RESPONDEN (orang yang diwawancarai petugas)

Petugas kami memasukkan data ini **atas nama Populi Center** setelah memperoleh
persetujuan responden di lapangan:

- **Jawaban kuesioner** (dapat mencakup pandangan, preferensi, dan data
  sosio-demografis sesuai isi survei).
- **Data pribadi responden bila survei memintanya**, mis. nama, jenis kelamin,
  wilayah/domisili, dan nomor telepon.
- **Lokasi GPS** titik wawancara.
- **Rekaman audio** wawancara (sebagai bukti pelaksanaan).
- **Foto** (mis. dokumentasi/bukti lapangan) dan **tanda tangan** persetujuan.

Kami hanya mengumpulkan data responden yang relevan dengan tujuan survei yang
sedang berjalan.

## 4. Tujuan penggunaan data

Kami memakai data di atas semata-mata untuk:

- menjalankan dan mengelola kegiatan survei (pengumpulan, penyimpanan, pengolahan
  jawaban menjadi hasil agregat);
- **menjamin mutu & keaslian data** (verifikasi lokasi, durasi wawancara, bukti
  audio/foto/tanda tangan, deteksi indikasi kecurangan);
- mengelola tugas dan komunikasi dengan petugas (pemberitahuan, penugasan);
- menjaga keamanan akun (kunci perangkat) dan memperbaiki gangguan teknis.

Hasil survei yang kami publikasikan bersifat **agregat/statistik** dan **tidak
memuat identitas pribadi responden**.

## 5. Izin perangkat Android dan alasannya

Aplikasi meminta izin berikut; semuanya dipakai hanya untuk fungsi survei:

- **Lokasi (GPS):** mencatat titik lokasi wawancara untuk kendali mutu.
- **Kamera:** mengambil foto dokumentasi/bukti lapangan.
- **Mikrofon:** merekam audio wawancara sebagai bukti pelaksanaan.
- **Notifikasi:** menampilkan pesan tugas/peringatan dari admin/supervisor.
- **Jaringan/internet:** mengirim data ke server dan menyinkronkan data offline.

Anda dapat menolak/mencabut izin lewat Pengaturan Android, namun sebagian fungsi
survei mungkin tidak berjalan bila izin terkait dinonaktifkan.

## 6. Berbagi data & layanan pihak ketiga

Kami **tidak menjual** dan **tidak menyewakan** data pribadi. Data hanya diproses
oleh penyedia layanan berikut, sebatas untuk menjalankan Aplikasi:

- **Google (Firebase Cloud Messaging):** mengirim notifikasi push; menerima token
  perangkat. Tunduk pada kebijakan privasi Google.
- **Sentry:** pelaporan error/kerusakan aplikasi (data teknis diagnostik; dapat
  memuat informasi perangkat).
- **Cloudflare:** layanan proksi/keamanan jaringan yang melindungi server kami
  (memproses lalu lintas jaringan, mis. alamat IP, demi keamanan).
- **OpenStreetMap:** ubin peta pada tampilan peta di dashboard (permintaan peta
  dapat memuat alamat IP peninjau).

Selain itu, kami dapat membuka data bila diwajibkan oleh hukum yang berlaku, atau
untuk melindungi hak, keselamatan, dan keamanan yang sah.

Data disimpan di server yang kami kelola sendiri. Sebagian penyedia di atas dapat
memproses data di luar Indonesia sesuai infrastruktur global mereka.

## 7. Penyimpanan & keamanan

- Transmisi data ke server memakai koneksi terenkripsi (HTTPS/TLS).
- Akses ke data dibatasi **berbasis peran** (admin, supervisor, petugas) dan
  memerlukan autentikasi.
- Data yang dikumpulkan offline disimpan sementara **terenkripsi di perangkat**
  dan terunggah otomatis saat perangkat kembali daring.
- Kami melakukan pencadangan berkala untuk mencegah kehilangan data.

Tidak ada sistem yang 100% aman; kami berupaya wajar melindungi data Anda.

## 8. Retensi data

- **Data wawancara (final):** disimpan selama diperlukan untuk keperluan survei,
  analisis, dan audit metodologi, lalu dihapus/dianonimkan sesuai kebijakan
  internal kami. [ISI: sebutkan jangka waktu bila lembaga menetapkannya]
- **Draft/media yatim (belum terkait wawancara):** dibersihkan otomatis oleh
  sistem dalam waktu singkat (± 7 hari).
- **Token perangkat/notifikasi:** dihapus otomatis saat tidak berlaku lagi.

## 9. Hak Anda

Sesuai peraturan pelindungan data pribadi yang berlaku di Indonesia, Anda
(petugas maupun responden) dapat meminta untuk **mengakses, memperbaiki, atau
menghapus** data pribadi Anda, serta **menarik persetujuan**. Ajukan permohonan
melalui kontak pada Bagian 12. Untuk data responden, permohonan dapat diajukan
melalui petugas terkait atau langsung kepada kami.

## 10. Anak-anak

Aplikasi ditujukan untuk **petugas survei dewasa** dan **tidak ditujukan untuk
anak-anak**. Kami tidak dengan sengaja mengumpulkan data pribadi anak. Bila survei
tertentu melibatkan responden di bawah umur, pengumpulan dilakukan sesuai
ketentuan hukum dan dengan persetujuan wali.

## 11. Perubahan kebijakan

Kami dapat memperbarui Kebijakan ini dari waktu ke waktu. Versi terbaru selalu
tersedia di URL ini, dengan tanggal "Terakhir diperbarui" yang disesuaikan.

## 12. Kontak

Pertanyaan atau permohonan terkait privasi:

- Yayasan Populi Indonesia (Populi Center)
- Email: [ISI: email resmi]
- Alamat: [ISI: alamat kantor]
- Telepon: [ISI: nomor telepon (opsional)]
