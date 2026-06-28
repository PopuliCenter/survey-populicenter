# Akses Reviewer (App access) — wajib untuk app berpintu-login

Aplikasi Populi Survey punya **login wall** dan **tanpa pendaftaran mandiri**.
Karena itu, reviewer Google **tidak bisa masuk sendiri** → Anda WAJIB memberi
**akun demo** di Play Console, atau app **ditolak**.

## 1. Buat akun TPD demo (di sistem Anda)
Lewat dashboard admin (risetcenter.com), buat satu akun surveyor khusus review:

| Field | Contoh |
|-------|--------|
| Nama | Reviewer Google |
| Email | `reviewer@populicenter.org` (atau email khusus) |
| Password | (buat password kuat khusus review) |
| Peran | surveyor (TPD) |

Lalu:
- Buat **1 survei "Demo/Sandbox"** (status aktif) dengan beberapa pertanyaan
  contoh dan **kuota kecil**, tugaskan ke akun reviewer ini.
- Pastikan akun **tetap aktif** selama masa review (jangan dinonaktifkan).
- Akun ini hanya melihat survei demo → **tidak menyentuh data responden asli**.

## 2. Isi di Play Console
**App content → App access** → pilih **"All or some functionality is restricted"**
→ tambah satu entri:

- **Nama**: Login petugas (TPD)
- **Username**: `reviewer@populicenter.org`
- **Password**: (password akun demo)
- **Instruksi** (tempel):
  ```
  1. Buka aplikasi, di layar Masuk isi email & password di atas, tekan "Masuk".
  2. Akan muncul daftar survei. Pilih survei "Demo".
  3. Tekan mulai untuk melihat alur pengisian kuesioner.
  4. Aplikasi mendukung mode offline; data tersinkron otomatis saat online.
  Catatan: akun dibuat oleh admin; tidak ada pendaftaran mandiri.
  ```

## 3. Jalur permintaan hapus data (App content)
Karena tidak ada hapus-akun in-app (akun dikelola admin), pada bagian terkait
nyatakan metode penghapusan data:
```
Permintaan penghapusan akun/data diajukan melalui dukungan:
Email info@populicenter.org atau WhatsApp +62 812-9206-8362.
Lihat Kebijakan Privasi: https://risetcenter.com/kebijakan-privasi.html
```

## 4. Tips lolos review
- Pastikan server (risetcenter.com) **online & stabil** selama review — reviewer
  benar-benar menjalankan app.
- Jangan kunci akun demo dengan OTP/perangkat-terikat.
- Bila ada rate-limit login, pastikan tidak memblok percobaan wajar reviewer.
