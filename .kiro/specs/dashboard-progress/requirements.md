# Requirements Document

## Introduction

Fitur ini memperkaya halaman dashboard dengan informasi progress pengumpulan data yang lebih detail. Fitur mencakup:

1. **Backend — Endpoint Progress per Survei:** `GET /dashboard/survey-progress/:surveyId` yang menampilkan total target kuota, total responden terkumpul, persentase completion, dan breakdown per surveyor (nama, kuota, terkumpul, persentase, sisa).
2. **Backend — Endpoint Ringkasan Surveyor:** `GET /dashboard/surveyor-summary` yang menampilkan ringkasan semua surveyor aktif: nama, jumlah survei aktif yang ditugaskan, total responden hari ini, dan status (on-track / behind / completed).
3. **Frontend — Section Progress Survei Aktif:** Penambahan section baru di `Dashboard.jsx` yang menampilkan card per survei aktif dengan progress bar dan tabel breakdown per surveyor.
4. **Frontend — Komponen Baru:** `SurveyProgressCard.jsx` untuk menampilkan progress card per survei dan `SurveyorProgressTable.jsx` untuk menampilkan tabel breakdown surveyor.
5. **Frontend — Filter Survei:** Dropdown untuk memilih survei tertentu dan melihat detail progress-nya.

## Glossary

- **Dashboard_Router**: Router Express di `backend/src/routes/dashboard.js` yang menangani endpoint dashboard, termasuk endpoint baru untuk progress survei dan ringkasan surveyor.
- **Survey_Progress_Endpoint**: Endpoint `GET /dashboard/survey-progress/:surveyId` yang mengembalikan data progress pengumpulan data untuk satu survei tertentu.
- **Surveyor_Summary_Endpoint**: Endpoint `GET /dashboard/surveyor-summary` yang mengembalikan ringkasan performa semua surveyor aktif.
- **Progress_Calculator**: Logika di backend yang menghitung persentase completion berdasarkan jumlah responden terkumpul dibagi target kuota.
- **Surveyor_Status_Resolver**: Logika di backend yang menentukan status surveyor (on-track, behind, completed) berdasarkan perbandingan responden terkumpul dengan kuota yang ditugaskan.
- **Dashboard_Page**: Halaman `frontend/src/pages/Dashboard.jsx` yang menampilkan statistik ringkasan, grafik tren, top surveyor, dan section progress survei aktif yang baru.
- **Survey_Progress_Card**: Komponen `frontend/src/components/SurveyProgressCard.jsx` yang menampilkan card progress untuk satu survei aktif, termasuk progress bar dan ringkasan angka.
- **Surveyor_Progress_Table**: Komponen `frontend/src/components/SurveyorProgressTable.jsx` yang menampilkan tabel breakdown progress per surveyor dalam satu survei.
- **Survey_Filter_Dropdown**: Elemen dropdown di Dashboard_Page yang memungkinkan pengguna memilih survei tertentu untuk melihat detail progress.
- **Completion_Percentage**: Nilai persentase yang dihitung sebagai `(jumlah_responden / total_kuota) * 100`, dengan batas maksimum 100%.
- **Surveyor_Breakdown**: Data per surveyor dalam satu survei yang mencakup nama, kuota, jumlah terkumpul, persentase, dan sisa kuota.

---

## Requirements

### Requirement 1: Endpoint Progress per Survei

**User Story:** Sebagai admin/supervisor, saya ingin melihat progress pengumpulan data per survei, sehingga saya dapat memantau sejauh mana target kuota sudah tercapai.

#### Acceptance Criteria

1. WHEN admin atau supervisor mengakses `GET /dashboard/survey-progress/:surveyId` dengan `surveyId` yang valid, THE Survey_Progress_Endpoint SHALL mengembalikan HTTP 200 dengan objek yang berisi field `surveyId`, `surveyTitle`, `totalQuota`, `totalCollected`, `completionPercentage`, dan array `surveyors`.
2. THE Progress_Calculator SHALL menghitung `totalQuota` sebagai penjumlahan kolom `quota` dari semua baris di tabel `surveyor_quotas` yang memiliki `survey_id` sesuai parameter.
3. THE Progress_Calculator SHALL menghitung `totalCollected` sebagai jumlah baris di tabel `responses` yang memiliki `survey_id` sesuai parameter.
4. THE Progress_Calculator SHALL menghitung `completionPercentage` sebagai `(totalCollected / totalQuota) * 100` dibulatkan ke satu angka desimal.
5. WHEN `totalCollected` melebihi `totalQuota`, THE Progress_Calculator SHALL menetapkan `completionPercentage` dengan nilai maksimum 100.0.
6. WHEN tidak ada baris di tabel `surveyor_quotas` untuk survei tersebut (totalQuota bernilai 0), THE Progress_Calculator SHALL menetapkan `completionPercentage` dengan nilai 0.
7. THE Survey_Progress_Endpoint SHALL menyertakan array `surveyors` yang berisi Surveyor_Breakdown untuk setiap surveyor yang memiliki kuota di survei tersebut.
8. WHEN `surveyId` tidak ditemukan di tabel `surveys`, THE Survey_Progress_Endpoint SHALL mengembalikan HTTP 404 dengan pesan `"Survei tidak ditemukan"`.
9. WHEN pengguna dengan role selain admin atau supervisor mengakses endpoint, THE Survey_Progress_Endpoint SHALL mengembalikan HTTP 403.

