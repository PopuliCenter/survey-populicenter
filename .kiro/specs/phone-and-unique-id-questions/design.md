# Design Document: Phone Number dan Unique ID Question Types

## Overview

Fitur ini menambahkan dua tipe pertanyaan baru ke platform Web Survey: `phone_number` dan `unique_id`. Perubahan minimal dan mengikuti pola yang sudah ada pada tipe `rating_scale`: tidak ada tabel baru, hanya satu migration untuk memperbarui CHECK constraint, update validasi di backend, dan komponen frontend baru.

**Tipe `phone_number`:** Konfigurasi disimpan di kolom `options` (JSONB):
```json
{ "min_length": 10, "max_length": 13 }
```

**Tipe `unique_id`:** Konfigurasi disimpan di kolom `options` (JSONB):
```json
{ "min_length": 1, "max_length": 20 }
```

Nilai jawaban kedua tipe disimpan sebagai string angka di `answer_value` (TEXT), misalnya `"08123456789"` atau `"001"`.

---

## Architecture

Tidak ada komponen arsitektur baru. Perubahan dilakukan pada lapisan yang sudah ada:

```
Admin (SurveyBuilder.jsx)
  ├── PhoneConfigEditor (inline di QuestionFormModal)
  │     └── POST/PUT /surveys/:id/questions
  │           └── Question_Validator (questions.js) → validatePhoneConfig()
  │                 └── Question.create / Question.update (PostgreSQL)
  └── UniqueIdConfigEditor (inline di QuestionFormModal)
        └── POST/PUT /surveys/:id/questions
              └── Question_Validator (questions.js) → validateUniqueIdConfig()
                    └── Question.create / Question.update (PostgreSQL)

Surveyor (SurveyForm.jsx)
  ├── PhoneNumberField (komponen baru)
  │     └── POST /responses/submit
  │           └── Response_Validator (responses.js) → validasi format + panjang
  │                 └── Answer.create (answer_value = "08123456789")
  └── UniqueIdField (komponen baru)
        ├── POST /responses/check-unique (real-time availability check)
        └── POST /responses/submit
              └── Response_Validator (responses.js) → validasi format + duplikat
                    └── Answer.create (answer_value = "001")

Admin (ResponseDetail.jsx)
  └── AnswerCard (diperbarui untuk phone_number dan unique_id)
        └── GET /responses/:id
```

---

## Components and Interfaces

### 1. Database Migration

**File baru:** `backend/src/migrations/20240104000001-add-phone-and-unique-id-types.js`

