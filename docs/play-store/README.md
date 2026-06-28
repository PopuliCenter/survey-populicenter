# Rilis Publik Play Store — Populi Survey

Checklist & berkas pendukung untuk menerbitkan aplikasi ke Google Play (publik).

| Berkas | Isi |
|--------|-----|
| `listing.md` | Judul, deskripsi, kategori, kebutuhan aset grafis |
| `data-safety.md` | Jawaban form Data Safety |
| `reviewer-access.md` | Akun demo untuk reviewer + jalur hapus data |

## Status

### ✅ Sisi kode (di repo) — selesai
- Ikon launcher (logo Populi, adaptive)
- Splash screen
- Signing config (template `keystore.properties` + gitignore)
- Hardening: `allowBackup=false`, rilis nol-cleartext, R8 keep-rules, izin foreground
- Tampilan versi (layar Login)
- Kebijakan Privasi, S&K, FAQ, kontak dukungan (tayang di risetcenter.com)

### ⬜ Play Console / operasional
**Wajib (paling sering bikin ditolak):**
- [ ] **App access**: akun demo reviewer → lihat `reviewer-access.md`
- [ ] **Jalur testing**: akun developer pribadi (≥ Nov 2023) butuh closed testing
      12 penguji × 14 hari sebelum production. **Akun organisasi/perusahaan tidak
      kena syarat ini** → disarankan daftar sebagai organisasi.
- [ ] **Data Safety** → lihat `data-safety.md`
- [ ] **Privacy Policy URL**: `https://risetcenter.com/kebijakan-privasi.html`
- [ ] **Content rating** (kuesioner) + **Target audience** = dewasa

**Store listing:**
- [ ] Teks judul/deskripsi → `listing.md`
- [ ] Ikon 512×512, Feature graphic 1024×500, 2–6 screenshot HP

**Teknis rilis:**
- [ ] Buat keystore + aktifkan **Play App Signing**
- [ ] `npm run cap:build` → `gradlew.bat bundleRelease` → **uji AAB di perangkat** (R8)
- [ ] Negara distribusi + harga (gratis)

## Urutan disarankan
1. Daftar/siapkan akun developer (**organisasi** bila bisa).
2. Deploy web (`--build nginx`) agar halaman legal & versi live + rebuild APK.
3. Buat akun demo reviewer + survei Demo.
4. Buat keystore → build AAB → uji di perangkat.
5. Isi Play Console: listing, Data Safety, content rating, app access, privacy URL.
6. Unggah AAB ke **Closed testing** dulu → lalu ajukan **Production**.

> ⚠️ Konten legal & teks ini bukan nasihat hukum — tinjau badan hukum, retensi,
> dan yurisdiksi sebelum publikasi.
