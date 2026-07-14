# Rilis iOS — Survei Populi Center

Panduan menyiapkan & merilis versi **iOS**. Kode sudah disiapkan dari sisi repo;
yang tersisa **wajib** dikerjakan di **macOS** (batasan Apple, bukan Capacitor).

> ⚠️ **Tidak bisa dibangun dari Windows/Linux.** Xcode, iOS SDK, dan *code signing*
> Apple hanya berjalan di macOS. Tidak ada jalan pintas yang sah.

---

## 1. Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| **macOS + Xcode** | Mac fisik, **cloud Mac** (MacinCloud/MacStadium), atau **CI macOS runner** (GitHub Actions `macos-latest`, Codemagic, Bitrise) |
| **Apple Developer Program** | ~$99/tahun — wajib untuk signing, TestFlight, & App Store |
| **CocoaPods** | `sudo gem install cocoapods` (dipakai Capacitor untuk dependensi native) |
| **Node 18+** | sama seperti build Android |

Bundle ID yang dipakai: **`com.populicenter.survey`** (sama dengan Android — daftarkan
di Apple Developer → Identifiers).

---

## 2. Langkah pertama kali (di macOS)

```bash
git clone <repo> && cd aplikasi-web-base-populicenter/frontend
npm install

# 1) Tambahkan platform iOS (HANYA di macOS) — membuat folder ios/
npm run cap:add:ios

# 2) WAJIB: tambal Info.plist dengan teks izin (mic/kamera/lokasi/galeri).
#    Tanpa ini app CRASH saat minta izin & App Store MENOLAK submission.
npm run ios:permissions

# 3) Build web + salin ke proyek iOS
npm run cap:build:ios

# 4) Buka di Xcode
npm run cap:open:ios
```

Di Xcode:
1. **Signing & Capabilities** → pilih Team (Apple Developer Anda), pastikan
   Bundle Identifier = `com.populicenter.survey`.
2. Set **Display Name** = `Survei Populi Center`.
3. Naikkan **Version** / **Build** tiap unggah (mirip `versionCode` Android).
4. **Product → Archive** → **Distribute App** → **TestFlight & App Store**.

---

## 3. Build berikutnya (setelah ada perubahan kode)

```bash
npm run cap:build:ios     # vite build + cap sync ios
npm run cap:open:ios      # lalu Archive di Xcode
```
Sama seperti Android: perubahan React **tidak** masuk ke app kalau belum
`cap:build:ios` (yang menyalin `dist/` ke proyek iOS).

---

## 4. Izin yang ditambahkan otomatis (`npm run ios:permissions`)

| Kunci Info.plist | Untuk fitur |
|---|---|
| `NSMicrophoneUsageDescription` | Rekaman audio wawancara |
| `NSCameraUsageDescription` | Foto bukti wawancara |
| `NSLocationWhenInUseUsageDescription` | Titik lokasi wawancara (hanya saat dipakai) |
| `NSPhotoLibraryAddUsageDescription` / `NSPhotoLibraryUsageDescription` | Simpan/pilih foto |

Skrip **idempoten** — kunci yang sudah ada tidak ditimpa. Teks bisa diedit di
[`frontend/scripts/ios-permissions.cjs`](../../frontend/scripts/ios-permissions.cjs).

---

## 5. Catatan khusus iOS (sudah diantisipasi di kode)

- **Format audio.** Safari/WKWebView **tidak** mendukung `webm/opus`. Hook
  `useAudioRecorder` sudah punya urutan fallback `webm → audio/mp4`, dan backend
  (`AUDIO_ALLOWED_MIME_TYPES`) sudah menerima `audio/mp4`. → aman.
- **Kunci perangkat.** `X-Device-Id` disimpan di localStorage per instalasi — jalan
  normal di iOS.
- **Offline/SQLite.** `@capacitor-community/sqlite` mendukung iOS; storage native
  (bukan storage Safari) sehingga **tidak** kena penghapusan data seperti PWA.
- **`network_security_config.xml`** hanya untuk Android — tak ada padanan/keperluan
  di iOS (ATS sudah memaksa HTTPS, dan server kita HTTPS).

---

## 6. Alternatif tanpa app native: PWA (sudah aktif)

TPD iPhone **sudah bisa** memakai versi web di `populicenter.com` (GPS sudah dibuat
*best-effort* di web agar offline tidak terblokir), dan PWA sudah aktif → bisa
**"Add to Home Screen"**.

⚠️ **Risiko untuk pemakaian offline berat:** WebKit dapat **menghapus data situs**
(IndexedDB/localStorage) saat storage tertekan atau lama tak dipakai. Untuk app
offline-first yang mengantre jawaban **dan rekaman audio** berhari-hari, ini bahaya
kehilangan data.

**Pedoman:**
- TPD iPhone mayoritas **online / offline singkat lalu sinkron** → PWA cukup.
- TPD iPhone mengumpulkan **offline berhari-hari** → pakai **app native iOS** (atau
  HP Android), jangan andalkan PWA.

---

## 7. Checklist App Store (ringkas)

- [ ] Bundle ID terdaftar di Apple Developer
- [ ] Teks izin Info.plist (`npm run ios:permissions`) ✅ otomatis
- [ ] Ikon app (1024×1024) + launch screen
- [ ] **Privacy Policy URL**: `https://populicenter.com/kebijakan-privasi.html`
- [ ] **App Privacy** (Data Collection) — mirip Data Safety di Play; lihat
      [`docs/play-store/data-safety.md`](../play-store/data-safety.md) sebagai acuan isi
- [ ] Akun demo untuk reviewer — lihat [`docs/play-store/reviewer-access.md`](../play-store/reviewer-access.md)
- [ ] Naikkan Version/Build tiap unggah
- [ ] Unggah via Xcode Archive → TestFlight → App Store
