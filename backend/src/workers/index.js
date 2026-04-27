#!/usr/bin/env node
'use strict';

/**
 * Export Worker Process
 * 
 * This worker process handles async export jobs from the Bull queue.
 * It should be run as a separate process from the main API server.
 * 
 * Usage:
 *   node src/workers/index.js
 * 
 * Or with PM2:
 *   pm2 start src/workers/index.js --name export-worker
 */

require('dotenv').config();

const exportQueue = require('../config/queue');
const { processExportJob } = require('./exportWorker');

console.log('[Worker] Starting export worker...');

// Register the job processor
exportQueue.process(async (job) => {
  console.log(`[Worker] Processing job ${job.id}...`);
  return processExportJob(job);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Worker] SIGTERM received, closing queue...');
  await exportQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker] SIGINT received, closing queue...');
  await exportQueue.close();
  process.exit(0);
});

console.log('[Worker] Export worker is ready and waiting for jobs');
