# Design Document: Deadline & Status Survei

## Overview

Fitur ini menambahkan kemampuan admin/supervisor untuk menetapkan tanggal mulai (`start_date`) dan tanggal berakhir (`end_date`) pada setiap survei. Dua kolom baru `TIMESTAMPTZ` (nullable) ditambahkan ke tabel `surveys` melalui migration baru. Backend memvalidasi konsistensi tanggal, menolak pengisian di luar periode aktif, dan memfilter survei untuk surveyor. Frontend menampilkan date picker di Survey Builder, badge status temporal di halaman admin, dan informasi sisa hari dengan pemblokiran tombol di halaman surveyor.

**Perubahan utama:**
- 1 migration baru (tambah kolom `start_date` dan `end_date`)
- Update model `Survey.js` (tambah field baru)
- Update `surveys.js` (validasi tanggal, filter surveyor, include field baru di response)
- Update `responses.js` (pengecekan periode aktif di `POST /responses/start`)
- Update `SurveyBuilder.jsx` (date picker section)
- Update `Surveys.jsx` (badge status temporal)
- Update `SurveyList.jsx` (sisa hari + pemblokiran tombol)
- Update clone handler (reset `start_date`/`end_date` ke null)

---

## Architecture

Tidak ada komponen arsitektur baru. Perubahan dilakukan pada lapisan yang sudah ada:

```
Admin (SurveyBuilder.jsx)
  └── Date_Picker_Section (inline)
        └── POST /surveys  atau  PUT /surveys/:id
              └── Date_Validator (surveys.js) → validasi end_date > start_date
                    └── Survey.create / Survey.update (PostgreSQL)

Admin (Surveys.jsx)
  └── Temporal_Badge (inline)
        └── GET /surveys → response termasuk start_date, end_date
              └── Logika badge: "Akan Datang" | "Aktif" | "Berakhir"

Surveyor (SurveyList.jsx)
  └── GET /surveys (filtered: hanya periode aktif)
        └── Period_Checker (surveys.js) → WHERE clause tambahan
  └── Tampilan sisa hari + disabled button
        └── Logika frontend berdasarkan start_date/end_date

Surveyor (SurveyForm.jsx)
  └── POST /responses/start
        └── Period_Checker (responses.js) → tolak jika di luar periode
              └── HTTP 409 "Survei sudah berakhir" / "Survei belum dimulai"

Clone (surveys.js)
  └── POST /surveys/:id/clone
        └── start_date = null, end_date = null (tidak diwarisi)
```

---

## Components and Interfaces

### 1. Database Migration

**File baru:** `backend/src/migrations/20240105000001-add-survey-deadline.js`

```javascript
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surveys', 'start_date', {
      type: Sequelize.DATE,       // TIMESTAMPTZ di PostgreSQL
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('surveys', 'end_date', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('surveys', 'end_date');
    await queryInterface.removeColumn('surveys', 'start_date');
  },
};
```

### 2. Backend: Model Update

**File:** `backend/src/models/Survey.js`

Tambahkan field `start_date` dan `end_date` ke definisi model:

```javascript
start_date: {
  type: DataTypes.DATE,
  allowNull: true,
  defaultValue: null,
},
end_date: {
  type: DataTypes.DATE,
  allowNull: true,
  defaultValue: null,
},
```

### 3. Backend: Validasi dan Penyimpanan di `surveys.js`

**File:** `backend/src/routes/surveys.js`

**Fungsi helper `validateSurveyDates`:**

```javascript
/**
 * Validasi konsistensi start_date dan end_date.
 * @param {string|null} startDate - ISO 8601 string atau null
 * @param {string|null} endDate - ISO 8601 string atau null
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSurveyDates(startDate, endDate) {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return { valid: false, error: 'Tanggal berakhir harus lebih besar dari tanggal mulai' };
    }
  }
  return { valid: true };
}
```

**Perubahan pada `POST /surveys`:**

```javascript
router.post('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { title, description, start_date, end_date } = req.body;

    // Validasi tanggal
    const dateValidation = validateSurveyDates(start_date || null, end_date || null);
    if (!dateValidation.valid) {
      return res.status(422).json({ error: dateValidation.error });
    }

    const survey = await Survey.create({
      title,
      description: description || null,
      status: 'draft',
      created_by: req.user.id,
      start_date: start_date || null,
      end_date: end_date || null,
    });

    // ... audit log dan response (tambahkan start_date, end_date di response)
  }
});
```