---

### Requirement 2: Breakdown Progress per Surveyor dalam Satu Survei

**User Story:** Sebagai admin/supervisor, saya ingin melihat detail progress setiap surveyor dalam satu survei, sehingga saya dapat mengidentifikasi surveyor yang perlu bantuan atau sudah mencapai target.

#### Acceptance Criteria

1. THE Survey_Progress_Endpoint SHALL menyertakan setiap elemen dalam array `surveyors` dengan field: `surveyorId`, `surveyorName`, `quota`, `collected`, `percentage`, dan `remaining`.
2. THE Progress_Calculator SHALL menghitung `collected` per surveyor sebagai jumlah baris di tabel `responses` yang memiliki `survey_id` dan `surveyor_id` sesuai.
3. THE Progress_Calculator SHALL menghitung `percentage` per surveyor sebagai `(collected / quota) * 100` dibulatkan ke satu angka desimal, dengan nilai maksimum 100.0.
4. THE Progress_Calculator SHALL menghitung `remaining` per surveyor sebagai `quota - collected`, dengan nilai minimum 0 (tidak boleh negatif).
5. THE Survey_Progress_Endpoint SHALL hanya menyertakan surveyor yang memiliki baris di tabel `surveyor_quotas` untuk survei tersebut (surveyor tanpa kuota tidak muncul).
6. THE Survey_Progress_Endpoint SHALL mengurutkan array `surveyors` berdasarkan `percentage` secara menurun (surveyor dengan persentase tertinggi di atas).

---

### Requirement 3: Endpoint Ringkasan Surveyor Aktif

**User Story:** Sebagai admin/supervisor, saya ingin melihat ringkasan performa semua surveyor aktif, sehingga saya dapat memantau produktivitas dan mengidentifikasi surveyor yang tertinggal.

#### Acceptance Criteria

1. WHEN admin atau supervisor mengakses `GET /dashboard/surveyor-summary`, THE Surveyor_Summary_Endpoint SHALL mengembalikan HTTP 200 dengan array objek yang berisi field `surveyorId`, `surveyorName`, `activeSurveyCount`, `responsesToday`, dan `status`.
2. THE Surveyor_Summary_Endpoint SHALL hanya menyertakan pengguna dengan role `surveyor` dan `is_active` bernilai `true`.
3. THE Surveyor_Summary_Endpoint SHALL menghitung `activeSurveyCount` sebagai jumlah survei dengan status `active` yang memiliki baris di tabel `surveyor_quotas` untuk surveyor tersebut.
4. THE Surveyor_Summary_Endpoint SHALL menghitung `responsesToday` sebagai jumlah baris di tabel `responses` yang memiliki `surveyor_id` sesuai dan `created_at` pada hari ini (UTC).
5. THE Surveyor_Status_Resolver SHALL menetapkan `status` bernilai `"completed"` ketika total responden surveyor di semua survei aktif yang ditugaskan lebih besar dari atau sama dengan total kuota yang ditugaskan.
6. THE Surveyor_Status_Resolver SHALL menetapkan `status` bernilai `"on-track"` ketika total responden surveyor di semua survei aktif yang ditugaskan kurang dari total kuota, tetapi rasio `(total_collected / total_quota)` lebih besar dari atau sama dengan 0.5.
7. THE Surveyor_Status_Resolver SHALL menetapkan `status` bernilai `"behind"` ketika rasio `(total_collected / total_quota)` kurang dari 0.5.
8. WHEN surveyor aktif tidak memiliki kuota di survei aktif manapun, THE Surveyor_Summary_Endpoint SHALL tetap menyertakan surveyor tersebut dengan `activeSurveyCount` bernilai 0, `responsesToday` sesuai data, dan `status` bernilai `"on-track"`.
9. WHEN pengguna dengan role selain admin atau supervisor mengakses endpoint, THE Surveyor_Summary_Endpoint SHALL mengembalikan HTTP 403.