```javascript
'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo', 'rating_scale',
          'phone_number', 'unique_id'
        ));`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DELETE FROM questions WHERE type IN ('phone_number', 'unique_id');`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo', 'rating_scale'
        ));`,
        { transaction }
      );
    });
  },
};
```


### 2. Backend: Model Update

**File:** `backend/src/models/Question.js`

Tambahkan `'phone_number'` dan `'unique_id'` ke array `QUESTION_TYPES`:

```javascript
const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'short_text',
  'long_text',
  'numeric_scale',
  'date',
  'photo',
  'rating_scale',
  'phone_number',  // TAMBAHAN
  'unique_id',     // TAMBAHAN
];
```

### 3. Backend: Validasi Konfigurasi di `questions.js`

**File:** `backend/src/routes/questions.js`

**Perubahan 1:** Tambahkan `'phone_number'` dan `'unique_id'` ke array `VALID_QUESTION_TYPES`.

**Perubahan 2:** Tambahkan fungsi helper validasi konfigurasi:

```javascript
/**
 * Validasi konfigurasi options untuk tipe phone_number.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePhoneConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'Konfigurasi panjang (options) wajib diisi untuk tipe phone_number' };
  }
  const { min_length, max_length } = options;
  if (!Number.isInteger(min_length) || !Number.isInteger(max_length)) {
    return { valid: false, error: 'Panjang minimum dan maksimum harus berupa bilangan bulat' };
  }
  if (min_length < 1) {
    return { valid: false, error: 'Panjang minimum harus minimal 1' };
  }
  if (max_length < min_length) {
    return { valid: false, error: 'Panjang maksimum harus lebih besar atau sama dengan panjang minimum' };
  }
  return { valid: true };
}

/**
 * Validasi konfigurasi options untuk tipe unique_id.
 * Options bersifat opsional untuk unique_id.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUniqueIdConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: true }; // options opsional untuk unique_id
  }
  const { min_length, max_length } = options;
  if (min_length !== undefined || max_length !== undefined) {
    if (!Number.isInteger(min_length) || !Number.isInteger(max_length)) {
      return { valid: false, error: 'Panjang minimum dan maksimum harus berupa bilangan bulat' };
    }
    if (min_length < 1) {
      return { valid: false, error: 'Panjang minimum harus minimal 1' };
    }
    if (max_length < min_length) {
      return { valid: false, error: 'Panjang maksimum harus lebih besar atau sama dengan panjang minimum' };
    }
  }
  return { valid: true };
}
```

**Perubahan 3:** Panggil validasi di handler POST dan PUT setelah validasi tipe:

```javascript
// Setelah validasi VALID_QUESTION_TYPES
if (type === 'phone_number') {
  const phoneValidation = validatePhoneConfig(options);
  if (!phoneValidation.valid) {
    return res.status(422).json({ error: phoneValidation.error });
  }
}

if (type === 'unique_id') {
  const uniqueIdValidation = validateUniqueIdConfig(options);
  if (!uniqueIdValidation.valid) {
    return res.status(422).json({ error: uniqueIdValidation.error });
  }
}
```

**Perubahan 4:** Ekspor fungsi validasi untuk testing:

```javascript
module.exports.validatePhoneConfig = validatePhoneConfig;
module.exports.validateUniqueIdConfig = validateUniqueIdConfig;
```


### 4. Backend: Validasi Jawaban di `responses.js`

**File:** `backend/src/routes/responses.js`

**Perubahan 1:** Di handler `POST /responses/submit`, setelah validasi pertanyaan wajib dan sebelum transaksi, tambahkan validasi jawaban untuk `phone_number` dan `unique_id`:

```javascript
// Fetch all questions with their config for validation
const questionsWithConfig = await Question.findAll({
  where: { survey_id },
  attributes: ['id', 'type', 'options', 'is_required'],
});

const questionMap = {};
for (const q of questionsWithConfig) {
  questionMap[q.id] = q;
}

// Validate phone_number and unique_id answers
for (const ans of answers) {
  const q = questionMap[ans.question_id];
  if (!q) continue;

  if (q.type === 'phone_number' && ans.answer_value) {
    // Hanya digit
    if (!/^\d+$/.test(ans.answer_value)) {
      return res.status(422).json({ error: 'Nomor telepon hanya boleh berisi angka' });
    }
    // Panjang sesuai konfigurasi
    const config = q.options || {};
    if (config.min_length && ans.answer_value.length < config.min_length) {
      return res.status(422).json({
        error: `Panjang nomor telepon harus antara ${config.min_length} dan ${config.max_length} digit`,
      });
    }
    if (config.max_length && ans.answer_value.length > config.max_length) {
      return res.status(422).json({
        error: `Panjang nomor telepon harus antara ${config.min_length} dan ${config.max_length} digit`,
      });
    }
  }

  if (q.type === 'unique_id' && ans.answer_value) {
    // Hanya digit
    if (!/^\d+$/.test(ans.answer_value)) {
      return res.status(422).json({ error: 'Nomor kuesioner hanya boleh berisi angka' });
    }
    // Panjang sesuai konfigurasi (jika ada)
    const config = q.options || {};
    if (config.min_length && ans.answer_value.length < config.min_length) {
      return res.status(422).json({
        error: `Panjang nomor kuesioner harus antara ${config.min_length} dan ${config.max_length} digit`,
      });
    }
    if (config.max_length && ans.answer_value.length > config.max_length) {
      return res.status(422).json({
        error: `Panjang nomor kuesioner harus antara ${config.min_length} dan ${config.max_length} digit`,
      });
    }
    // Cek duplikat per survei
    const existingAnswer = await Answer.findOne({
      where: { question_id: q.id, answer_value: ans.answer_value },
      include: [{
        model: Response,
        as: 'response',
        where: { survey_id },
        attributes: ['id'],
      }],
    });
    if (existingAnswer) {
      return res.status(422).json({ error: 'Nomor kuesioner sudah digunakan dalam survei ini' });
    }
  }
}
```

**Perubahan 2:** Tambahkan endpoint baru `POST /responses/check-unique`:

```javascript
/**
 * POST /responses/check-unique
 * Check if a unique_id value is already used in a survey.
 * Body: { survey_id, question_id, value }
 * Returns: { available: boolean }
 * Requires: authMiddleware + requireRole('surveyor')
 */
