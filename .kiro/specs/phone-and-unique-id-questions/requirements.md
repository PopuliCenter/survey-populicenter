# Requirements Document

## Introduction

Fitur ini menambahkan dua tipe pertanyaan baru ke platform Web Survey: `phone_number` (Input Nomor Telepon) dan `unique_id` (Nomor Kuesioner Manual Unik per Survei). Kedua tipe menerima input angka murni tanpa karakter non-numerik.

**Tipe `phone_number`** memungkinkan surveyor memasukkan nomor telepon responden. Admin mengonfigurasi panjang minimum dan maksimum digit saat membuat pertanyaan. Duplikat nomor telepon diperbolehkan.

**Tipe `unique_id`** memungkinkan surveyor memasukkan nomor kuesioner manual yang harus unik per survei. Jika nomor yang sama sudah digunakan dalam survei tersebut, sistem menolak input. Tipe ini merupakan field tambahan di samping nomor kuesioner otomatis yang sudah ada (tidak mengganti).

**Lingkup perubahan:**
1. Database: migration baru untuk menambahkan `phone_number` dan `unique_id` ke CHECK constraint kolom `type` pada tabel `questions`
2. Backend: update validasi tipe di `questions.js` dan model `Question.js`, tambah validasi konfigurasi dan jawaban di `responses.js`, endpoint baru opsional `POST /responses/check-unique`
3. Frontend: konfigurasi di `SurveyBuilder.jsx`, komponen input `PhoneNumberField` dan `UniqueIdField` di `SurveyForm.jsx`, tampilan di `ResponseDetail.jsx`

## Glossary

- **Phone_Number_Question**: Pertanyaan dengan tipe `phone_number` yang menerima input angka murni dengan panjang dalam rentang [min_length, max_length].
- **Unique_Id_Question**: Pertanyaan dengan tipe `unique_id` yang menerima input angka murni dan harus unik per survei.
- **Phone_Config**: Objek JSONB yang disimpan di kolom `options` dengan struktur `{ min_length, max_length }` untuk tipe `phone_number`.
- **UniqueId_Config**: Objek JSONB yang disimpan di kolom `options` dengan struktur `{ min_length, max_length }` untuk tipe `unique_id` (opsional, default tanpa batasan panjang).
- **Phone_Number_Field**: Komponen React di `SurveyForm.jsx` yang merender input nomor telepon (hanya angka).
- **Unique_Id_Field**: Komponen React di `SurveyForm.jsx` yang merender input nomor kuesioner manual dengan indikator ketersediaan.
- **Phone_Config_Editor**: Bagian dari modal `QuestionFormModal` di `SurveyBuilder.jsx` untuk mengonfigurasi min_length dan max_length nomor telepon.
- **UniqueId_Config_Editor**: Bagian dari modal `QuestionFormModal` di `SurveyBuilder.jsx` untuk mengonfigurasi min_length dan max_length nomor kuesioner manual.
- **Question_Validator**: Logika validasi di `backend/src/routes/questions.js` yang memverifikasi tipe dan konfigurasi pertanyaan.
- **Response_Validator**: Logika validasi di `backend/src/routes/responses.js` yang memverifikasi jawaban saat submit.
- **Response_Detail**: Halaman `frontend/src/pages/ResponseDetail.jsx` yang menampilkan detail jawaban responden.
- **Migration**: File Sequelize migration baru di `backend/src/migrations/` yang memperbarui CHECK constraint kolom `type`.

---

## Requirements

### Requirement 1: Tipe Pertanyaan Phone Number dan Unique ID di Database

**User Story:** Sebagai admin, saya ingin tipe pertanyaan `phone_number` dan `unique_id` dikenali oleh database, sehingga pertanyaan kedua tipe tersebut dapat disimpan tanpa melanggar constraint integritas data.

#### Acceptance Criteria

1. THE Migration SHALL menambahkan nilai `phone_number` dan `unique_id` ke CHECK constraint kolom `type` pada tabel `questions` melalui file migration baru tanpa mengubah migration yang sudah ada.
2. WHEN migration dijalankan, THE Migration SHALL menghapus CHECK constraint lama `questions_type_check` dan membuat CHECK constraint baru yang mencakup semua tipe sebelumnya ditambah `phone_number` dan `unique_id`.
3. THE Migration SHALL menyediakan fungsi `down` yang mengembalikan CHECK constraint ke kondisi sebelum migration (tanpa `phone_number` dan `unique_id`).
4. WHEN migration `down` dijalankan, THE Migration SHALL menghapus semua baris dengan `type = 'phone_number'` atau `type = 'unique_id'` sebelum mengembalikan constraint lama untuk mencegah constraint violation.

