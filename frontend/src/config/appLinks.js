/**
 * appLinks.js
 *
 * Tautan kebijakan & dukungan yang ditampilkan di aplikasi (mis. footer Login).
 * Isi sesuai milik Populi Center. Tautan yang KOSONG otomatis disembunyikan di
 * UI, jadi aman dibiarkan kosong sampai siap.
 *
 * Catatan Play Store: URL Kebijakan Privasi juga WAJIB dimasukkan di Play
 * Console (Data Safety). Karena akun TPD dibuat admin (tanpa hapus-akun in-app),
 * deklarasikan di Data Safety bahwa permintaan hapus data dilakukan via kontak
 * dukungan/admin di bawah ini.
 */

// Halaman Kebijakan Privasi — dilayani langsung oleh risetcenter.com
// (file statis: frontend/public/kebijakan-privasi.html).
export const PRIVACY_POLICY_URL = 'https://risetcenter.com/kebijakan-privasi.html';

// Halaman Syarat & Ketentuan — dilayani langsung oleh risetcenter.com
// (file statis: frontend/public/syarat-ketentuan.html).
export const TERMS_URL = 'https://risetcenter.com/syarat-ketentuan.html';

// Halaman Pertanyaan Umum / FAQ — dilayani langsung oleh risetcenter.com
// (file statis: frontend/public/pertanyaan-umum.html).
export const FAQ_URL = 'https://risetcenter.com/pertanyaan-umum.html';

// Email dukungan.
export const SUPPORT_EMAIL = 'info@populicenter.org';

// Nomor WhatsApp dukungan, format internasional TANPA tanda '+'.
// (0812-9206-8362 → 6281292068362)
export const SUPPORT_WHATSAPP = '6281292068362';

/**
 * Tautan kontak dukungan siap-pakai: utamakan WhatsApp, lalu email.
 * @returns {string} URL (wa.me / mailto) atau '' bila belum diisi.
 */
// URL dashboard proyek Sentry (org/proyek Anda). Kosong = kartu Sentry di
// halaman Status Sistem tampil sebagai "belum dikonfigurasi".
// Contoh: 'https://sentry.io/organizations/populi/projects/populi-survey/'
export const SENTRY_DASHBOARD_URL = '';

export function supportLink() {
  if (SUPPORT_WHATSAPP) return `https://wa.me/${SUPPORT_WHATSAPP}`;
  if (SUPPORT_EMAIL) return `mailto:${SUPPORT_EMAIL}`;
  return '';
}
