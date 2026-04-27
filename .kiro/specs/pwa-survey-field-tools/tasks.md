# Rencana Implementasi: PWA Survey Field Tools

## Ikhtisar

Implementasi empat kapabilitas lapangan baru (Perekaman Audio, Geolokasi Ditingkatkan, Pengambilan Foto Multi, Tanda Tangan Digital) dengan pendekatan inkremental: backend terlebih dahulu (migrasi, model, endpoint), kemudian hooks frontend, komponen presentasi, dan terakhir integrasi di SurveyForm. Semua fitur mengikuti pola offline-first yang sudah ada.

## Tasks

- [x] 1. Backend — Migrasi database dan update model Response
  - [x] 1.1 Buat file migrasi `backend/src/migrations/20240108000001-add-field-tools-columns.js`
    - Tambahkan 6 kolom baru ke tabel `responses`: `audio_path` (VARCHAR 500, nullable), `signature_path` (VARCHAR 500, nullable), `photo_paths` (JSONB, nullable, default `[]`), `start_latitude` (DECIMAL 10,6, nullable), `start_longitude` (DECIMAL 10,6, nullable), `start_geo_status` (VARCHAR 30, nullable, default `'available'`)
    - Implementasikan `up` dan `down` migration
    - _Requirements: 1.12, 2.3, 3.11, 4.9_
  - [x] 1.2 Update model `backend/src/models/Response.js` dengan kolom baru
    - Tambahkan definisi `audio_path`, `signature_path`, `photo_paths`, `start_latitude`, `start_longitude`, `start_geo_status` pada model Sequelize
    - Tambahkan validasi `isIn` untuk `start_geo_status` menggunakan array `GEO_STATUSES` yang sudah ada
    - _Requirements: 1.12, 2.3, 2.6, 3.11, 4.9_

- [x] 2. Backend — Endpoint upload audio dan tanda tangan
  - [x] 2.1 Buat direktori upload `backend/uploads/audio/` dan `backend/uploads/signatures/`
    - Pastikan direktori dibuat otomatis jika belum ada (pola yang sama dengan `uploads/photos/`)
    - _Requirements: 1.11, 4.8_
  - [x] 2.2 Tambahkan endpoint `POST /upload/audio` di `backend/src/routes/upload.js`
    - Konfigurasi multer: storage disk ke `uploads/audio/`, prefix `audio-`, max 50 MB
    - MIME filter: `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/ogg`
    - Response: `{ path: "uploads/audio/audio-{timestamp}-{random}.ext" }`
    - Error handling: 413 untuk ukuran, 422 untuk format, 422 untuk file kosong
    - Auth: `authMiddleware` + `requireRole(['admin', 'supervisor', 'surveyor'])`
    - _Requirements: 1.11_
  - [x] 2.3 Tambahkan endpoint `POST /upload/signature` di `backend/src/routes/upload.js`
    - Konfigurasi multer: storage disk ke `uploads/signatures/`, prefix `sig-`, max 2 MB
    - MIME filter: `image/png` saja
    - Response: `{ path: "uploads/signatures/sig-{timestamp}-{random}.png" }`
    - Error handling: 413 untuk ukuran, 422 untuk format, 422 untuk file kosong
    - Auth: `authMiddleware` + `requireRole(['admin', 'supervisor', 'surveyor'])`
    - _Requirements: 4.8, 4.9_
  - [ ]* 2.4 Tulis property test untuk validasi upload backend (Property 8)
    - **Property 8: Validasi Upload Backend (Audio dan Signature)**
    - File: `backend/tests/properties/fieldToolsUpload.property.test.js`
    - Gunakan fast-check untuk generate kombinasi MIME type dan ukuran file, verifikasi acceptance/rejection sesuai aturan
    - **Validates: Requirements 1.11, 4.8**
  - [ ]* 2.5 Tulis unit test untuk endpoint upload audio dan signature
    - File: `backend/tests/unit/upload.test.js` (tambahkan test cases baru)
    - Test: upload audio sukses, audio terlalu besar (413), audio format salah (422), upload signature sukses, signature terlalu besar (413), signature bukan PNG (422)
    - _Requirements: 1.11, 4.8_

