# Setup Keystore & Signing — Survei Populi Center (Android)

Langkah **sekali seumur hidup aplikasi** untuk menandatangani rilis Play Store.
Dikerjakan di **mesin dev** (tempat build APK/AAB), bukan di server.

> 🔑 **PALING PENTING:** keystore ini + password-nya adalah identitas app.
> **Jika hilang, kamu tidak bisa lagi meng-update app yang sama di Play**
> (kecuali reset lewat Play App Signing). Backup di ≥2 tempat aman.
> **JANGAN** commit ke git (sudah otomatis di-`.gitignore`).

---

## 1. Pastikan `keytool` tersedia

`keytool` ikut dalam JDK. Bila pakai **Android Studio**, biasanya ada di JBR:

```powershell
# Coba langsung:
keytool -help

# Bila "not recognized", pakai JBR bawaan Android Studio (sesuaikan path):
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -help
```

Untuk perintah selanjutnya, ganti `keytool` dengan path lengkap di atas bila perlu.

---

## 2. Buat upload keystore (sekali)

Jalankan **di dalam folder** `frontend/android/` (agar file keystore langsung di
lokasi yang dibaca `keystore.properties`):

```powershell
cd frontend\android
keytool -genkeypair -v -storetype PKCS12 `
  -keystore release.keystore `
  -alias populi-survey `
  -keyalg RSA -keysize 2048 -validity 10000
```

- `-validity 10000` ≈ 27 tahun (Play mensyaratkan key berlaku lama — aman).
- keytool akan menanyakan **password keystore**, lalu nama/organisasi (boleh diisi
  "Populi Center" dst.), dan konfirmasi. Untuk PKCS12, password key = password store.
- Catat password-nya baik-baik (masuk password manager).

Hasil: `frontend/android/release.keystore` (sudah di-`.gitignore`).

---

## 3. Isi `keystore.properties`

Salin template lalu isi password:

```powershell
cd frontend\android
copy keystore.properties.example keystore.properties
```

Edit `keystore.properties` (file ini **tidak** di-commit):

```properties
storeFile=release.keystore
storePassword=<password keystore dari langkah 2>
keyAlias=populi-survey
keyPassword=<password key — untuk PKCS12 sama dengan storePassword>
```

---

## 4. Build AAB yang ditandatangani

```powershell
cd frontend
npm run cap:release
```

Header skrip harus menampilkan:

```
Signing      : keystore.properties ditemukan (ditandatangani)
```

Output: `frontend/android/app/build/outputs/bundle/release/app-release.aab`.

**Uji di perangkat asli dulu** (build release memakai R8/minify — bisa memunculkan
bug yang tak ada di debug). Untuk memasang AAB ke HP via `bundletool`, atau cukup
`npm run cap:release -- --apk` untuk menghasilkan APK yang bisa langsung di-install.

Verifikasi tanda tangan (opsional):

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -printcert -jarfile app\build\outputs\bundle\release\app-release.aab
```

---

## 5. Play App Signing (saat upload pertama)

Saat mengunggah AAB pertama ke Play Console:

1. Google menawarkan **Play App Signing** (default, disarankan) → Google memegang
   **app signing key** final. Keystore-mu menjadi **upload key**.
2. Keuntungan: bila upload key hilang, bisa **direset** lewat Play Console (kirim
   permintaan) tanpa kehilangan app. Tetap **jangan** anggap remeh — backup.
3. Setelah terdaftar, tiap rilis berikutnya cukup: `npm run cap:release` (versionCode
   naik otomatis) → unggah AAB.

---

## 6. Backup keystore (wajib)

Simpan **`release.keystore` + isi `keystore.properties`** (atau minimal password &
alias) di tempat aman terpisah, mis.:

- Password manager (1Password/Bitwarden) untuk password + alias.
- Salinan file `release.keystore` di cloud pribadi terenkripsi / USB terpisah.

Tanpa ini, rilis update di masa depan bisa terhambat. Perlakukan setara kunci brankas.

---

## Ringkas alur rilis berikutnya

```powershell
cd frontend
npm run cap:release            # build AAB, versionCode auto-naik
# → unggah app-release.aab ke Play Console (Closed testing → Production)
```
