# Design Document: Clone/Duplikasi Survei

## Overview

Fitur ini menambahkan kemampuan duplikasi survei pada platform Web Survey. Satu endpoint baru `POST /surveys/:id/clone` ditambahkan ke route survei yang sudah ada, dan satu tombol "Duplikasi" ditambahkan ke kolom aksi di halaman `Surveys.jsx`. Proses duplikasi berjalan secara atomik menggunakan transaksi Sequelize, memastikan konsistensi data antara survei baru dan pertanyaan-pertanyaannya.

Kompleksitas utama fitur ini ada pada **remapping skip logic**: setiap referensi `question_id` di dalam JSONB `skip_logic` harus diperbarui dari UUID pertanyaan lama ke UUID pertanyaan baru yang dibuat saat duplikasi.

---

## Architecture

Fitur ini tidak memerlukan komponen arsitektur baru. Perubahan dilakukan pada lapisan yang sudah ada:

```
POST /surveys/:id/clone
        │
        ▼
authMiddleware → requireRole(['admin', 'supervisor'])
        │
        ▼
Clone Handler (surveys.js)
  ├── sequelize.transaction()
  │     ├── Survey.findOne(sourceId)          → 404 jika tidak ada
  │     ├── Survey.create(clonedData)          → survei baru, status=draft
  │     ├── Question.findAll(sourceId)         → ambil semua pertanyaan
  │     ├── buildIdMap(oldQuestions)           → { oldId → newId }
  │     ├── remapSkipLogic(questions, idMap)   → perbarui referensi
  │     └── Question.bulkCreate(clonedQs)      → simpan semua pertanyaan baru
  └── AuditLog.create(CLONE_SURVEY)            → setelah transaksi commit
```

---

## Components and Interfaces

### Backend: `POST /surveys/:id/clone`

**File:** `backend/src/routes/surveys.js`

**Middleware:** `authMiddleware`, `requireRole(['admin', 'supervisor'])`

**Request:**
```
POST /surveys/:id/clone
Authorization: Bearer <jwt>
```
Tidak ada request body.

**Response sukses (201):**
```json
{
  "id": "uuid-baru",
  "title": "Salinan dari Survei Kepuasan Pelanggan",
  "description": "Deskripsi survei asli",
  "status": "draft",
  "created_at": "2024-01-15T10:30:00.000Z",
  "question_count": 5
}
```

**Response error:**

| Kondisi | HTTP | Body |
|---|---|---|
| Survei tidak ditemukan | 404 | `{"error": "Survei tidak ditemukan"}` |
| Tidak terautentikasi | 401 | `{"error": "Token tidak valid atau sudah kedaluwarsa"}` |
| Role tidak diizinkan | 403 | `{"error": "Anda tidak memiliki izin untuk mengakses resource ini"}` |
| Error server / rollback | 500 | `{"error": "Terjadi kesalahan internal server"}` |

**Logika handler:**

```javascript
router.post('/:id/clone', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  const { id } = req.params;

  try {
    const result = await sequelize.transaction(async (t) => {
      // 1. Ambil survei sumber
      const source = await Survey.findOne({ where: { id }, transaction: t });
      if (!source) return null; // sinyal 404

      // 2. Buat survei baru
      const cloned = await Survey.create({
        title: `Salinan dari ${source.title}`,
        description: source.description,
        status: 'draft',
        created_by: req.user.id,
      }, { transaction: t });

      // 3. Ambil semua pertanyaan sumber
      const sourceQuestions = await Question.findAll({
        where: { survey_id: id },
        order: [['order_index', 'ASC']],
        transaction: t,
      });

      // 4. Bangun peta ID lama → ID baru
      const { v4: uuidv4 } = require('uuid');
      const idMap = {};
      sourceQuestions.forEach(q => { idMap[q.id] = uuidv4(); });

      // 5. Remap skip_logic dan buat pertanyaan baru
      const clonedQuestions = sourceQuestions.map(q => ({
        id: idMap[q.id],
        survey_id: cloned.id,
        text: q.text,
        type: q.type,
        order_index: q.order_index,
        is_required: q.is_required,
        randomize_options: q.randomize_options,
        options: q.options,
        skip_logic: remapSkipLogic(q.skip_logic, idMap),
      }));

      if (clonedQuestions.length > 0) {
        await Question.bulkCreate(clonedQuestions, { transaction: t });
      }

      return { cloned, questionCount: clonedQuestions.length };
    });

    if (!result) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    // 6. Audit log (di luar transaksi — setelah commit berhasil)
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLONE_SURVEY',
      entity_type: 'survey',
      entity_id: result.cloned.id,
      old_value: { source_survey_id: id, source_survey_title: result.cloned.title.replace('Salinan dari ', '') },
      new_value: { id: result.cloned.id, title: result.cloned.title, status: 'draft', question_count: result.questionCount },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: result.cloned.id,
      title: result.cloned.title,
      description: result.cloned.description,
      status: result.cloned.status,
      created_at: result.cloned.created_at,
      question_count: result.questionCount,
    });
  } catch (error) {
    next(error);
  }
});
```

