# Requirements Document

## Introduction

Fitur Rating Scale Question menambahkan tipe pertanyaan baru `rating_scale` ke platform Web Survey. Pertanyaan ini memungkinkan surveyor memberikan penilaian dalam skala numerik (misalnya 1–5 atau 1–10) dengan tampilan visual berupa bintang atau tombol angka. Tipe ini cocok untuk survei kepuasan pelanggan, survei opini, dan pengukuran persepsi.

Konfigurasi rating disimpan di kolom `options` (JSONB) yang sudah ada pada tabel `questions`, sehingga tidak diperlukan perubahan skema tabel. Satu-satunya perubahan database adalah penambahan `rating_scale` ke CHECK constraint kolom `type` melalui migration baru. Nilai jawaban disimpan sebagai string numerik di kolom `answer_value` (misalnya `"4"`), konsisten dengan tipe pertanyaan lain yang sudah ada.

**Lingkup perubahan:**
1. Database: migration baru untuk menambahkan `rating_scale` ke CHECK constraint kolom `type`
2. Backend: update validasi tipe di `questions.js` dan logika ekspor di `exportWorker.js`
3. Frontend: konfigurasi di `SurveyBuilder.jsx`, komponen input di `SurveyForm.jsx`, dan tampilan di `ResponseDetail.jsx`

## Glossary

- **Rating_Scale_Question**: Pertanyaan dengan tipe `rating_scale` yang memungkinkan surveyor memilih nilai integer dalam rentang [min, max].
- **Rating_Config**: Objek JSONB yang disimpan di kolom `options` dengan struktur `{ min, max, display, labels }`.
- **Rating_Component**: Komponen React di `SurveyForm.jsx` yang merender antarmuka pemilihan rating (bintang atau angka).
- **Rating_Config_Editor**: Bagian dari modal `QuestionFormModal` di `SurveyBuilder.jsx` yang memungkinkan admin mengonfigurasi min, max, display mode, dan label.
- **Question_Validator**: Logika validasi di `backend/src/routes/questions.js` yang memverifikasi tipe dan konfigurasi pertanyaan.
- **Export_Worker**: Komponen di `backend/src/workers/exportWorker.js` yang memproses ekspor data ke format Excel/CSV.
- **Response_Detail**: Halaman `frontend/src/pages/ResponseDetail.jsx` yang menampilkan detail jawaban responden.
- **Migration**: File Sequelize migration baru di `backend/src/migrations/` yang memperbarui CHECK constraint kolom `type`.

---

## Requirements

### Requirement 1: Tipe Pertanyaan Rating Scale di Database

**User Story:** Sebagai admin, saya ingin tipe pertanyaan `rating_scale` dikenali oleh database, sehingga pertanyaan rating dapat disimpan tanpa melanggar constraint integritas data.

#### Acceptance Criteria

1. THE Migration SHALL menambahkan nilai `rating_scale` ke CHECK constraint kolom `type` pada tabel `questions` melalui file migration baru tanpa mengubah migration yang sudah ada.
2. WHEN migration dijalankan, THE Migration SHALL menghapus CHECK constraint lama `questions_type_check` dan membuat CHECK constraint baru yang mencakup semua tipe sebelumnya ditambah `rating_scale`.
3. THE Migration SHALL menyediakan fungsi `down` yang mengembalikan CHECK constraint ke kondisi sebelum migration (tanpa `rating_scale`).
4. WHEN migration `down` dijalankan, THE Migration SHALL menghapus semua baris dengan `type = 'rating_scale'` sebelum mengembalikan constraint lama untuk mencegah constraint violation.

---

### Requirement 2: Konfigurasi Rating Scale di Backend

**User Story:** Sebagai admin, saya ingin backend menerima dan memvalidasi konfigurasi pertanyaan rating scale, sehingga hanya konfigurasi yang valid yang tersimpan di database.

#### Acceptance Criteria

