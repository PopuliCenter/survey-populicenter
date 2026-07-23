/**
 * Muat variabel lingkungan (.env) SEBELUM suite mana pun berjalan.
 *
 * Tanpa ini, suite yang me-require modul rute secara langsung (mis. tes
 * properti) bergantung pada suite lain yang kebetulan memuat src/app.js
 * (baris pertamanya dotenv) lebih dulu — middleware/auth.js fail-fast
 * process.exit(1) bila JWT_SECRET kosong, dan urutan suite jest berubah-ubah
 * mengikuti ukuran file. Flake urutan ini pernah menjatuhkan seluruh run.
 */
require('dotenv').config();

// Jaring pengaman untuk lingkungan CI tanpa .env — nilai KHUSUS TES.
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'your-secret-key-change-in-production';
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = process.env.JWT_SECRET;
