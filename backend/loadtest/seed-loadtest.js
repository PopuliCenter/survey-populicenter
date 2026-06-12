/**
 * seed-loadtest.js — siapkan data untuk simulasi beban.
 *
 * Membuat 1 survei aktif (semua field-tool DISABLED agar submit tidak perlu
 * media/GPS), 1 pertanyaan opsional, sequence nomor kuesioner, lalu N TPD
 * (surveyor) + kuota masing-masing. Menulis loadtest-config.json untuk dipakai
 * run-loadtest.js.
 *
 * ENV: LT_TPD (default 40), LT_QUOTA (default 10).
 * Jalankan dari folder backend, dengan DB_PORT/REDIS sesuai stack load test.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { sequelize, User, Survey, Question, SurveyorQuota } = require('../src/models');

const NUM_TPD = parseInt(process.env.LT_TPD, 10) || 40;
const QUOTA = parseInt(process.env.LT_QUOTA, 10) || 10;
const PASSWORD = 'Password123';

async function main() {
  await sequelize.authenticate();

  let admin = await User.findOne({ where: { role: 'admin' } });
  if (!admin) {
    admin = await User.create({
      name: 'LT Admin',
      email: 'ltadmin@test.local',
      password_hash: await bcrypt.hash(PASSWORD, 10),
      role: 'admin',
      is_active: true,
    });
  }

  const survey = await Survey.create({
    title: 'Load Test Survey',
    description: 'Survei untuk simulasi beban (auto-generated)',
    status: 'active',
    created_by: admin.id,
    field_tools_settings: {
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'disabled',
      gps_mode: 'disabled',
    },
    form_mode: 'scroll',
    type: 'lainnya',
  });

  // Sequence nomor kuesioner (meniru yang dibuat saat aktivasi survei).
  const seqName = `questionnaire_seq_${survey.id.replace(/-/g, '_')}`;
  await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName}`);

  const question = await Question.create({
    survey_id: survey.id,
    text: 'Catatan singkat',
    type: 'short_text',
    order_index: 1,
    is_required: false,
    options: {},
  });

  const pwHash = await bcrypt.hash(PASSWORD, 10);
  const surveyors = [];
  for (let i = 1; i <= NUM_TPD; i++) {
    const email = `loadtpd${i}@test.local`;
    let u = await User.findOne({ where: { email } });
    if (!u) {
      u = await User.create({
        name: `LoadTPD ${i}`,
        email,
        password_hash: pwHash,
        role: 'surveyor',
        is_active: true,
      });
    }
    await SurveyorQuota.findOrCreate({
      where: { survey_id: survey.id, surveyor_id: u.id },
      defaults: { quota: QUOTA },
    });
    surveyors.push({ email, id: u.id });
  }

  const config = {
    survey_id: survey.id,
    question_id: question.id,
    password: PASSWORD,
    quota: QUOTA,
    surveyors,
  };
  fs.writeFileSync(path.join(__dirname, 'loadtest-config.json'), JSON.stringify(config, null, 2));
  console.log(`Seeded survey ${survey.id} | ${NUM_TPD} TPD | quota ${QUOTA}`);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