1. THE Question_Validator SHALL menerima `rating_scale` sebagai nilai valid untuk field `type` pada endpoint `POST /surveys/:id/questions` dan `PUT /surveys/:id/questions/:qid`.
2. WHEN tipe pertanyaan adalah `rating_scale`, THE Question_Validator SHALL memvalidasi bahwa field `options` berisi objek dengan field `min` (integer), `max` (integer), dan `display` (string `"stars"` atau `"numbers"`).
3. WHEN `options.max` kurang dari atau sama dengan `options.min`, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nilai max harus lebih besar dari min"`.
4. WHEN `options.min` kurang dari 1, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nilai min harus minimal 1"`.
5. WHEN `options.max` lebih dari 10, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nilai max tidak boleh lebih dari 10"`.
6. WHEN field `options.display` bukan `"stars"` atau `"numbers"`, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Display harus 'stars' atau 'numbers'"`.
7. WHERE field `options.labels` disertakan, THE Question_Validator SHALL menerima objek dengan field `min` (string) dan `max` (string) sebagai label opsional untuk ujung skala.
8. WHEN tipe pertanyaan adalah `rating_scale` dan field `options` tidak disertakan atau null, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Konfigurasi rating (options) wajib diisi untuk tipe rating_scale"`.

---

### Requirement 3: Validasi Nilai Jawaban Rating

**User Story:** Sebagai developer, saya ingin backend memvalidasi nilai jawaban rating sebelum disimpan, sehingga hanya nilai integer dalam rentang yang valid yang tersimpan di database.

#### Acceptance Criteria

1. WHEN surveyor mengirimkan jawaban untuk pertanyaan `rating_scale`, THE Question_Validator SHALL memverifikasi bahwa nilai `answer_value` adalah string representasi integer (misalnya `"3"`, `"5"`).
2. WHEN nilai `answer_value` yang dikonversi ke integer berada di luar rentang `[options.min, options.max]`, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nilai rating harus berada dalam rentang [min, max]"`.
3. WHEN pertanyaan `rating_scale` memiliki `is_required = true` dan `answer_value` kosong atau tidak disertakan, THE Question_Validator SHALL menyertakan ID pertanyaan tersebut dalam field `missing_questions` pada respons error HTTP 422.
4. WHEN nilai `answer_value` bukan representasi integer yang valid (misalnya `"abc"`, `"3.5"`), THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nilai rating harus berupa bilangan bulat"`.

---

### Requirement 4: Ekspor Data Rating Scale

**User Story:** Sebagai admin, saya ingin nilai rating diekspor sebagai angka di file Excel/CSV, sehingga data dapat langsung dianalisis tanpa konversi manual.

#### Acceptance Criteria

1. WHEN Export_Worker memproses pertanyaan dengan tipe `rating_scale`, THE Export_Worker SHALL menampilkan nilai `answer_value` sebagai nilai numerik (integer) di kolom yang sesuai.
2. WHEN `answer_value` untuk pertanyaan `rating_scale` kosong atau null, THE Export_Worker SHALL menampilkan string kosong `""` di kolom tersebut.
3. THE Export_Worker SHALL menggunakan teks pertanyaan (`question.text`) sebagai header kolom untuk pertanyaan `rating_scale`, konsisten dengan tipe pertanyaan lain.

---

### Requirement 5: Konfigurasi Rating Scale di Survey Builder

**User Story:** Sebagai admin atau supervisor, saya ingin dapat mengonfigurasi pertanyaan rating scale di Survey Builder, sehingga saya dapat menentukan rentang skala, mode tampilan, dan label ujung skala.

#### Acceptance Criteria