router.post('/check-unique', authMiddleware, requireRole('surveyor'), async (req, res, next) => {
  try {
    const { survey_id, question_id, value } = req.body;

    if (!survey_id || !question_id || !value) {
      return res.status(422).json({
        error: 'Parameter survey_id, question_id, dan value wajib diisi',
      });
    }

    const existingAnswer = await Answer.findOne({
      where: { question_id, answer_value: value },
      include: [{
        model: Response,
        as: 'response',
        where: { survey_id },
        attributes: ['id'],
      }],
    });

    res.json({ available: !existingAnswer });
  } catch (error) {
    next(error);
  }
});
```


### 5. Frontend: Survey Builder — Config Editors

**File:** `frontend/src/pages/SurveyBuilder.jsx`

**Perubahan 1:** Tambahkan tipe baru ke array `QUESTION_TYPES`:

```javascript
const QUESTION_TYPES = [
  { value: 'single_choice', label: 'Pilihan Tunggal' },
  { value: 'multiple_choice', label: 'Pilihan Ganda' },
  { value: 'short_text', label: 'Teks Pendek' },
  { value: 'long_text', label: 'Teks Panjang' },
  { value: 'numeric_scale', label: 'Skala Numerik' },
  { value: 'date', label: 'Tanggal' },
  { value: 'photo', label: 'Upload Foto' },
  { value: 'rating_scale', label: 'Rating Scale' },
  { value: 'phone_number', label: 'Nomor Telepon' },       // TAMBAHAN
  { value: 'unique_id', label: 'Nomor Kuesioner (Unik)' }, // TAMBAHAN
];
```

**Perubahan 2:** Tambahkan komponen `PhoneConfigEditor`:

```jsx
/**
 * Editor konfigurasi untuk tipe pertanyaan phone_number.
 * Mengelola min_length dan max_length.
 */
