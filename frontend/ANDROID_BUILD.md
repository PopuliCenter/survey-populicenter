# Build APK Android — Populi Survey

## Prasyarat

1. **Android Studio** — download dari https://developer.android.com/studio
2. **Java JDK 17+** — biasanya sudah termasuk di Android Studio
3. **Node.js 18+** dan **npm**

## Langkah Build APK

### 1. Build Web Assets

```bash
cd frontend
npm run build
```

### 2. Sync ke Android Project

```bash
npx cap sync android
```

### 3. Buka di Android Studio

```bash
npx cap open android
```

Ini akan membuka folder `frontend/android` di Android Studio.

### 4. Build APK di Android Studio

- Tunggu Gradle sync selesai (progress bar di bawah)
- Menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- APK akan tersedia di: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### 5. Build Release APK (untuk distribusi)

- Menu: **Build → Generate Signed Bundle / APK**
- Pilih **APK**
- Buat keystore baru (pertama kali) atau gunakan yang sudah ada
- Pilih **release** build variant
- APK release: `frontend/android/app/build/outputs/apk/release/app-release.apk`

## Konfigurasi Server

Saat pertama kali membuka app di Android, user akan diminta memasukkan URL server backend.

Alternatif: set URL server saat build dengan membuat file `.env.production`:

```
VITE_API_URL=https://survey.populicenter.com
```

Lalu rebuild:

```bash
npm run cap:build
```

## Shortcut Commands

| Command | Deskripsi |
|---------|-----------|
| `npm run cap:build` | Build web + sync ke Android |
| `npm run cap:sync` | Sync web assets ke Android (tanpa rebuild) |
| `npm run cap:open` | Buka project di Android Studio |
| `npm run cap:run` | Run langsung di device/emulator yang terhubung |

## Testing di Device

1. Aktifkan **Developer Options** di HP Android
2. Aktifkan **USB Debugging**
3. Hubungkan HP via USB
4. Jalankan: `npx cap run android`

Atau install APK manual:
1. Copy file `app-debug.apk` ke HP
2. Buka file APK di HP → Install

## Permissions yang Digunakan

| Permission | Kegunaan |
|-----------|----------|
| INTERNET | Koneksi ke server backend |
| CAMERA | Foto dokumentasi wawancara |
| ACCESS_FINE_LOCATION | GPS lokasi wawancara |
| RECORD_AUDIO | Rekaman audio wawancara |
| READ/WRITE_EXTERNAL_STORAGE | Simpan file offline |

## Troubleshooting

### App tidak bisa konek ke server
- Pastikan URL server benar (termasuk http:// atau https://)
- Untuk development lokal, gunakan IP komputer (bukan localhost)
- Android emulator: gunakan `10.0.2.2` untuk akses localhost host machine

### Gradle build error
- Pastikan Android Studio sudah update
- File → Invalidate Caches → Restart

### Camera/GPS tidak berfungsi
- Pastikan permission sudah di-grant di Settings HP
- Beberapa emulator tidak support kamera/GPS
