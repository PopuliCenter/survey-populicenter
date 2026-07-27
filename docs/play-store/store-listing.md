# Draf Store Listing — Survei Populi Center (Google Play)

> **Catatan pengelola (hapus sebelum dipakai):** ini teks siap-tempel untuk
> Play Console → "Main store listing". Batas karakter Google ditulis di tiap
> bagian — jangan melebihi. Lengkapi bagian **[ISI: …]**. Aset grafis (ikon,
> feature graphic, screenshot) tidak bisa dibuat dari teks — lihat Bagian E.

---

## A. Nama aplikasi  *(maks 30 karakter)*

```
Survei Populi Center
```
*(20 karakter)*

## B. Deskripsi singkat  *(maks 80 karakter — tampil di bawah nama)*

```
Alat pengumpulan data survei lapangan untuk petugas resmi Populi Center.
```
*(72 karakter. Alternatif: "Aplikasi survei lapangan resmi Populi Center — bekerja penuh saat offline.")*

## C. Deskripsi lengkap  *(maks 4000 karakter)*

```
Survei Populi Center adalah aplikasi pengumpulan data survei lapangan resmi
yang digunakan oleh Tim Pengumpul Data (TPD) Populi Center.

PENTING: Aplikasi ini hanya untuk petugas survei terdaftar. Akses memerlukan
akun yang diberikan oleh administrator Populi Center. Aplikasi tidak ditujukan
untuk masyarakat umum.

DIRANCANG UNTUK LAPANGAN NYATA
Petugas sering bekerja di daerah dengan sinyal terbatas. Aplikasi ini bekerja
PENUH tanpa koneksi internet: seluruh kuesioner, daftar wilayah, dan tugas
diunduh lebih dulu, wawancara diisi offline, lalu tersinkron otomatis begitu
perangkat kembali daring. Ada checklist "siap offline" agar petugas yakin semua
bahan sudah tersimpan sebelum berangkat.

FITUR UTAMA
• Pengisian kuesioner luwes: pilihan tunggal/ganda, skala, matriks, tanggal,
  waktu, isian wilayah Indonesia bertingkat, dan lainnya.
• Bukti kualitas wawancara: lokasi GPS, rekaman audio, foto, dan tanda tangan
  responden — untuk memastikan wawancara benar-benar dilakukan.
• Bekerja offline dengan sinkronisasi otomatis dan aman saat sinyal kembali.
• Manajemen kuota dan nomor kuesioner per petugas.
• Pemilihan RT acak yang adil dan dapat diaudit (menggantikan lembar angka acak
  kertas), lengkap dengan grid yang bisa dicocokkan.
• Randomisasi urutan pertanyaan untuk mengurangi bias urutan.
• Pemberitahuan tugas dan peringatan dari admin/supervisor.
• Kunci perangkat (1 akun = 1 perangkat) untuk mencegah penyalahgunaan akun.
• Kontrol mutu bawaan: penanda durasi wawancara terlalu singkat dan pengecekan
  konsistensi data.

UNTUK SIAPA
Aplikasi ini dipakai oleh petugas lapangan Populi Center dalam kegiatan survei
opini publik dan riset sosial. Data yang dikumpulkan diolah menjadi hasil
AGREGAT; laporan yang dipublikasikan tidak memuat identitas pribadi responden.

PRIVASI
Kami menghormati privasi. Aplikasi hanya meminta izin yang diperlukan untuk
tugas survei (lokasi, kamera, mikrofon, notifikasi) dan tidak menampilkan iklan.
Baca kebijakan privasi kami di: [ISI: URL kebijakan privasi]

DUKUNGAN
Pertanyaan atau kendala teknis: [ISI: email dukungan]
```

*(± 1.750 karakter — aman di bawah 4000.)*

## D. Detail lain di Console

- **Kategori aplikasi:** Peralatan (Tools) — alternatif: Bisnis.
- **Tag:** survei, pengumpulan data, riset. *(pilih dari daftar Google)*
- **Email kontak:** [ISI: email resmi] — WAJIB, tampil publik.
- **Situs web:** https://populicenter.org
- **Kebijakan privasi:** [ISI: URL — lihat docs/play-store/kebijakan-privasi.md]
- **Rating konten:** isi kuesioner IARC; sasaran dewasa/umum, BUKAN anak-anak.
- **Iklan:** "Tidak, aplikasi ini tidak berisi iklan."

## E. Aset grafis yang WAJIB disiapkan (tidak bisa dari teks)

| Aset | Ukuran | Catatan |
|---|---|---|
| Ikon aplikasi | 512×512 PNG (32-bit, alpha) | Logo Populi Center di atas latar solid. |
| Feature graphic | 1024×500 PNG/JPG | Banner: logo + tagline "Survei Lapangan Resmi". Hindari teks kecil. |
| Screenshot ponsel | min. 2 (disarankan 4–8), 16:9 atau 9:16, sisi min. 320px | Tangkap dari HP: Daftar Survei, satu layar pertanyaan, layar GPS/foto, hasil Pemilihan RT (grid). |

Tips screenshot: gunakan data **contoh/sampel** (survei "(sampel)…") agar tidak
ada data pribadi responden nyata yang bocor ke etalase publik.

## F. Yang sering bikin aplikasi DITOLAK — antisipasi

1. **Aplikasi terkunci login tanpa akses peninjau.** Google menolak aplikasi
   ber-login yang tak bisa mereka uji. Dua jalan:
   - Rilis lewat **Internal/Closed Testing** (peninjauan lebih ringan), ATAU
   - Di Play Console → "App access", sediakan **akun demo** (email + kata sandi
     petugas uji) + langkah masuk, agar peninjau bisa masuk.
2. **Data Safety tidak selaras** dengan kebijakan privasi → isi keduanya sama
   persis (GPS, audio, foto, data pribadi; tujuan; pihak ketiga).
3. **Izin lokasi latar belakang.** Aplikasi hanya memakai lokasi saat dipakai
   (foreground) — JANGAN mendeklarasikan izin lokasi latar belakang; bila ditanya
   Console, jawab tidak memakai background location.
4. **Merek/kepemilikan.** Nama developer sebaiknya terverifikasi sebagai
   organisasi (lihat rencana akun Organisasi) agar tidak dikira aplikasi pihak
   tak resmi.
