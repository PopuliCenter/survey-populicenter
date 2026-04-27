# Implementation Plan: Grid View Toggle

## Overview

Rencana implementasi ini menambahkan fitur toggle tampilan grid/card pada halaman Manajemen Survei dan Manajemen Surveyor. Implementasi dilakukan secara inkremental — dimulai dari komponen reusable (ViewToggle, hook), lalu komponen kartu (SurveyCard, SurveyorCard), dan terakhir integrasi ke halaman existing. Semua perubahan murni frontend, tidak ada perubahan backend.

## Tasks

- [-] 1. Buat komponen ViewToggle dan hook useViewMode
  - [x] 1.1 Implementasi hook `useViewMode` dan komponen `ViewToggle`
    - Buat file `frontend/src/components/ViewToggle.jsx`
    - Implementasi custom hook `useViewMode(storageKey)` yang mengelola state view mode dengan localStorage
    - Hook mengembalikan `[viewMode, handleViewChange]` — baca dari localStorage saat init, simpan saat berubah
    - Jika localStorage kosong atau nilai tidak valid, default ke `'table'`
    - Gunakan `try/catch` pada read/write localStorage untuk handle private browsing atau storage penuh
    - Implementasi komponen `ViewToggle` yang menerima props `viewMode` dan `onViewChange`
    - Tampilkan dua tombol ikon SVG inline: ikon tabel (garis horizontal) dan ikon grid (kotak-kotak)
    - Tombol aktif: `bg-blue-100 text-blue-700`; tombol tidak aktif: `bg-gray-50 text-gray-400`
    - Tambahkan `aria-label` ("Tampilan Tabel" / "Tampilan Grid") dan `aria-pressed` pada setiap tombol
    - Kelompokkan tombol dalam container dengan `role="group"` dan `aria-label="Pilih mode tampilan"`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.4_

  - [ ]* 1.2 Tulis property test: Preference persistence round-trip
    - **Property 1: Preference persistence round-trip**
    - Generate random valid mode (`'table'` atau `'grid'`) dan storage key, simpan via hook, baca kembali, verifikasi kesamaan
    - File test: `frontend/src/components/__tests__/ViewToggle.test.jsx`
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 1.3 Tulis unit tests untuk ViewToggle dan useViewMode
    - Test ViewToggle menampilkan dua tombol dengan ikon yang benar
    - Test tombol aktif memiliki styling yang berbeda (bg-blue-100)
    - Test klik tombol tabel memanggil `onViewChange('table')`
    - Test klik tombol grid memanggil `onViewChange('grid')`
    - Test `aria-label` dan `aria-pressed` sesuai status aktif
    - Test `useViewMode` default ke `'table'` ketika localStorage kosong
    - File test: `frontend/src/components/__tests__/ViewToggle.test.jsx`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.4_

- [-] 2. Buat komponen SurveyCard
  - [x] 2.1 Implementasi komponen `SurveyCard`
    - Buat file `frontend/src/components/SurveyCard.jsx`
    - Import dan gunakan `SurveyStatusBadge` dan `TemporalBadge` dari `Surveys.jsx` (ekstrak ke file terpisah atau export dari Surveys.jsx)
    - Layout kartu: header (judul truncated + badges), body (metadata: pertanyaan, responden, tanggal), footer (tombol aksi)
    - Styling: `bg-white rounded-xl shadow border border-gray-100 hover:shadow-md transition-shadow p-5`
    - Judul survei ditampilkan dengan `truncate` class dan atribut `title` untuk tooltip
    - Tombol aksi: Builder, Duplikasi, Aktifkan/Nonaktifkan, Hapus — sesuai kondisi status dan response_count
    - Konfirmasi inline untuk Hapus (draft tanpa responden) dan Nonaktifkan (aktif) — pola sama dengan tabel
    - Terima semua callback aksi melalui props dari halaman induk
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 2.2 Tulis property test: Survey card displays all required information
    - **Property 2: Survey card displays all required information**
    - Generate random survey objects via `fc.record()`, render `SurveyCard`, verifikasi semua field ada di DOM
    - File test: `frontend/src/components/__tests__/SurveyCard.test.jsx`
    - **Validates: Requirements 3.2, 6.4**

  - [ ]* 2.3 Tulis property test: Survey card action buttons match survey state
    - **Property 3: Survey card action buttons match survey state**
    - Generate surveys dengan random status dan response_count, verifikasi tombol aksi yang benar muncul
    - File test: `frontend/src/components/__tests__/SurveyCard.test.jsx`
    - **Validates: Requirements 3.3, 3.5, 3.6**

  - [ ]* 2.4 Tulis unit tests untuk SurveyCard
    - Test konfirmasi inline delete untuk draft survey tanpa responden
    - Test konfirmasi inline deactivate untuk active survey
    - Test tombol Builder dan Duplikasi selalu tampil
    - Test truncation judul panjang dengan atribut `title`
    - File test: `frontend/src/components/__tests__/SurveyCard.test.jsx`
    - _Requirements: 3.2, 3.3, 3.5, 3.6, 6.4_

