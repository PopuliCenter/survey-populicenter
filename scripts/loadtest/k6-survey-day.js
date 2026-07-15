/* eslint-disable */
/**
 * k6-survey-day.js — Simulasi hari-H survei lapangan: 10 wilayah, ratusan TPD
 * login lalu menyetor data (start → upload media → submit) bersamaan.
 *
 * 🚨 STAGING/LOKAL SAJA — DILARANG ke produksi. Skrip menolak berjalan bila
 *    BASE_URL mengarah ke populicenter.com.
 *
 * Prasyarat: seed dulu di server target —
 *   docker compose exec backend node scripts/loadtest-seed.cjs
 *
 * Jalankan (contoh, dari mesin mana pun yang bisa akses staging):
 *   k6 run -e BASE_URL=http://IP-STAGING scripts/loadtest/k6-survey-day.js
 *
 * Knob (env -e):
 *   BASE_URL   (wajib)  mis. http://localhost / http://10.0.0.5
 *   TPD        (300)    jumlah VU = jumlah akun TPD hasil seeder
 *   RAMP       (2m)     durasi gelombang login (0 → TPD VU)
 *   STEADY     (10m)    durasi beban puncak
 *   MEDIA      (1)      1 = ikut upload foto+audio; 0 = submit data saja
 *   PHOTO_KB   (400)    ukuran foto sintetis
 *   AUDIO_KB   (900)    ukuran audio sintetis
 *   THINK_MIN  (3)      jeda "wawancara" minimum (detik)
 *   THINK_MAX  (8)      jeda maksimum
 *   PASSWORD   (LoadTest#2026)
 *
 * Catatan limiter: semua VU berasal dari SATU IP generator, sehingga pagar
 * login lapis-2 (per-IP, default 100/15 menit) akan menolak login ke-101 —
 * itu BUKTI pagarnya bekerja, bukan bug. Untuk menguji kapasitas penuh dari
 * satu generator, set di .env staging: LOGIN_IP_RATE_LIMIT_MAX=100000
 * (di lapangan nyata tiap TPD punya IP CGNAT berbeda-beda).
 */
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import crypto from 'k6/crypto';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL;
if (!BASE) fail('BASE_URL wajib diisi, mis. -e BASE_URL=http://ip-staging');
if (/populicenter\.com/i.test(BASE)) {
  fail('DITOLAK: BASE_URL mengarah ke PRODUKSI. Load test hanya untuk staging/lokal.');
}

const TPD = parseInt(__ENV.TPD || '300', 10);
const MEDIA = (__ENV.MEDIA || '1') === '1';
const THINK_MIN = parseFloat(__ENV.THINK_MIN || '3');
const THINK_MAX = parseFloat(__ENV.THINK_MAX || '8');
const PASSWORD = __ENV.PASSWORD || 'LoadTest#2026';

// Media sintetis — dibuat sekali per VU, dipakai ulang tiap iterasi.
const PHOTO = crypto.randomBytes(parseInt(__ENV.PHOTO_KB || '400', 10) * 1024);
const AUDIO = crypto.randomBytes(parseInt(__ENV.AUDIO_KB || '900', 10) * 1024);

const rateLimited = new Counter('rate_limited_429');
const submitOk = new Counter('submit_ok');
const tSubmit = new Trend('submit_duration', true);
const tUpload = new Trend('upload_duration', true);

export const options = {
  scenarios: {
    survey_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || '2m', target: TPD },   // gelombang login pagi
        { duration: __ENV.STEADY || '10m', target: TPD }, // puncak sinkron
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Gagal (non-2xx/3xx) < 1% — 429 login lapis-2 dihitung terpisah.
    http_req_failed: ['rate<0.01'],
    submit_duration: ['p(95)<800'],  // submit p95 < 800 ms
    upload_duration: ['p(95)<3000'], // upload media p95 < 3 dtk
  },
};

// State per-VU (login sekali, dipakai semua iterasi)
let token = null;
let survey = null;
let questions = null;
let localSeq = 0;

const authHeaders = () => ({ headers: { Authorization: `Bearer ${token}` } });
const jsonHeaders = () => ({
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});

