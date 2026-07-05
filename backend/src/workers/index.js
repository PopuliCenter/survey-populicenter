#!/usr/bin/env node
'use strict';

/**
 * Export Worker Process (BullMQ)
 *
 * This worker process handles async export jobs from the BullMQ queue.
 * It should be run as a separate process from the main API server.
 *
 * Usage:
 *   node src/workers/index.js
 *
 * Or with PM2:
 *   pm2 start src/workers/index.js --name export-worker
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const { connection } = require('../config/queue');
const { processExportJob } = require('./exportWorker');
const { processArchiveJob } = require('./archiveWorker');
const { captureException } = require('../config/sentry');

// Initialize Sentry for worker process (no Express, just error capture)
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: `populi-survey-worker@1.0.0`,
  });
}

console.log('[Worker] Starting export worker (BullMQ)...');

const worker = new Worker(
  'export-jobs',
  async (job) => {
    console.log(`[Worker] Processing job ${job.id} (${job.name}, attempt ${job.attemptsMade + 1})...`);
    // Satu queue, dua jenis job dibedakan lewat nama.
    if (job.name === 'archive') return processArchiveJob(job);
    return processExportJob(job);
  },
  {
    connection,
    concurrency: 2, // Process up to 2 export jobs simultaneously
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message);
  captureException(err, { jobId: job.id, data: job.data });
});

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err.message);
});

// Handle graceful shutdown
async function shutdown(signal) {
  console.log(`[Worker] ${signal} received, closing worker...`);
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Maintenance terjadwal (M2 stats, M3 PENDING, M4 media yatim) ──────────────
// Berjalan di proses worker (instance tunggal). Bisa dimatikan via
// MAINTENANCE_DISABLED=true.
if (process.env.MAINTENANCE_DISABLED !== 'true') {
  const { startMaintenanceScheduler } = require('./maintenance');
  startMaintenanceScheduler();
}

console.log('[Worker] Export worker is ready and waiting for jobs');