- [x] 3. Backend — Update endpoint responses untuk field baru
  - [x] 3.1 Update endpoint `POST /responses/submit` untuk menerima field baru
    - Terima field opsional: `audio_path`, `signature_path`, `photo_paths` (array), `start_latitude`, `start_longitude`, `start_geo_status`
    - Simpan field baru ke model Response saat membuat record
    - _Requirements: 1.12, 2.3, 3.11, 4.9_
  - [x] 3.2 Update endpoint `GET /responses/:id` untuk menyertakan field baru
    - Sertakan `audio_path`, `signature_path`, `photo_paths`, `start_latitude`, `start_longitude`, `start_geo_status` dalam response JSON
    - _Requirements: 2.6_

- [x] 4. Checkpoint — Pastikan semua test backend lulus
  - Jalankan test suite backend, pastikan semua test lulus. Tanyakan ke pengguna jika ada pertanyaan.

- [x] 5. Frontend — Upgrade offlineDB.js (IndexedDB v2 + media_files store)
  - [x] 5.1 Upgrade `frontend/src/utils/offlineDB.js` ke DB_VERSION 2
    - Tambahkan object store `media_files` dengan keyPath `fileId` (auto-increment) dan index `localId` serta `type`
    - Pastikan upgrade handler menangani upgrade dari versi 1 ke 2 tanpa menghapus store yang sudah ada
    - _Requirements: 5.2_
  - [x] 5.2 Tambahkan fungsi baru di offlineDB.js untuk media files
    - `saveMediaFile({ localId, type, blob, filename })` → fileId
    - `getMediaFilesByLocalId(localId)` → Array
    - `deleteMediaFilesByLocalId(localId)` → void
    - _Requirements: 1.7, 3.6, 4.6, 5.2_
  - [x] 5.3 Update `enqueueResponse` untuk menerima field baru
    - Tambahkan field `start_geo`, `has_audio`, `has_signature`, `photo_count` pada payload offline_queue
    - _Requirements: 2.5, 5.1_
  - [ ]* 5.4 Tulis property test untuk round-trip media di IndexedDB (Property 2)
    - **Property 2: Round-Trip Penyimpanan Media di IndexedDB**
    - File: `frontend/src/utils/__tests__/offlineDB.property.test.js`
    - Gunakan fast-check untuk generate blob data, simpan dan ambil kembali, verifikasi identitas type, filename, dan ukuran blob
    - **Validates: Requirements 1.7, 3.6, 4.6**
  - [ ]* 5.5 Tulis property test untuk preservasi data offline queue (Property 7)
    - **Property 7: Preservasi Data Offline Queue**
    - File: `frontend/src/utils/__tests__/offlineDB.property.test.js`
    - Gunakan fast-check untuk generate payload respons dengan semua field baru, simpan dan ambil kembali, verifikasi semua field identik
    - **Validates: Requirements 2.5, 5.1**

- [x] 6. Frontend — Hook useAudioRecorder
  - [x] 6.1 Buat hook `frontend/src/surveyor/hooks/useAudioRecorder.js`
    - Implementasikan state machine: `idle` → `recording` → `paused` → `stopped`
    - Gunakan MediaRecorder API dengan fallback MIME: `audio/webm;codecs=opus` → `audio/mp4` → `audio/webm`
    - Timer durasi dengan `setInterval` 1 detik, dijeda saat pause
    - Deteksi dukungan browser via `typeof MediaRecorder !== 'undefined'`
    - Return: `isSupported`, `permissionDenied`, `status`, `duration`, `audioBlob`, `startRecording`, `pauseRecording`, `resumeRecording`, `stopRecording`, `resetRecording`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9_
  - [ ]* 6.2 Tulis property test untuk state machine audio recorder (Property 1)
    - **Property 1: Validitas Transisi State Audio Recorder**
    - File: `frontend/src/surveyor/hooks/__tests__/useAudioRecorder.property.test.js`
    - Gunakan fast-check untuk generate urutan aksi acak, verifikasi setiap transisi menghasilkan state yang valid dan transisi invalid menjadi no-op
    - **Validates: Requirements 1.1, 1.4, 1.5, 1.6**

