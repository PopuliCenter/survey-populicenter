'use strict';

/**
 * Bull queue for asynchronous export jobs
 * Uses the same Redis instance as rate limiting
 *
 * In test environment, returns a mock object to avoid Redis connection attempts.
 */

if (process.env.NODE_ENV === 'test') {
  module.exports = {
    add: () => Promise.resolve({}),
    process: () => {},
    empty: () => Promise.resolve(),
    close: () => Promise.resolve(),
    on: () => {},
  };
} else {
  const Queue = require('bull');

  const exportQueue = new Queue('export-jobs', {
    redis: {
      host: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'localhost',
      port: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).port : 6379,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  });

  exportQueue.on('error', (error) => {
    console.error('[Queue] Error:', error);
  });

  exportQueue.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job.id} failed:`, err.message);
  });

  exportQueue.on('completed', (job) => {
    console.log(`[Queue] Job ${job.id} completed`);
  });

  module.exports = exportQueue;
}