**Perubahan pada `PUT /surveys/:id`:**

```javascript
router.put('/:id', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, start_date, end_date } = req.body;

    const survey = await Survey.findOne({ where: { id } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    // Tentukan nilai final untuk validasi
    const finalStartDate = start_date !== undefined ? (start_date || null) : survey.start_date;
    const finalEndDate = end_date !== undefined ? (end_date || null) : survey.end_date;

    const dateValidation = validateSurveyDates(finalStartDate, finalEndDate);
    if (!dateValidation.valid) {
      return res.status(422).json({ error: dateValidation.error });
    }

    // Update fields
    if (title !== undefined) survey.title = title;
    if (description !== undefined) survey.description = description;
    if (start_date !== undefined) survey.start_date = start_date || null;
    if (end_date !== undefined) survey.end_date = end_date || null;

    await survey.save();
    // ... audit log dan response (tambahkan start_date, end_date di response)
  }
});
```

**Perubahan pada `GET /surveys` — filter untuk surveyor:**

Untuk role `surveyor`, tambahkan filter periode aktif:

```javascript
const { Op } = require('sequelize');
const now = new Date();

// Surveyor: hanya survei aktif DAN dalam periode aktif
surveys = await Survey.findAll({
  where: {
    status: 'active',
    [Op.and]: [
      {
        [Op.or]: [
          { start_date: null },
          { start_date: { [Op.lte]: now } },
        ],
      },
      {
        [Op.or]: [
          { end_date: null },
          { end_date: { [Op.gt]: now } },
        ],
      },
    ],
  },
  attributes: ['id', 'title', 'description', 'status', 'start_date', 'end_date', 'created_at'],
  order: [['created_at', 'DESC']],
});
```

Untuk role `admin`, `supervisor`, dan `viewer`, tambahkan `start_date` dan `end_date` ke attributes tanpa filter tambahan.

**Perubahan pada `GET /surveys/:id` — tambah field `is_expired`:**

```javascript
// Setelah fetch survey, hitung is_expired
const is_expired = survey.end_date ? new Date(survey.end_date) < new Date() : false;

res.json({
  // ... field yang sudah ada
  start_date: survey.start_date,
  end_date: survey.end_date,
  is_expired,
  questions,
});
```

**Perubahan pada `GET /surveys` — tambah field di response mapping:**

```javascript
let result = surveys.map((s) => ({
  // ... field yang sudah ada
  start_date: s.start_date,
  end_date: s.end_date,
}));
```

**Perubahan pada `POST /surveys/:id/clone` — reset tanggal:**

Di handler clone, saat membuat survei baru, pastikan `start_date` dan `end_date` bernilai null:

```javascript
const cloned = await Survey.create({
  title: `Salinan dari ${source.title}`,
  description: source.description,
  status: 'draft',
  created_by: req.user.id,
  start_date: null,   // TAMBAHAN: tidak mewarisi tanggal
  end_date: null,      // TAMBAHAN: tidak mewarisi tanggal
}, { transaction: t });
```

### 4. Backend: Pengecekan Periode di `responses.js`

**File:** `backend/src/routes/responses.js`

**Perubahan pada `POST /responses/start`:**

Setelah memverifikasi survei aktif, tambahkan pengecekan periode:

```javascript
router.post('/start', authMiddleware, requireRole('surveyor'), async (req, res, next) => {
  try {
    const { survey_id } = req.body;
    const surveyor_id = req.user.id;

    if (!survey_id) {
      return res.status(422).json({ error: 'survey_id wajib diisi' });
    }

    // Verify survey exists and is active
    const survey = await Survey.findOne({ where: { id: survey_id, status: 'active' } });
    if (!survey) {
      return res.status(409).json({ error: 'Survei tidak lagi aktif' });
    }

    // TAMBAHAN: Pengecekan periode aktif
    const now = new Date();
    if (survey.end_date && new Date(survey.end_date) <= now) {
      return res.status(409).json({ error: 'Survei sudah berakhir' });
    }
    if (survey.start_date && new Date(survey.start_date) > now) {
      return res.status(409).json({ error: 'Survei belum dimulai' });
    }

    // ... lanjutkan proses pembuatan sesi (kode yang sudah ada)
  }
});
```

