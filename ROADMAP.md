# Roadmap Pengembangan Web Survey Platform

Dokumen ini berisi rencana pengembangan fitur lanjutan yang siap diimplementasikan.
Setiap fitur sudah dianalisis dan dapat langsung dibuatkan spec oleh Kiro.

---

## Cara Menggunakan Dokumen Ini

Ketika siap mengimplementasikan suatu fitur, cukup minta Kiro:
> "Buatkan spec untuk fitur [nama fitur] sesuai ROADMAP.md"

Kiro akan membuat requirements, design, dan tasks secara otomatis berdasarkan deskripsi di bawah.

---

## Fitur 1: Deadline & Status Survei

**Prioritas:** 🔴 Tinggi  
**Estimasi Kompleksitas:** Kecil-Menengah  
**Spec path yang akan dibuat:** `.kiro/specs/survey-deadline/`

### Deskripsi
Tambahkan kemampuan admin/supervisor untuk menetapkan tanggal mulai (`start_date`) dan tanggal berakhir (`end_date`) pada setiap survei. Survei otomatis tidak bisa diisi ketika belum dimulai atau sudah melewati deadline.

### Perubahan yang Diperlukan

**Database:**
- Tambah kolom `start_date TIMESTAMPTZ` (nullable) ke tabel `surveys`
- Tambah kolom `end_date TIMESTAMPTZ` (nullable) ke tabel `surveys`
- Buat migration baru (jangan ubah migration lama)

**Backend:**
- Update `POST /responses/start`: tolak dengan HTTP 409 jika survei belum dimulai atau sudah expired
- Update `GET /surveys` untuk surveyor: filter hanya survei yang sedang dalam periode aktif
- Tambahkan field `start_date`, `end_date`, dan `is_expired` di response `GET /surveys/:id`
- Opsional: cron job atau check saat request untuk auto-deactivate survei yang expired

**Frontend:**
- `SurveyBuilder.jsx`: tambah date picker untuk `start_date` dan `end_date`
- `Surveys.jsx`: tampilkan badge "Akan Datang", "Aktif", "Berakhir" berdasarkan tanggal
- `SurveyList.jsx` (surveyor): tampilkan sisa hari sebelum deadline
- Blokir tombol "Mulai Isi" jika survei expired atau belum dimulai

### Correctness Properties
1. Survei dengan `end_date` di masa lalu tidak bisa menerima responden baru
2. Survei dengan `start_date` di masa depan tidak bisa diisi meskipun statusnya `active`
3. `end_date` harus selalu lebih besar dari `start_date` jika keduanya diisi

---

## Fitur 2: Dashboard Progress Real-time

**Prioritas:** 🔴 Tinggi  
**Estimasi Kompleksitas:** Menengah  
**Spec path yang akan dibuat:** `.kiro/specs/dashboard-progress/`

### Deskripsi
Perkaya halaman dashboard dengan informasi progress pengumpulan data yang lebih detail: progress setiap surveyor vs target kuota, completion rate per survei, dan daftar surveyor yang belum mencapai target.

### Perubahan yang Diperlukan

**Backend — Endpoint Baru:**
- `GET /dashboard/survey-progress/:surveyId` — progress per survei:
  - Total target kuota (sum semua surveyor)
  - Total responden terkumpul
  - Persentase completion
  - Breakdown per surveyor: nama, kuota, terkumpul, persentase, sisa
- `GET /dashboard/surveyor-summary` — ringkasan semua surveyor aktif:
  - Nama surveyor
  - Jumlah survei aktif yang ditugaskan
  - Total responden hari ini
  - Status: on-track / behind / completed

**Frontend:**
- `Dashboard.jsx`: tambah section "Progress Survei Aktif"
  - Card per survei aktif dengan progress bar
  - Tabel breakdown per surveyor
- Tambah komponen `SurveyProgressCard.jsx`
- Tambah komponen `SurveyorProgressTable.jsx`
- Filter berdasarkan survei (dropdown pilih survei)

### Correctness Properties
1. Total responden di dashboard selalu konsisten dengan jumlah di tabel `responses`
2. Persentase completion tidak pernah melebihi 100% meskipun responden melebihi kuota
3. Surveyor yang tidak memiliki kuota di survei tertentu tidak muncul di breakdown survei tersebut

---

## Fitur 3: Ganti Password & Profil Self-Service

**Prioritas:** 🔴 Tinggi  
**Estimasi Kompleksitas:** Kecil  
**Spec path yang akan dibuat:** `.kiro/specs/user-profile-self-service/`

### Deskripsi
Semua pengguna (admin, supervisor, viewer, surveyor) dapat mengganti password mereka sendiri dan memperbarui nama tampilan tanpa perlu bantuan admin.

### Perubahan yang Diperlukan

