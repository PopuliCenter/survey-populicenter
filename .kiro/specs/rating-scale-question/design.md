# Design Document: Rating Scale Question

## Overview

Fitur ini menambahkan tipe pertanyaan baru `rating_scale` ke platform Web Survey. Perubahan minimal dan terlokalisasi: tidak ada skema tabel baru, tidak ada kolom baru — hanya satu migration untuk memperbarui CHECK constraint, update validasi di backend, dan tiga komponen frontend yang dimodifikasi.

Konfigurasi rating disimpan di kolom `options` (JSONB) yang sudah ada:

```json
{
  "min": 1,
  "max": 5,
  "display": "stars",
  "labels": {
    "min": "Sangat Tidak Puas",
    "max": "Sangat Puas"
  }
}
```

Nilai jawaban disimpan sebagai string numerik di `answer_value` (misalnya `"4"`), konsisten dengan tipe `numeric_scale` yang sudah ada.

---

## Architecture

Tidak ada komponen arsitektur baru. Perubahan dilakukan pada lapisan yang sudah ada:

```
Admin (SurveyBuilder.jsx)
  └── Rating_Config_Editor (inline di QuestionFormModal)
        └── POST/PUT /surveys/:id/questions
              └── Question_Validator (questions.js)
                    └── Question.create / Question.update (PostgreSQL)

Surveyor (SurveyForm.jsx)
  └── RatingScaleField (komponen baru di SurveyForm.jsx)
        └── POST /responses/submit
              └── Answer.create (answer_value = "N")

Admin (ResponseDetail.jsx)
  └── AnswerCard (diperbarui untuk rating_scale)
        └── GET /responses/:id

Export Worker (exportWorker.js)
  └── buildExportData (diperbarui untuk rating_scale)
```

---

## Components and Interfaces

### 1. Database Migration

**File baru:** `backend/src/migrations/20240103000001-add-rating-scale-type.js`

```javascript
'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Hapus constraint lama
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );
      // Tambah constraint baru dengan rating_scale
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo', 'rating_scale'
        ));`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Hapus baris dengan tipe rating_scale sebelum mengembalikan constraint
      await queryInterface.sequelize.query(
        `DELETE FROM questions WHERE type = 'rating_scale';`,
        { transaction }
      );
      // Hapus constraint baru
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );
      // Kembalikan constraint lama
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo'
        ));`,
        { transaction }
      );
    });
  },
};
```

### 2. Backend: Model Update

**File:** `backend/src/models/Question.js`

Tambahkan `'rating_scale'` ke array `QUESTION_TYPES`:

```javascript
const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'short_text',
  'long_text',
  'numeric_scale',
  'date',
  'photo',
  'rating_scale', // TAMBAHAN
];
```

### 3. Backend: Validasi di `questions.js`

**File:** `backend/src/routes/questions.js`

**Perubahan 1:** Tambahkan `'rating_scale'` ke array `VALID_QUESTION_TYPES`.

**Perubahan 2:** Tambahkan fungsi helper validasi konfigurasi rating:

```javascript
/**
 * Validasi konfigurasi options untuk tipe rating_scale.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRatingConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'Konfigurasi rating (options) wajib diisi untuk tipe rating_scale' };
  }
  const { min, max, display } = options;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return { valid: false, error: 'Nilai min dan max harus berupa bilangan bulat' };
  }
  if (min < 1) {
    return { valid: false, error: 'Nilai min harus minimal 1' };
  }
  if (max > 10) {
    return { valid: false, error: 'Nilai max tidak boleh lebih dari 10' };
  }
  if (max <= min) {
    return { valid: false, error: 'Nilai max harus lebih besar dari min' };
  }
  if (display !== 'stars' && display !== 'numbers') {
    return { valid: false, error: "Display harus 'stars' atau 'numbers'" };
  }
  return { valid: true };
}
```

**Perubahan 3:** Panggil `validateRatingConfig` di handler POST dan PUT setelah validasi tipe:

```javascript
// Setelah validasi VALID_QUESTION_TYPES
if (type === 'rating_scale' || (question && question.type === 'rating_scale' && type === undefined)) {
  const effectiveOptions = options !== undefined ? options : question?.options;
  const ratingValidation = validateRatingConfig(effectiveOptions);
  if (!ratingValidation.valid) {
    return res.status(422).json({ error: ratingValidation.error });
  }
}
```

### 4. Backend: Export Worker Update

**File:** `backend/src/workers/exportWorker.js`