function loginOnce() {
  if (token) return true;
  const email = `tpd${String(((__VU - 1) % TPD) + 1).padStart(4, '0')}@loadtest.local`;
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' },
  });
  if (res.status === 429) { rateLimited.add(1); sleep(5); return false; }
  if (!check(res, { 'login 200': (r) => r.status === 200 })) { sleep(3); return false; }
  token = res.json('token');

  // Ambil survei [LOADTEST] yang ditugaskan + pertanyaannya (sekali saja)
  const list = http.get(`${BASE}/surveys`, { ...authHeaders(), tags: { name: 'surveys-list' } });
  if (!check(list, { 'daftar survei 200': (r) => r.status === 200 })) { token = null; return false; }
  const arr = list.json('surveys') || list.json(); // dukung {surveys:[...]} atau [...]
  survey = (Array.isArray(arr) ? arr : []).find((s) => (s.title || '').startsWith('[LOADTEST]'));
  if (!survey) fail('Survei [LOADTEST] tidak ditemukan — sudah jalankan seeder?');

  const detail = http.get(`${BASE}/surveys/${survey.id}`, { ...authHeaders(), tags: { name: 'survey-detail' } });
  if (!check(detail, { 'detail survei 200': (r) => r.status === 200 })) { token = null; return false; }
  const d = detail.json('survey') || detail.json();
  questions = (d.questions || d.Questions || []).sort((a, b) => a.order_index - b.order_index);
  if (questions.length < 3) fail(`Pertanyaan survei tidak lengkap (${questions.length})`);
  return true;
}

export default function surveyDay() {
  if (!loginOnce()) return;

  // ── 1 iterasi = 1 wawancara ─────────────────────────────────────────────
  const start = http.post(`${BASE}/responses/start`, JSON.stringify({ survey_id: survey.id }), {
    ...jsonHeaders(), tags: { name: 'start' },
  });
  if (start.status === 429) { rateLimited.add(1); sleep(5); return; }
  if (start.status === 403) { sleep(30); return; } // kuota VU ini habis — diam
  if (!check(start, { 'start 201': (r) => r.status === 201 })) { sleep(3); return; }
  const sessionToken = start.json('session_token');
  const clientStart = new Date().toISOString();

  // "Wawancara" berlangsung…
  sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));

  // Nomor kuesioner unik antar-VU dan antar-iterasi
  localSeq += 1;
  const uniqueNumber = `LT${__VU}-${localSeq}`;

  // Cek ketersediaan nomor (alur nyata: gerbang anti-double di depan)
  const uniqueQ = questions.find((q) => q.type === 'unique_id');
  const cek = http.post(`${BASE}/responses/check-unique`, JSON.stringify({
    survey_id: survey.id, question_id: uniqueQ.id, value: uniqueNumber,
  }), { ...jsonHeaders(), tags: { name: 'check-unique' } });
  check(cek, { 'check-unique 200': (r) => r.status === 200 });

  // Upload media (opsional)
  let photoPaths = [];
  let audioPaths = [];
  if (MEDIA) {
    const up1 = http.post(`${BASE}/upload/photo`, {
      photo: http.file(PHOTO, 'photo.jpg', 'image/jpeg'),
    }, { ...authHeaders(), tags: { name: 'upload-photo' } });
    tUpload.add(up1.timings.duration);
    if (up1.status === 429) rateLimited.add(1);
    else if (check(up1, { 'foto 201': (r) => r.status === 201 })) photoPaths = [up1.json('path')];

    const up2 = http.post(`${BASE}/upload/audio`, {
      audio: http.file(AUDIO, 'rec.webm', 'audio/webm'),
    }, { ...authHeaders(), tags: { name: 'upload-audio' } });
    tUpload.add(up2.timings.duration);
    if (up2.status === 429) rateLimited.add(1);
    else if (check(up2, { 'audio 201': (r) => r.status === 201 })) audioPaths = [up2.json('path')];
  }

  // Submit
  const [, qChoice, qText] = questions;
  const submit = http.post(`${BASE}/responses/submit`, JSON.stringify({
    session_token: sessionToken,
    answers: [
      { question_id: uniqueQ.id, answer_value: uniqueNumber },
      { question_id: qChoice.id, answer_value: Math.random() < 0.5 ? 'SETUJU' : 'TIDAK SETUJU' },
      { question_id: qText.id, answer_value: 'JAWABAN SINTETIS UJI BEBAN' },
    ],
    start_latitude: -6.2 + Math.random() * 0.1,
    start_longitude: 106.8 + Math.random() * 0.1,
    start_geo_status: 'available',
    client_start_time: clientStart,
    client_end_time: new Date().toISOString(),
    ...(photoPaths.length ? { photo_paths: photoPaths } : {}),
    ...(audioPaths.length ? { audio_paths: audioPaths } : {}),
  }), { ...jsonHeaders(), tags: { name: 'submit' } });

  tSubmit.add(submit.timings.duration);
  if (submit.status === 429) rateLimited.add(1);
  if (check(submit, { 'submit 201': (r) => r.status === 201 || r.status === 200 })) submitOk.add(1);

  sleep(1 + Math.random() * 2);
}
