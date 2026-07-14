# ✅ Checklist Rilis Play Store — Survei Populi Center

Checklist berurut, tinggal contreng. Ikuti dari atas ke bawah. Detail tiap bagian
ada di dokumen pendamping: [listing.md](listing.md) · [data-safety.md](data-safety.md) ·
[reviewer-access.md](reviewer-access.md) · [keystore-setup.md](keystore-setup.md).

**Fakta app** (untuk disalin):
| | |
|---|---|
| Application ID | `com.populicenter.survey` |
| Nama app (launcher) | **Survei Populi Center** |
| Versi | versionName **1.0.0** · versionCode **naik otomatis** tiap `cap:release` |
| Privacy Policy | `https://populicenter.com/kebijakan-privasi.html` |
| Syarat & Ketentuan | `https://populicenter.com/syarat-ketentuan.html` |
| Dukungan | `info@populicenter.org` · WA +62 812-9206-8362 |
| Kategori | Bisnis |

> 🚨 **BACA DULU — 3 hal ini membuat reviewer TERJEBAK → app DITOLAK.**
> Reviewer Google menjalankan app di **perangkat/emulator mereka sendiri**, sering
> **tanpa GPS nyata, tanpa mikrofon/kamera**, dan mereka **boleh menolak izin**.
> Sebelum submit **WAJIB** (detail: [reviewer-access.md](reviewer-access.md)):
> - [ ] **Kunci Perangkat** — akun demo **belum terikat**: Manajemen TPD → **Reset Perangkat**
>       (chip 🔒 HP hilang) **dan** survei Demo → **Kunci Perangkat = Nonaktif**.
>       Setelah reset, **jangan** login akun demo dari HP Anda (nanti terikat lagi).
> - [ ] **GPS Wajib memblokir tombol Simpan** di APK → survei Demo: **Lokasi GPS = Opsional**.
> - [ ] **Audio/Foto/Tanda tangan Wajib ditolak server (422)** bila reviewer menolak izin
>       → survei Demo: **semuanya Opsional**.
>
> ✅ **Uji sendiri:** login akun demo di HP bersih, **tolak semua izin**, lalu isi
> 1 kuesioner sampai **tersimpan**. Kalau itu berhasil, reviewer pasti bisa.

---

## 0 · Jenis akun developer — PUTUSKAN PALING AWAL ⏳

> ⏳ **Jalur kritis:** kalau pilih Organisasi, **urus D-U-N-S number SEKARANG**
> (gratis, tapi bisa memakan **~30 hari**). Sambil menunggu, aset grafis, akun
> demo, dan pengujian tetap bisa dikerjakan.

**Rekomendasi: daftar sebagai ORGANISASI** (app ini milik lembaga & menyimpan data
pribadi responden).

| | **Akun Pribadi** | **Akun Organisasi** ✅ |
|---|---|---|
| Biaya | $25 | $25 (**sama**) |
| **Closed testing wajib** | ⚠️ **12 penguji × 14 hari** (akun baru sejak Nov 2023) | **Dibebaskan** |
| Yang tampil publik | Nama & **alamat pribadi** Anda | Nama & **alamat lembaga** |
| Nama developer "Populi Center" | Berisiko dianggap **menyesatkan** | Sah & terverifikasi |
| Pemilik app | **Individu** — transfer app ribet bila orangnya keluar | **Lembaga** |
| Syarat | Verifikasi identitas pribadi (KTP/paspor) | **D-U-N-S** (gratis) + dokumen legal |

- [ ] **Putuskan jenis akun** (rekomendasi: Organisasi)
- [ ] **(Organisasi)** Ajukan **D-U-N-S number** — gratis, Dun & Bradstreet. ⏳ **mulai duluan**
- [ ] **(Organisasi)** Siapkan dokumen legal lembaga + email domain + alamat/telepon kantor
- [ ] **Akun Google Play Developer** aktif ($25 sekali)
- [ ] **Developer name** (nama yang tampil di Play Store, seperti "GARENA INTERNATIONAL I")
      → set ke **`Populi Center`** di *Play Console → Settings → Developer account →
      Developer name*. Ini **field terpisah** dari nama akun.

> ⚠️ Kalau **terpaksa** pakai akun pribadi: **jangan** langsung memakai nama
> "Populi Center" sebagai developer name tanpa bukti kewenangan (risiko ditolak/
> ditangguhkan). Pakai nama Anda dulu, ganti/transfer setelah akun organisasi siap
> — konsekuensinya tertahan **12 penguji × 14 hari**.
>
> Kebijakan Play sering berubah — konfirmasikan syarat terbaru (D-U-N-S & closed
> testing) langsung di Play Console saat mendaftar.

---

## 1 · Prasyarat (sebelum buka Play Console)
- [ ] **Web produksi live & stabil** (`populicenter.com`) — reviewer benar-benar
      menjalankan app terhadap server ini.
- [ ] **Halaman legal live**: privasi, S&K, FAQ (sudah tayang + logo).
- [ ] **AAB signed siap** — bangun dengan `npm run cap:release` (tanpa `--apk`).
      ⚠ Play Store butuh **AAB**, bukan APK. APK hanya untuk sideload ke TPD.
- [ ] **Keystore sudah di-backup** di ≥2 tempat + password di manager. ➜ [keystore-setup.md](keystore-setup.md)
- [ ] **Akun demo reviewer + survei "Demo"** dibuat & aktif, **Field Tools semua
      Opsional** + **Kunci Perangkat Nonaktif**, kuota & nomor kuesioner tersedia.
      ➜ [reviewer-access.md](reviewer-access.md)
