/**
 * run-loadtest.js — simulasi submit responden konkuren + verifikasi integritas.
 *
 * Skenario: ramp jumlah TPD (default 10,20,30,40). Tiap level, tiap TPD
 * menembakkan LT_RESP (default 10) submit SECARA BERSAMAAN (start → submit).
 * Responses dibersihkan antar-level agar tiap level independen (kuota tidak
 * terkuras lintas-level).
 *
 * Setelah ramp, menjalankan UJI BOUNDARY C1: 1 TPD kuota K menembakkan K+overrun
 * submit konkuren → harus tepat K commit (membuktikan kuota tidak jebol).
 *
 * Verifikasi tiap level: jumlah commit per TPD ≤ kuota, tidak ada nomor duplikat.
 *
 * ENV: LT_BASE (default http://localhost:3000), LT_RESP (10),
 *      LT_RAMP ("10,20,30,40"), LT_OVERRUN (5).
 * Butuh server backend berjalan + akses DB (require ../src/models).
 */
require('dotenv').config();
const path = require('path');
const jwt = require('jsonwebtoken');
const { sequelize, Response } = require('../src/models');

const config = require(path.join(__dirname, 'loadtest-config.json'));
const JWT_SECRET = process.env.JWT_SECRET;
const BASE = process.env.LT_BASE || 'http://localhost:3000';
const RESP_PER_TPD = parseInt(process.env.LT_RESP, 10) || 10;
const RAMP = (process.env.LT_RAMP || '10,20,30,40').split(',').map((n) => parseInt(n, 10));
const OVERRUN = parseInt(process.env.LT_OVERRUN, 10) || 5;
const SURVEY_ID = config.survey_id;

// Mint token surveyor langsung (bypass /auth/login agar limiter login tidak
// mengganggu; fokus beban di jalur /responses/start + /submit).
function mintToken(surveyor) {
  return jwt.sign(
    { id: surveyor.id, role: 'surveyor', email: surveyor.email },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

async function submitOne(token) {
  const t0 = Date.now();
  try {
    const s = await fetch(`${BASE}/responses/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ survey_id: SURVEY_ID }),
    });
    if (!s.ok) return { ok: false, stage: 'start', status: s.status, ms: Date.now() - t0 };
    const { session_token } = await s.json();
    const sub = await fetch(`${BASE}/responses/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        session_token,
        survey_id: SURVEY_ID,
        answers: [{ question_id: config.question_id, answer_value: 'X' }],
        geo: { status: 'lokasi_tidak_tersedia', lat: null, lng: null },
      }),
    });
    return { ok: sub.ok, stage: 'submit', status: sub.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, stage: 'network', status: 0, ms: Date.now() - t0, err: e.message };
  }
}

function summarize(results, wallMs) {
  const ok = results.filter((r) => r.ok).length;
  const byStatus = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (q) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] || 0;
  return {
    total: results.length,
    ok,
    fail: results.length - ok,
    throughput: +(results.length / (wallMs / 1000)).toFixed(1),
    p50: pct(0.5),
    p95: pct(0.95),
    max: lat[lat.length - 1] || 0,
    byStatus,
  };
}

async function clearResponses() {
  await Response.destroy({ where: { survey_id: SURVEY_ID } });
}

async function verifyIntegrity() {
  // commit per TPD (kecualikan PENDING)
  const [rows] = await sequelize.query(
    `SELECT surveyor_id, COUNT(*) c FROM responses
     WHERE survey_id = :sid AND questionnaire_number NOT LIKE 'PENDING-%'
     GROUP BY surveyor_id ORDER BY c DESC`,
    { replacements: { sid: SURVEY_ID } }
  );
  const maxPerTpd = rows.length ? Math.max(...rows.map((r) => Number(r.c))) : 0;
  // nomor duplikat
  const [dups] = await sequelize.query(
    `SELECT questionnaire_number, COUNT(*) c FROM responses
     WHERE survey_id = :sid AND questionnaire_number NOT LIKE 'PENDING-%'
     GROUP BY questionnaire_number HAVING COUNT(*) > 1`,
    { replacements: { sid: SURVEY_ID } }
  );
  const committed = rows.reduce((s, r) => s + Number(r.c), 0);
  return { committed, maxPerTpd, duplicates: dups.length };
}

async function runWave(nTpd) {
  await clearResponses();
  const tokens = config.surveyors.slice(0, nTpd).map(mintToken);
  const t0 = Date.now();
  const results = await Promise.all(
    tokens.flatMap((tok) => Array.from({ length: RESP_PER_TPD }, () => submitOne(tok)))
  );
  const wall = Date.now() - t0;
  const s = summarize(results, wall);
  const v = await verifyIntegrity();
  const integrityOk = v.maxPerTpd <= config.quota && v.duplicates === 0;
  console.log(
    `[RAMP] TPD=${String(nTpd).padStart(2)} x${RESP_PER_TPD} | ok=${s.ok}/${s.total} fail=${s.fail} ` +
      `| wall=${wall}ms thrpt=${s.throughput}/s p50=${s.p50}ms p95=${s.p95}ms max=${s.max}ms ` +
      `| status=${JSON.stringify(s.byStatus)} | commit=${v.committed} maxPerTPD=${v.maxPerTpd} dup=${v.duplicates} ` +
      `| integritas=${integrityOk ? 'OK' : 'GAGAL'}`
  );
  return integrityOk;
}

async function runOverrunTest() {
  // Uji boundary kuota C1: 1 TPD, kuota K, tembak K+OVERRUN submit konkuren.
  await clearResponses();
  const K = config.quota;
  const token = mintToken(config.surveyors[0]);
  const attempts = K + OVERRUN;
  const results = await Promise.all(Array.from({ length: attempts }, () => submitOne(token)));
  const ok = results.filter((r) => r.ok).length;
  const rejected = results.filter((r) => r.status === 403).length;
  const v = await verifyIntegrity();
  const pass = v.committed === K && v.maxPerTpd === K && v.duplicates === 0;
  console.log(
    `[C1 BOUNDARY] kuota=${K} tembak=${attempts} konkuren | sukses=${ok} ditolak403=${rejected} ` +
      `| commit_aktual=${v.committed} (harus ${K}) dup=${v.duplicates} | ${pass ? 'LULUS (kuota tidak jebol)' : 'GAGAL (kuota jebol!)'}`
  );
  return pass;
}

(async () => {
  console.log(`Target=${BASE} survey=${SURVEY_ID} quota=${config.quota} resp/TPD=${RESP_PER_TPD}`);
  let allOk = true;
  for (const n of RAMP) {
    if (n > config.surveyors.length) {
      console.log(`[skip] TPD=${n} > tersedia ${config.surveyors.length}`);
      continue;
    }
    allOk = (await runWave(n)) && allOk;
  }
  allOk = (await runOverrunTest()) && allOk;
  console.log(`\nHASIL AKHIR: ${allOk ? 'SEMUA INTEGRITAS OK ✅' : 'ADA KEGAGALAN ❌'}`);
  await sequelize.close();
  process.exit(allOk ? 0 : 1);
})();