1. WHEN admin membuka modal tambah/edit pertanyaan di `SurveyBuilder.jsx`, THE Rating_Config_Editor SHALL menampilkan opsi `"Rating Scale"` dalam dropdown tipe pertanyaan.
2. WHEN tipe pertanyaan `rating_scale` dipilih, THE Rating_Config_Editor SHALL menampilkan field konfigurasi: input angka untuk `min` (default: 1), input angka untuk `max` (default: 5), dan dropdown `display` dengan pilihan `"Bintang (Stars)"` dan `"Angka (Numbers)"`.
3. WHEN tipe pertanyaan `rating_scale` dipilih, THE Rating_Config_Editor SHALL menampilkan field opsional untuk label ujung skala: input teks untuk `labels.min` (placeholder: "Sangat Tidak Puas") dan `labels.max` (placeholder: "Sangat Puas").
4. WHEN admin mengubah tipe pertanyaan dari `rating_scale` ke tipe lain, THE Rating_Config_Editor SHALL menyembunyikan field konfigurasi rating dan tidak menyertakan `options` rating dalam payload yang dikirim ke backend.
5. WHEN admin menyimpan pertanyaan `rating_scale`, THE Rating_Config_Editor SHALL mengirimkan payload dengan field `options` berisi `{ min, max, display, labels }` ke endpoint backend.
6. WHEN pertanyaan `rating_scale` yang sudah ada dibuka untuk diedit, THE Rating_Config_Editor SHALL menampilkan nilai konfigurasi yang tersimpan (min, max, display, labels) sebagai nilai awal form.

---

### Requirement 6: Komponen Input Rating di Survey Form

**User Story:** Sebagai surveyor, saya ingin dapat memilih nilai rating dengan antarmuka visual yang intuitif, sehingga pengisian survei kepuasan menjadi mudah dan cepat.

#### Acceptance Criteria

1. WHEN pertanyaan `rating_scale` dengan `display: "stars"` ditampilkan di `SurveyForm.jsx`, THE Rating_Component SHALL merender sejumlah ikon bintang sesuai nilai `options.max`, dengan bintang dari 1 hingga `options.min - 1` tidak dapat dipilih (karena min dimulai dari nilai tertentu).
2. WHEN pertanyaan `rating_scale` dengan `display: "numbers"` ditampilkan di `SurveyForm.jsx`, THE Rating_Component SHALL merender tombol angka dari `options.min` hingga `options.max` secara horizontal.
3. WHEN surveyor mengklik bintang atau tombol angka, THE Rating_Component SHALL memperbarui nilai jawaban dengan integer yang dipilih dan menampilkan state terpilih secara visual (bintang terisi / tombol aktif).
4. WHEN `options.labels` tersedia, THE Rating_Component SHALL menampilkan `labels.min` di bawah nilai minimum dan `labels.max` di bawah nilai maksimum sebagai teks keterangan.
5. WHEN pertanyaan `rating_scale` memiliki `is_required = true` dan belum ada nilai yang dipilih saat submit, THE Rating_Component SHALL menampilkan border merah dan pesan error `"Pertanyaan ini wajib diisi"`.
6. WHEN surveyor memilih nilai rating, THE Rating_Component SHALL mengirimkan nilai sebagai string numerik (misalnya `"4"`) ke handler `onChange`, konsisten dengan format `answer_value` tipe pertanyaan lain.
7. WHEN pertanyaan `rating_scale` ditampilkan, THE Rating_Component SHALL menampilkan teks pertanyaan, indikator wajib (jika `is_required`), dan antarmuka rating dalam satu card yang konsisten dengan tampilan pertanyaan lain.

---

### Requirement 7: Tampilan Rating di Response Detail

**User Story:** Sebagai admin, saya ingin melihat nilai rating dengan tampilan visual yang sesuai di halaman detail responden, sehingga saya dapat dengan mudah memahami jawaban surveyor.

#### Acceptance Criteria

1. WHEN `ResponseDetail.jsx` menampilkan jawaban untuk pertanyaan `rating_scale`, THE Response_Detail SHALL menampilkan nilai numerik rating beserta representasi visual (bintang terisi untuk mode `stars`, atau badge angka untuk mode `numbers`).
2. WHEN `answer_value` untuk pertanyaan `rating_scale` kosong atau null, THE Response_Detail SHALL menampilkan teks `"—"` (em dash) sebagai indikator tidak ada jawaban.
3. THE Response_Detail SHALL menampilkan label tipe `"Rating Scale"` pada badge tipe pertanyaan untuk pertanyaan dengan tipe `rating_scale`.
4. WHEN `options.labels` tersedia, THE Response_Detail SHALL menampilkan label min dan max di samping nilai rating sebagai konteks tambahan.

