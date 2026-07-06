'use strict';

/**
 * archiveWorker.js — pemroses job arsip ZIP async (BullMQ, nama job 'archive').
 * Dipakai untuk survei besar: bangun ZIP ke uploads/exports/archive-<jobId>.zip
 * lalu tandai ExportJob 'completed'. Klien mengunduh via
 * GET /storage/archive-jobs/:jobId/download.
 *
 * Struktur job.data: { jobId: UUID, survey_id: UUID }
 */

const path = require('path');
const fsp = require('fs').promises;
const { ExportJob } = require('../models');
const { buildSurveyArchive } = require('../utils/archiveBuilder');

async function processArchiveJob(job) {
  const { jobId, survey_id } = job.data;

  try {
    // Idempotensi: bila retry BullMQ mengulang job yang sudah selesai, jangan
    // bangun ulang ZIP (boros) — atau bila record sudah hilang, lewati.
    const existing = await ExportJob.findByPk(jobId, { attributes: ['status'] });
    if (!existing) return { success: false, skipped: 'job-record-missing' };
    if (existing.status === 'completed') return { success: true, skipped: 'already-completed' };

    await ExportJob.update({ status: 'processing' }, { where: { id: jobId } });

    const exportsDir = path.join(__dirname, '..', '..', 'uploads', 'exports');
    await fsp.mkdir(exportsDir, { recursive: true });

    const fileName = `archive-${jobId}.zip`;
    const outPath = path.join(exportsDir, fileName);
    const { count } = await buildSurveyArchive(survey_id, outPath);

    await ExportJob.update(
      { status: 'completed', file_path: `uploads/exports/${fileName}`, completed_at: new Date() },
      { where: { id: jobId } }
    );

    return { success: true, file_path: `uploads/exports/${fileName}`, count };
  } catch (error) {
    await ExportJob.update(
      { status: 'failed', completed_at: new Date(), error_message: String(error && error.message || 'Kesalahan tak dikenal').slice(0, 500) },
      { where: { id: jobId } }
    );
    throw error;
  }
}

module.exports = { processArchiveJob };