**Fungsi helper `remapSkipLogic`:**

```javascript
/**
 * Memperbarui referensi question_id di dalam skip_logic
 * dari UUID pertanyaan lama ke UUID pertanyaan baru.
 *
 * @param {Array|null} skipLogic - Array skip logic dari pertanyaan sumber
 * @param {Object} idMap - Peta { oldQuestionId: newQuestionId }
 * @returns {Array|null}
 */
function remapSkipLogic(skipLogic, idMap) {
  if (!skipLogic || !Array.isArray(skipLogic)) return skipLogic;
  return skipLogic.map(rule => ({
    ...rule,
    condition: rule.condition ? {
      ...rule.condition,
      question_id: idMap[rule.condition.question_id] ?? rule.condition.question_id,
    } : rule.condition,
    target_question_id: idMap[rule.target_question_id] ?? rule.target_question_id,
  }));
}
```

### Frontend: `Surveys.jsx`

**Perubahan:**
1. Tambah state `cloningId` (string | null) — menyimpan ID survei yang sedang dalam proses duplikasi
2. Tambah handler `handleClone(survey)` — memanggil `POST /surveys/:id/clone`, lalu redirect ke builder
3. Tambah tombol "Duplikasi" di kolom aksi setiap baris

**Handler:**

```javascript
const [cloningId, setCloningId] = useState(null);

async function handleClone(survey) {
  setCloningId(survey.id);
  setActionError(null);
  try {
    const res = await api.post(`/surveys/${survey.id}/clone`);
    setSuccessMsg(`Survei "${survey.title}" berhasil diduplikasi.`);
    navigate(`/surveys/${res.data.id}/builder`);
  } catch (err) {
    setActionError(
      err.response?.data?.error ||
        err.message ||
        'Gagal menduplikasi survei.'
    );
  } finally {
    setCloningId(null);
  }
}
```

**Tombol di kolom aksi (ditambahkan setelah tombol "Builder"):**

```jsx
<button
  onClick={() => handleClone(survey)}
  disabled={cloningId === survey.id}
  className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-60 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300"
  aria-label={`Duplikasi survei ${survey.title}`}
>
  {cloningId === survey.id ? 'Menduplikasi…' : 'Duplikasi'}
</button>
```

---

## Data Models

Tidak ada perubahan skema database. Fitur ini menggunakan tabel `surveys`, `questions`, dan `audit_logs` yang sudah ada.

**Field yang disalin dari Source_Survey ke Cloned_Survey:**

| Field | Disalin? | Nilai di Clone |
|---|---|---|
| `id` | ❌ | UUID baru (auto-generate) |
| `title` | ✓ (dimodifikasi) | `"Salinan dari {title asli}"` |
| `description` | ✓ | Sama persis |
| `status` | ❌ | Selalu `"draft"` |
| `created_by` | ❌ | ID user yang melakukan request |
| `created_at` | ❌ | Timestamp saat clone |
| `updated_at` | ❌ | Timestamp saat clone |

**Field yang disalin dari setiap Question ke Question baru:**

| Field | Disalin? | Nilai di Clone |
|---|---|---|
| `id` | ❌ | UUID baru (pre-generated) |
| `survey_id` | ❌ | ID Cloned_Survey |
| `text` | ✓ | Sama persis |
| `type` | ✓ | Sama persis |
| `order_index` | ✓ | Sama persis |
| `is_required` | ✓ | Sama persis |
| `randomize_options` | ✓ | Sama persis |
| `options` | ✓ | Sama persis (deep copy JSONB) |
| `skip_logic` | ✓ (dimodifikasi) | Referensi `question_id` diperbarui ke UUID baru |

---

## Correctness Properties

### Property 1: Jumlah Pertanyaan Clone Sama dengan Sumber

*For any* survei sumber dengan N pertanyaan (N ≥ 0), survei hasil clone harus memiliki tepat N pertanyaan — tidak lebih, tidak kurang.

**Validates: Requirements 1.6, 4.2**

---

### Property 2: Status Clone Selalu Draft

*For any* survei sumber dengan status apapun (`draft`, `active`, atau `inactive`), survei hasil clone harus selalu berstatus `draft`.

**Validates: Requirements 1.4, 6.1, 6.2, 6.3, 6.4**

---

