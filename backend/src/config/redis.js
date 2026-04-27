const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 100, 3000);
  },
});

redis.on('error', (err) => {
  // Suppress connection errors in test environment
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Redis] Connection error:', err.message);
  }
});

module.exports = redis;