function PhoneConfigEditor({ config, onChange }) {
  const { min_length = 10, max_length = 13 } = config || {};

  function update(field, value) {
    onChange({ min_length, max_length, [field]: value });
  }

  return (
    <div className="space-y-4 p-4 bg-green-50 border border-green-200 rounded-lg">
      <p className="text-sm font-medium text-green-800">Konfigurasi Nomor Telepon</p>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Min Digit</label>
          <input
            type="number"
            min={1}
            max={20}
            value={min_length}
            onChange={(e) => update('min_length', parseInt(e.target.value, 10) || 1)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Panjang minimum digit"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Digit</label>
          <input
            type="number"
            min={1}
            max={20}
            value={max_length}
            onChange={(e) => update('max_length', parseInt(e.target.value, 10) || 13)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Panjang maksimum digit"
          />
        </div>
      </div>
      <div className="text-xs text-gray-500">
        Menerima nomor telepon {min_length}–{max_length} digit (angka saja, tanpa +62)
      </div>
    </div>
  );
}
```

**Perubahan 3:** Tambahkan komponen `UniqueIdConfigEditor`:

```jsx
/**
 * Editor konfigurasi untuk tipe pertanyaan unique_id.
 * Mengelola min_length dan max_length (opsional).
 */
function UniqueIdConfigEditor({ config, onChange }) {
  const { min_length = 1, max_length = 20 } = config || {};

  function update(field, value) {
    onChange({ min_length, max_length, [field]: value });
  }

  return (
    <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
      <p className="text-sm font-medium text-purple-800">Konfigurasi Nomor Kuesioner (Unik)</p>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Min Digit</label>
          <input
            type="number"
            min={1}
            max={50}
            value={min_length}
            onChange={(e) => update('min_length', parseInt(e.target.value, 10) || 1)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Panjang minimum digit"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Digit</label>
          <input
            type="number"
            min={1}
            max={50}
            value={max_length}
            onChange={(e) => update('max_length', parseInt(e.target.value, 10) || 20)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Panjang maksimum digit"
          />
        </div>
      </div>
      <div className="text-xs text-gray-500">
        Nomor kuesioner manual {min_length}–{max_length} digit (angka saja, unik per survei)
      </div>
    </div>
  );
}
```

**Perubahan 4:** Di `QuestionFormModal`, tambahkan state dan logika:

```javascript
// State tambahan
const [phoneConfig, setPhoneConfig] = useState(
  initial?.type === 'phone_number' && initial?.options && !Array.isArray(initial.options)
    ? initial.options
    : { min_length: 10, max_length: 13 }
);
const [uniqueIdConfig, setUniqueIdConfig] = useState(
  initial?.type === 'unique_id' && initial?.options && !Array.isArray(initial.options)
    ? initial.options
    : { min_length: 1, max_length: 20 }
);

// Di handleTypeChange, reset config saat tipe berubah
function handleTypeChange(newType) {
  setType(newType);
  if (!CHOICE_TYPES.includes(newType)) setRandomizeOptions(false);
  if (newType !== 'rating_scale') setRatingConfig({ min: 1, max: 5, display: 'stars', labels: {} });
  if (newType !== 'phone_number') setPhoneConfig({ min_length: 10, max_length: 13 });
  if (newType !== 'unique_id') setUniqueIdConfig({ min_length: 1, max_length: 20 });
}

// Di handleSubmit, sertakan config dalam payload
const payload = {
  text: text.trim(),
  type,
  is_required: isRequired,
  ...(isChoiceType ? { options: options.filter((o) => o.value.trim() || o.label.trim()), randomize_options: randomizeOptions } : {}),
  ...(type === 'rating_scale' ? { options: ratingConfig } : {}),
  ...(type === 'phone_number' ? { options: phoneConfig } : {}),
  ...(type === 'unique_id' ? { options: uniqueIdConfig } : {}),
  skip_logic: skipLogic,
};
```

**Perubahan 5:** Di JSX, render config editors setelah type selector:

```jsx
{type === 'phone_number' && (
  <PhoneConfigEditor config={phoneConfig} onChange={setPhoneConfig} />
)}
{type === 'unique_id' && (
  <UniqueIdConfigEditor config={uniqueIdConfig} onChange={setUniqueIdConfig} />
)}
```


### 6. Frontend: Survey Form — Input Components

**File:** `frontend/src/surveyor/pages/SurveyForm.jsx`

**Perubahan 1:** Tambahkan komponen `PhoneNumberField`:

```jsx
/**
 * Komponen input untuk pertanyaan phone_number.
 * Hanya menerima karakter digit (0-9).
 */
function PhoneNumberField({ question, answer, onChange, hasError }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { min_length = 10, max_length = 13 } = config;

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(digits);
  }

  const currentLength = (answer || '').length;
  const isValidLength = currentLength >= min_length && currentLength <= max_length;

  return (
    <div className="space-y-1">
      <input
        type="tel"
        inputMode="numeric"
        value={answer || ''}
        onChange={handleChange}
        maxLength={max_length}
        placeholder="Masukkan nomor telepon"
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
          hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
        aria-label={`Nomor telepon untuk: ${question.text}`}
      />
      {currentLength > 0 && !isValidLength && (
        <p className="text-xs text-amber-600">
          Masukkan {min_length}-{max_length} digit angka ({currentLength} digit saat ini)
        </p>
      )}
    </div>
  );
}
```

**Perubahan 2:** Tambahkan komponen `UniqueIdField`:

```jsx
/**
 * Komponen input untuk pertanyaan unique_id.
 * Hanya menerima karakter digit (0-9) dengan indikator ketersediaan real-time.
 */
function UniqueIdField({ question, answer, onChange, hasError, surveyId }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { min_length, max_length } = config;

  const [availability, setAvailability] = useState(null); // null | 'checking' | 'available' | 'taken'
  const debounceRef = useRef(null);

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(digits);

    // Debounced availability check
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (digits.length > 0) {
      setAvailability('checking');
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await api.post('/responses/check-unique', {
            survey_id: surveyId,
            question_id: question.id,
            value: digits,
          });
          setAvailability(res.data.available ? 'available' : 'taken');
        } catch {
          setAvailability(null);
        }
      }, 500);
    } else {
      setAvailability(null);
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-1">
      <input
        type="text"
        inputMode="numeric"
        value={answer || ''}
        onChange={handleChange}
        maxLength={max_length || undefined}
        placeholder="Masukkan nomor kuesioner"
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
          hasError || availability === 'taken' ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
        aria-label={`Nomor kuesioner untuk: ${question.text}`}
      />
      {availability === 'checking' && (
        <p className="text-xs text-gray-400">Memeriksa ketersediaan...</p>
      )}
      {availability === 'available' && (
        <p className="text-xs text-green-600">Nomor tersedia</p>
      )}
      {availability === 'taken' && (
        <p className="text-xs text-red-600">Nomor sudah digunakan</p>
      )}
      {min_length && max_length && (answer || '').length > 0 && (
        ((answer || '').length < min_length || (answer || '').length > max_length) && (
          <p className="text-xs text-amber-600">
            Masukkan {min_length}-{max_length} digit angka
          </p>
        )
      )}
    </div>
  );
}
```

**Perubahan 3:** Di komponen `QuestionField`, tambahkan case baru:

```javascript
case 'phone_number':
  return (
    <PhoneNumberField
      question={question}
      answer={answer}
      onChange={onChange}
      hasError={hasError}
    />
  );