### Property 3: UUID Clone Selalu Berbeda dari Sumber

*For any* operasi clone, ID Cloned_Survey dan ID setiap pertanyaan baru harus berbeda dari ID Source_Survey dan ID pertanyaan sumbernya.

**Validates: Requirements 4.1, 4.2**

---

### Property 4: Remapping Skip Logic Mempertahankan Struktur

*For any* konfigurasi skip logic yang valid pada pertanyaan sumber, fungsi `remapSkipLogic` harus menghasilkan skip logic dengan jumlah rule yang sama, dan setiap `target_question_id` serta `condition.question_id` harus menunjuk ke UUID pertanyaan baru yang valid di Cloned_Survey.

**Validates: Requirements 4.3**

---

### Property 5: Role Non-Admin/Supervisor Selalu Ditolak

*For any* request ke `POST /surveys/:id/clone` dengan token role `viewer` atau `surveyor`, sistem harus selalu mengembalikan HTTP 403.

**Validates: Requirements 1.1, 1.10**

---

### Property 6: Judul Clone Selalu Mengandung Prefix "Salinan dari"

*For any* survei sumber dengan judul apapun, judul Cloned_Survey harus selalu dimulai dengan `"Salinan dari "` diikuti judul aslinya.

**Validates: Requirements 1.3**

---

## Error Handling

### Backend

| Kondisi | Penanganan |
|---|---|
| Source_Survey tidak ditemukan | Return 404 sebelum memulai transaksi |
| Error di tengah transaksi | Sequelize otomatis rollback; error diteruskan ke global error handler → 500 |
| AuditLog.create gagal | Error diteruskan ke global error handler → 500; transaksi sudah commit, survei baru sudah ada (acceptable trade-off karena audit log tidak kritis untuk integritas data) |

### Frontend

| Kondisi | Penanganan |
|---|---|
| Request sedang berjalan | Tombol disabled, teks berubah menjadi "Menduplikasi…" |
| Error 403 | Tampilkan pesan error di `actionError` |
| Error 404 | Tampilkan pesan error di `actionError` |
| Error 500 | Tampilkan pesan error di `actionError` |
| Sukses | Tampilkan `successMsg`, redirect ke SurveyBuilder |

---

## Testing Strategy

### Unit Tests Backend (`backend/tests/unit/surveys.test.js`)

Tambahkan describe block baru `POST /surveys/:id/clone` dengan test cases:

1. Admin berhasil menduplikasi survei aktif → 201, judul mengandung "Salinan dari", status `draft`
2. Supervisor berhasil menduplikasi survei → 201
3. Duplikasi survei dengan pertanyaan → pertanyaan disalin, `Question.bulkCreate` dipanggil
4. Duplikasi survei tanpa pertanyaan → 201, `question_count: 0`
5. Survei tidak ditemukan → 404
6. Viewer mencoba clone → 403
7. Surveyor mencoba clone → 403
8. Request tanpa token → 401
9. Audit log dibuat dengan field yang benar (`action: 'CLONE_SURVEY'`)
10. Error di transaksi → rollback, 500

### Unit Tests Frontend (`frontend/src/pages/__tests__/Surveys.test.jsx`)

Buat file test baru atau tambahkan ke file yang sudah ada:

1. Tombol "Duplikasi" muncul di setiap baris survei
2. Klik "Duplikasi" memanggil `api.post('/surveys/{id}/clone')`
3. Saat loading, tombol disabled dan teks berubah menjadi "Menduplikasi…"
4. Setelah sukses, `navigate` dipanggil ke `/surveys/{newId}/builder`
5. Setelah sukses, pesan sukses ditampilkan
6. Setelah error, pesan error ditampilkan dan tombol kembali normal

### Property-Based Tests Backend (`backend/tests/properties/surveyClone.property.test.js`)

1. **Property 2**: Untuk semua status source (`draft`, `active`, `inactive`), clone selalu menghasilkan status `draft`
2. **Property 5**: Untuk semua role non-admin/supervisor, endpoint clone selalu mengembalikan 403
3. **Property 6**: Untuk semua judul survei yang valid, judul clone selalu dimulai dengan `"Salinan dari "`

### Property-Based Tests — Fungsi `remapSkipLogic`

Fungsi `remapSkipLogic` adalah pure function yang dapat diuji secara terisolasi:

1. **Property 4a**: Jumlah rule setelah remap sama dengan sebelum remap
2. **Property 4b**: Setiap `target_question_id` setelah remap ada di dalam `idMap.values()`
3. **Property 4c**: `remapSkipLogic(null, idMap)` mengembalikan `null`
4. **Property 4d**: `remapSkipLogic([], idMap)` mengembalikan `[]`