Fungsi `buildExportData` sudah menangani `answer_value` secara generik. Tidak ada perubahan logika yang diperlukan karena nilai rating disimpan sebagai string numerik di `answer_value` dan akan diekspor apa adanya. Namun, untuk kejelasan, tambahkan komentar dokumentasi pada case `rating_scale`:

```javascript
// Dalam fungsi buildExportData, bagian questionValues:
const questionValues = questions.map((q) => {
  const answer = answerMap[q.id];
  if (!answer) return '';

  if (q.type === 'photo') {
    return answer.photo_path || '';
  }

  // rating_scale: answer_value berisi string numerik, misalnya "4"
  // Tidak perlu konversi khusus — dikembalikan apa adanya
  if (answer.answer_json !== null && answer.answer_json !== undefined) {
    return Array.isArray(answer.answer_json)
      ? answer.answer_json.join(', ')
      : JSON.stringify(answer.answer_json);
  }

  return answer.answer_value !== null && answer.answer_value !== undefined
    ? answer.answer_value
    : '';
});
```

### 5. Frontend: Survey Builder — `RatingConfigEditor`

**File:** `frontend/src/pages/SurveyBuilder.jsx`

**Perubahan 1:** Tambahkan `rating_scale` ke array `QUESTION_TYPES`:

```javascript
const QUESTION_TYPES = [
  { value: 'single_choice', label: 'Pilihan Tunggal' },
  { value: 'multiple_choice', label: 'Pilihan Ganda' },
  { value: 'short_text', label: 'Teks Pendek' },
  { value: 'long_text', label: 'Teks Panjang' },
  { value: 'numeric_scale', label: 'Skala Numerik' },
  { value: 'date', label: 'Tanggal' },
  { value: 'photo', label: 'Upload Foto' },
  { value: 'rating_scale', label: 'Rating Scale' }, // TAMBAHAN
];
```

**Perubahan 2:** Tambahkan komponen `RatingConfigEditor` baru (sebelum `QuestionFormModal`):

```jsx
/**
 * Editor konfigurasi untuk tipe pertanyaan rating_scale.
 * Mengelola min, max, display mode, dan label opsional.
 */
function RatingConfigEditor({ config, onChange }) {
  const { min = 1, max = 5, display = 'stars', labels = {} } = config || {};

  function update(field, value) {
    onChange({ min, max, display, labels, [field]: value });
  }

  function updateLabel(key, value) {
    onChange({ min, max, display, labels: { ...labels, [key]: value } });
  }

  return (
    <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-sm font-medium text-amber-800">Konfigurasi Rating Scale</p>

      {/* Min / Max */}
      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Min</label>
          <input
            type="number"
            min={1}
            max={9}
            value={min}
            onChange={(e) => update('min', parseInt(e.target.value, 10) || 1)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Nilai minimum rating"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Max</label>
          <input
            type="number"
            min={2}
            max={10}
            value={max}
            onChange={(e) => update('max', parseInt(e.target.value, 10) || 5)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Nilai maksimum rating"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tampilan</label>
          <select
            value={display}
            onChange={(e) => update('display', e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            aria-label="Mode tampilan rating"
          >
            <option value="stars">Bintang (Stars)</option>
            <option value="numbers">Angka (Numbers)</option>
          </select>
        </div>
      </div>

      {/* Preview */}
      <div className="text-xs text-gray-500">
        Skala: {min} – {max} ({max - min + 1} nilai)
      </div>

      {/* Labels opsional */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">Label Ujung Skala (opsional)</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label Min</label>
            <input
              type="text"
              value={labels.min || ''}
              onChange={(e) => updateLabel('min', e.target.value)}
              placeholder="Sangat Tidak Puas"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Label nilai minimum"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label Max</label>
            <input
              type="text"
              value={labels.max || ''}
              onChange={(e) => updateLabel('max', e.target.value)}
              placeholder="Sangat Puas"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Label nilai maksimum"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Perubahan 3:** Di dalam `QuestionFormModal`, tambahkan state dan logika untuk rating config:

```javascript
// State tambahan di QuestionFormModal
const [ratingConfig, setRatingConfig] = useState(
  initial?.type === 'rating_scale' && initial?.options
    ? initial.options
    : { min: 1, max: 5, display: 'stars', labels: {} }
);

// Di handleTypeChange, reset ratingConfig ke default jika berpindah dari rating_scale
function handleTypeChange(newType) {
  setType(newType);
  if (!CHOICE_TYPES.includes(newType)) {
    setRandomizeOptions(false);
  }
  if (newType !== 'rating_scale') {
    setRatingConfig({ min: 1, max: 5, display: 'stars', labels: {} });
  }
}