---

### Requirement 2: Konfigurasi Phone Number di Backend

**User Story:** Sebagai admin, saya ingin backend menerima dan memvalidasi konfigurasi pertanyaan nomor telepon, sehingga hanya konfigurasi panjang digit yang valid yang tersimpan di database.

#### Acceptance Criteria

1. THE Question_Validator SHALL menerima `phone_number` sebagai nilai valid untuk field `type` pada endpoint `POST /surveys/:id/questions` dan `PUT /surveys/:id/questions/:qid`.
2. WHEN tipe pertanyaan adalah `phone_number`, THE Question_Validator SHALL memvalidasi bahwa field `options` berisi objek dengan field `min_length` (integer) dan `max_length` (integer).
3. WHEN `options.min_length` kurang dari 1, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Panjang minimum harus minimal 1"`.
4. WHEN `options.max_length` kurang dari `options.min_length`, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Panjang maksimum harus lebih besar atau sama dengan panjang minimum"`.
5. WHEN `options.min_length` atau `options.max_length` bukan bilangan bulat, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Panjang minimum dan maksimum harus berupa bilangan bulat"`.
6. WHEN tipe pertanyaan adalah `phone_number` dan field `options` tidak disertakan atau null, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Konfigurasi panjang (options) wajib diisi untuk tipe phone_number"`.

---

### Requirement 3: Konfigurasi Unique ID di Backend

**User Story:** Sebagai admin, saya ingin backend menerima dan memvalidasi konfigurasi pertanyaan nomor kuesioner manual, sehingga konfigurasi panjang digit yang valid tersimpan di database.

#### Acceptance Criteria

1. THE Question_Validator SHALL menerima `unique_id` sebagai nilai valid untuk field `type` pada endpoint `POST /surveys/:id/questions` dan `PUT /surveys/:id/questions/:qid`.
2. WHEN tipe pertanyaan adalah `unique_id` dan field `options` disertakan, THE Question_Validator SHALL memvalidasi bahwa `options.min_length` (integer) dan `options.max_length` (integer) memenuhi aturan: `min_length >= 1` dan `max_length >= min_length`.
3. WHEN tipe pertanyaan adalah `unique_id` dan field `options` tidak disertakan atau null, THE Question_Validator SHALL menerima pertanyaan dengan konfigurasi default tanpa batasan panjang.
4. WHEN `options.max_length` kurang dari `options.min_length` untuk tipe `unique_id`, THE Question_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Panjang maksimum harus lebih besar atau sama dengan panjang minimum"`.

---

### Requirement 4: Validasi Jawaban Phone Number saat Submit

**User Story:** Sebagai developer, saya ingin backend memvalidasi jawaban nomor telepon sebelum disimpan, sehingga hanya angka murni dengan panjang yang sesuai konfigurasi yang tersimpan di database.

#### Acceptance Criteria

1. WHEN surveyor mengirimkan jawaban untuk pertanyaan `phone_number`, THE Response_Validator SHALL memverifikasi bahwa nilai `answer_value` hanya berisi karakter digit (0-9) tanpa spasi, tanda hubung, atau karakter lain.
2. WHEN nilai `answer_value` mengandung karakter non-digit, THE Response_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nomor telepon hanya boleh berisi angka"`.
3. WHEN panjang `answer_value` kurang dari `options.min_length` atau lebih dari `options.max_length`, THE Response_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Panjang nomor telepon harus antara {min_length} dan {max_length} digit"`.
4. WHEN pertanyaan `phone_number` memiliki `is_required = true` dan `answer_value` kosong atau tidak disertakan, THE Response_Validator SHALL menyertakan ID pertanyaan tersebut dalam field `missing_questions` pada respons error HTTP 422.

---

### Requirement 5: Validasi Jawaban Unique ID saat Submit

**User Story:** Sebagai developer, saya ingin backend memvalidasi jawaban nomor kuesioner manual sebelum disimpan, sehingga hanya angka murni yang unik per survei yang tersimpan di database.

#### Acceptance Criteria

