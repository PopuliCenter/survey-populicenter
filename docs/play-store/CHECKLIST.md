# ✅ Checklist Rilis Play Store — Populi Survey

Checklist berurut, tinggal contreng. Ikuti dari atas ke bawah. Detail tiap bagian
ada di dokumen pendamping: [listing.md](listing.md) · [data-safety.md](data-safety.md) ·
[reviewer-access.md](reviewer-access.md) · [keystore-setup.md](keystore-setup.md).

**Fakta app** (untuk disalin):
| | |
|---|---|
| Application ID | `com.populicenter.survey` |
| Nama app | Populi Survey |
| Versi AAB pertama | versionName **1.0.0** / versionCode **1** |
| Privacy Policy | `https://risetcenter.com/kebijakan-privasi.html` |
| Syarat & Ketentuan | `https://risetcenter.com/syarat-ketentuan.html` |
| Dukungan | `info@populicenter.org` · WA +62 812-9206-8362 |
| Kategori | Bisnis |

---

## 0 · Prasyarat (sebelum buka Play Console)
- [ ] **Akun Google Play Developer** aktif (biaya $25 sekali). ➜ Daftar sebagai
      **Organisasi/Perusahaan** bila bisa → **lolos** syarat closed testing wajib
      (12 penguji × 14 hari) yang dikenakan ke akun pribadi baru.
- [ ] **Web produksi live & stabil** (`risetcenter.com`) — reviewer benar-benar
      menjalankan app terhadap server ini.
- [ ] **Halaman legal live**: privasi, S&K, FAQ (sudah tayang + logo).
- [ ] **AAB signed siap** — `app-release.aab` (v1.0.0 / code 1). ✔ selesai
- [ ] **Keystore sudah di-backup** di ≥2 tempat + password di manager. ➜ [keystore-setup.md](keystore-setup.md)
- [ ] **Akun demo reviewer + survei "Demo"** dibuat & aktif. ➜ [reviewer-access.md](reviewer-access.md)
- [ ] **Aset grafis siap**: ikon 512×512, feature 1024×500, 2–6 screenshot HP. ➜ [listing.md](listing.md)
- [ ] **Uji AAB/APK di HP asli** (build R8/minify) — login + simpan 1 responden OK.

---

## 1 · Buat aplikasi
- [ ] Play Console → **Create app**.
- [ ] Nama: **Populi Survey** · Bahasa default: **Indonesia (id-ID)**.
- [ ] Tipe: **App** (bukan Game) · **Free** (gratis).
- [ ] Setujui deklarasi (Developer Program Policies, US export laws).

## 2 · Main store listing
- [ ] **Judul**, **deskripsi singkat**, **deskripsi lengkap** → salin dari [listing.md](listing.md).
- [ ] **Ikon** 512×512 PNG (< 1 MB).
- [ ] **Feature graphic** 1024×500.
- [ ] **Screenshot HP** (≥2; ideal 4: Login, Daftar survei, Form pengisian, Status offline/sinkron).
- [ ] **Kategori aplikasi**: Bisnis · Email kontak: `info@populicenter.org` · Website: `populicenter.org`.

## 3 · App content (kebijakan — paling sering bikin ditolak)
- [ ] **Privacy policy** → `https://risetcenter.com/kebijakan-privasi.html`.
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

## 4 · Rilis ke Closed testing (WAJIB dulu, sebelum Production)
- [ ] **Testing → Closed testing** → buat track → tambah **penguji** (daftar email
      atau Google Group).
- [ ] **Create new release** → aktifkan **Play App Signing** (saat diminta di upload
      pertama — Google pegang kunci final, keystore-mu jadi *upload key*).
- [ ] **Upload** `app-release.aab`.
- [ ] Isi **release notes** (mis. "Rilis awal Populi Survey.").
- [ ] **Save → Review release → Start rollout** ke Closed testing.
- [ ] **Akun pribadi**: jalankan **12 penguji × 14 hari** berturut sebelum boleh Production.
      (Akun organisasi: lewati.)

## 5 · Production
- [ ] **Countries/regions**: pilih Indonesia (atau sesuai kebutuhan).
- [ ] **Production → Create release** → pakai AAB yang sama (atau versi lebih baru).
- [ ] **Review** semua peringatan hijau → **Start rollout to Production** → **Submit**.
- [ ] Tunggu review Google (biasanya beberapa jam–beberapa hari).

---

## ⚠️ Gotcha yang sering menggagalkan
- **versionCode wajib naik tiap upload** → sudah otomatis via `npm run cap:release`
  (build ini code 1; berikutnya code 2, dst.).
- **Server harus online selama review** — reviewer menjalankan app sungguhan.
- **Data Safety vs izin** harus konsisten; Play membandingkan deklarasi dengan
  perilaku app.
- **Akun demo jangan** dikunci OTP/perangkat, jangan dinonaktifkan selama review.
- **Keystore/password hilang = tak bisa update app** (kecuali reset upload key via
  Play App Signing). Backup sekarang.

## Rilis berikutnya (setelah live)
```powershell
cd frontend
npm run cap:release          # versionCode naik otomatis
# → Production → Create release → upload AAB baru → rollout
```
