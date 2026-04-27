const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// --- Photo upload config ---
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'photos');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// --- Audio upload config ---
const AUDIO_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'audio');
const AUDIO_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const AUDIO_ALLOWED_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'];

// --- Signature upload config ---
const SIGNATURE_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'signatures');
const SIGNATURE_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const SIGNATURE_ALLOWED_MIME_TYPES = ['image/png'];

// Ensure upload directories exist
[UPLOAD_DIR, AUDIO_UPLOAD_DIR, SIGNATURE_UPLOAD_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `photo-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('FORMAT_NOT_SUPPORTED'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

/**
 * POST /upload/photo
 * Upload a photo file (JPEG, PNG, WEBP) up to 5 MB
 * Requires authentication (admin or surveyor)
 * Returns: { path: "uploads/photos/filename.jpg" }
 */
router.post('/photo', authMiddleware, requireRole(['admin', 'supervisor', 'surveyor']), (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Ukuran file melebihi batas maksimal 5 MB' });
      }
      if (err.message === 'FORMAT_NOT_SUPPORTED') {
        return res.status(422).json({ error: 'Format file tidak didukung. Gunakan JPEG, PNG, atau WEBP' });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(422).json({ error: 'File tidak ditemukan dalam request' });
    }

    // Return relative path
    const relativePath = `uploads/photos/${req.file.filename}`;
    res.status(201).json({ path: relativePath });
  });
});

// --- Audio multer config ---
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AUDIO_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.webm';
    cb(null, `audio-${uniqueSuffix}${ext}`);
  },
});

const audioFileFilter = (req, file, cb) => {
  if (AUDIO_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('AUDIO_FORMAT_NOT_SUPPORTED'), false);
  }
};

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: AUDIO_MAX_FILE_SIZE },
  fileFilter: audioFileFilter,
});

/**
 * POST /upload/audio
 * Upload an audio file (WebM, MP4, MPEG, OGG) up to 50 MB
 * Requires authentication (admin, supervisor, or surveyor)
 * Returns: { path: "uploads/audio/audio-{timestamp}-{random}.ext" }
 */
router.post('/audio', authMiddleware, requireRole(['admin', 'supervisor', 'surveyor']), (req, res, next) => {
  audioUpload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Ukuran file melebihi batas maksimal 50 MB' });
      }
      if (err.message === 'AUDIO_FORMAT_NOT_SUPPORTED') {
        return res.status(422).json({ error: 'Format file tidak didukung. Gunakan WebM, MP4, MPEG, atau OGG' });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(422).json({ error: 'File tidak ditemukan dalam request' });
    }

    const relativePath = `uploads/audio/${req.file.filename}`;
    res.status(201).json({ path: relativePath });
  });
});

// --- Signature multer config ---
const signatureStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SIGNATURE_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `sig-${uniqueSuffix}.png`);
  },
});

const signatureFileFilter = (req, file, cb) => {
  if (SIGNATURE_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('SIGNATURE_FORMAT_NOT_SUPPORTED'), false);
  }
};

const signatureUpload = multer({
  storage: signatureStorage,
  limits: { fileSize: SIGNATURE_MAX_FILE_SIZE },
  fileFilter: signatureFileFilter,
});

/**
 * POST /upload/signature
 * Upload a signature image (PNG only) up to 2 MB
 * Requires authentication (admin, supervisor, or surveyor)
 * Returns: { path: "uploads/signatures/sig-{timestamp}-{random}.png" }
 */
router.post('/signature', authMiddleware, requireRole(['admin', 'supervisor', 'surveyor']), (req, res, next) => {
  signatureUpload.single('signature')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Ukuran file melebihi batas maksimal 2 MB' });
      }
      if (err.message === 'SIGNATURE_FORMAT_NOT_SUPPORTED') {
        return res.status(422).json({ error: 'Format file tidak didukung. Gunakan PNG' });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(422).json({ error: 'File tidak ditemukan dalam request' });
    }

    const relativePath = `uploads/signatures/${req.file.filename}`;
    res.status(201).json({ path: relativePath });
  });
});

module.exports = router;