### 5. Frontend: Date Picker di Survey Builder

**File:** `frontend/src/pages/SurveyBuilder.jsx`

Perubahan dilakukan di komponen `SurveyBuilder` (bukan di modal pertanyaan). Tambahkan section date picker di header survei, di bawah deskripsi.

**State tambahan:**

```javascript
const [startDate, setStartDate] = useState(survey?.start_date || '');
const [endDate, setEndDate] = useState(survey?.end_date || '');
const [dateError, setDateError] = useState('');
```

**Komponen `DatePickerSection`:**

```jsx
function DatePickerSection({ startDate, endDate, onStartDateChange, onEndDateChange, dateError }) {
  return (
    <div className="bg-white rounded-xl shadow px-6 py-4 space-y-3">
      <p className="text-sm font-medium text-gray-700">Periode Pengisian Survei</p>
      <div className="flex items-start gap-4 flex-wrap">
        <div>
          <label htmlFor="survey-start-date" className="block text-xs font-medium text-gray-600 mb-1">
            Tanggal Mulai
          </label>
          <input
            id="survey-start-date"
            type="datetime-local"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Tanggal mulai survei"
          />
        </div>
        <div>
          <label htmlFor="survey-end-date" className="block text-xs font-medium text-gray-600 mb-1">
            Tanggal Berakhir
          </label>
          <input
            id="survey-end-date"
            type="datetime-local"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              dateError ? 'border-red-400' : 'border-gray-300'
            }`}
            aria-label="Tanggal berakhir survei"
            aria-describedby={dateError ? 'date-error' : undefined}
            aria-invalid={!!dateError}
          />
        </div>
      </div>
      {dateError && (
        <p id="date-error" className="text-xs text-red-600">{dateError}</p>
      )}
      <p className="text-xs text-gray-400">
        Kosongkan untuk survei tanpa batasan waktu.
      </p>
    </div>
  );
}
```

**Logika simpan tanggal:** Saat admin menyimpan perubahan survei (misalnya melalui tombol "Simpan Periode" atau auto-save), panggil `PUT /surveys/:id` dengan `start_date` dan `end_date`.

**Validasi frontend:** Jika `end_date` diisi dan `start_date` diisi, periksa bahwa `end_date > start_date`. Jika tidak, tampilkan pesan error dan cegah pengiriman.

### 6. Frontend: Badge Status Temporal di Surveys.jsx

**File:** `frontend/src/pages/Surveys.jsx`

**Komponen `TemporalBadge`:**

```jsx
/**
 * Badge status temporal survei berdasarkan start_date dan end_date.
 * - "Akan Datang" (biru): start_date di masa depan
 * - "Aktif" (hijau): dalam periode aktif atau tanpa batasan waktu
 * - "Berakhir" (merah): end_date di masa lalu
 */
function TemporalBadge({ startDate, endDate }) {
  const now = new Date();

  if (startDate && new Date(startDate) > now) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
        Akan Datang
      </span>
    );
  }

  if (endDate && new Date(endDate) < now) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        Berakhir
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      Aktif
    </span>
  );
}
```

**Penempatan:** Di kolom Status, di samping `SurveyStatusBadge` yang sudah ada:

```jsx
<td className="px-5 py-3">
  <div className="flex items-center gap-1.5">
    <SurveyStatusBadge status={survey.status} />
    <TemporalBadge startDate={survey.start_date} endDate={survey.end_date} />
  </div>
</td>
```

### 7. Frontend: Sisa Hari dan Pemblokiran di SurveyList.jsx

**File:** `frontend/src/surveyor/pages/SurveyList.jsx`

**Fungsi helper:**

```javascript
/**
 * Hitung selisih hari antara dua tanggal (dibulatkan ke bawah).
 * @param {string} dateStr - ISO 8601 date string
 * @returns {number} Jumlah hari tersisa
 */
