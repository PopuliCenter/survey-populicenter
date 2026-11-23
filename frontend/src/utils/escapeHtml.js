/**
 * Escape teks untuk disisipkan ke string HTML — dipakai di tempat yang TERPAKSA
 * merakit HTML sebagai string (popup Leaflet). Di JSX biasa React sudah meng-
 * escape sendiri; jangan dipakai ganda di sana.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