case 'unique_id':
  return (
    <UniqueIdField
      question={question}
      answer={answer}
      onChange={onChange}
      hasError={hasError}
      surveyId={surveyId}
    />
  );
```

**Perubahan 4:** Pastikan `surveyId` (dari `useParams`) diteruskan ke `QuestionField` dan kemudian ke `UniqueIdField`.


### 7. Frontend: Response Detail Update

**File:** `frontend/src/pages/ResponseDetail.jsx`

**Perubahan 1:** Tambahkan tipe baru ke objek `typeLabel` di komponen `AnswerCard`:

```javascript
const typeLabel = {
  single_choice: 'Pilihan Tunggal',
  multiple_choice: 'Pilihan Ganda',
  short_text: 'Teks Pendek',
  long_text: 'Teks Panjang',
  numeric_scale: 'Skala Numerik',
  date: 'Tanggal',
  photo: 'Upload Foto',
  rating_scale: 'Rating Scale',
  phone_number: 'Nomor Telepon',              // TAMBAHAN
  unique_id: 'Nomor Kuesioner (Unik)',        // TAMBAHAN
};
```

**Perubahan 2:** Tidak perlu case khusus di `renderValue` — kedua tipe menggunakan `answer_value` sebagai teks, yang sudah ditangani oleh default case (`<span>{answer.answer_value}</span>`).

---

## Data Models

Tidak ada tabel atau kolom baru. Perubahan hanya pada CHECK constraint dan penggunaan kolom `options` yang sudah ada.

### Format `options` untuk `phone_number`

```json
{
  "min_length": 10,
  "max_length": 13
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `min_length` | integer | Ya | Panjang minimum digit, minimal 1 |
| `max_length` | integer | Ya | Panjang maksimum digit, harus >= min_length |

### Format `options` untuk `unique_id`

```json
{
  "min_length": 1,
  "max_length": 20
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `min_length` | integer | Tidak | Panjang minimum digit, minimal 1 (default: tanpa batasan) |
| `max_length` | integer | Tidak | Panjang maksimum digit, harus >= min_length (default: tanpa batasan) |

### Format `answer_value`

Nilai disimpan sebagai string angka di kolom `answer_value` (TEXT):
- `phone_number`: misalnya `"08123456789"`, `"081234567890123"`
- `unique_id`: misalnya `"001"`, `"12345"`

### Perubahan CHECK Constraint

**Sebelum:**
```sql
CHECK (type IN ('single_choice','multiple_choice','short_text','long_text','numeric_scale','date','photo','rating_scale'))
```

**Sesudah:**
```sql
CHECK (type IN ('single_choice','multiple_choice','short_text','long_text','numeric_scale','date','photo','rating_scale','phone_number','unique_id'))
```

---

## Correctness Properties

### Property 1: Nomor Telepon Selalu Berisi Hanya Digit dengan Panjang Valid

*For any* konfigurasi phone_number yang valid (min_length >= 1, max_length >= min_length) dan nilai `answer_value` yang dikirimkan, sistem hanya menerima dan menyimpan nilai yang hanya berisi karakter digit (0-9) dengan panjang dalam rentang [min_length, max_length]; semua nilai dengan karakter non-digit atau panjang di luar rentang harus ditolak dengan HTTP 422.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Property 2: Unique ID Selalu Unik per Survei

*For any* survei dan sejumlah penyimpanan jawaban `unique_id` yang berhasil, tidak ada dua jawaban untuk pertanyaan `unique_id` yang sama dalam survei yang sama yang memiliki `answer_value` identik.

**Validates: Requirements 5.3**

---

### Property 3: Konfigurasi dengan max_length < min_length Selalu Ditolak

*For any* pasangan nilai (min_length, max_length) di mana max_length < min_length, fungsi `validatePhoneConfig` dan `validateUniqueIdConfig` harus selalu mengembalikan `{ valid: false }` dan endpoint harus mengembalikan HTTP 422.

**Validates: Requirements 2.4, 3.4**

---

### Property 4: Input Non-Angka Selalu Ditolak

*For any* string yang mengandung setidaknya satu karakter non-digit, validasi jawaban untuk tipe `phone_number` dan `unique_id` harus selalu mengembalikan error.

**Validates: Requirements 4.2, 5.2**

---

## Error Handling

### Backend

| Kondisi | HTTP | Pesan |
|---|---|---|
| `options` null untuk `phone_number` | 422 | `"Konfigurasi panjang (options) wajib diisi untuk tipe phone_number"` |
| `min_length` atau `max_length` bukan integer | 422 | `"Panjang minimum dan maksimum harus berupa bilangan bulat"` |
| `min_length < 1` | 422 | `"Panjang minimum harus minimal 1"` |
| `max_length < min_length` | 422 | `"Panjang maksimum harus lebih besar atau sama dengan panjang minimum"` |
| `answer_value` phone mengandung non-digit | 422 | `"Nomor telepon hanya boleh berisi angka"` |
| `answer_value` phone panjang di luar rentang | 422 | `"Panjang nomor telepon harus antara {min} dan {max} digit"` |
| `answer_value` unique_id mengandung non-digit | 422 | `"Nomor kuesioner hanya boleh berisi angka"` |
| `answer_value` unique_id panjang di luar rentang | 422 | `"Panjang nomor kuesioner harus antara {min} dan {max} digit"` |
| `answer_value` unique_id duplikat per survei | 422 | `"Nomor kuesioner sudah digunakan dalam survei ini"` |
| Parameter check-unique tidak lengkap | 422 | `"Parameter survey_id, question_id, dan value wajib diisi"` |

### Frontend

| Kondisi | Penanganan |
|---|---|
| Pertanyaan required belum diisi | Border merah + pesan "Pertanyaan ini wajib diisi" |
| Input non-digit | Karakter diabaikan (filtered di onChange) |
| Panjang di luar rentang | Pesan bantuan amber di bawah input |
| Unique ID sudah digunakan | Indikator merah "Nomor sudah digunakan" |
| Unique ID tersedia | Indikator hijau "Nomor tersedia" |
| Error validasi dari backend | Ditampilkan di `submitError` banner |

---

## Testing Strategy

### Unit Tests Backend (`backend/tests/unit/questions.test.js`)

Tambahkan describe block `phone_number question type`:
1. POST dengan tipe `phone_number` dan options `{ min_length: 10, max_length: 13 }` -> 201
2. POST dengan `max_length < min_length` -> 422
3. POST dengan `min_length < 1` -> 422
4. POST dengan `min_length` bukan integer -> 422
5. POST tanpa `options` untuk `phone_number` -> 422
6. PUT update konfigurasi phone yang sudah ada -> 200

Tambahkan describe block `unique_id question type`:
1. POST dengan tipe `unique_id` dan options `{ min_length: 1, max_length: 20 }` -> 201
2. POST dengan tipe `unique_id` tanpa options -> 201 (options opsional)
3. POST dengan `max_length < min_length` -> 422
4. PUT update konfigurasi unique_id yang sudah ada -> 200

### Unit Tests Backend (`backend/tests/unit/responses.test.js`)

Tambahkan describe block `phone_number answer validation`:
1. Submit jawaban phone_number dengan angka valid -> 201
2. Submit jawaban phone_number dengan karakter non-digit -> 422
3. Submit jawaban phone_number dengan panjang kurang dari min_length -> 422
4. Submit jawaban phone_number dengan panjang lebih dari max_length -> 422

Tambahkan describe block `unique_id answer validation`:
1. Submit jawaban unique_id dengan angka valid -> 201
2. Submit jawaban unique_id dengan karakter non-digit -> 422
3. Submit jawaban unique_id duplikat dalam survei yang sama -> 422
4. Submit jawaban unique_id yang sama di survei berbeda -> 201 (diperbolehkan)

Tambahkan describe block `POST /responses/check-unique`:
1. Cek nilai yang belum ada -> `{ available: true }`
2. Cek nilai yang sudah ada -> `{ available: false }`
3. Tanpa parameter lengkap -> 422

### Unit Tests Frontend (`frontend/src/pages/__tests__/SurveyBuilder.test.jsx`)

1. Dropdown tipe menampilkan opsi "Nomor Telepon" dan "Nomor Kuesioner (Unik)"
2. Memilih "Nomor Telepon" menampilkan PhoneConfigEditor
3. Memilih "Nomor Kuesioner (Unik)" menampilkan UniqueIdConfigEditor
4. Mengubah tipe menyembunyikan editor yang tidak relevan
5. Payload yang dikirim menyertakan `options` yang benar

### Unit Tests Frontend (`frontend/src/surveyor/pages/__tests__/SurveyForm.test.jsx`)

1. PhoneNumberField merender input type=tel
2. Input non-digit difilter (hanya angka yang muncul)
3. Pesan panjang ditampilkan jika di luar rentang
4. UniqueIdField merender input dengan placeholder
5. Indikator ketersediaan ditampilkan setelah debounce

### Unit Tests Frontend (`frontend/src/pages/__tests__/ResponseDetail.test.jsx`)

1. Badge tipe menampilkan "Nomor Telepon" untuk phone_number
2. Badge tipe menampilkan "Nomor Kuesioner (Unik)" untuk unique_id
3. Nilai answer_value ditampilkan sebagai teks
4. answer_value kosong menampilkan em dash

### Property-Based Tests Backend (`backend/tests/properties/phoneAndUniqueId.property.test.js`)

1. **Property 1**: Untuk semua string yang hanya berisi digit dengan panjang dalam [min_length, max_length], validasi phone_number selalu menerima
2. **Property 3**: Untuk semua pasangan (min_length, max_length) di mana max_length < min_length, `validatePhoneConfig` selalu mengembalikan `{ valid: false }`
3. **Property 4**: Untuk semua string yang mengandung karakter non-digit, validasi jawaban phone_number dan unique_id selalu menolak

### Property-Based Tests Frontend (`frontend/src/surveyor/pages/__tests__/PhoneAndUniqueId.property.test.jsx`)

1. **Property Frontend**: Untuk semua input string, PhoneNumberField hanya meneruskan karakter digit ke onChange (filter non-digit)