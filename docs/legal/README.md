# Halaman Legal — Populi Survey

Konten **Kebijakan Privasi** & **Syarat & Ketentuan** siap-tempel untuk dipasang
di website (populicenter.org / risetcenter.com) dan dirujuk oleh aplikasi Android
saat rilis ke Play Store.

| File | Halaman |
|------|---------|
| `kebijakan-privasi.html` | Kebijakan Privasi (Privacy Policy) |
| `syarat-ketentuan.html`  | Syarat & Ketentuan (Terms) |

## Cara memasang (WordPress / Elementor)
1. Buat halaman baru, mis. **Kebijakan Privasi** (slug `kebijakan-privasi`) dan **Syarat & Ketentuan** (slug `syarat-ketentuan`).
2. Tambah widget **HTML** (Elementor) atau blok **HTML Kustom** (Gutenberg).
3. Salin **seluruh isi** file `.html` terkait ke widget tersebut.
4. Publish. URL akan menjadi mis. `https://populicenter.org/kebijakan-privasi`.

> Konten memakai `<style>` yang sudah di-scope ke `.populi-legal`, jadi tidak
> mengganggu tema. `font-family: inherit` mengikuti font situs.

## WAJIB diganti sebelum publish (placeholder)
Cari & ganti di kedua file:

| Placeholder | Isi dengan |
|-------------|-----------|
| `[NAMA_BADAN_HUKUM]` | Nama badan hukum, mis. *PT Populi Cipta Nusantara* |
| `[ALAMAT_KANTOR]` | Alamat kantor lengkap |
| `[EMAIL_DUKUNGAN]` | Email dukungan, mis. `support@populicenter.org` |
| `[WHATSAPP_DUKUNGAN]` | Nomor WhatsApp, mis. `+62 812-3456-7890` |
| `[TANGGAL_BERLAKU]` | Tanggal berlaku, mis. `1 Juli 2026` |
| `[MASA_RETENSI]` | Lama penyimpanan data (privasi), mis. `24 bulan setelah proyek` |
| `[YURISDIKSI]` | Wilayah hukum (S&K), mis. `Jakarta, Indonesia` |
| `[URL_PRIVASI]` | URL final Kebijakan Privasi (dipakai di S&K) |

## Setelah halaman publik tayang
1. Isi URL-nya ke aplikasi: `frontend/src/config/appLinks.js`
   (`PRIVACY_POLICY_URL`, `TERMS_URL`, `SUPPORT_EMAIL`, `SUPPORT_WHATSAPP`).
2. Masukkan **URL Kebijakan Privasi** ke **Google Play Console**:
   - Kolom *Privacy Policy* (App content), dan
   - Form **Data Safety** (deklarasikan lokasi, audio, kamera, data responden).
3. Karena tidak ada hapus-akun in-app (akun dibuat admin), pada Data Safety
   nyatakan metode hapus data = **permintaan via kontak dukungan** (email/WA di atas).

> ⚠️ Template ini bukan nasihat hukum. Tinjau & sesuaikan (badan hukum, retensi,
> yurisdiksi) sebelum dipublikasikan.
