'use strict';

/**
 * BullMQ queue for asynchronous export jobs.
 * Uses the same Redis instance as rate limiting.
 *
 * In test environment, returns a mock object to avoid Redis connection attempts.
 */

if (process.env.NODE_ENV === 'test') {
  module.exports = {
    queue: {
      add: () => Promise.resolve({}),
      close: () => Promise.resolve(),
      obliterate: () => Promise.resolve(),
    },
    worker: null,
    connection: null,
  };
} else {
  const { Queue } = require('bullmq');

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(redisUrl);

  const connection = {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 6379,
  };

  const exportQueue = new Queue('export-jobs', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },  // Keep last 100 completed jobs
      removeOnFail: { count: 200 },      // Keep last 200 failed jobs
    },
  });

  module.exports = {
    queue: exportQueue,
    connection,
  };
}