// Di handleSubmit, sertakan ratingConfig dalam payload jika tipe rating_scale
const payload = {
  text: text.trim(),
  type,
  is_required: isRequired,
  ...(isChoiceType
    ? { options: options.filter((o) => o.value.trim() || o.label.trim()), randomize_options: randomizeOptions }
    : {}),
  ...(type === 'rating_scale' ? { options: ratingConfig } : {}),
  skip_logic: skipLogic,
};
```

**Perubahan 4:** Di JSX `QuestionFormModal`, tambahkan render `RatingConfigEditor` setelah type selector:

```jsx
{/* Rating Scale Config (hanya untuk tipe rating_scale) */}
{type === 'rating_scale' && (
  <RatingConfigEditor
    config={ratingConfig}
    onChange={setRatingConfig}
  />
)}
```

### 6. Frontend: Survey Form — `RatingScaleField`

**File:** `frontend/src/surveyor/pages/SurveyForm.jsx`

**Perubahan 1:** Tambahkan komponen `RatingScaleField` baru (sebelum `QuestionField`):

```jsx
/**
 * Komponen input untuk pertanyaan rating_scale.
 * Mendukung mode tampilan "stars" dan "numbers".
 */
function RatingScaleField({ question, answer, onChange, hasError }) {
  const config = question.options || {};
  const { min = 1, max = 5, display = 'stars', labels = {} } = config;
  const selectedValue = answer ? parseInt(answer, 10) : null;

  const values = [];
  for (let i = min; i <= max; i++) values.push(i);

  if (display === 'stars') {
    return (
      <div className={`space-y-2 ${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}>
        <div className="flex items-center gap-1" role="group" aria-label={`Rating bintang untuk: ${question.text}`}>
          {values.map((val) => {
            const filled = selectedValue !== null && val <= selectedValue;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onChange(String(val))}
                className={`text-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 rounded ${
                  filled ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'
                }`}
                aria-label={`Beri rating ${val} dari ${max}`}
                aria-pressed={selectedValue === val}
              >
                ★
              </button>
            );
          })}
          {selectedValue !== null && (
            <span className="ml-2 text-sm text-gray-500">{selectedValue}/{max}</span>
          )}
        </div>
        {(labels.min || labels.max) && (
          <div className="flex justify-between text-xs text-gray-400 px-1">
            <span>{labels.min || ''}</span>
            <span>{labels.max || ''}</span>
          </div>
        )}
      </div>
    );
  }

  // display === 'numbers'
  return (
    <div className={`space-y-2 ${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Rating angka untuk: ${question.text}`}>
        {values.map((val) => {
          const isSelected = selectedValue === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onChange(String(val))}
              className={`w-10 h-10 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700'
              }`}
              aria-label={`Pilih nilai ${val}`}
              aria-pressed={isSelected}
            >
              {val}
            </button>
          );
        })}
      </div>
      {(labels.min || labels.max) && (
        <div className="flex justify-between text-xs text-gray-400">
          <span>{labels.min || ''}</span>
          <span>{labels.max || ''}</span>
        </div>
      )}
    </div>
  );
}
```

**Perubahan 2:** Di komponen `QuestionField`, tambahkan case `rating_scale` dalam switch statement:

```javascript
case 'rating_scale':
  return (
    <RatingScaleField
      question={question}
      answer={answer}
      onChange={onChange}
      hasError={hasError}
    />
  );
```

**Perubahan 3:** Di fungsi `buildEmptyAnswers`, tidak ada perubahan — nilai default `''` sudah sesuai untuk `rating_scale`.

**Perubahan 4:** Di fungsi `validateRequiredQuestions`, tidak ada perubahan — logika `val === ''` sudah menangkap kasus rating yang belum dipilih.

### 7. Frontend: Response Detail Update

**File:** `frontend/src/pages/ResponseDetail.jsx`

**Perubahan 1:** Tambahkan `rating_scale` ke objek `typeLabel` di komponen `AnswerCard`:

```javascript
const typeLabel = {
  single_choice: 'Pilihan Tunggal',
  multiple_choice: 'Pilihan Ganda',
  short_text: 'Teks Pendek',
  long_text: 'Teks Panjang',
  numeric_scale: 'Skala Numerik',
  date: 'Tanggal',
  photo: 'Upload Foto',
  rating_scale: 'Rating Scale', // TAMBAHAN
};
```

**Perubahan 2:** Tambahkan case `rating_scale` di fungsi `renderValue` dalam `AnswerCard`:

```javascript
function renderValue() {
  // ... kode existing ...

  if (answer.question_type === 'rating_scale') {
    if (!answer.answer_value) return <span className="text-gray-400 italic">—</span>;
    const numVal = parseInt(answer.answer_value, 10);
    const config = answer.question_options || {};
    const { max = 5, display = 'stars', labels = {} } = config;

    if (display === 'stars') {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            {Array.from({ length: max }, (_, i) => i + 1).map((i) => (
              <span key={i} className={`text-xl ${i <= numVal ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
            ))}
            <span className="ml-2 text-sm font-semibold text-gray-700">{numVal}/{max}</span>
          </div>
          {(labels.min || labels.max) && (
            <div className="flex justify-between text-xs text-gray-400 max-w-xs">
              <span>{labels.min || ''}</span>
              <span>{labels.max || ''}</span>
            </div>
          )}
        </div>
      );
    }

    // display === 'numbers'
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white text-sm font-bold">
          {numVal}
        </span>
        <span className="text-sm text-gray-500">dari {max}</span>
        {labels.min && <span className="text-xs text-gray-400">({labels.min} – {labels.max})</span>}
      </div>
    );
  }

  // ... kode existing lainnya ...
}
```

**Catatan:** Agar `question_options` tersedia di `answer`, endpoint `GET /responses/:id` perlu menyertakan field `options` dari tabel `questions` dalam join. Periksa route `responses.js` — jika belum menyertakan `options`, tambahkan ke atribut `Question` dalam include.

---

## Data Models

Tidak ada tabel atau kolom baru. Perubahan hanya pada CHECK constraint dan penggunaan kolom `options` yang sudah ada.

### Format `options` untuk `rating_scale`

```json
{
  "min": 1,
  "max": 5,
  "display": "stars",
  "labels": {
    "min": "Sangat Tidak Puas",
    "max": "Sangat Puas"
  }
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `min` | integer | Ya | Nilai minimum, minimal 1 |
| `max` | integer | Ya | Nilai maksimum, maksimal 10, harus > min |
| `display` | string | Ya | `"stars"` atau `"numbers"` |
| `labels.min` | string | Tidak | Label untuk nilai minimum |
| `labels.max` | string | Tidak | Label untuk nilai maksimum |

### Format `answer_value` untuk `rating_scale`

Nilai disimpan sebagai string numerik di kolom `answer_value` (TEXT), misalnya `"1"`, `"3"`, `"5"`. Ini konsisten dengan tipe `numeric_scale` yang sudah ada.

### Perubahan CHECK Constraint

**Sebelum:**
```sql
CHECK (type IN ('single_choice','multiple_choice','short_text','long_text','numeric_scale','date','photo'))
```

**Sesudah:**
```sql
CHECK (type IN ('single_choice','multiple_choice','short_text','long_text','numeric_scale','date','photo','rating_scale'))
```

---

## Correctness Properties

### Property 1: Nilai Rating Selalu Integer dalam Rentang [min, max]

*For any* konfigurasi rating yang valid (min ∈ [1,9], max ∈ [2,10], max > min) dan nilai `answer_value` yang dikirimkan, sistem hanya menerima dan menyimpan nilai yang merupakan integer dalam rentang [min, max]; semua nilai di luar rentang atau bukan integer harus ditolak dengan HTTP 422.

**Validates: Requirements 3.1, 3.2, 3.4**

---

### Property 2: Konfigurasi dengan max ≤ min Selalu Ditolak

*For any* pasangan nilai (min, max) di mana max ≤ min, fungsi `validateRatingConfig` harus selalu mengembalikan `{ valid: false }` dan endpoint harus mengembalikan HTTP 422.

**Validates: Requirements 2.3**

---

### Property 3: Konfigurasi Valid Selalu Diterima

*For any* konfigurasi rating di mana min ∈ [1,9], max ∈ [min+1, 10], dan display ∈ {"stars", "numbers"}, fungsi `validateRatingConfig` harus selalu mengembalikan `{ valid: true }`.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**

---

### Property 4: Pertanyaan Required Tidak Bisa Disubmit Tanpa Nilai

*For any* form survei yang mengandung pertanyaan `rating_scale` dengan `is_required = true` dan nilai jawaban kosong, fungsi `validateRequiredQuestions` di frontend harus selalu menyertakan ID pertanyaan tersebut dalam set `missing`, dan backend harus menyertakannya dalam `missing_questions`.

**Validates: Requirements 3.3, 6.5**

---

## Error Handling

### Backend

| Kondisi | HTTP | Pesan |
|---|---|---|
| `options` null/tidak ada untuk `rating_scale` | 422 | `"Konfigurasi rating (options) wajib diisi untuk tipe rating_scale"` |
| `max <= min` | 422 | `"Nilai max harus lebih besar dari min"` |
| `min < 1` | 422 | `"Nilai min harus minimal 1"` |
| `max > 10` | 422 | `"Nilai max tidak boleh lebih dari 10"` |
| `display` bukan `"stars"` atau `"numbers"` | 422 | `"Display harus 'stars' atau 'numbers'"` |
| `answer_value` bukan integer | 422 | `"Nilai rating harus berupa bilangan bulat"` |
| `answer_value` di luar rentang | 422 | `"Nilai rating harus berada dalam rentang [min, max]"` |

### Frontend

| Kondisi | Penanganan |
|---|---|
| Pertanyaan required belum dipilih | Border merah + pesan "Pertanyaan ini wajib diisi" |
| Error validasi dari backend | Ditampilkan di `submitError` banner |
| `options` null/tidak valid | Fallback ke default (min=1, max=5, stars) |

---

## Testing Strategy

### Unit Tests Backend (`backend/tests/unit/questions.test.js`)

Tambahkan describe block `rating_scale question type`:

1. POST dengan tipe `rating_scale` dan options valid → 201
2. POST dengan `max <= min` → 422, pesan "Nilai max harus lebih besar dari min"
3. POST dengan `min < 1` → 422, pesan "Nilai min harus minimal 1"
4. POST dengan `max > 10` → 422, pesan "Nilai max tidak boleh lebih dari 10"
5. POST dengan `display` tidak valid → 422, pesan "Display harus 'stars' atau 'numbers'"
6. POST tanpa `options` untuk `rating_scale` → 422
7. POST dengan `options.labels` opsional → 201 (labels tersimpan di JSONB)
8. PUT update konfigurasi rating yang sudah ada → 200

### Unit Tests Frontend — `RatingScaleField` (`frontend/src/surveyor/pages/__tests__/SurveyForm.test.jsx`)

1. Render mode `stars`: menampilkan N bintang sesuai `max`
2. Render mode `numbers`: menampilkan tombol dari `min` hingga `max`
3. Klik bintang ke-3 → `onChange` dipanggil dengan `"3"`
4. Klik tombol angka 7 → `onChange` dipanggil dengan `"7"`
5. Bintang yang dipilih memiliki class `text-amber-400`
6. Tombol angka yang dipilih memiliki class `bg-blue-600`
7. Label min/max ditampilkan jika `options.labels` tersedia
8. Pertanyaan required tanpa nilai → border merah setelah submit

### Unit Tests Frontend — `RatingConfigEditor` (`frontend/src/pages/__tests__/SurveyBuilder.test.jsx`)

1. Dropdown tipe menampilkan opsi "Rating Scale"
2. Memilih "Rating Scale" menampilkan `RatingConfigEditor`
3. Mengubah tipe dari "Rating Scale" ke lain menyembunyikan editor
4. Nilai default: min=1, max=5, display=stars
5. Payload yang dikirim ke API menyertakan `options` dengan konfigurasi yang benar

### Unit Tests Frontend — `ResponseDetail` (`frontend/src/pages/__tests__/ResponseDetail.test.jsx`)

1. Jawaban `rating_scale` mode `stars` menampilkan bintang terisi
2. Jawaban `rating_scale` mode `numbers` menampilkan badge angka
3. `answer_value` kosong menampilkan "—"
4. Badge tipe menampilkan "Rating Scale"

### Property-Based Tests Backend (`backend/tests/properties/ratingScale.property.test.js`)

1. **Property 1**: Untuk semua nilai di luar rentang [min, max], validasi selalu mengembalikan error
2. **Property 2**: Untuk semua pasangan (min, max) di mana max ≤ min, `validateRatingConfig` selalu mengembalikan `{ valid: false }`
3. **Property 3**: Untuk semua konfigurasi valid (min ∈ [1,9], max ∈ [min+1,10], display ∈ {"stars","numbers"}), `validateRatingConfig` selalu mengembalikan `{ valid: true }`

### Property-Based Tests Frontend (`frontend/src/surveyor/pages/__tests__/RatingScale.property.test.jsx`)

1. **Property 4**: Untuk semua konfigurasi rating valid, `RatingScaleField` merender tepat `(max - min + 1)` elemen interaktif
