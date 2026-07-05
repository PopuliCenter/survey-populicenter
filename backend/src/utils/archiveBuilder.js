'use strict';

/**
 * archiveBuilder.js — bangun arsip ZIP satu survei (responses.json + folder
 * media/) ke sebuah path output. Dipakai bersama oleh:
 *  - route sinkron  (storage.js, survei kecil → langsung diunduh)
 *  - worker async   (archiveWorker.js, survei besar → file di uploads/exports)
 *
 * Query pakai RAW SQL + JOIN via survey_id (tanpa hidrasi ORM, tanpa daftar
 * `IN (ribuan id)`) agar ringan & tahan survei sangat besar.
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { sequelize, Survey } = require('../models');
const { UPLOADS_ROOT, PROJECT_ROOT } = require('./mediaFiles');

/**
 * @param {string} surveyId
 * @param {string} outPath  tujuan file .zip
 * @returns {Promise<{count:number, title:string}>}
 */
async function buildSurveyArchive(surveyId, outPath) {
  const survey = await Survey.findByPk(surveyId, { attributes: ['id', 'title'] });
  if (!survey) {
    const e = new Error('Survei tidak ditemukan');
    e.status = 404;
    throw e;
  }

  const [respRows] = await sequelize.query(
    `SELECT id, questionnaire_number, surveyor_id, created_at, latitude, longitude,
            review_status, audio_path, signature_path, photo_paths
     FROM responses
     WHERE survey_id = :sid AND questionnaire_number NOT LIKE 'PENDING-%'
     ORDER BY created_at ASC`,
    { replacements: { sid: surveyId } }
  );

  let ansRows = [];
  if (respRows.length > 0) {
    [ansRows] = await sequelize.query(
      `SELECT a.response_id, a.question_id, a.answer_value, a.answer_json, a.photo_path
       FROM answers a
       JOIN responses r ON r.id = a.response_id
       WHERE r.survey_id = :sid AND r.questionnaire_number NOT LIKE 'PENDING-%'`,
      { replacements: { sid: surveyId } }
    );
  }

  const ansByResp = {};
  const mediaSet = new Set();
  for (const a of ansRows) {
    if (!ansByResp[a.response_id]) ansByResp[a.response_id] = [];
    ansByResp[a.response_id].push({
      question_id: a.question_id, answer_value: a.answer_value,
      answer_json: a.answer_json, photo_path: a.photo_path,
    });
    if (a.photo_path) mediaSet.add(a.photo_path);
  }
  for (const r of respRows) {
    if (r.audio_path) mediaSet.add(r.audio_path);
    if (r.signature_path) mediaSet.add(r.signature_path);
    if (Array.isArray(r.photo_paths)) for (const p of r.photo_paths) if (p) mediaSet.add(p);
  }

  const data = respRows.map((r) => ({
    id: r.id,
    questionnaire_number: r.questionnaire_number,
    surveyor_id: r.surveyor_id,
    created_at: r.created_at,
    latitude: r.latitude,
    longitude: r.longitude,
    review_status: r.review_status,
    answers: ansByResp[r.id] || [],
  }));

  const output = fs.createWriteStream(outPath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);
  archive.append(
    JSON.stringify({ survey: { id: survey.id, title: survey.title }, count: data.length, responses: data }, null, 2),
    { name: 'responses.json' }
  );
  for (const rel of mediaSet) {
    const full = path.resolve(PROJECT_ROOT, rel);
    // hanya file di dalam uploads/ (cegah path traversal)
    if (full !== UPLOADS_ROOT && !full.startsWith(UPLOADS_ROOT + path.sep)) continue;
    if (fs.existsSync(full)) archive.file(full, { name: `media/${rel.replace(/^uploads\//, '')}` });
  }
  archive.finalize();
  await done;

  return { count: data.length, title: survey.title };
}

module.exports = { buildSurveyArchive };
