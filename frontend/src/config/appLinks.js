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

// Halaman Kebijakan Privasi (publik). Contoh: 'https://populicenter.org/kebijakan-privasi'
export const PRIVACY_POLICY_URL = '';

// Halaman Syarat & Ketentuan (publik). Contoh: 'https://populicenter.org/syarat-ketentuan'
export const TERMS_URL = '';

// Email dukungan. Contoh: 'support@populicenter.org'
export const SUPPORT_EMAIL = '';

// Nomor WhatsApp dukungan, format internasional TANPA tanda '+'.
// Contoh: '6281234567890'
export const SUPPORT_WHATSAPP = '';

/**
 * Tautan kontak dukungan siap-pakai: utamakan WhatsApp, lalu email.
 * @returns {string} URL (wa.me / mailto) atau '' bila belum diisi.
 */
export function supportLink() {
  if (SUPPORT_WHATSAPP) return `https://wa.me/${SUPPORT_WHATSAPP}`;
  if (SUPPORT_EMAIL) return `mailto:${SUPPORT_EMAIL}`;
  return '';
}
