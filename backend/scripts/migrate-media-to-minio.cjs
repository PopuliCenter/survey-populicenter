#!/usr/bin/env node
/**
 * migrate-media-to-minio.cjs — Salin media dari disk (volume uploads/) ke MinIO.
 *
 * Dijalankan SEBELUM mem-flip MEDIA_STORAGE=s3. Idempoten: berkas yang sudah ada
 * di bucket dengan ukuran sama akan DILEWATI, jadi aman dijalankan berkali-kali.
 * TIDAK menghapus apa pun dari disk — disk tetap jadi cadangan sampai Anda yakin.
 *
 * Jalankan di dalam container backend (punya env MINIO_* + akses volume):
 *   docker compose exec backend node scripts/migrate-media-to-minio.cjs --check
 *   docker compose exec backend node scripts/migrate-media-to-minio.cjs
 *
 * --check : hanya laporkan berapa berkas di disk vs sudah ada di bucket (tanpa
 *           mengunggah). Pakai ini dulu, lalu tanpa flag untuk mengeksekusi.
 *
 * Bukti sukses = "perlu diunggah: 0" pada --check setelah migrasi.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const UPLOADS_ROOT = path.join(PROJECT_ROOT, 'uploads');
const MEDIA_DIRS = ['photos', 'audio', 'signatures']; // exports/ = ZIP transien, dilewati
const CHECK_ONLY = process.argv.includes('--check');
const BUCKET = process.env.MINIO_BUCKET || 'survey-media';

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.webm': 'audio/webm', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

function client() {
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

function walk(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

(async () => {
  const c = client();
  if (!(await c.bucketExists(BUCKET))) {
    if (CHECK_ONLY) { console.log(`Bucket "${BUCKET}" belum ada (akan dibuat saat migrasi).`); }
    else { await c.makeBucket(BUCKET); console.log(`Bucket "${BUCKET}" dibuat.`); }
  }

  let onDisk = 0, already = 0, toUpload = 0, uploaded = 0, bytes = 0, failed = 0;

  for (const sub of MEDIA_DIRS) {
    for (const full of walk(path.join(UPLOADS_ROOT, sub))) {
      onDisk += 1;
      const rel = path.relative(PROJECT_ROOT, full).split(path.sep).join('/'); // uploads/<sub>/...
      const size = fs.statSync(full).size;

      // Sudah ada dengan ukuran sama? → lewati (idempoten)
      let exists = false;
      try {
        const st = await c.statObject(BUCKET, rel);
        if (st.size === size) exists = true;
      } catch { /* belum ada */ }

      if (exists) { already += 1; continue; }
      toUpload += 1;
      if (CHECK_ONLY) continue;

      try {
        const ext = path.extname(full).toLowerCase();
        await c.fPutObject(BUCKET, rel, full, {
          'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        });
        uploaded += 1; bytes += size;
        if (uploaded % 50 === 0) console.log(`  … ${uploaded} berkas terunggah`);
      } catch (e) {
        failed += 1;
        console.error(`  ✗ gagal: ${rel} — ${e.message}`);
      }
    }
  }

  console.log('─────────────────────────────────────────────');
  console.log(`Berkas di disk       : ${onDisk}`);
  console.log(`Sudah ada di bucket  : ${already}`);
  console.log(`Perlu diunggah       : ${toUpload}`);
  if (!CHECK_ONLY) {
    console.log(`Terunggah kali ini   : ${uploaded} (${(bytes / 1048576).toFixed(1)} MB)`);
    if (failed) console.log(`GAGAL                : ${failed} — cek pesan di atas, jalankan ulang.`);
  }
  console.log('─────────────────────────────────────────────');
  if (CHECK_ONLY && toUpload === 0 && onDisk > 0) {
    console.log('✅ Semua media disk sudah ada di MinIO — aman flip MEDIA_STORAGE=s3.');
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ Migrasi gagal:', e.message); process.exit(1); });
