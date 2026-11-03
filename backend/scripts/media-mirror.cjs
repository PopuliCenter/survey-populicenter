#!/usr/bin/env node
/**
 * media-mirror.cjs — Salin seluruh objek bucket media ke/dari sebuah folder.
 *
 * Pengganti `mc mirror` untuk backup-minio.sh & restore-minio.sh. Image minio/mc
 * sudah tak tersedia di registry publik (Docker Hub 404, dl.min.io 410), jadi alat
 * backup tak boleh bergantung padanya. Skrip ini memakai paket `minio` yang sudah
 * ada di image backend kita sendiri, dan env MINIO_* milik service worker.
 *
 * Dipanggil dari skrip backup, bukan langsung:
 *   docker compose run --rm --no-deps -T -v <folder>:/out worker node scripts/media-mirror.cjs pull /out
 *   docker compose run --rm --no-deps -T -v <folder>:/in:ro worker node scripts/media-mirror.cjs push /in
 *
 * pull : tiap objek → <folder>/<key>. Keluar 1 bila satu saja gagal atau ukurannya
 *        tak cocok, supaya arsip parsial tak lolos sebagai backup yang sehat.
 * push : tiap berkas → bucket (menimpa key sama; objek lain tak dihapus). Bucket
 *        dibuat bila belum ada, karena pemulihan bisa terjadi di server baru.
 *        Argumen ketiga = jumlah berkas yang diharapkan; bila tak cocok, keluar 1
 *        agar folder yang salah terpasang tak berakhir sebagai "pemulihan sukses".
 */
const fs = require('fs');
const path = require('path');

const BUCKET = process.env.MINIO_BUCKET || 'survey-media';

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.webm': 'audio/webm', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

function createClient() {
  const Minio = require('minio');
  if (!process.env.MINIO_ENDPOINT || !process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
    throw new Error('MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY belum diset di env container ini.');
  }
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
  });
}

/** Lokasi berkas untuk sebuah key; menolak key yang keluar dari folder tujuan. */
function targetPath(root, key) {
  const base = path.resolve(root);
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`Key di luar folder tujuan: ${key}`);
  }
  return full;
}

function listObjects(client, bucket) {
  return new Promise((resolve, reject) => {
    const objects = [];
    client.listObjects(bucket, '', true)
      .on('data', (o) => { if (o.name) objects.push(o); })
      .on('error', reject)
      .on('end', () => resolve(objects));
  });
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

async function pull(client, bucket, dir) {
  if (!(await client.bucketExists(bucket))) {
    throw new Error(`Bucket "${bucket}" tidak ada.`);
  }
  // Key berakhiran "/" hanya penanda folder, bukan objek berisi.
  const objects = (await listObjects(client, bucket)).filter((o) => !o.name.endsWith('/'));
  let copied = 0, bytes = 0, failed = 0;
  for (const o of objects) {
    try {
      const file = targetPath(dir, o.name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await client.fGetObject(bucket, o.name, file);
      const size = fs.statSync(file).size;
      if (size !== o.size) throw new Error(`ukuran ${size} ≠ ${o.size}`);
      copied += 1; bytes += size;
    } catch (e) {
      failed += 1;
      console.error(`  ✗ gagal: ${o.name} — ${e.message}`);
    }
  }
  return { total: objects.length, copied, bytes, failed };
}

async function push(client, bucket, dir, expected) {
  const files = walk(dir);
  if (expected !== undefined && files.length !== expected) {
    throw new Error(`Folder berisi ${files.length} berkas, diharapkan ${expected}.`);
  }
  if (!(await client.bucketExists(bucket))) {
    await client.makeBucket(bucket);
  }
  let copied = 0, bytes = 0, failed = 0;
  for (const file of files) {
    const key = path.relative(dir, file).split(path.sep).join('/');
    try {
      await client.fPutObject(bucket, key, file, {
        'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      });
      copied += 1; bytes += fs.statSync(file).size;
    } catch (e) {
      failed += 1;
      console.error(`  ✗ gagal: ${key} — ${e.message}`);
    }
  }
  return { total: files.length, copied, bytes, failed };
}

if (require.main === module) {
  const [mode, dir, expectedArg] = process.argv.slice(2);
  const run = { pull, push }[mode];
  if (!run || !dir) {
    console.error('Pakai: node scripts/media-mirror.cjs <pull|push> <folder> [jumlah-harapan]');
    process.exit(2);
  }
  run(createClient(), BUCKET, dir, expectedArg === undefined ? undefined : Number(expectedArg)).then((r) => {
    console.log(`  · ${mode} bucket "${BUCKET}": ${r.copied}/${r.total} objek, ${(r.bytes / 1048576).toFixed(1)} MB`);
    if (r.failed) console.error(`  ✗ ${r.failed} objek gagal.`);
    process.exit(r.failed ? 1 : 0);
  }).catch((e) => {
    console.error(`  ✗ ${mode} gagal: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { pull, push, targetPath };
