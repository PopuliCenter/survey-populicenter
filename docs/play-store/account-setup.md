# Membuat Akun Google Play Developer atas Nama Lembaga

Panduan langkah-demi-langkah membuat **akun Organisasi** Play Console untuk
**Yayasan Populi Indonesia** (brand: **Populi Center**).

> 🔒 **Kenapa pakai email lembaga, bukan Gmail pribadi?** Akun Google yang mendaftar
> menjadi **pemilik** akun developer, dan pemilik **tidak bisa diganti begitu saja** —
> pemindahan butuh proses transfer resmi ke Google. Kalau didaftarkan dari Gmail
> pribadi, app milik lembaga menempel pada individu.

**Data yang dipakai (salin dari sini):**
| | |
|---|---|
| Email pemilik akun | `info@populicenter.org` |
| Nama legal (persis akta) | `Yayasan Populi Indonesia` |
| Developer name (tampil publik) | `Populi Center` |
| Jenis akun | **Organisasi** → **Lembaga nonprofit** |
| Website | `https://populicenter.org` |
| Biaya | **$25** sekali (tetap berlaku walau nonprofit) |

---

## 0 · Prasyarat — SELESAIKAN SEBELUM MENDAFTAR

Salah di tahap ini = harus transfer akun (repot) atau daftar ulang (bayar lagi).

- [ ] **`info@populicenter.org` adalah akun pengguna Workspace PENUH** — bisa **login**
      ke Google, bukan sekadar *alias* atau *grup*.
      ➜ Uji: logout, lalu sign-in ke Google sebagai `info@populicenter.org`.
      ❌ Kalau hanya alias/grup → **tidak bisa dipakai**; minta admin Workspace
      mengubahnya jadi user account.
- [ ] **Verifikasi 2 langkah (2FA) aktif** di akun tsb.
- [ ] **Kode cadangan (backup codes) disimpan** di password manager lembaga —
      bukan di laptop satu orang.
- [ ] **Email pemulihan** diarahkan ke admin lain (mis. `saepudin@populicenter.org`),
      agar akun tidak terkunci bila satu orang tak dapat dihubungi.
- [ ] **D-U-N-S number** sudah di tangan (atau sedang diurus). ⏳ ➜ [CHECKLIST.md](CHECKLIST.md) §0
- [ ] Alamat kantor, **nomor telepon**, dan **website** lembaga siap & dapat diverifikasi.
- [ ] Kartu pembayaran untuk **$25** (idealnya kartu lembaga).

---

## 1 · Daftar

1. **Buka jendela Incognito/penyamaran.** Ini mencegah Google memakai sesi Gmail
   pribadi yang sedang login — penyebab paling umum akun terdaftar ke email yang salah.
2. Login sebagai **`info@populicenter.org`**.
3. Buka **`play.google.com/console/signup`**.
4. **Pastikan email di pojok kiri benar** (`info@populicenter.org`) — bukan Gmail pribadi.
   ⚠️ **Cek dua kali di sini.** Setelah bayar, mengubah pemilik = proses transfer.
5. Pilih **Organisasi** → *Jenis organisasi:* **Lembaga nonprofit** → **Mulai**.

## 2 · Isi identitas organisasi

| Kolom | Isi |
|---|---|
| Nama legal organisasi | `Yayasan Populi Indonesia` — **persis** seperti akta/SK Kemenkumham |
| D-U-N-S | (nomor dari Dun & Bradstreet) |
| Alamat / telepon | Alamat & telepon **kantor**, harus cocok dengan rekaman D-U-N-S |
| Website | `https://populicenter.org` |
| Email kontak | `info@populicenter.org` |

> Google mencocokkan **nama + alamat + telepon** dengan rekaman D-U-N-S. Beda sedikit
> → verifikasi gagal. Samakan dulu, jangan dikira-kira.

## 3 · Bayar $25 & verifikasi

- [ ] Bayar biaya pendaftaran **$25** (sekali seumur hidup).
- [ ] Unggah dokumen bila diminta (akta / SK Kemenkumham).
- [ ] Tunggu **verifikasi organisasi** — bisa beberapa hari.

## 4 · Setel Developer name → `Populi Center`

*Play Console → **Settings → Developer account → Developer name*** → isi **`Populi Center`**.

- Ini **field terpisah** dari nama legal, dan inilah yang tampil di bawah judul app.
- Nama legal `Yayasan Populi Indonesia` akan tetap muncul di **"Verified developer
  info"** pada halaman listing — itu **wajar dan benar** untuk akun Organisasi,
  bukan masalah.
- Tiga nama yang berbeda, jangan tertukar:

| Yang mana | Isi | Diatur di |
|---|---|---|
| Nama **app** | `Survei Populi Center` | *Create app* |
| **Developer name** | `Populi Center` | *Settings → Developer account* |
| Nama **legal** | `Yayasan Populi Indonesia` | Verifikasi organisasi (otomatis tampil) |

## 5 · Undang admin (agar tak bergantung satu inbox)

*Play Console → **Users and permissions → Invite new users***

- [ ] `saepudin@populicenter.org` → peran **Admin**
- [ ] (opsional) Gmail pribadi Anda → **Admin**, untuk kerja harian

Pemilik tetap lembaga (`info@`), tapi kerja harian tak perlu login sebagai `info@`.

## 6 · Lanjutkan ke rilis app

➜ [CHECKLIST.md](CHECKLIST.md) §1 (Prasyarat) dan seterusnya.

---

## 7 · ⚠️ Jangan sampai peringatan Google tenggelam

`info@` adalah inbox publik yang ramai, sedangkan **peringatan kebijakan Google
dikirim ke situ** — app bisa **ditangguhkan** kalau peringatan terlewat.

- [ ] Buat **filter/label** di Gmail: pengirim `@google.com` **berisi** "Play Console"
      → beri label **Play Console** + **Penting**, jangan pernah masuk arsip otomatis.
- [ ] Pastikan admin di langkah 5 aktif — Play juga mengirim notifikasi ke pengguna
      yang punya izin, jadi ada mata kedua.
- [ ] Tunjuk **satu orang penanggung jawab** yang memeriksa label itu tiap minggu.

## Gotcha yang mahal

- **Salah akun saat daftar** → $25 hangus / transfer akun yang panjang. Pakai Incognito
  dan cek email di layar signup.
- **`info@` ternyata alias** → tidak bisa login, mandek di tengah. Uji login **dulu**.
- **Nama legal beda satu huruf** dari akta/D-U-N-S → verifikasi ditolak.
- **2FA tanpa kode cadangan** → akun lembaga terkunci saat HP hilang/ganti staf.
- **Nonprofit ≠ gratis.** Biaya $25 tetap berlaku; pembebasan biaya adalah program
  terpisah (Google for Nonprofits) dan **bukan** bagian dari alur ini.

> Kebijakan Google berubah dari waktu ke waktu — ikuti apa yang tampil di layar
> Play Console bila berbeda dengan dokumen ini.