1. WHEN surveyor mengirimkan jawaban untuk pertanyaan `unique_id`, THE Response_Validator SHALL memverifikasi bahwa nilai `answer_value` hanya berisi karakter digit (0-9).
2. WHEN nilai `answer_value` mengandung karakter non-digit, THE Response_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nomor kuesioner hanya boleh berisi angka"`.
3. WHEN nilai `answer_value` untuk pertanyaan `unique_id` sudah ada di tabel `answers` untuk pertanyaan yang sama dalam survei yang sama, THE Response_Validator SHALL mengembalikan HTTP 422 dengan pesan `"Nomor kuesioner sudah digunakan dalam survei ini"`.
4. WHEN pertanyaan `unique_id` memiliki konfigurasi `options` dengan `min_length` dan `max_length`, THE Response_Validator SHALL memvalidasi panjang `answer_value` sesuai rentang tersebut dan mengembalikan HTTP 422 dengan pesan `"Panjang nomor kuesioner harus antara {min_length} dan {max_length} digit"` jika tidak sesuai.
5. WHEN pertanyaan `unique_id` memiliki `is_required = true` dan `answer_value` kosong atau tidak disertakan, THE Response_Validator SHALL menyertakan ID pertanyaan tersebut dalam field `missing_questions` pada respons error HTTP 422.

---

### Requirement 6: Endpoint Cek Ketersediaan Unique ID (Opsional)

**User Story:** Sebagai surveyor, saya ingin dapat memeriksa ketersediaan nomor kuesioner secara real-time sebelum submit, sehingga saya tidak perlu menunggu hingga submit untuk mengetahui apakah nomor sudah digunakan.

#### Acceptance Criteria

1. THE Backend SHALL menyediakan endpoint `POST /responses/check-unique` yang menerima body `{ survey_id, question_id, value }`.
2. WHEN nilai `value` sudah ada di tabel `answers` untuk `question_id` yang sama dalam survei yang sama, THE Backend SHALL mengembalikan `{ available: false }`.
3. WHEN nilai `value` belum ada di tabel `answers` untuk `question_id` yang sama dalam survei yang sama, THE Backend SHALL mengembalikan `{ available: true }`.
4. WHEN `survey_id`, `question_id`, atau `value` tidak disertakan, THE Backend SHALL mengembalikan HTTP 422 dengan pesan `"Parameter survey_id, question_id, dan value wajib diisi"`.

---

### Requirement 7: Konfigurasi Phone Number di Survey Builder

**User Story:** Sebagai admin, saya ingin dapat mengonfigurasi pertanyaan nomor telepon di Survey Builder, sehingga saya dapat menentukan panjang minimum dan maksimum digit yang diterima.

#### Acceptance Criteria

1. WHEN admin membuka modal tambah/edit pertanyaan di `SurveyBuilder.jsx`, THE Phone_Config_Editor SHALL menampilkan opsi `"Nomor Telepon"` dalam dropdown tipe pertanyaan.
2. WHEN tipe pertanyaan `phone_number` dipilih, THE Phone_Config_Editor SHALL menampilkan field konfigurasi: input angka untuk `min_length` (default: 10) dan input angka untuk `max_length` (default: 13).
3. WHEN admin mengubah tipe pertanyaan dari `phone_number` ke tipe lain, THE Phone_Config_Editor SHALL menyembunyikan field konfigurasi panjang dan tidak menyertakan konfigurasi phone dalam payload yang dikirim ke backend.
4. WHEN admin menyimpan pertanyaan `phone_number`, THE Phone_Config_Editor SHALL mengirimkan payload dengan field `options` berisi `{ min_length, max_length }` ke endpoint backend.
5. WHEN pertanyaan `phone_number` yang sudah ada dibuka untuk diedit, THE Phone_Config_Editor SHALL menampilkan nilai konfigurasi yang tersimpan (min_length, max_length) sebagai nilai awal form.

---

### Requirement 8: Konfigurasi Unique ID di Survey Builder

**User Story:** Sebagai admin, saya ingin dapat mengonfigurasi pertanyaan nomor kuesioner manual di Survey Builder, sehingga saya dapat menentukan panjang minimum dan maksimum digit yang diterima.

#### Acceptance Criteria

1. WHEN admin membuka modal tambah/edit pertanyaan di `SurveyBuilder.jsx`, THE UniqueId_Config_Editor SHALL menampilkan opsi `"Nomor Kuesioner (Unik)"` dalam dropdown tipe pertanyaan.
2. WHEN tipe pertanyaan `unique_id` dipilih, THE UniqueId_Config_Editor SHALL menampilkan field konfigurasi opsional: input angka untuk `min_length` (default: 1) dan input angka untuk `max_length` (default: 20).
3. WHEN admin mengubah tipe pertanyaan dari `unique_id` ke tipe lain, THE UniqueId_Config_Editor SHALL menyembunyikan field konfigurasi panjang dan tidak menyertakan konfigurasi unique_id dalam payload yang dikirim ke backend.
4. WHEN admin menyimpan pertanyaan `unique_id`, THE UniqueId_Config_Editor SHALL mengirimkan payload dengan field `options` berisi `{ min_length, max_length }` ke endpoint backend.
5. WHEN pertanyaan `unique_id` yang sudah ada dibuka untuk diedit, THE UniqueId_Config_Editor SHALL menampilkan nilai konfigurasi yang tersimpan (min_length, max_length) sebagai nilai awal form.