**Backend — Endpoint Baru:**
- `GET /auth/me` — sudah ada, pastikan mengembalikan data lengkap (name, email, role)
- `PATCH /auth/change-password` — ganti password:
  - Body: `{ current_password, new_password }`
  - Validasi: `current_password` harus cocok dengan hash di DB
  - Validasi: `new_password` harus memenuhi aturan (min 8 karakter, huruf besar, kecil, angka)
  - Validasi: `new_password` tidak boleh sama dengan `current_password`
  - Audit log: `CHANGE_PASSWORD` dengan `user_id` dan `ip_address`
- `PATCH /auth/update-profile` — update nama:
  - Body: `{ name }`
  - Validasi: nama tidak boleh kosong
  - Audit log: `UPDATE_PROFILE`

**Frontend:**
- Tambah halaman `Profile.jsx` yang dapat diakses semua role
- Form ganti password dengan field: password lama, password baru, konfirmasi password baru
- Form update nama
- Tambah menu "Profil" di sidebar/navbar untuk semua role
- Update `localStorage` setelah nama berhasil diubah

### Correctness Properties
1. Ganti password selalu memerlukan verifikasi password lama yang benar
2. Password baru yang tidak memenuhi aturan selalu ditolak, terlepas dari role pengguna
3. Setelah ganti password berhasil, token lama tetap valid hingga expired (tidak force logout)

---

## Fitur 4: Clone/Duplikasi Survei

**Prioritas:** 🟡 Menengah  
**Estimasi Kompleksitas:** Kecil  
**Spec path yang akan dibuat:** `.kiro/specs/survey-clone/`

### Deskripsi
Admin dan supervisor dapat menduplikasi survei yang sudah ada (termasuk semua pertanyaan dan konfigurasi skip logic) menjadi survei baru dengan status draft.

### Perubahan yang Diperlukan

**Backend:**
- `POST /surveys/:id/clone` — duplikasi survei:
  - Salin semua field survei kecuali `id`, `status` (set ke `draft`), `created_at`, `updated_at`
  - Salin semua pertanyaan dengan `order_index`, `skip_logic`, `options` yang sama
  - Judul survei baru: `"Salinan dari {judul asli}"`
  - Audit log: `CLONE_SURVEY`
  - Kembalikan survei baru yang sudah dibuat

**Frontend:**
- `Surveys.jsx`: tambah tombol "Duplikasi" di kolom aksi setiap baris
- Setelah duplikasi berhasil, redirect ke `SurveyBuilder` survei baru
- Tampilkan notifikasi sukses

### Correctness Properties
1. Survei hasil clone memiliki semua pertanyaan yang sama persis dengan survei asli
2. Survei hasil clone selalu berstatus `draft` terlepas dari status survei asli
3. Perubahan pada survei hasil clone tidak mempengaruhi survei asli

---

## Fitur 5: Tipe Pertanyaan Rating Scale

**Prioritas:** 🟡 Menengah  
**Estimasi Kompleksitas:** Menengah  
**Spec path yang akan dibuat:** `.kiro/specs/rating-scale-question/`

### Deskripsi
Tambahkan tipe pertanyaan baru: **rating scale** (skala 1–5 atau 1–10) dengan tampilan bintang atau angka. Cocok untuk survei kepuasan dan opini.

### Perubahan yang Diperlukan

**Database:**
- Tidak ada perubahan skema — gunakan kolom `options` (JSONB) yang sudah ada untuk menyimpan konfigurasi: `{ min: 1, max: 5, display: "stars" | "numbers", labels: { min: "Sangat Tidak Puas", max: "Sangat Puas" } }`
- Tambahkan `rating_scale` ke CHECK constraint kolom `type` di tabel `questions`

**Backend:**
- Update validasi tipe pertanyaan di `questions.js` untuk menerima `rating_scale`
- Update logika ekspor Excel/CSV untuk menampilkan nilai numerik rating

**Frontend:**
- `SurveyBuilder.jsx`: tambah opsi tipe "Rating Scale" dengan konfigurasi min/max dan label
- `SurveyForm.jsx` (surveyor): render komponen rating (bintang atau angka yang bisa diklik)
- `ResponseDetail.jsx`: tampilkan nilai rating dengan visual yang sesuai

### Correctness Properties
1. Nilai rating yang disimpan selalu bilangan bulat dalam rentang [min, max]
2. Pertanyaan rating dengan `is_required = true` tidak bisa disubmit tanpa nilai

---

## Fitur 6: Flag & Catatan pada Responden

**Prioritas:** 🟡 Menengah  
**Estimasi Kompleksitas:** Kecil-Menengah  
**Spec path yang akan dibuat:** `.kiro/specs/response-review/`

### Deskripsi
Supervisor dan admin dapat menandai (flag) responden yang mencurigakan dan menambahkan catatan review. Berguna untuk quality control data lapangan.

### Perubahan yang Diperlukan