- [-] 3. Buat komponen SurveyorCard
  - [x] 3.1 Implementasi komponen `SurveyorCard`
    - Buat file `frontend/src/components/SurveyorCard.jsx`
    - Import dan gunakan `StatusBadge` dari `Surveyors.jsx` (ekstrak ke file terpisah atau export)
    - Import dan gunakan `QuotaPanel` dari `Surveyors.jsx` (ekstrak ke file terpisah atau export)
    - Layout kartu: header (nama truncated + badge status), body (email, responden, tanggal bergabung), footer (tombol aksi)
    - Styling: sama dengan SurveyCard — `bg-white rounded-xl shadow border border-gray-100 hover:shadow-md transition-shadow p-5`
    - Nama surveyor ditampilkan dengan `truncate` class dan atribut `title` untuk tooltip
    - Tombol aksi: Lihat Kuota, Edit, Nonaktifkan/Aktifkan, Hapus (admin only)
    - Konfirmasi inline untuk Nonaktifkan dan Hapus — pola sama dengan tabel
    - Panel kuota (`QuotaPanel`) ditampilkan di bawah footer ketika "Lihat Kuota" aktif
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 3.2 Tulis property test: Surveyor card displays all required information
    - **Property 4: Surveyor card displays all required information**
    - Generate random surveyor objects, render `SurveyorCard`, verifikasi semua field ada di DOM
    - File test: `frontend/src/components/__tests__/SurveyorCard.test.jsx`
    - **Validates: Requirements 4.2, 6.4**

  - [ ]* 3.3 Tulis property test: Surveyor card action buttons match surveyor state and user role
    - **Property 5: Surveyor card action buttons match surveyor state and user role**
    - Generate surveyors dengan random `is_active` dan user roles, verifikasi tombol aksi yang benar muncul
    - File test: `frontend/src/components/__tests__/SurveyorCard.test.jsx`
    - **Validates: Requirements 4.3, 4.6**

  - [ ]* 3.4 Tulis unit tests untuk SurveyorCard
    - Test panel kuota muncul saat tombol "Lihat Kuota" diklik
    - Test konfirmasi inline deactivate untuk surveyor aktif
    - Test tombol Hapus hanya muncul untuk admin
    - Test truncation nama panjang dengan atribut `title`
    - File test: `frontend/src/components/__tests__/SurveyorCard.test.jsx`
    - _Requirements: 4.2, 4.3, 4.5, 4.6, 6.4_

- [x] 4. Checkpoint - Pastikan semua komponen dan test berjalan
  - Ensure all tests pass, ask the user if questions arise.

- [-] 5. Integrasi ViewToggle dan SurveyCard ke Surveys.jsx
  - [x] 5.1 Modifikasi Surveys.jsx untuk mendukung grid view
    - Import `ViewToggle` dan `useViewMode` dari `ViewToggle.jsx`
    - Import `SurveyCard` dari `SurveyCard.jsx`
    - Tambahkan `useViewMode('surveys_view_mode')` untuk mengelola state view mode
    - Tambahkan `ViewToggle` di header halaman, di antara judul dan tombol "Buat Survei"
    - Implementasi conditional rendering: jika `viewMode === 'grid'`, render grid kartu; jika `'table'`, render tabel existing
    - Grid layout: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
    - Pastikan loading state, error state, dan empty state konsisten di kedua mode tampilan
    - Teruskan semua callback aksi (builder, clone, activate, deactivate, delete) ke `SurveyCard`
    - Ekstrak `SurveyStatusBadge` dan `TemporalBadge` ke file terpisah jika belum, agar bisa digunakan oleh `SurveyCard`
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.2, 3.1, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.2 Tulis unit tests untuk integrasi Surveys grid view
    - Test halaman menampilkan grid ketika viewMode adalah 'grid'
    - Test halaman menampilkan tabel ketika viewMode adalah 'table'
    - Test loading/error/empty state konsisten di kedua mode
    - File test: `frontend/src/pages/__tests__/Surveys.test.jsx`
    - _Requirements: 3.1, 5.4, 5.5_

- [-] 6. Integrasi ViewToggle dan SurveyorCard ke Surveyors.jsx
  - [x] 6.1 Modifikasi Surveyors.jsx untuk mendukung grid view
    - Import `ViewToggle` dan `useViewMode` dari `ViewToggle.jsx`
    - Import `SurveyorCard` dari `SurveyorCard.jsx`
    - Tambahkan `useViewMode('surveyors_view_mode')` untuk mengelola state view mode
    - Tambahkan `ViewToggle` di header halaman, di antara judul dan tombol-tombol aksi
    - Implementasi conditional rendering: jika `viewMode === 'grid'`, render grid kartu; jika `'table'`, render tabel existing
    - Grid layout: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
    - Pastikan loading state, error state, dan empty state konsisten di kedua mode tampilan
    - Teruskan semua callback aksi (edit, activate, deactivate, delete, toggleQuota) ke `SurveyorCard`
    - Ekstrak `StatusBadge` dan `QuotaPanel` ke file terpisah jika belum, agar bisa digunakan oleh `SurveyorCard`
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.3, 4.1, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.2 Tulis unit tests untuk integrasi Surveyors grid view
    - Test halaman menampilkan grid ketika viewMode adalah 'grid'
    - Test halaman menampilkan tabel ketika viewMode adalah 'table'
    - Test loading/error/empty state konsisten di kedua mode
    - File test: `frontend/src/pages/__tests__/Surveyors.test.jsx`
    - _Requirements: 4.1, 5.4, 5.5_

- [x] 7. Final checkpoint - Pastikan semua test pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks yang ditandai `*` bersifat opsional dan dapat dilewati untuk MVP lebih cepat
- Setiap task mereferensikan persyaratan spesifik untuk traceability
- Checkpoint memastikan validasi inkremental
- Property tests memvalidasi correctness properties universal dari dokumen desain (Property 1–5)
- Unit tests memvalidasi contoh spesifik dan edge cases
- Semua test frontend menggunakan Vitest + React Testing Library + fast-check
- File test mengikuti pola existing di `frontend/src/components/__tests__/`
- Tidak ada perubahan backend — semua implementasi murni frontend
