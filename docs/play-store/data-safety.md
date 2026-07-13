# Data Safety — jawaban form Play Console

Panduan mengisi **Play Console → App content → Data safety**. Sesuaikan bila ada
data lain yang Anda kumpulkan. Konteks: data dikumpulkan oleh petugas (TPD) dari
responden, plus data akun petugas.

## Ringkasan jawaban awal
- **Apakah app mengumpulkan/membagikan data pengguna?** → **Ya**
- **Apakah semua data dienkripsi saat transit?** → **Ya** (HTTPS/TLS)
- **Apakah pengguna bisa minta data dihapus?** → **Ya**, via kontak dukungan
  (`info@populicenter.org` / WhatsApp +62 812-9206-8362). URL kebijakan:
  `https://populicenter.com/kebijakan-privasi.html`

## Jenis data yang dikumpulkan
Untuk tiap data: **Dikumpulkan = Ya**, **Dibagikan = Tidak** (kecuali disebut),
**Diproses sementara = Tidak**, **Wajib (bukan opsional)**, **Tujuan** seperti di bawah.

| Kategori | Jenis data | Tujuan | Catatan |
|----------|-----------|--------|---------|
| **Lokasi** | Lokasi perkiraan & presisi | Fungsi aplikasi; Pencegahan kecurangan/keamanan | Geotag titik wawancara; foreground saja |
| **Info pribadi** | Nama | Fungsi aplikasi | Nama petugas; nama responden bila ditanyakan kuesioner |
| **Info pribadi** | Alamat email | Fungsi aplikasi; Manajemen akun | Email akun petugas (dibuat admin) |
| **Info pribadi** | Nomor telepon | Fungsi aplikasi | Hanya bila kuesioner menanyakan kontak responden |
| **Foto & video** | Foto | Fungsi aplikasi | Foto bukti wawancara (bila diaktifkan) |
| **File & dokumen / Audio** | Rekaman suara | Fungsi aplikasi | Audio wawancara untuk kendali mutu (bila diaktifkan) |
| **Aktivitas aplikasi** | Interaksi dalam app | Analitik; Fungsi aplikasi | Log pengisian/sinkron (kendali mutu) |
| **ID perangkat** | ID perangkat | Pencegahan kecurangan/keamanan | Seperlunya untuk keamanan sesi |

> Catatan: app ini mengumpulkan data **responden** (pihak ketiga) melalui petugas.
> Deklarasikan jenis datanya seperti di atas. Tandai **Dibagikan = Tidak** karena
> data hanya diserahkan ke klien riset dalam bentuk **agregat/anonim** (bukan
> "sharing" data pribadi individual menurut definisi Play).

## Praktik keamanan
- ✅ Data dienkripsi saat transit (HTTPS/TLS).
- ✅ Pengguna dapat meminta penghapusan data (jalur kontak dukungan).
- (Opsional) Mengikuti kebijakan keluarga: **Tidak** ditujukan untuk anak.

## Yang perlu Anda pastikan sebelum submit
- Cocokkan daftar di atas dengan **izin nyata** di app (lokasi, kamera, mikrofon) —
  Play membandingkan deklarasi vs perilaku app.
- Bila suatu fitur (mis. audio) tidak pernah dipakai di proyek publik, boleh tidak
  dideklarasikan — tapi lebih aman deklarasikan bila kode memintanya.