- [ ] **Aset grafis siap**: ikon 512×512, feature 1024×500, 2–6 screenshot HP. ➜ [listing.md](listing.md)
- [ ] **Uji AAB/APK di HP asli** (build R8/minify) — login + simpan 1 responden OK.

---

## 2 · Buat aplikasi
- [ ] Play Console → **Create app**.
- [ ] Nama: **Survei Populi Center** · Bahasa default: **Indonesia (id-ID)**.
- [ ] Tipe: **App** (bukan Game) · **Free** (gratis).
- [ ] Setujui deklarasi (Developer Program Policies, US export laws).

## 3 · Main store listing
- [ ] **Judul**, **deskripsi singkat**, **deskripsi lengkap** → salin dari [listing.md](listing.md).
- [ ] **Ikon** 512×512 PNG (< 1 MB).
- [ ] **Feature graphic** 1024×500.
- [ ] **Screenshot HP** (≥2; ideal 4: Login, Daftar survei, Form pengisian, Status offline/sinkron).
- [ ] **Kategori aplikasi**: Bisnis · Email kontak: `info@populicenter.org` · Website: `populicenter.org`.

## 4 · App content (kebijakan — paling sering bikin ditolak)
- [ ] **Privacy policy** → `https://populicenter.com/kebijakan-privasi.html`.
- [ ] **App access** → "All or some functionality is restricted" → tambah akun demo
      reviewer + instruksi login. ➜ [reviewer-access.md](reviewer-access.md) §2.
- [ ] **Ads**: pilih **Tidak ada iklan** (app ini tak beriklan).
- [ ] **Content rating** → isi kuesioner (kategori: Utilitas/Bisnis; tak ada konten
      dewasa/kekerasan) → dapat rating.
- [ ] **Target audience & content** → usia **18+ (dewasa)**; **bukan** ditujukan untuk anak.
- [ ] **Data safety** → isi sesuai [data-safety.md](data-safety.md) (Lokasi, Nama, Email,
      No. telp, Foto, Audio, Aktivitas app, ID perangkat; **transit terenkripsi = Ya**;
      **hapus data = Ya** via kontak). ⚠ Harus **cocok dengan izin nyata** app.
- [ ] **Data deletion** → nyatakan jalur permintaan hapus via dukungan. ➜ [reviewer-access.md](reviewer-access.md) §3.
- [ ] **Government app?** → Tidak (kecuali memang instansi).

## 5 · Rilis ke Closed testing (WAJIB dulu, sebelum Production)
- [ ] **Testing → Closed testing** → buat track → tambah **penguji** (daftar email
      atau Google Group).
- [ ] **Create new release** → aktifkan **Play App Signing** (saat diminta di upload
      pertama — Google pegang kunci final, keystore-mu jadi *upload key*).
- [ ] **Upload** AAB dari `frontend/android/app/build/outputs/bundle/release/`
      → pakai berkas bernama unik, mis. **`SurveiPopuliCenter-v1.0.0-code8.aab`**.
- [ ] Isi **release notes** → salin dari [reviewer-access.md](reviewer-access.md) §4.
- [ ] **Save → Review release → Start rollout** ke Closed testing.
- [ ] **Akun pribadi**: jalankan **12 penguji × 14 hari** berturut sebelum boleh Production.
      (Akun organisasi: lewati.)

## 6 · Production
- [ ] **Countries/regions**: pilih Indonesia (atau sesuai kebutuhan).
- [ ] **Production → Create release** → pakai AAB yang sama (atau versi lebih baru).
- [ ] **Review** semua peringatan hijau → **Start rollout to Production** → **Submit**.
- [ ] Tunggu review Google (biasanya beberapa jam–beberapa hari).

---

## ⚠️ Gotcha yang sering menggagalkan
- 🚨 **Kunci Perangkat vs reviewer** — lihat kotak merah di atas. Akun demo **harus**
  bebas ikatan perangkat & survei Demo **harus** `Kunci Perangkat = Nonaktif`,
  kalau tidak reviewer tak bisa login → **ditolak**.
- **versionCode wajib naik tiap upload** → otomatis via `npm run cap:release`.
  Cek nilai berjalan di `frontend/android/version.properties`.
- **Server harus online selama review** — reviewer menjalankan app sungguhan.
  Jangan deploy/restart berisiko saat masa review.
- **Data Safety vs izin** harus konsisten; Play membandingkan deklarasi dengan
  perilaku app. App ini juga mengumpulkan **ID perangkat** (kunci perangkat) —
  pastikan ikut dideklarasikan.
- **Akun demo jangan** dikunci OTP/perangkat, jangan dinonaktifkan selama review.
- **Nama developer ≠ nama app.** "Populi Center" (developer, tampil di bawah judul
  app) diatur di *Settings → Developer account*; "Survei Populi Center" (nama app)
  di *Create app*. Nama developer harus **akurat** — memakai nama lembaga di akun
  **pribadi** tanpa kewenangan berisiko ditolak/ditangguhkan. ➜ §0
- **D-U-N-S bisa ~30 hari** — kalau menargetkan akun Organisasi, urus **paling awal**,
  jangan menunggu app siap. ➜ §0
- **Keystore/password hilang = tak bisa update app** (kecuali reset upload key via
  Play App Signing). Backup sekarang.

## Rilis berikutnya (setelah live)
```powershell
cd frontend
npm run cap:release          # versionCode naik otomatis
# → Production → Create release → upload AAB baru → rollout
```
