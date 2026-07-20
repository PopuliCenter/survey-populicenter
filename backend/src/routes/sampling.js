'use strict';

/**
 * routes/sampling.js — Proxy ber-autentikasi ke layanan Random Sampling (Python).
 *
 * Layanan Python (sampling-service) TIDAK punya auth & hanya di jaringan internal
 * Docker. Semua akses WAJIB lewat sini agar JWT + role (admin/supervisor)
 * ditegakkan. Node meneruskan unggahan MFD/referensi + config ke Python, lalu
 * mengembalikan hasilnya (JSON atau Excel) apa adanya.
 *
 * Memakai fetch/FormData/Blob bawaan Node (>=18) — tanpa dependensi tambahan.
 */

const express = require('express');
const multer = require('multer');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const SERVICE_URL = (process.env.SAMPLING_SERVICE_URL || 'http://sampling:8000').replace(/\/$/, '');
const ROLES = ['admin', 'supervisor'];
const MAX_FILE = 25 * 1024 * 1024; // 25 MB (MFD 38 provinsi ~3 MB)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE } });

// Terima MFD (wajib) + reference (opsional) sebagai multipart.
const acceptFiles = upload.fields([
  { name: 'mfd', maxCount: 1 },
  { name: 'reference', maxCount: 1 },
]);

function fileFrom(req, field) {
  const f = req.files && req.files[field] && req.files[field][0];
  if (!f) return null;
  return { blob: new Blob([f.buffer], { type: f.mimetype || 'application/octet-stream' }), name: f.originalname || `${field}.xlsx` };
}

// Bungkus multer agar error (mis. file > 25 MB) jadi 4xx yang ramah, bukan 500.
function withFiles(req, res, next) {
  acceptFiles(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'Berkas terlalu besar (maks 25 MB).' : 'Unggahan tidak valid.' });
    }
    return next();
  });
}

async function forwardJson(res, path, form) {
  let upstream;
  try {
    upstream = await fetch(`${SERVICE_URL}${path}`, { method: 'POST', body: form });
  } catch {
    return res.status(503).json({ error: 'Layanan sampling tidak tersedia. Coba lagi sebentar.' });
  }
  const text = await upstream.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: text || 'Respons layanan tidak valid' }; }
  if (!upstream.ok) {
    // FastAPI membungkus pesan error di { detail }.
    const msg = (body && (body.detail || body.error)) || 'Gagal memproses sampling';
    return res.status(upstream.status === 422 ? 422 : upstream.status || 502).json({ error: msg });
  }
  return res.json(body);
}

// POST /sampling/inspect — unggah MFD → daftar provinsi/kab + metadata (isi form).
router.post('/inspect', authMiddleware, requireRole(ROLES), withFiles, async (req, res) => {
  const mfd = fileFrom(req, 'mfd');
  if (!mfd) return res.status(422).json({ error: 'File MFD (.xlsx) wajib diunggah.' });
  const form = new FormData();
  form.append('mfd', mfd.blob, mfd.name);
  const ref = fileFrom(req, 'reference');
  if (ref) form.append('reference', ref.blob, ref.name);
  return forwardJson(res, '/inspect', form);
});

// Bangun form MFD + config (+ referensi) — dipakai /preview dan /run.
function configForm(req, res) {
  const mfd = fileFrom(req, 'mfd');
  if (!mfd) { res.status(422).json({ error: 'File MFD (.xlsx) wajib diunggah.' }); return null; }
  if (!req.body || !req.body.config) { res.status(422).json({ error: 'Parameter sampling (config) wajib diisi.' }); return null; }
  const form = new FormData();
  form.append('mfd', mfd.blob, mfd.name);
  form.append('config', String(req.body.config));
  const ref = fileFrom(req, 'reference');
  if (ref) form.append('reference', ref.blob, ref.name);
  return form;
}

// POST /sampling/preview — hitung alokasi per wilayah tanpa seleksi acak (pratinjau).
router.post('/preview', authMiddleware, requireRole(ROLES), withFiles, async (req, res) => {
  const form = configForm(req, res);
  if (!form) return undefined;
  return forwardJson(res, '/preview', form);
});

// POST /sampling/run — jalankan sampling (MFD + config JSON string) → hasil + Excel base64.
router.post('/run', authMiddleware, requireRole(ROLES), withFiles, async (req, res) => {
  const form = configForm(req, res);
  if (!form) return undefined;
  return forwardJson(res, '/run', form);
});

// GET /sampling/template/:kind — unduh template Excel (mfd | reference).
router.get('/template/:kind', authMiddleware, requireRole(ROLES), async (req, res) => {
  const kind = req.params.kind === 'reference' ? 'reference' : 'mfd';
  let upstream;
  try {
    upstream = await fetch(`${SERVICE_URL}/template/${kind}`);
  } catch {
    return res.status(503).json({ error: 'Layanan sampling tidak tersedia.' });
  }
  if (!upstream.ok) return res.status(502).json({ error: 'Gagal mengambil template.' });
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="template_${kind}.xlsx"`);
  return res.send(buf);
});

module.exports = router;