- [x] 7. Frontend — Hook usePhotoCapture
  - [x] 7.1 Buat hook `frontend/src/surveyor/hooks/usePhotoCapture.js`
    - Validasi ukuran file (maks 5 MB) dan tipe MIME (JPEG, PNG, WEBP) di hook
    - Preview URL via `URL.createObjectURL()`, di-revoke saat hapus atau unmount
    - Return: `photos`, `addPhoto`, `removePhoto`, `clearPhotos`, `getPhotoBlobs`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.10_
  - [ ]* 7.2 Tulis property test untuk validasi file foto (Property 3)
    - **Property 3: Validasi File Foto**
    - File: `frontend/src/surveyor/hooks/__tests__/usePhotoCapture.property.test.js`
    - Gunakan fast-check untuk generate kombinasi MIME type dan ukuran, verifikasi acceptance/rejection sesuai aturan
    - **Validates: Requirements 3.8, 3.9, 3.10**
  - [ ]* 7.3 Tulis property test untuk invariant koleksi multi-foto (Property 4)
    - **Property 4: Invariant Koleksi Multi-Foto**
    - File: `frontend/src/surveyor/hooks/__tests__/usePhotoCapture.property.test.js`
    - Gunakan fast-check untuk generate urutan add/remove, verifikasi panjang array selalu konsisten
    - **Validates: Requirements 3.3, 3.5**

- [x] 8. Frontend — Hook useSignaturePad
  - [x] 8.1 Buat hook `frontend/src/surveyor/hooks/useSignaturePad.js`
    - Simpan array of strokes (setiap stroke = array of points `{x, y}`)
    - Event handling: `pointerdown` → mulai stroke, `pointermove` → tambah point, `pointerup` → akhiri stroke
    - Render ulang canvas dari strokes array setelah undo/clear
    - `toBlob()` menggunakan `canvas.toBlob('image/png')` wrapped dalam Promise
    - Return: `canvasRef`, `isEmpty`, `strokeCount`, `clear`, `undo`, `toBlob`, `toPngDataUrl`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 8.2 Tulis property test untuk clear signature pad (Property 5)
    - **Property 5: Clear Signature Pad Mengembalikan State Kosong**
    - File: `frontend/src/surveyor/hooks/__tests__/useSignaturePad.property.test.js`
    - Gunakan fast-check untuk generate urutan goresan acak, panggil clear, verifikasi `isEmpty === true` dan `strokeCount === 0`
    - **Validates: Requirements 4.3**
  - [ ]* 8.3 Tulis property test untuk undo signature pad (Property 6)
    - **Property 6: Undo Signature Pad Menghapus Goresan Terakhir**
    - File: `frontend/src/surveyor/hooks/__tests__/useSignaturePad.property.test.js`
    - Gunakan fast-check untuk generate N goresan, panggil undo, verifikasi `strokeCount === N - 1`. Undo N kali → `isEmpty === true`. Undo pada canvas kosong → no-op.
    - **Validates: Requirements 4.4**

- [x] 9. Checkpoint — Pastikan semua test hooks lulus
  - Jalankan test suite frontend, pastikan semua test lulus. Tanyakan ke pengguna jika ada pertanyaan.

- [x] 10. Frontend — Komponen presentasi
  - [x] 10.1 Buat komponen `frontend/src/surveyor/components/AudioRecorderPanel.jsx`
    - Panel sticky di atas/bawah SurveyForm
    - Tombol: Mulai Rekam / Jeda / Lanjutkan / Berhenti (visibility berdasarkan status)
    - Indikator durasi berjalan dan status "Merekam" / "Dijeda"
    - Ukuran sentuh minimal 44×44px, label ARIA pada semua kontrol
    - Pesan jika browser tidak mendukung atau izin ditolak
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 6.1, 6.4, 6.5_
  - [x] 10.2 Buat komponen `frontend/src/surveyor/components/PhotoCapturePanel.jsx`
    - Input file dengan `accept="image/jpeg,image/png,image/webp"` dan `capture="environment"`
    - Grid thumbnail preview dengan tombol hapus per foto
    - Pesan error untuk file terlalu besar atau format tidak didukung
    - Ukuran sentuh minimal 44×44px, label ARIA
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.8, 3.9, 3.10, 6.2, 6.4, 6.5_
  - [x] 10.3 Buat komponen `frontend/src/surveyor/components/SignaturePadCanvas.jsx`
    - Canvas responsif (lebar 100% container, tinggi 200px)
    - Tombol "Hapus" dan "Ulangi" di bawah canvas
    - Border merah jika `hasError` dan canvas kosong
    - `touch-action: none` pada canvas untuk mencegah scroll saat menggambar
    - Ukuran sentuh minimal 44×44px, label ARIA
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.10, 6.3, 6.4, 6.5_
  - [ ]* 10.4 Tulis unit test untuk komponen AudioRecorderPanel
    - File: `frontend/src/surveyor/components/__tests__/AudioRecorderPanel.test.jsx`
    - Test: render states, button visibility per status, ARIA labels, pesan tidak didukung
    - _Requirements: 1.1, 1.2, 1.4, 1.8, 1.9, 6.5_
  - [ ]* 10.5 Tulis unit test untuk komponen PhotoCapturePanel
    - File: `frontend/src/surveyor/components/__tests__/PhotoCapturePanel.test.jsx`
    - Test: thumbnail preview, delete button, error messages, ARIA labels
    - _Requirements: 3.2, 3.4, 3.9, 3.10, 6.5_
  - [ ]* 10.6 Tulis unit test untuk komponen SignaturePadCanvas
    - File: `frontend/src/surveyor/components/__tests__/SignaturePadCanvas.test.jsx`
    - Test: canvas render, clear/undo buttons, required validation error, ARIA labels
    - _Requirements: 4.1, 4.3, 4.4, 4.10, 6.5_