---

### Requirement 9: Komponen Input Nomor Telepon di Survey Form

**User Story:** Sebagai surveyor, saya ingin memasukkan nomor telepon responden dengan input yang hanya menerima angka, sehingga data nomor telepon yang tersimpan selalu dalam format yang benar.

#### Acceptance Criteria

1. WHEN pertanyaan `phone_number` ditampilkan di `SurveyForm.jsx`, THE Phone_Number_Field SHALL merender input dengan `type="tel"` dan `inputMode="numeric"` yang hanya menerima karakter digit (0-9).
2. WHEN surveyor mengetik karakter non-digit, THE Phone_Number_Field SHALL mengabaikan karakter tersebut dan tidak menampilkannya di input.
3. WHEN panjang input kurang dari `options.min_length` atau lebih dari `options.max_length`, THE Phone_Number_Field SHALL menampilkan pesan bantuan `"Masukkan {min_length}-{max_length} digit angka"` di bawah input.
4. WHEN pertanyaan `phone_number` memiliki `is_required = true` dan belum ada nilai yang diisi saat submit, THE Phone_Number_Field SHALL menampilkan border merah dan pesan error `"Pertanyaan ini wajib diisi"`.
5. THE Phone_Number_Field SHALL menampilkan placeholder `"Masukkan nomor telepon"` pada input.

---

### Requirement 10: Komponen Input Unique ID di Survey Form

**User Story:** Sebagai surveyor, saya ingin memasukkan nomor kuesioner manual dengan input yang hanya menerima angka dan menunjukkan ketersediaan secara real-time, sehingga saya dapat memastikan nomor yang saya masukkan belum digunakan.

#### Acceptance Criteria

1. WHEN pertanyaan `unique_id` ditampilkan di `SurveyForm.jsx`, THE Unique_Id_Field SHALL merender input dengan `inputMode="numeric"` yang hanya menerima karakter digit (0-9).
2. WHEN surveyor mengetik karakter non-digit, THE Unique_Id_Field SHALL mengabaikan karakter tersebut dan tidak menampilkannya di input.
3. WHEN surveyor selesai mengetik (debounce 500ms), THE Unique_Id_Field SHALL memanggil endpoint `POST /responses/check-unique` untuk memeriksa ketersediaan nomor.
4. WHEN endpoint mengembalikan `{ available: true }`, THE Unique_Id_Field SHALL menampilkan indikator hijau dengan teks `"Nomor tersedia"`.
5. WHEN endpoint mengembalikan `{ available: false }`, THE Unique_Id_Field SHALL menampilkan indikator merah dengan teks `"Nomor sudah digunakan"`.
6. WHEN pertanyaan `unique_id` memiliki `is_required = true` dan belum ada nilai yang diisi saat submit, THE Unique_Id_Field SHALL menampilkan border merah dan pesan error `"Pertanyaan ini wajib diisi"`.
7. THE Unique_Id_Field SHALL menampilkan placeholder `"Masukkan nomor kuesioner"` pada input.

---

### Requirement 11: Tampilan Phone Number dan Unique ID di Response Detail

**User Story:** Sebagai admin, saya ingin melihat nilai nomor telepon dan nomor kuesioner manual di halaman detail responden, sehingga saya dapat memverifikasi data yang dikumpulkan surveyor.

#### Acceptance Criteria

1. WHEN `ResponseDetail.jsx` menampilkan jawaban untuk pertanyaan `phone_number`, THE Response_Detail SHALL menampilkan nilai `answer_value` sebagai teks angka.
2. WHEN `ResponseDetail.jsx` menampilkan jawaban untuk pertanyaan `unique_id`, THE Response_Detail SHALL menampilkan nilai `answer_value` sebagai teks angka.
3. THE Response_Detail SHALL menampilkan label tipe `"Nomor Telepon"` pada badge tipe pertanyaan untuk pertanyaan dengan tipe `phone_number`.
4. THE Response_Detail SHALL menampilkan label tipe `"Nomor Kuesioner (Unik)"` pada badge tipe pertanyaan untuk pertanyaan dengan tipe `unique_id`.
5. WHEN `answer_value` untuk pertanyaan `phone_number` atau `unique_id` kosong atau null, THE Response_Detail SHALL menampilkan teks `"—"` (em dash) sebagai indikator tidak ada jawaban.
