'use strict';

/**
 * cache.js — pembungkus Redis yang gagal-aman (fail-safe). Bila Redis
 * bermasalah, get mengembalikan null dan set/del diam-diam dilewati sehingga
 * pemanggil tetap bisa menghitung ulang tanpa error. Dipakai bersama oleh
 * dashboard & storage agar tidak ada duplikasi helper.
 */

const redis = require('../config/redis');

async function cacheGet(key) {
  try {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    /* abaikan kegagalan cache */
  }
}

async function cacheDel(key) {
  try {
    await redis.del(key);
  } catch {
    /* abaikan kegagalan cache */
  }
}

module.exports = { cacheGet, cacheSet, cacheDel };