- [x] 11. Frontend — Enhanced useSyncManager
  - [x] 11.1 Update `frontend/src/surveyor/hooks/useSyncManager.js` untuk media-first upload
    - Untuk setiap pending entry, ambil media files dari `media_files` store via `getMediaFilesByLocalId`
    - Upload setiap media file ke endpoint yang sesuai (`/upload/audio`, `/upload/photo`, `/upload/signature`)
    - Kumpulkan path hasil upload
    - Sertakan path dalam payload submit respons (`audio_path`, `photo_paths`, `signature_path`, `start_latitude`, `start_longitude`, `start_geo_status`)
    - Setelah berhasil, hapus media files dari IndexedDB via `deleteMediaFilesByLocalId`
    - _Requirements: 5.3, 5.4, 5.5, 5.7, 1.10, 3.7, 4.7_
  - [ ]* 11.2 Tulis property test untuk pembersihan media setelah sinkronisasi (Property 9)
    - **Property 9: Pembersihan Media Setelah Sinkronisasi Berhasil**
    - File: `frontend/src/surveyor/hooks/__tests__/useSyncManager.property.test.js`
    - Gunakan fast-check untuk generate entri offline queue dengan media, simulasi sync sukses, verifikasi `getMediaFilesByLocalId` mengembalikan array kosong
    - **Validates: Requirements 5.7**

- [x] 12. Frontend — Integrasi SurveyForm.jsx
  - [x] 12.1 Integrasi hooks dan komponen di `frontend/src/surveyor/pages/SurveyForm.jsx`
    - Import dan inisialisasi `useAudioRecorder`, `usePhotoCapture`, `useSignaturePad`
    - Panggil `getLocation()` saat form dimuat untuk start coordinates, simpan di state
    - Render `AudioRecorderPanel` di sticky header/footer
    - Render `PhotoCapturePanel` di body formulir
    - Render `SignaturePadCanvas` sebelum tombol submit
    - _Requirements: 6.1, 6.2, 6.3, 2.1_
  - [x] 12.2 Implementasi submit online dengan media upload
    - Saat submit online: upload audio blob → upload foto blobs → upload signature blob → kumpulkan paths
    - Sertakan `audio_path`, `photo_paths`, `signature_path`, `start_latitude`, `start_longitude`, `start_geo_status` dalam payload `POST /responses/submit`
    - _Requirements: 1.10, 1.12, 3.7, 3.11, 4.7, 4.9, 2.2, 2.3_
  - [x] 12.3 Implementasi submit offline dengan penyimpanan media ke IndexedDB
    - Simpan audio blob, foto blobs, signature blob ke `media_files` store via `saveMediaFile`
    - Simpan metadata (`has_audio`, `has_signature`, `photo_count`, `start_geo`) ke `offline_queue` via `enqueueResponse`
    - _Requirements: 1.7, 3.6, 4.6, 5.1, 5.2, 2.5_
  - [x] 12.4 Validasi tanda tangan wajib sebelum submit
    - Jika tanda tangan bersifat wajib dan canvas kosong, tampilkan pesan "Tanda tangan wajib diisi" dan blokir submit
    - _Requirements: 4.10_

- [x] 13. Checkpoint akhir — Pastikan semua test lulus
  - Jalankan seluruh test suite (backend dan frontend), pastikan semua test lulus. Tanyakan ke pengguna jika ada pertanyaan.

## Catatan

- Task bertanda `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan persyaratan spesifik untuk traceability
- Checkpoint memastikan validasi inkremental di setiap milestone
- Property tests memvalidasi properti kebenaran universal dari dokumen desain
- Unit tests memvalidasi contoh spesifik dan edge cases
