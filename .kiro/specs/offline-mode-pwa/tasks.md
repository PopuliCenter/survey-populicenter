# Implementation Plan: Offline Mode PWA

## Overview

Implementasi fitur Offline Mode PWA untuk aplikasi surveyor. Rencana ini memecah pekerjaan menjadi lapisan-lapisan inkremental: konfigurasi PWA terlebih dahulu, lalu offline data layer (IndexedDB), kemudian sync manager, diikuti modifikasi UI, dan diakhiri dengan integrasi penuh.

## Tasks

- [x] 1. Konfigurasi PWA — manifest, ikon, dan vite-plugin-pwa
  - [x] 1.1 Install `vite-plugin-pwa` dan `idb` sebagai dependensi
    - Tambahkan `vite-plugin-pwa` ke `devDependencies` di `frontend/package.json`
    - Tambahkan `idb` ke `dependencies` di `frontend/package.json`
    - Jalankan `npm install` di direktori `frontend`
    - _Requirements: 1.3_

  - [x] 1.2 Buat file `frontend/public/manifest.json`
    - Field `name`: "Web Survey Platform"
    - Field `short_name`: "Survey"
    - Field `start_url`: "/surveyor"
    - Field `display`: "standalone"
    - Field `theme_color`: "#2563eb"
    - Field `background_color`: "#f9fafb"
    - Field `icons`: array dengan ikon 192x192 dan 512x512 (path: `/icons/icon-192.png`, `/icons/icon-512.png`)
    - _Requirements: 1.1_

  - [x] 1.3 Buat ikon PWA placeholder di `frontend/public/icons/`
    - Buat file `icon-192.png` (192x192 piksel) — dapat berupa SVG yang di-convert atau PNG sederhana
    - Buat file `icon-512.png` (512x512 piksel)
    - _Requirements: 1.1, 1.4_

  - [x] 1.4 Modifikasi `frontend/index.html` — tambahkan meta tags PWA
    - Tambahkan `<link rel="manifest" href="/manifest.json" />`
    - Tambahkan `<meta name="theme-color" content="#2563eb" />`
    - Tambahkan `<meta name="apple-mobile-web-app-capable" content="yes" />`
    - Tambahkan `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
    - _Requirements: 1.2_

  - [x] 1.5 Modifikasi `frontend/vite.config.js` — integrasikan VitePWA plugin
    - Import `VitePWA` dari `vite-plugin-pwa`
    - Tambahkan `VitePWA` ke array `plugins` dengan konfigurasi:
      - `registerType: 'prompt'`
      - `manifest: false` (gunakan manifest.json dari public/)
      - `workbox.globPatterns`: cache semua aset statis (js, css, html, png, svg)
      - `workbox.runtimeCaching`: strategi `NetworkFirst` untuk URL pattern `/api/*` dengan `maxEntries: 50`, `maxAgeSeconds: 86400`, `networkTimeoutSeconds: 10`
    - _Requirements: 1.3, 2.1, 2.2, 2.5_

  - [x] 1.6 Modifikasi `frontend/src/main.jsx` — registrasi Service Worker
    - Import `registerSW` dari `virtual:pwa-register`
    - Panggil `registerSW` dengan callback `onNeedRefresh` yang menampilkan `confirm()` untuk reload
    - Callback `onOfflineReady` untuk log bahwa aplikasi siap offline
    - _Requirements: 2.4_

- [x] 2. Buat Offline Data Layer — `offlineDB.js`
  - [x] 2.1 Buat file `frontend/src/utils/offlineDB.js` — inisialisasi IndexedDB
    - Import `openDB` dari library `idb`
    - Definisikan konstanta `DB_NAME = 'survey-offline-db'` dan `DB_VERSION = 1`
    - Implementasi fungsi `getDB()` yang membuka database dengan dua object store:
      - `surveys`: keyPath `id`
      - `offline_queue`: keyPath `localId` (autoIncrement), dengan indexes pada `status` dan `timestamp`
    - Export `getDB` sebagai named export
    - _Requirements: 3.1, 3.2, 4.2, 4.4_

  - [x] 2.2 Implementasi fungsi cache survei di `offlineDB.js`
    - `cacheSurvey(survey)`: simpan objek survei lengkap (termasuk `questions[]`) ke object store `surveys`
    - `getCachedSurvey(surveyId)`: ambil satu survei dari cache berdasarkan id
    - `cacheSurveyList(surveys)`: simpan array survei (tanpa questions) ke object store `surveys` menggunakan `putAll` atau loop
    - `getCachedSurveyList()`: ambil semua survei dari object store `surveys`
    - Export semua fungsi sebagai named exports
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.3 Implementasi fungsi Offline Queue di `offlineDB.js`
    - `enqueueResponse(payload)`: tambahkan entri ke `offline_queue` dengan `status: 'pending'`, `timestamp: Date.now()`, `errorMessage: null`, dan semua field dari `payload`; return `localId` yang di-generate
    - `getQueueByStatus(status)`: ambil semua entri dengan status tertentu, diurutkan berdasarkan `timestamp` ASC
    - `updateQueueStatus(localId, status, errorMessage)`: update field `status` dan `errorMessage` pada entri dengan `localId` tertentu
    - `clearSyncedQueue()`: hapus semua entri dengan `status: 'synced'`
    - `deleteQueueEntry(localId)`: hapus satu entri berdasarkan `localId`
    - `getPendingCount()`: hitung jumlah entri dengan `status: 'pending'`
    - Export semua fungsi sebagai named exports
    - _Requirements: 4.2, 4.4, 5.3, 5.5, 5.7, 6.3_

  - [ ]* 2.4 Tulis unit test untuk `offlineDB.js`
    - Test `enqueueResponse` menyimpan entri dengan status `pending` dan field yang benar
    - Test `getQueueByStatus` mengembalikan entri sesuai status, diurutkan timestamp ASC
    - Test `updateQueueStatus` mengubah status dan errorMessage dengan benar
    - Test `clearSyncedQueue` hanya menghapus entri `synced`, tidak menyentuh `pending` atau `failed`
    - Test `deleteQueueEntry` menghapus entri spesifik tanpa mempengaruhi entri lain
    - Test `getPendingCount` mengembalikan jumlah yang akurat
    - File: `frontend/src/utils/__tests__/offlineDB.test.js`
    - _Requirements: 4.2, 4.4, 5.3, 5.5, 5.7_

  - [ ]* 2.5 Tulis property-based test untuk `offlineDB.js`
    - **Property 1**: Round-trip Offline Queue — generate random payload, enqueue, baca kembali, verifikasi identik
    - **Property 2**: Urutan sinkronisasi — generate entri dengan timestamp acak, verifikasi `getQueueByStatus` mengembalikan urutan ascending
    - **Property 3**: Konsistensi transisi status — verifikasi hanya transisi valid yang diizinkan
    - **Property 4**: Idempotency `clearSyncedQueue` — panggil dua kali, verifikasi hasil sama
    - **Property 5**: Isolasi operasi — verifikasi operasi pada satu entri tidak mempengaruhi entri lain
    - File: `frontend/src/utils/__tests__/offlineDB.property.test.js`
    - _Requirements: 8.4, 8.5_

- [x] 3. Buat Sync Manager — `useSyncManager.js`
  - [x] 3.1 Buat file `frontend/src/surveyor/hooks/useSyncManager.js`
    - Import `api` dari `services/api.js` dan fungsi-fungsi dari `offlineDB.js`
    - State: `isOnline` (dari `navigator.onLine`), `isSyncing`, `pendingCount`, `failedItems`
    - Implementasi `refreshCounts()`: baca `getPendingCount()` dan `getQueueByStatus('failed')`, update state
    - Implementasi `syncNow()`:
      1. Guard: jika `!isOnline` atau `isSyncing`, return
      2. Set `isSyncing = true`
      3. Ambil semua entri `pending` dari IndexedDB (urutan timestamp ASC)
      4. Loop setiap entri:
         - `POST /responses/start` dengan `{ survey_id: entry.survey_id }`
         - Jika berhasil: `POST /responses/submit` dengan `{ session_token, survey_id, answers, geo }`
         - Jika berhasil (201): `updateQueueStatus(localId, 'synced')`
         - Jika error jaringan (network error / timeout): set `isSyncing = false`, return (hentikan loop)
         - Jika error server (response.status >= 400): `updateQueueStatus(localId, 'failed', errorMessage)`, lanjut
      5. `clearSyncedQueue()`
      6. `refreshCounts()`
      7. Set `isSyncing = false`
    - Implementasi `deleteFailedItem(localId)`: panggil `deleteQueueEntry(localId)`, lalu `refreshCounts()`
    - `useEffect` untuk event listeners `online`/`offline` pada `window`
    - `useEffect` untuk memanggil `refreshCounts()` saat mount
    - Return `{ isOnline, isSyncing, pendingCount, failedItems, syncNow, deleteFailedItem }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.4_

  - [ ]* 3.2 Tulis unit test untuk `useSyncManager.js`
    - Test deteksi perubahan status koneksi via event `online`/`offline`
    - Test `syncNow` mengirim respons secara berurutan (mock API)
    - Test penanganan error jaringan: sinkronisasi berhenti, entri tetap `pending`
    - Test penanganan error server: entri menjadi `failed`, sinkronisasi lanjut ke entri berikutnya
    - Test `deleteFailedItem` menghapus entri dan memperbarui `failedItems`
    - File: `frontend/src/surveyor/hooks/__tests__/useSyncManager.test.js`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 4. Buat komponen `OfflineStatusBar.jsx`
  - [x] 4.1 Buat file `frontend/src/components/OfflineStatusBar.jsx`
    - Props: `{ isOnline, isSyncing, pendingCount }`
    - State internal: `showSyncSuccess` (boolean, true selama 3 detik setelah sync selesai)
    - `useEffect` untuk mendeteksi transisi dari `isSyncing: true` → `isSyncing: false` dan `pendingCount: 0` → set `showSyncSuccess = true` selama 3 detik
    - Render kondisional:
      - `isSyncing`: badge biru + spinner + "Menyinkronkan data..."
      - `showSyncSuccess`: badge hijau "Semua data berhasil disinkronkan"
      - `!isOnline`: badge merah "Offline"
      - `isOnline && pendingCount > 0`: badge hijau "Online" + teks "{pendingCount} data menunggu sinkronisasi"
      - `isOnline && pendingCount === 0`: badge hijau "Online"
    - Aksesibilitas: `role="status"`, `aria-live="polite"`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 4.2 Tulis unit test untuk `OfflineStatusBar.jsx`
    - Test render badge "Online" saat `isOnline: true, pendingCount: 0`
    - Test render badge "Offline" saat `isOnline: false`
    - Test tampilkan jumlah pending saat `pendingCount > 0`
    - Test tampilkan spinner saat `isSyncing: true`
    - Test notifikasi sukses muncul dan hilang setelah 3 detik
    - File: `frontend/src/components/__tests__/OfflineStatusBar.test.jsx`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 5. Modifikasi `SurveyList.jsx` untuk offline support
  - [x] 5.1 Modifikasi `frontend/src/surveyor/pages/SurveyList.jsx` — integrasi offline
    - Import `useSyncManager` dari `../hooks/useSyncManager`
    - Import `cacheSurveyList`, `getCachedSurveyList` dari `../../utils/offlineDB`
    - Import `OfflineStatusBar` dari `../../components/OfflineStatusBar`
    - Panggil `useSyncManager()` dan destructure `{ isOnline, isSyncing, pendingCount, failedItems, deleteFailedItem }`
    - Modifikasi `fetchData`:
      - Jika `isOnline`: fetch dari API seperti sebelumnya, lalu panggil `cacheSurveyList(activeSurveys)` setelah berhasil
      - Jika `!isOnline`: panggil `getCachedSurveyList()` dan set ke state `surveys`
      - Jika offline dan cache kosong: set `error` ke "Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu."
    - Tambahkan `OfflineStatusBar` di header (setelah session counter)
    - Tambahkan section "Respons Gagal Tersinkron" di bawah daftar survei jika `failedItems.length > 0`:
      - Tampilkan setiap item dengan `survey_id`, `timestamp`, `errorMessage`
      - Tombol "Hapus" per item yang memanggil `deleteFailedItem(item.localId)`
    - _Requirements: 3.1, 3.3, 3.5, 3.6, 6.2, 6.3, 7.1_

  - [ ]* 5.2 Tulis unit test untuk `SurveyList.jsx` mode offline
    - Test memuat data dari IndexedDB saat `isOnline: false`
    - Test menampilkan pesan error saat cache kosong dan offline
    - Test menampilkan `OfflineStatusBar` di header
    - Test menampilkan daftar `failedItems` dengan tombol Hapus
    - Test tombol Hapus memanggil `deleteFailedItem`
    - File: `frontend/src/surveyor/pages/__tests__/SurveyList.offline.test.jsx`
    - _Requirements: 3.3, 3.6, 6.2, 6.3_

- [x] 6. Modifikasi `SurveyForm.jsx` untuk offline support
  - [x] 6.1 Modifikasi `frontend/src/surveyor/pages/SurveyForm.jsx` — integrasi offline
    - Import `useSyncManager` dari `../hooks/useSyncManager`
    - Import `cacheSurvey`, `getCachedSurvey`, `enqueueResponse` dari `../../utils/offlineDB`
    - Import `OfflineStatusBar` dari `../../components/OfflineStatusBar`
    - Panggil `useSyncManager()` dan destructure `{ isOnline, isSyncing, pendingCount }`
    - Modifikasi `init()` (dalam `useEffect`):
      - Jika `isOnline`: fetch dari API seperti sebelumnya, lalu panggil `cacheSurvey(surveyData)` setelah berhasil
      - Jika `!isOnline`: panggil `getCachedSurvey(id)` dan set ke state
      - Jika offline dan cache kosong: set `loadingError` ke "Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu."
    - Tambahkan `OfflineStatusBar` di header
    - Modifikasi render pertanyaan `photo` saat offline: tampilkan sebagai opsional dengan pesan "Upload foto memerlukan koneksi internet"
    - Modifikasi `UniqueIdField` saat offline: skip pengecekan ketersediaan, tampilkan pesan "Validasi ketersediaan nomor akan dilakukan saat sinkronisasi"
    - Modifikasi `handleSubmit`:
      - Jika `isOnline`: alur submit yang sudah ada (tidak berubah)
      - Jika `!isOnline`:
        1. Jalankan validasi required dan validasi tipe (sama seperti online)
        2. Jalankan validasi answer validation (dari `answerValidation.js`)
        3. Bangun `answersPayload` (sama seperti online, tapi skip foto)
        4. Dapatkan geolocation (atau gunakan `{ status: 'unavailable', lat: null, lng: null }` jika gagal)
        5. Panggil `enqueueResponse({ survey_id: id, answers: answersPayload, geo })`
        6. Navigate ke `/surveyor/survey/${id}/success` dengan state `{ offline: true }`
    - _Requirements: 3.2, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 6.2 Tulis unit test untuk `SurveyForm.jsx` mode offline
    - Test memuat pertanyaan dari IndexedDB saat offline
    - Test menampilkan pesan error saat cache kosong dan offline
    - Test pertanyaan `photo` ditampilkan sebagai opsional saat offline
    - Test `unique_id` skip pengecekan ketersediaan saat offline
    - Test submit offline menyimpan ke Offline Queue (mock `enqueueResponse`)
    - Test validasi required tetap berjalan saat offline
    - Test navigate ke SubmitSuccess dengan `state.offline: true`
    - File: `frontend/src/surveyor/pages/__tests__/SurveyForm.offline.test.jsx`
    - _Requirements: 3.4, 4.1, 4.2, 4.3, 4.5, 4.6, 8.1, 8.2, 8.3_

- [x] 7. Modifikasi `SubmitSuccess.jsx` untuk mode offline
  - [x] 7.1 Modifikasi `frontend/src/surveyor/pages/SubmitSuccess.jsx` — tampilan offline
    - Baca `offline` dari `location.state`
    - Jika `offline: true`:
      - Tampilkan ikon cloud/jam (bukan centang hijau)
      - Heading: "Data tersimpan secara lokal!"
      - Pesan: "Data akan otomatis dikirim saat koneksi internet tersedia."
      - Sembunyikan section nomor kuesioner
    - Jika `offline: false` (atau tidak ada): tampilan yang sudah ada tidak berubah
    - Tetap increment `session_response_count` di kedua kasus
    - _Requirements: 4.3_

  - [ ]* 7.2 Tulis unit test untuk `SubmitSuccess.jsx` mode offline
    - Test tampilan offline: heading, pesan, tidak ada nomor kuesioner
    - Test tampilan online: heading, nomor kuesioner (tidak berubah dari sebelumnya)
    - Test increment `session_response_count` di kedua mode
    - File: `frontend/src/surveyor/pages/__tests__/SubmitSuccess.offline.test.jsx`
    - _Requirements: 4.3_

- [x] 8. Checkpoint — Verifikasi integrasi end-to-end
  - [x] 8.1 Verifikasi alur offline end-to-end
    - Verifikasi alur: buka SurveyList online → data ter-cache → matikan koneksi → buka SurveyList offline → data tampil dari cache
    - Verifikasi alur: buka SurveyForm online → data ter-cache → matikan koneksi → isi formulir → submit → data masuk Offline Queue
    - Verifikasi alur: nyalakan koneksi → SyncManager otomatis sync → data terkirim ke backend → status berubah ke `synced`
    - Verifikasi alur: submit offline dengan kuota habis → status `failed` → tampil di SurveyList → bisa dihapus
    - Verifikasi backward compatibility: alur online yang sudah ada tidak berubah
    - _Requirements: 1.4, 1.5, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.3, 6.1, 6.2, 6.3_

- [x] 9. Checkpoint akhir — Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

## Notes

- Task yang ditandai dengan `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- `vite-plugin-pwa` hanya menghasilkan Service Worker saat `npm run build` (production build), bukan saat `npm run dev`
- Untuk testing PWA secara manual, gunakan `npm run build && npm run preview`
- Library `idb` adalah wrapper Promise tipis untuk IndexedDB — tidak ada overhead signifikan
- Foto tidak di-queue saat offline karena memerlukan multipart upload yang kompleks; pertanyaan `photo` menjadi opsional saat offline
- Background Sync API (Service Worker) tidak digunakan — sinkronisasi dilakukan di foreground saat tab aktif
- Ikon PWA perlu dibuat secara manual atau menggunakan tool seperti `pwa-asset-generator`