---

### Requirement 4: Section Progress Survei Aktif di Dashboard

**User Story:** Sebagai admin/supervisor, saya ingin melihat section progress survei aktif di halaman dashboard, sehingga saya dapat memantau semua survei yang sedang berjalan dalam satu tampilan.

#### Acceptance Criteria

1. THE Dashboard_Page SHALL menampilkan section baru berjudul "Progress Survei Aktif" di bawah section "Top 5 Surveyor" yang sudah ada.
2. THE Dashboard_Page SHALL mengambil daftar survei aktif dari endpoint `GET /surveys` yang sudah ada (filter status `active`) saat halaman dimuat.
3. WHEN terdapat survei aktif, THE Dashboard_Page SHALL menampilkan satu Survey_Progress_Card untuk setiap survei aktif.
4. WHEN tidak terdapat survei aktif, THE Dashboard_Page SHALL menampilkan pesan "Tidak ada survei aktif saat ini." di dalam section.
5. THE Dashboard_Page SHALL menampilkan Survey_Filter_Dropdown di atas daftar card untuk memfilter survei tertentu.
6. WHEN pengguna memilih survei dari Survey_Filter_Dropdown, THE Dashboard_Page SHALL menampilkan hanya Survey_Progress_Card untuk survei yang dipilih beserta Surveyor_Progress_Table di bawahnya.
7. WHEN pengguna memilih opsi "Semua Survei" dari Survey_Filter_Dropdown, THE Dashboard_Page SHALL menampilkan semua Survey_Progress_Card tanpa Surveyor_Progress_Table.

---

### Requirement 5: Komponen Survey Progress Card

**User Story:** Sebagai admin/supervisor, saya ingin melihat card progress per survei dengan progress bar visual, sehingga saya dapat dengan cepat menilai status pengumpulan data setiap survei.

#### Acceptance Criteria

