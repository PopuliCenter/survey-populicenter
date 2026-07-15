#!/usr/bin/env node
/**
 * loadtest-seed.cjs — Seed data uji beban: N survei "[LOADTEST] Wilayah XX"
 * + M akun TPD + kuota. Dipakai bersama scripts/loadtest/k6-survey-day.js.
 *
 * 🚨 STAGING/LOKAL SAJA. Jangan pernah dijalankan di produksi — skrip ini
 *    membuat ratusan akun surveyor dengan password seragam.
 *
 * Jalankan DI DALAM container backend (punya sequelize + koneksi DB):
 *   docker compose exec backend node scripts/loadtest-seed.cjs
 *   docker compose exec backend node scripts/loadtest-seed.cjs --cleanup
 *
 * Knob (env):
 *   LT_SURVEYS=10      jumlah survei (wilayah)
 *   LT_TPD=300         jumlah akun TPD (dibagi merata ke survei)
 *   LT_QUOTA=30        kuota responden per TPD
 *   LT_PASSWORD=...    password semua akun TPD (default: LoadTest#2026)
 *
 * Penanda data (dipakai cleanup): judul survei berawalan "[LOADTEST]",
 * email akun berakhiran "@loadtest.local".
 */
const bcrypt = require('bcrypt');
const { sequelize, User, Survey, Question, SurveyorQuota, Response, Answer } = require('../src/models');

const SURVEYS = parseInt(process.env.LT_SURVEYS, 10) || 10;
const TPD = parseInt(process.env.LT_TPD, 10) || 300;
const QUOTA = parseInt(process.env.LT_QUOTA, 10) || 30;
const PASSWORD = process.env.LT_PASSWORD || 'LoadTest#2026';
const CLEANUP = process.argv.includes('--cleanup');

const MARK_TITLE = '[LOADTEST]';
const MARK_EMAIL = '@loadtest.local';

async function cleanup() {
  const { Op } = require('sequelize');
  const surveys = await Survey.findAll({ where: { title: { [Op.like]: `${MARK_TITLE}%` } }, attributes: ['id'] });
  const surveyIds = surveys.map((s) => s.id);
  const users = await User.findAll({ where: { email: { [Op.like]: `%${MARK_EMAIL}` } }, attributes: ['id'] });
  const userIds = users.map((u) => u.id);

  // Urutan penting (FK): answers → responses → quotas → questions → surveys → users
  if (surveyIds.length) {
    const responses = await Response.findAll({ where: { survey_id: surveyIds }, attributes: ['id'] });
    const responseIds = responses.map((r) => r.id);
    if (responseIds.length) await Answer.destroy({ where: { response_id: responseIds } });
    await Response.destroy({ where: { survey_id: surveyIds } });
    await SurveyorQuota.destroy({ where: { survey_id: surveyIds } });
    await Question.destroy({ where: { survey_id: surveyIds } });
    await Survey.destroy({ where: { id: surveyIds } });
  }
  if (userIds.length) {
    await SurveyorQuota.destroy({ where: { surveyor_id: userIds } });
    await User.destroy({ where: { id: userIds } });
  }
  console.log(`✅ Cleanup: ${surveyIds.length} survei + ${userIds.length} akun LOADTEST dihapus.`);
}

async function seed() {
  // created_by: pakai admin pertama (atau buat admin loadtest bila tak ada)
  let admin = await User.findOne({ where: { role: 'admin' } });
  if (!admin) {
    admin = await User.create({
      name: 'LOADTEST Admin',
      email: `admin${MARK_EMAIL}`,
      password_hash: await bcrypt.hash(PASSWORD, 10),
      role: 'admin',
      is_active: true,
    });
  }

  const hash = await bcrypt.hash(PASSWORD, 10); // satu hash utk semua (cepat)

  // ── Survei + pertanyaan ──────────────────────────────────────────────────
  const surveys = [];
  for (let i = 1; i <= SURVEYS; i++) {
    const survey = await Survey.create({
      title: `${MARK_TITLE} Wilayah ${String(i).padStart(2, '0')}`,
      description: 'Survei sintetis untuk uji beban. JANGAN dipakai untuk data asli.',
      status: 'active',
      created_by: admin.id,
      // Semua opsional + kunci perangkat MATI: VU k6 bukan perangkat sungguhan.
      field_tools_settings: {
        signature_mode: 'optional',
        audio_mode: 'optional',
        photo_mode: 'optional',
        gps_mode: 'optional',
        device_lock: 'off',
      },
    });
    // Susunan meniru survei nyata: nomor kues (unique_id) + pilihan + teks.
    await Question.create({
      survey_id: survey.id, order_index: 0, type: 'unique_id', is_required: true,
      text: 'Nomor Kuesioner', options: { min_length: 1, max_length: 20 },
    });
    await Question.create({
      survey_id: survey.id, order_index: 1, type: 'single_choice', is_required: true,
      text: 'Apakah Anda setuju dengan kebijakan X?',
      options: [
        { value: 'SETUJU', label: 'Setuju' },
        { value: 'TIDAK SETUJU', label: 'Tidak Setuju' },
      ],
    });
    await Question.create({
      survey_id: survey.id, order_index: 2, type: 'short_text', is_required: true,
      text: 'Sebutkan alasan Anda.',
    });
    surveys.push(survey);
  }

  // ── Akun TPD + kuota (dibagi merata: TPD ke-i → survei i % SURVEYS) ───────
  for (let i = 1; i <= TPD; i++) {
    const user = await User.create({
      name: `LOADTEST TPD ${i}`,
      email: `tpd${String(i).padStart(4, '0')}${MARK_EMAIL}`,
      password_hash: hash,
      role: 'surveyor',
      is_active: true,
    });
    const survey = surveys[(i - 1) % surveys.length];
    await SurveyorQuota.create({
      survey_id: survey.id,
      surveyor_id: user.id,
      quota: QUOTA,
      assigned_numbers: null, // nomor bebas — k6 memakai nomor unik per VU
    });
    if (i % 50 === 0) console.log(`  … ${i}/${TPD} akun TPD`);
  }

  console.log('─────────────────────────────────────────────');
  console.log(`✅ Seed selesai: ${SURVEYS} survei × 3 pertanyaan, ${TPD} TPD (kuota ${QUOTA}).`);
  console.log(`   Email : tpd0001${MARK_EMAIL} … tpd${String(TPD).padStart(4, '0')}${MARK_EMAIL}`);
  console.log(`   Pass  : ${PASSWORD}`);
  console.log('   Bersihkan setelah uji: node scripts/loadtest-seed.cjs --cleanup');
}

(async () => {
  try {
    await sequelize.authenticate();
    if (CLEANUP) await cleanup();
    else await seed();
    process.exit(0);
  } catch (err) {
    console.error('✗ Gagal:', err.message);
    process.exit(1);
  }
})();