**Database:**
- Tambah kolom `review_status ENUM('unreviewed', 'flagged', 'verified')` ke tabel `responses` (default: `unreviewed`)
- Tambah kolom `review_note TEXT` (nullable) ke tabel `responses`
- Tambah kolom `reviewed_by UUID FK` (nullable, references users) ke tabel `responses`
- Tambah kolom `reviewed_at TIMESTAMPTZ` (nullable) ke tabel `responses`

**Backend:**
- `PATCH /responses/:id/review` — update status dan catatan:
  - Body: `{ review_status, review_note }`
  - Hanya admin dan supervisor yang bisa akses
  - Audit log: `REVIEW_RESPONSE`
- Update `GET /responses`: tambah filter `review_status`

**Frontend:**
- `Responses.jsx`: tambah kolom "Status Review" dan filter berdasarkan status
- `ResponseDetail.jsx`: tambah panel review di sidebar dengan dropdown status dan textarea catatan
- Badge visual: merah untuk "flagged", hijau untuk "verified", abu-abu untuk "unreviewed"

### Correctness Properties
1. Hanya admin dan supervisor yang dapat mengubah review status
2. Surveyor tidak dapat melihat review status dan catatan pada respondennya sendiri

---

## Ringkasan Urutan Implementasi

### Fitur Awal (dari Roadmap v1)

| # | Fitur | Prioritas | Kompleksitas | Spec Path | Status |
|---|-------|-----------|--------------|-----------|--------|
| 1 | Deadline & Status Survei | 🔴 Tinggi | Kecil-Menengah | `.kiro/specs/survey-deadline/` | ✅ Selesai |
| 2 | Dashboard Progress Real-time | 🔴 Tinggi | Menengah | `.kiro/specs/dashboard-progress/` | ✅ Selesai |
| 3 | Ganti Password & Profil | 🔴 Tinggi | Kecil | `.kiro/specs/user-profile-self-service/` | 📝 Requirements |
| 4 | Clone/Duplikasi Survei | 🟡 Menengah | Kecil | `.kiro/specs/survey-clone/` | ✅ Selesai |
| 5 | Rating Scale Question | 🟡 Menengah | Menengah | `.kiro/specs/rating-scale-question/` | ✅ Selesai |
| 6 | Flag & Catatan Responden | 🟡 Menengah | Kecil-Menengah | `.kiro/specs/response-review/` | 📝 Requirements |

### Fitur Tambahan (dari Roadmap v2)

| # | Fitur | Prioritas | Kompleksitas | Spec Path | Status |
|---|-------|-----------|--------------|-----------|--------|
| 7 | Kuota Enforcement & Surveyor Management | 🔴 Tinggi | Besar | `.kiro/specs/quota-enforcement-and-surveyor-management/` | ✅ Selesai |
| 8 | Phone & Unique ID Questions | 🟡 Menengah | Menengah | `.kiro/specs/phone-and-unique-id-questions/` | ✅ Selesai |
| 9 | Admin Delete User | 🟡 Menengah | Kecil | `.kiro/specs/admin-delete-user/` | ✅ Selesai |
| 10 | Role-Based Access Control | 🔴 Tinggi | Menengah | `.kiro/specs/role-based-access-control/` | ✅ Selesai |

### Fitur Baru (Gap Analysis vs App Survey Lapangan)

| # | Fitur | Prioritas | Kompleksitas | Spec Path | Status |
|---|-------|-----------|--------------|-----------|--------|
| 11 | Offline Mode (PWA) | 🔴 Tinggi | Besar | `.kiro/specs/offline-mode-pwa/` | 📝 Requirements |
| 12 | Validasi Jawaban | 🟡 Menengah | Menengah | `.kiro/specs/answer-validation/` | 📝 Requirements |
| 13 | Tipe Pertanyaan Tambahan (time, matrix) | 🟡 Menengah | Menengah | `.kiro/specs/additional-question-types/` | 📐 Design |

### Fitur Non-Spec (Implementasi Langsung)

| # | Fitur | Status |
|---|-------|--------|
| — | Grid/Explorer view untuk pemilihan survei (Reports & Map) | ✅ Selesai |
| — | Filter status respons (committed/pending) di export | ✅ Selesai |
| — | Pembersihan data otomatis & manual (Cleanup) | ✅ Selesai |
| — | Kuota langsung saat tambah surveyor | ✅ Selesai |

### Legenda Status

| Simbol | Arti |
|--------|------|
| ✅ Selesai | Implementasi selesai (requirements + design + tasks + kode) |
| 📐 Design | Requirements dan design selesai, tasks belum dibuat |
| 📝 Requirements | Requirements selesai, design dan tasks belum dibuat |
| ❌ Belum | Belum dimulai |

---

## Catatan Teknis

- Semua fitur menggunakan stack yang sudah ada: Node.js + Express + Sequelize + React + Vite
- Setiap fitur memerlukan migration database baru (tidak mengubah migration lama)
- Setiap fitur akan dilengkapi unit tests dan property-based tests (fast-check)
- Backend dan frontend diimplementasikan bersamaan dalam satu spec