1. THE Survey_Progress_Card SHALL menampilkan judul survei, progress bar visual, teks Completion_Percentage, dan teks `"X dari Y responden"` (X = totalCollected, Y = totalQuota).
2. THE Survey_Progress_Card SHALL menampilkan progress bar dengan lebar proporsional terhadap Completion_Percentage, dengan nilai maksimum lebar 100%.
3. WHEN Completion_Percentage bernilai 100, THE Survey_Progress_Card SHALL menampilkan progress bar berwarna hijau.
4. WHEN Completion_Percentage bernilai kurang dari 50, THE Survey_Progress_Card SHALL menampilkan progress bar berwarna merah.
5. WHEN Completion_Percentage bernilai antara 50 dan 99 (inklusif), THE Survey_Progress_Card SHALL menampilkan progress bar berwarna kuning.
6. THE Survey_Progress_Card SHALL menerima data progress melalui props dan tidak melakukan fetch API secara mandiri.
7. THE Survey_Progress_Card SHALL menampilkan atribut `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, dan `aria-valuemax="100"` pada elemen progress bar untuk aksesibilitas.

---

### Requirement 6: Komponen Surveyor Progress Table

**User Story:** Sebagai admin/supervisor, saya ingin melihat tabel breakdown progress per surveyor dalam satu survei, sehingga saya dapat mengidentifikasi surveyor mana yang sudah mencapai target dan mana yang masih tertinggal.

#### Acceptance Criteria

1. THE Surveyor_Progress_Table SHALL menampilkan tabel dengan kolom: "No", "Nama Surveyor", "Kuota", "Terkumpul", "Persentase", "Sisa".
2. THE Surveyor_Progress_Table SHALL menampilkan satu baris untuk setiap surveyor dalam array `surveyors` dari data Survey_Progress_Endpoint.
3. WHEN surveyor memiliki `percentage` bernilai 100, THE Surveyor_Progress_Table SHALL menampilkan badge berwarna hijau dengan teks "Selesai" di kolom persentase.
4. WHEN surveyor memiliki `percentage` kurang dari 50, THE Surveyor_Progress_Table SHALL menampilkan teks persentase berwarna merah.
5. WHEN array `surveyors` kosong, THE Surveyor_Progress_Table SHALL menampilkan pesan "Belum ada surveyor yang ditugaskan untuk survei ini."
6. THE Surveyor_Progress_Table SHALL menerima data melalui props dan tidak melakukan fetch API secara mandiri.
7. THE Surveyor_Progress_Table SHALL menampilkan elemen `<table>` dengan atribut `role="table"` dan header kolom menggunakan elemen `<th>` dengan atribut `scope="col"` untuk aksesibilitas.

---

### Requirement 7: Filter Dropdown Survei

**User Story:** Sebagai admin/supervisor, saya ingin dapat memfilter tampilan progress berdasarkan survei tertentu, sehingga saya dapat fokus pada survei yang ingin dipantau.

#### Acceptance Criteria

1. THE Survey_Filter_Dropdown SHALL menampilkan elemen `<select>` dengan opsi "Semua Survei" sebagai nilai default dan satu opsi untuk setiap survei aktif.
2. WHEN pengguna memilih survei tertentu, THE Dashboard_Page SHALL memanggil Survey_Progress_Endpoint dengan `surveyId` yang dipilih untuk mengambil data breakdown surveyor.
3. WHEN pengguna memilih "Semua Survei", THE Dashboard_Page SHALL menampilkan semua Survey_Progress_Card tanpa memanggil Survey_Progress_Endpoint untuk breakdown individual.
4. THE Survey_Filter_Dropdown SHALL menampilkan label "Pilih Survei" yang terhubung dengan elemen `<select>` melalui atribut `htmlFor` dan `id` untuk aksesibilitas.
5. WHEN data survei aktif sedang dimuat, THE Survey_Filter_Dropdown SHALL menampilkan opsi "Memuat..." dan menonaktifkan elemen `<select>`.

---

### Requirement 8: Konsistensi Data Responden di Dashboard

**User Story:** Sebagai admin/supervisor, saya ingin data responden yang ditampilkan di dashboard selalu konsisten dengan data aktual di database, sehingga saya dapat membuat keputusan berdasarkan informasi yang akurat.

#### Acceptance Criteria

1. THE Progress_Calculator SHALL menghitung `totalCollected` dengan melakukan query `COUNT` langsung ke tabel `responses` berdasarkan `survey_id`, tanpa menggunakan cache atau nilai yang disimpan terpisah.
2. THE Progress_Calculator SHALL menghitung `collected` per surveyor dengan melakukan query `COUNT` langsung ke tabel `responses` berdasarkan `survey_id` dan `surveyor_id`, tanpa menggunakan cache atau nilai yang disimpan terpisah.
3. FOR ALL survei yang valid, penjumlahan `collected` dari semua surveyor dalam array `surveyors` SHALL sama dengan `totalCollected` pada level survei, KETIKA semua responden dalam survei tersebut berasal dari surveyor yang memiliki kuota.
4. FOR ALL surveyor dalam array `surveyors`, nilai `collected` ditambah `remaining` SHALL sama dengan `quota` KETIKA `collected` kurang dari atau sama dengan `quota`.

---

### Requirement 9: Penanganan Error pada Endpoint Dashboard Progress

**User Story:** Sebagai developer, saya ingin endpoint dashboard progress menangani error secara konsisten, sehingga frontend dapat menampilkan pesan error yang informatif kepada pengguna.

#### Acceptance Criteria

1. WHEN terjadi error database saat memproses `GET /dashboard/survey-progress/:surveyId`, THE Survey_Progress_Endpoint SHALL mengembalikan HTTP 500 dengan pesan `"Terjadi kesalahan internal server"`.
2. WHEN terjadi error database saat memproses `GET /dashboard/surveyor-summary`, THE Surveyor_Summary_Endpoint SHALL mengembalikan HTTP 500 dengan pesan `"Terjadi kesalahan internal server"`.
3. WHEN parameter `surveyId` bukan format UUID yang valid, THE Survey_Progress_Endpoint SHALL mengembalikan HTTP 422 dengan pesan `"Format surveyId tidak valid"`.
4. THE Dashboard_Page SHALL menampilkan pesan error dalam komponen alert berwarna merah ketika salah satu endpoint progress mengembalikan error, tanpa mengganggu tampilan section dashboard lainnya yang sudah berhasil dimuat.

---

### Requirement 10: Loading State pada Section Progress

**User Story:** Sebagai admin/supervisor, saya ingin melihat indikator loading saat data progress sedang dimuat, sehingga saya mengetahui bahwa sistem sedang memproses permintaan.

#### Acceptance Criteria

1. WHILE data progress survei aktif sedang dimuat, THE Dashboard_Page SHALL menampilkan indikator loading berupa teks "Memuat data progress..." di dalam section "Progress Survei Aktif".
2. WHILE data breakdown surveyor sedang dimuat setelah memilih survei dari dropdown, THE Dashboard_Page SHALL menampilkan indikator loading di area Surveyor_Progress_Table.
3. WHEN data progress berhasil dimuat, THE Dashboard_Page SHALL mengganti indikator loading dengan konten yang sesuai (card atau tabel).
4. THE Dashboard_Page SHALL memuat data section progress secara independen dari section dashboard lainnya (stats, trend, top surveyor), sehingga kegagalan pada satu section tidak memblokir section lainnya.
