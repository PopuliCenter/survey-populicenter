/**
 * Unit Tests for Question Management Module
 * Tests: tambah pertanyaan semua tipe, konfigurasi skip logic valid,
 *        tolak skip logic siklus (422), hapus pertanyaan membersihkan referensi skip logic, reorder
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => {
  const mockSequelize = {
    fn: jest.fn((fnName, col) => ({ fn: fnName, col })),
    col: jest.fn((col) => col),
    query: jest.fn().mockResolvedValue([]),
  };

  return {
    Survey: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    },
    Question: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    Response: {
      findAll: jest.fn(),
      count: jest.fn(),
    },
    AuditLog: {
      create: jest.fn(),
    },
    sequelize: mockSequelize,
    Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike') } },
  };
});

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
}));

const app = require('../../src/app');
const { Survey, Question, AuditLog, sequelize } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper: create a valid admin JWT
function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// Helper: create a valid surveyor JWT
function createSurveyorToken(id = 'surveyor-uuid-001') {
  return jwt.sign({ id, role: 'surveyor', email: 'surveyor@example.com' }, JWT_SECRET, { expiresIn: '12h' });
}

// Helper: build a mock survey object
function mockSurvey(overrides = {}) {
  return {
    id: 'survey-uuid-001',
    title: 'Test Survey',
    status: 'draft',
    created_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// Helper: build a mock question object
function mockQuestion(overrides = {}) {
  return {
    id: 'question-uuid-001',
    survey_id: 'survey-uuid-001',
    text: 'Test question?',
    type: 'single_choice',
    order_index: 1,
    is_required: false,
    randomize_options: false,
    options: null,
    skip_logic: null,
    created_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── GET /surveys/:surveyId/questions ─────────────────────────────────────────

describe('Question Management - GET /surveys/:surveyId/questions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('admin dapat melihat daftar pertanyaan', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([
      mockQuestion({ id: 'q-001', order_index: 1 }),
      mockQuestion({ id: 'q-002', order_index: 2 }),
    ]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  test('surveyor dapat melihat daftar pertanyaan', async () => {
    const token = createSurveyorToken();
    Survey.findOne.mockResolvedValue(mockSurvey({ status: 'active' }));
    Question.findAll.mockResolvedValue([
      mockQuestion({ id: 'q-001', order_index: 1 }),
    ]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/surveys/nonexistent/questions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app).get('/surveys/survey-uuid-001/questions');
    expect(res.status).toBe(401);
  });
});

// ─── POST /surveys/:surveyId/questions ────────────────────────────────────────

describe('Question Management - POST /surveys/:surveyId/questions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  const VALID_TYPES = [
    'single_choice',
    'multiple_choice',
    'short_text',
    'long_text',
    'numeric_scale',
    'date',
    'photo',
  ];

  VALID_TYPES.forEach((type) => {
    test(`tambah pertanyaan tipe ${type} berhasil`, async () => {
      const token = createAdminToken();
      Survey.findOne.mockResolvedValue(mockSurvey());
      Question.findAll.mockResolvedValue([]); // no existing questions
      const newQuestion = mockQuestion({ id: `q-${type}`, type, order_index: 1 });
      Question.create.mockResolvedValue(newQuestion);

      const res = await request(app)
        .post('/surveys/survey-uuid-001/questions')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: `Question of type ${type}`, type, order_index: 1 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type });
    });
  });

  test('randomize_order tersimpan dan SAMPAI DI BADAN RESPONS (kontrak klien)', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    Question.create.mockImplementation(async (row) => ({ ...mockQuestion({ id: 'q-ro' }), ...row, id: 'q-ro' }));

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Penilaian tokoh A', type: 'single_choice', order_index: 5, randomize_order: true });

    expect(res.status).toBe(201);
    // Pelajaran field_tools_settings: DUA whitelist (query & serialisasi) —
    // yang diuji harus badan respons, bukan argumen query.
    expect(res.body.randomize_order).toBe(true);
    expect(Question.create.mock.calls[0][0].randomize_order).toBe(true);
  });

  test('randomize_order pada pertanyaan identitas (unique_id) DITOLAK 422', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Nomor Kuesioner', type: 'unique_id', order_index: 0, randomize_order: true });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/identitas/i);
    expect(Question.create).not.toHaveBeenCalled();
  });

  test('randomize_order + skip_logic pada pertanyaan yang sama DITOLAK 422', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([
      { id: 'q-target', type: 'single_choice', order_index: 0, randomize_order: false, skip_logic: null, auto_fill: null },
    ]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Bercabang tapi minta diacak',
        type: 'single_choice',
        order_index: 1,
        randomize_order: true,
        skip_logic: [{ condition: { question_id: 'q-target', operator: 'equals', value: 'x' }, action: 'jump_to', target_question_id: 'q-target' }],
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/lompatan/i);
  });

  test('pertanyaan baru ber-flag DI DALAM interval lompatan yang ada DITOLAK 422', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    // a(0) --jump--> c(2); pertanyaan baru diacak di order 1 (di antara).
    Question.findAll.mockResolvedValue([
      { id: 'q-a', type: 'single_choice', order_index: 0, randomize_order: false, auto_fill: null,
        skip_logic: [{ condition: { question_id: 'q-a', operator: 'equals', value: 'x' }, action: 'jump_to', target_question_id: 'q-c' }] },
      { id: 'q-c', type: 'single_choice', order_index: 2, randomize_order: false, skip_logic: null, auto_fill: null },
    ]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Sisipan diacak', type: 'single_choice', order_index: 1, randomize_order: true });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/di antara/i);
  });

  test('tambah pertanyaan dengan skip logic valid berhasil', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    // Existing questions with no skip_logic
    Question.findAll.mockResolvedValue([
      { id: 'q-existing-001', skip_logic: null },
    ]);
    const skipLogic = [
      {
        condition: { question_id: 'q-existing-001', operator: 'equals', value: 'yes' },
        action: 'jump_to',
        target_question_id: 'q-existing-001', // points to existing, no cycle with new question
      },
    ];
    const newQuestion = mockQuestion({ id: 'q-new', skip_logic: skipLogic });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Question with skip logic',
        type: 'single_choice',
        order_index: 2,
        skip_logic: skipLogic,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('skip_logic');
  });

  test('tolak skip logic yang membentuk siklus - mengembalikan 422', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());

    // Existing question q-001 points to q-002 (which is the new question being added)
    // New question will point back to q-001 → cycle: q-001 → q-002 → q-001
    Question.findAll.mockResolvedValue([
      {
        id: 'q-001',
        skip_logic: [
          {
            condition: { question_id: 'q-001', operator: 'equals', value: 'yes' },
            action: 'jump_to',
            target_question_id: 'q-002',
          },
        ],
      },
    ]);

    // New question (temp id) points back to q-001 → creates cycle
    // We simulate this by having the new question's skip_logic point to q-001
    // and q-001 already points to the new question's id
    // For simplicity: existing q-001 → q-new, new q-new → q-001 = cycle
    Question.findAll.mockResolvedValue([
      {
        id: 'q-001',
        skip_logic: null, // will be set up below
      },
    ]);

    // Create a direct cycle scenario: new question points to q-001,
    // and q-001 already points to the temp id (which we can't know ahead of time)
    // Instead, test a simpler cycle: existing q-A → q-B, new question is q-B → q-A
    Question.findAll.mockResolvedValue([
      {
        id: 'q-A',
        skip_logic: [
          {
            condition: { question_id: 'q-A', operator: 'equals', value: 'yes' },
            action: 'jump_to',
            target_question_id: 'q-B',
          },
        ],
      },
      {
        id: 'q-B',
        skip_logic: null,
      },
    ]);

    // New question with skip_logic pointing back to q-A (but new question IS q-B effectively)
    // Actually: we add a NEW question that creates a cycle with existing ones
    // Simplest: existing q-A → q-B, new question → q-A, and q-B → new question
    // But we can't control temp id. Let's use a known cycle in existing questions
    // and add a new question that extends it.
    // Easiest test: existing q-A → q-B, new question has skip_logic pointing to q-A
    // and q-B has skip_logic pointing to the new question's temp id (unknown).
    // 
    // Better approach: test with existing questions that already form a cycle
    // when combined with the new question's skip_logic.
    // 
    // Simplest valid test: new question points to q-A, and q-A points to q-B,
    // and q-B points back to the new question (temp id). But we can't know temp id.
    //
    // Most reliable: test where existing questions form a cycle themselves
    // (the validator should catch it regardless of new question).
    Question.findAll.mockResolvedValue([
      {
        id: 'q-cycle-1',
        skip_logic: [
          {
            condition: { question_id: 'q-cycle-1', operator: 'equals', value: 'yes' },
            action: 'jump_to',
            target_question_id: 'q-cycle-2',
          },
        ],
      },
      {
        id: 'q-cycle-2',
        skip_logic: [
          {
            condition: { question_id: 'q-cycle-2', operator: 'equals', value: 'yes' },
            action: 'jump_to',
            target_question_id: 'q-cycle-1',
          },
        ],
      },
    ]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'New question',
        type: 'single_choice',
        order_index: 3,
        skip_logic: [
          {
            condition: { question_id: 'q-cycle-1', operator: 'equals', value: 'yes' },
            action: 'jump_to',
            target_question_id: 'q-cycle-1',
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('siklus');
  });

  test('tambah pertanyaan dengan randomize_options: true tersimpan dengan benar', async () => {
    // Requirement 5.1: saat admin mengaktifkan fitur random list jawaban,
    // Platform SHALL menyimpan konfigurasi randomisasi untuk pertanyaan tersebut
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({
      id: 'q-rand',
      type: 'single_choice',
      randomize_options: true,
      options: [
        { value: 'a', label: 'Pilihan A' },
        { value: 'b', label: 'Pilihan B' },
      ],
    });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Pertanyaan dengan randomisasi',
        type: 'single_choice',
        order_index: 1,
        randomize_options: true,
        options: [
          { value: 'a', label: 'Pilihan A' },
          { value: 'b', label: 'Pilihan B' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.randomize_options).toBe(true);
    // Verify Question.create was called with randomize_options: true
    expect(Question.create).toHaveBeenCalledWith(
      expect.objectContaining({ randomize_options: true })
    );
  });

  test('tambah pertanyaan tanpa randomize_options default ke false', async () => {
    // Requirement 5.1: default konfigurasi randomisasi adalah false
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({ id: 'q-no-rand', type: 'single_choice', randomize_options: false });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Pertanyaan tanpa randomisasi', type: 'single_choice', order_index: 1 });

    expect(res.status).toBe(201);
    expect(res.body.randomize_options).toBe(false);
    expect(Question.create).toHaveBeenCalledWith(
      expect.objectContaining({ randomize_options: false })
    );
  });

  test('surveyor tidak bisa menambah pertanyaan - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Question', type: 'short_text', order_index: 1 });

    expect(res.status).toBe(403);
    expect(Question.create).not.toHaveBeenCalled();
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/surveys/nonexistent/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Question', type: 'short_text', order_index: 1 });

    expect(res.status).toBe(404);
  });
});

// ─── PUT /surveys/:surveyId/questions/:qid ────────────────────────────────────

describe('Question Management - PUT /surveys/:surveyId/questions/:qid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('update pertanyaan berhasil', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    const question = mockQuestion({ id: 'q-001', text: 'Old text' });
    Question.findOne.mockResolvedValue(question);
    Question.findAll.mockResolvedValue([{ id: 'q-001', skip_logic: null }]);

    const res = await request(app)
      .put('/surveys/survey-uuid-001/questions/q-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Updated text', is_required: true });

    expect(res.status).toBe(200);
    expect(question.save).toHaveBeenCalled();
    expect(question.text).toBe('Updated text');
    expect(question.is_required).toBe(true);
  });

  test('update skip logic valid berhasil', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    const question = mockQuestion({ id: 'q-001' });
    Question.findOne.mockResolvedValue(question);
    Question.findAll.mockResolvedValue([
      { id: 'q-001', skip_logic: null },
      { id: 'q-002', skip_logic: null },
    ]);

    const skipLogic = [
      {
        condition: { question_id: 'q-001', operator: 'equals', value: 'yes' },
        action: 'jump_to',
        target_question_id: 'q-002',
      },
    ];

    const res = await request(app)
      .put('/surveys/survey-uuid-001/questions/q-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ skip_logic: skipLogic });

    expect(res.status).toBe(200);
    expect(question.save).toHaveBeenCalled();
  });

  test('tolak update skip logic yang membentuk siklus - mengembalikan 422', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    const question = mockQuestion({ id: 'q-001' });
    Question.findOne.mockResolvedValue(question);

    // q-001 → q-002, q-002 → q-001 (cycle)
    Question.findAll.mockResolvedValue([
      { id: 'q-001', skip_logic: null }, // will be replaced with new skip_logic
      {
        id: 'q-002',
        skip_logic: [
          {
            condition: { question_id: 'q-002', operator: 'equals', value: 'yes' },
            action: 'jump_to',
            target_question_id: 'q-001',
          },
        ],
      },
    ]);

    const res = await request(app)
      .put('/surveys/survey-uuid-001/questions/q-001')
      .set('Authorization', `Bearer ${token}`)
      .send({
        skip_logic: [
          {
            condition: { question_id: 'q-001', operator: 'equals', value: 'yes' },
            action: 'jump_to',
            target_question_id: 'q-002',
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('siklus');
  });

  test('update randomize_options: true tersimpan dengan benar', async () => {
    // Requirement 5.1: saat admin mengaktifkan randomisasi via PUT,
    // Platform SHALL menyimpan konfigurasi randomisasi untuk pertanyaan tersebut
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    const question = mockQuestion({ id: 'q-001', randomize_options: false });
    Question.findOne.mockResolvedValue(question);
    Question.findAll.mockResolvedValue([{ id: 'q-001', skip_logic: null }]);

    const res = await request(app)
      .put('/surveys/survey-uuid-001/questions/q-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ randomize_options: true });

    expect(res.status).toBe(200);
    expect(question.save).toHaveBeenCalled();
    expect(question.randomize_options).toBe(true);
    expect(res.body.randomize_options).toBe(true);
  });

  test('pertanyaan tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findOne.mockResolvedValue(null);

    const res = await request(app)
      .put('/surveys/survey-uuid-001/questions/nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Updated text' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Pertanyaan tidak ditemukan' });
  });

  test('surveyor tidak bisa update pertanyaan - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .put('/surveys/survey-uuid-001/questions/q-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Updated text' });

    expect(res.status).toBe(403);
  });
});

// ─── DELETE /surveys/:surveyId/questions/:qid ─────────────────────────────────

describe('Question Management - DELETE /surveys/:surveyId/questions/:qid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('hapus pertanyaan berhasil', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    const question = mockQuestion({ id: 'q-001' });
    Question.findOne.mockResolvedValue(question);
    // No other questions with skip_logic referencing q-001
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .delete('/surveys/survey-uuid-001/questions/q-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(question.destroy).toHaveBeenCalled();
  });

  test('hapus pertanyaan membersihkan referensi skip_logic di pertanyaan lain', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    const questionToDelete = mockQuestion({ id: 'q-target' });
    Question.findOne.mockResolvedValue(questionToDelete);

    // q-other has skip_logic pointing to q-target
    const otherQuestion = mockQuestion({
      id: 'q-other',
      skip_logic: [
        {
          condition: { question_id: 'q-other', operator: 'equals', value: 'yes' },
          action: 'jump_to',
          target_question_id: 'q-target',
        },
        {
          condition: { question_id: 'q-other', operator: 'equals', value: 'no' },
          action: 'jump_to',
          target_question_id: 'q-another', // this one should remain
        },
      ],
    });

    Question.findAll.mockResolvedValue([otherQuestion]);
    Question.update.mockResolvedValue([1]);

    const res = await request(app)
      .delete('/surveys/survey-uuid-001/questions/q-target')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(questionToDelete.destroy).toHaveBeenCalled();

    // Verify Question.update was called to clean up skip_logic
    expect(Question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        skip_logic: expect.arrayContaining([
          expect.objectContaining({ target_question_id: 'q-another' }),
        ]),
      }),
      expect.objectContaining({ where: { id: 'q-other' } })
    );

    // Verify the cleaned skip_logic does NOT contain q-target
    const updateCall = Question.update.mock.calls[0][0];
    const updatedSkipLogic = updateCall.skip_logic;
    if (Array.isArray(updatedSkipLogic)) {
      const hasDeletedRef = updatedSkipLogic.some(
        (rule) => rule.target_question_id === 'q-target'
      );
      expect(hasDeletedRef).toBe(false);
    }
  });

  test('hapus pertanyaan yang menjadi satu-satunya target skip_logic - set null', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    const questionToDelete = mockQuestion({ id: 'q-target' });
    Question.findOne.mockResolvedValue(questionToDelete);

    // q-other has skip_logic with ONLY a reference to q-target
    const otherQuestion = mockQuestion({
      id: 'q-other',
      skip_logic: [
        {
          condition: { question_id: 'q-other', operator: 'equals', value: 'yes' },
          action: 'jump_to',
          target_question_id: 'q-target',
        },
      ],
    });

    Question.findAll.mockResolvedValue([otherQuestion]);
    Question.update.mockResolvedValue([1]);

    const res = await request(app)
      .delete('/surveys/survey-uuid-001/questions/q-target')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    // When all rules are removed, skip_logic should be set to null
    expect(Question.update).toHaveBeenCalledWith(
      { skip_logic: null },
      expect.objectContaining({ where: { id: 'q-other' } })
    );
  });

  test('pertanyaan tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete('/surveys/survey-uuid-001/questions/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Pertanyaan tidak ditemukan' });
  });

  test('surveyor tidak bisa menghapus pertanyaan - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .delete('/surveys/survey-uuid-001/questions/q-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── PATCH /surveys/:surveyId/questions/reorder ───────────────────────────────

describe('Question Management - PATCH /surveys/:surveyId/questions/reorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('reorder pertanyaan berhasil', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.update.mockResolvedValue([1]);
    Question.findAll.mockResolvedValue([
      mockQuestion({ id: 'q-001', order_index: 2 }),
      mockQuestion({ id: 'q-002', order_index: 1 }),
    ]);

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/questions/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({
        order: [
          { id: 'q-001', order_index: 2 },
          { id: 'q-002', order_index: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Verify Question.update was called for each item in two passes (offset + final)
    expect(Question.update).toHaveBeenCalledTimes(4);
    // Pass 2: final values
    expect(Question.update).toHaveBeenCalledWith(
      { order_index: 2 },
      { where: { id: 'q-001', survey_id: 'survey-uuid-001' } }
    );
    expect(Question.update).toHaveBeenCalledWith(
      { order_index: 1 },
      { where: { id: 'q-002', survey_id: 'survey-uuid-001' } }
    );
  });

  test('reorder dengan order tidak valid - mengembalikan 422', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/questions/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ order: 'invalid' });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/surveys/nonexistent/questions/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ order: [{ id: 'q-001', order_index: 1 }] });

    expect(res.status).toBe(404);
  });

  test('surveyor tidak bisa reorder pertanyaan - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/questions/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ order: [{ id: 'q-001', order_index: 1 }] });

    expect(res.status).toBe(403);
  });
});

// ─── Rating Scale Question Type ───────────────────────────────────────────────

describe('rating_scale question type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('POST dengan tipe rating_scale dan options valid → 201', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({
      id: 'q-rating-001',
      type: 'rating_scale',
      options: { min: 1, max: 5, display: 'stars' },
    });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        options: { min: 1, max: 5, display: 'stars' },
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('rating_scale');
  });

  test('POST dengan max <= min → 422, error "Nilai max harus lebih besar dari min"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        options: { min: 5, max: 3, display: 'stars' },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Nilai max harus lebih besar dari min');
  });

  test('POST dengan min < 1 → 422, error "Nilai min harus minimal 1"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        options: { min: 0, max: 5, display: 'stars' },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Nilai min harus minimal 1');
  });

  test('POST dengan max > 10 → 422, error "Nilai max tidak boleh lebih dari 10"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        options: { min: 1, max: 11, display: 'stars' },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Nilai max tidak boleh lebih dari 10');
  });

  test('POST dengan display: "emoji" → 422, error "Display harus \'stars\' atau \'numbers\'"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        options: { min: 1, max: 5, display: 'emoji' },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Display harus 'stars' atau 'numbers'");
  });

  test('POST tanpa options untuk rating_scale → 422, error "Konfigurasi rating (options) wajib diisi untuk tipe rating_scale"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Konfigurasi rating (options) wajib diisi untuk tipe rating_scale');
  });

  test('POST dengan options.labels opsional { min: "Buruk", max: "Bagus" } → 201, labels tersimpan', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({
      id: 'q-rating-labels',
      type: 'rating_scale',
      options: { min: 1, max: 5, display: 'stars', labels: { min: 'Buruk', max: 'Bagus' } },
    });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        options: { min: 1, max: 5, display: 'stars', labels: { min: 'Buruk', max: 'Bagus' } },
      });

    expect(res.status).toBe(201);
    expect(res.body.options).toMatchObject({ labels: { min: 'Buruk', max: 'Bagus' } });
  });

  test('POST dengan display: "numbers" dan min=1, max=10 → 201', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({
      id: 'q-rating-numbers',
      type: 'rating_scale',
      options: { min: 1, max: 10, display: 'numbers' },
    });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        options: { min: 1, max: 10, display: 'numbers' },
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('rating_scale');
  });
});

// ─── Phone Number Question Type ───────────────────────────────────────────────

describe('phone_number question type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('POST dengan tipe phone_number dan options valid → 201', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({
      id: 'q-phone-001',
      type: 'phone_number',
      options: { min_length: 10, max_length: 13 },
    });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor telepon responden',
        type: 'phone_number',
        order_index: 1,
        options: { min_length: 10, max_length: 13 },
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('phone_number');
  });

  test('POST dengan max_length < min_length → 422, error "Panjang maksimum harus lebih besar atau sama dengan panjang minimum"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor telepon responden',
        type: 'phone_number',
        order_index: 1,
        options: { min_length: 13, max_length: 10 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Panjang maksimum harus lebih besar atau sama dengan panjang minimum');
  });

  test('POST dengan min_length < 1 → 422, error "Panjang minimum harus minimal 1"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor telepon responden',
        type: 'phone_number',
        order_index: 1,
        options: { min_length: 0, max_length: 13 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Panjang minimum harus minimal 1');
  });

  test('POST dengan min_length bukan integer → 422, error "Panjang minimum dan maksimum harus berupa bilangan bulat"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor telepon responden',
        type: 'phone_number',
        order_index: 1,
        options: { min_length: 'abc', max_length: 13 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Panjang minimum dan maksimum harus berupa bilangan bulat');
  });

  test('POST tanpa options untuk phone_number → 422, error "Konfigurasi panjang (options) wajib diisi untuk tipe phone_number"', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor telepon responden',
        type: 'phone_number',
        order_index: 1,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Konfigurasi panjang (options) wajib diisi untuk tipe phone_number');
  });
});

// ─── Unique ID Question Type ──────────────────────────────────────────────────

describe('unique_id question type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('POST dengan tipe unique_id dan options valid → 201', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({
      id: 'q-unique-001',
      type: 'unique_id',
      options: { min_length: 1, max_length: 20 },
    });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor kuesioner manual',
        type: 'unique_id',
        order_index: 1,
        options: { min_length: 1, max_length: 20 },
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('unique_id');
  });

  test('POST dengan tipe unique_id tanpa options → 201 (options opsional)', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);
    const newQuestion = mockQuestion({
      id: 'q-unique-002',
      type: 'unique_id',
      options: null,
    });
    Question.create.mockResolvedValue(newQuestion);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor kuesioner manual',
        type: 'unique_id',
        order_index: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('unique_id');
  });

  test('POST dengan max_length < min_length → 422', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(mockSurvey());
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/survey-uuid-001/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Nomor kuesioner manual',
        type: 'unique_id',
        order_index: 1,
        options: { min_length: 20, max_length: 5 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Panjang maksimum harus lebih besar atau sama dengan panjang minimum');
  });
});