function daysUntil(dateStr) {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target - now;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Tentukan status temporal survei.
 * @returns {{ canStart: boolean, label: string|null, isUrgent: boolean }}
 */
function getSurveyTemporalStatus(startDate, endDate) {
  const now = new Date();

  if (endDate && new Date(endDate) <= now) {
    return { canStart: false, label: 'Berakhir', isUrgent: true };
  }

  if (startDate && new Date(startDate) > now) {
    const days = daysUntil(startDate);
    return { canStart: false, label: `Dimulai dalam ${days} hari`, isUrgent: false };
  }

  if (endDate) {
    const days = daysUntil(endDate);
    return { canStart: true, label: `Sisa ${days} hari`, isUrgent: days < 3 };
  }

  return { canStart: true, label: null, isUrgent: false };
}
```

**Perubahan di render card survei:**

```jsx
{surveys.map((survey) => {
  const temporal = getSurveyTemporalStatus(survey.start_date, survey.end_date);
  // ... quota info

  return (
    <div key={survey.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-800">{survey.title}</h2>
        {survey.description && (
          <p className="text-sm text-gray-500 mt-1">{survey.description}</p>
        )}
        {/* Informasi sisa hari */}
        {temporal.label && (
          <p className={`text-xs mt-1 font-medium ${temporal.isUrgent ? 'text-red-600' : 'text-gray-500'}`}>
            {temporal.label}
          </p>
        )}
      </div>

      {/* ... quota progress */}

      <button
        onClick={() => handleStartSurvey(survey.id)}
        disabled={!temporal.canStart}
        className={`w-full sm:w-auto text-sm font-medium px-5 py-2 rounded-lg transition-colors ${
          temporal.canStart
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
        aria-label={temporal.canStart ? `Mulai isi survei ${survey.title}` : `Survei ${survey.title} tidak dapat diisi`}
      >
        Mulai Isi
      </button>
    </div>
  );
})}
```

---

## Data Models

### Perubahan Tabel `surveys`

Dua kolom baru ditambahkan:

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `start_date` | `TIMESTAMPTZ` | Ya | `NULL` | Tanggal mulai periode pengisian |
| `end_date` | `TIMESTAMPTZ` | Ya | `NULL` | Tanggal berakhir periode pengisian |

### Kombinasi Nilai dan Perilaku

| `start_date` | `end_date` | Perilaku |
|---|---|---|
| `NULL` | `NULL` | Survei selalu aktif (tanpa batasan waktu) |
| Terisi | `NULL` | Survei aktif setelah `start_date`, tanpa batas akhir |
| `NULL` | Terisi | Survei langsung aktif hingga `end_date` |
| Terisi | Terisi | Survei aktif dalam rentang `[start_date, end_date)` |

### Field Baru di Response API

**`GET /surveys`** — tambah `start_date` dan `end_date` di setiap item.

**`GET /surveys/:id`** — tambah:
- `start_date` (TIMESTAMPTZ atau null)
- `end_date` (TIMESTAMPTZ atau null)
- `is_expired` (boolean): `true` jika `end_date` terisi dan `end_date < now`

### Perubahan pada Clone

Survei hasil clone selalu memiliki `start_date = null` dan `end_date = null`, terlepas dari nilai pada survei asli.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Validasi Konsistensi Tanggal

*For any* pasangan `(start_date, end_date)`, fungsi `validateSurveyDates` harus mengembalikan `valid: true` jika dan hanya jika salah satu kondisi terpenuhi: (a) keduanya null, (b) hanya salah satu yang terisi, atau (c) keduanya terisi dan `end_date > start_date`. Untuk semua kasus lain (keduanya terisi dan `end_date <= start_date`), fungsi harus mengembalikan `valid: false`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 2: Penegakan Periode Aktif pada Pengisian Survei

*For any* survei aktif dengan kombinasi `(start_date, end_date)` dan waktu saat ini `now`, `POST /responses/start` harus diterima jika dan hanya jika survei berada dalam periode aktif: (`start_date` null ATAU `start_date <= now`) DAN (`end_date` null ATAU `end_date > now`). Di luar kondisi tersebut, endpoint harus mengembalikan HTTP 409.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 3: Filter Survei Surveyor Berdasarkan Periode Aktif

*For any* kumpulan survei aktif dengan berbagai kombinasi `(start_date, end_date)`, ketika surveyor mengakses `GET /surveys`, hasil yang dikembalikan harus hanya berisi survei yang memenuhi: (`start_date` null ATAU `start_date <= now`) DAN (`end_date` null ATAU `end_date > now`). Tidak boleh ada survei di luar periode aktif yang muncul dalam hasil.

**Validates: Requirements 4.1, 4.2**

### Property 4: Komputasi is_expired

*For any* survei dengan `end_date` terisi, field `is_expired` di response `GET /surveys/:id` harus bernilai `true` jika dan hanya jika `end_date < now`. Untuk survei dengan `end_date` null, `is_expired` harus selalu `false`.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 5: Klasifikasi Badge Temporal

*For any* survei dengan kombinasi `(start_date, end_date)`, badge temporal harus diklasifikasikan secara deterministik: jika `start_date` di masa depan → "Akan Datang", jika `end_date` di masa lalu → "Berakhir", selain itu → "Aktif". Klasifikasi ini harus konsisten untuk input yang sama.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 6: Status Temporal Surveyor (canStart dan Label)

*For any* survei dengan kombinasi `(start_date, end_date)`, fungsi `getSurveyTemporalStatus` harus mengembalikan `canStart: false` jika survei di luar periode aktif (expired atau belum dimulai), dan `canStart: true` jika dalam periode aktif. Label harus sesuai: "Berakhir" untuk expired, "Dimulai dalam X hari" untuk belum dimulai, "Sisa X hari" untuk aktif dengan deadline, dan null untuk tanpa deadline.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

### Property 7: Clone Selalu Mereset Tanggal

*For any* survei sumber dengan kombinasi `(start_date, end_date)` apapun (termasuk null), survei hasil clone melalui `POST /surveys/:id/clone` harus selalu memiliki `start_date = null` dan `end_date = null`.

**Validates: Requirements 10.1**

---

## Error Handling

### Backend

| Kondisi | HTTP | Pesan |
|---|---|---|
| `end_date <= start_date` (keduanya terisi) | 422 | `"Tanggal berakhir harus lebih besar dari tanggal mulai"` |
| Survei sudah berakhir (`end_date` di masa lalu) | 409 | `"Survei sudah berakhir"` |
| Survei belum dimulai (`start_date` di masa depan) | 409 | `"Survei belum dimulai"` |
| Survei tidak ditemukan | 404 | `"Survei tidak ditemukan"` |
| Survei tidak aktif | 409 | `"Survei tidak lagi aktif"` |

### Frontend

| Kondisi | Penanganan |
|---|---|
| `end_date <= start_date` di date picker | Pesan error merah di bawah input: "Tanggal berakhir harus setelah tanggal mulai", form submission dicegah |
| Survei expired di SurveyList | Teks "Berakhir" merah, tombol "Mulai Isi" disabled dan abu-abu |
| Survei belum dimulai di SurveyList | Teks "Dimulai dalam X hari", tombol "Mulai Isi" disabled dan abu-abu |
| Sisa hari < 3 | Teks "Sisa X hari" berwarna merah sebagai peringatan |
| Error 409 dari backend saat start | Ditampilkan di error banner pada halaman SurveyForm |

---

## Testing Strategy

### Unit Tests Backend (`backend/tests/unit/surveys.test.js`)

Tambahkan describe block `survey deadline`:

1. POST /surveys dengan `start_date` dan `end_date` valid → 201, kedua field tersimpan
2. POST /surveys dengan `end_date <= start_date` → 422
3. POST /surveys tanpa `start_date` dan `end_date` → 201, kedua field null
4. POST /surveys dengan hanya `start_date` → 201
5. POST /surveys dengan hanya `end_date` → 201
6. PUT /surveys/:id update `start_date` dan `end_date` → 200, field diperbarui
7. PUT /surveys/:id dengan `end_date <= start_date` → 422
8. GET /surveys sebagai surveyor → hanya survei dalam periode aktif
9. GET /surveys sebagai admin → semua survei termasuk expired dan belum dimulai
10. GET /surveys/:id → response mengandung `start_date`, `end_date`, `is_expired`
11. GET /surveys/:id dengan `end_date` di masa lalu → `is_expired: true`
12. GET /surveys/:id dengan `end_date` di masa depan → `is_expired: false`
13. GET /surveys/:id tanpa `end_date` → `is_expired: false`

### Unit Tests Backend (`backend/tests/unit/responses.test.js`)

Tambahkan describe block `survey deadline enforcement`:

1. POST /responses/start untuk survei dengan `end_date` di masa lalu → 409 "Survei sudah berakhir"
2. POST /responses/start untuk survei dengan `start_date` di masa depan → 409 "Survei belum dimulai"
3. POST /responses/start untuk survei dalam periode aktif → 201
4. POST /responses/start untuk survei tanpa `start_date`/`end_date` → 201
5. POST /responses/start untuk survei aktif tapi expired → 409 (periode lebih prioritas)

### Unit Tests Backend — Clone (`backend/tests/unit/surveys.test.js`)

Tambahkan test case di describe block `POST /surveys/:id/clone`:

1. Clone survei dengan `start_date` dan `end_date` → survei baru memiliki keduanya null

### Unit Tests Frontend (`frontend/src/pages/__tests__/SurveyBuilder.test.jsx`)

1. Date picker section menampilkan dua input tanggal dengan label yang benar
2. Mengisi kedua tanggal dan submit → payload mengandung `start_date` dan `end_date` dalam ISO 8601
3. Mengosongkan tanggal → payload mengandung null
4. Survei yang sudah ada menampilkan nilai tersimpan di date picker
5. `end_date <= start_date` → pesan error ditampilkan, submit dicegah

### Unit Tests Frontend (`frontend/src/pages/__tests__/Surveys.test.jsx`)

1. Temporal badge "Akan Datang" ditampilkan untuk survei dengan `start_date` di masa depan
2. Temporal badge "Aktif" ditampilkan untuk survei dalam periode aktif
3. Temporal badge "Berakhir" ditampilkan untuk survei dengan `end_date` di masa lalu
4. Temporal badge "Aktif" ditampilkan untuk survei tanpa tanggal
5. Temporal badge ditampilkan di samping badge status yang sudah ada

### Unit Tests Frontend (`frontend/src/surveyor/pages/__tests__/SurveyList.test.jsx`)

1. "Sisa X hari" ditampilkan untuk survei dengan `end_date` di masa depan
2. Teks sisa hari berwarna merah jika kurang dari 3 hari
3. "Berakhir" ditampilkan dan tombol disabled untuk survei expired
4. "Dimulai dalam X hari" ditampilkan dan tombol disabled untuk survei belum dimulai
5. Tidak ada informasi sisa hari untuk survei tanpa `end_date`
6. Tombol disabled memiliki atribut `disabled` dan tampilan abu-abu

### Property-Based Tests Backend (`backend/tests/properties/surveyDeadline.property.test.js`)

Library: **fast-check** (sudah digunakan di project ini)
Minimum iterasi: 100 per property

1. **Property 1**: Validasi konsistensi tanggal — generate random `(start_date, end_date)` pairs (termasuk null), verifikasi `validateSurveyDates` mengembalikan hasil yang benar.
   Tag: `Feature: survey-deadline, Property 1: Validasi konsistensi tanggal`

2. **Property 2**: Penegakan periode aktif — generate random `(start_date, end_date, now)` triples, verifikasi `POST /responses/start` diterima/ditolak sesuai logika periode.
   Tag: `Feature: survey-deadline, Property 2: Penegakan periode aktif pada pengisian survei`

3. **Property 3**: Filter surveyor — generate random kumpulan survei dengan berbagai tanggal, verifikasi hanya survei dalam periode aktif yang dikembalikan untuk surveyor.
   Tag: `Feature: survey-deadline, Property 3: Filter survei surveyor berdasarkan periode aktif`

4. **Property 4**: Komputasi is_expired — generate random `end_date` (past/future/null), verifikasi `is_expired` dihitung dengan benar.
   Tag: `Feature: survey-deadline, Property 4: Komputasi is_expired`

5. **Property 5**: Klasifikasi badge temporal — generate random `(start_date, end_date)`, verifikasi badge diklasifikasikan dengan benar.
   Tag: `Feature: survey-deadline, Property 5: Klasifikasi badge temporal`

6. **Property 6**: Status temporal surveyor — generate random `(start_date, end_date)`, verifikasi `getSurveyTemporalStatus` mengembalikan `canStart` dan `label` yang benar.
   Tag: `Feature: survey-deadline, Property 6: Status temporal surveyor`

7. **Property 7**: Clone mereset tanggal — generate random survei dengan berbagai `(start_date, end_date)`, clone, verifikasi hasil selalu memiliki null dates.
   Tag: `Feature: survey-deadline, Property 7: Clone selalu mereset tanggal`

