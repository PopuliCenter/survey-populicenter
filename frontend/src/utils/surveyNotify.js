/**
 * surveyNotify.js
 *
 * Deteksi perubahan ketersediaan survei untuk TPD: survei yang BARU muncul
 * (tersedia) atau HILANG (dinonaktifkan/tidak ditugaskan) dibanding daftar
 * yang terakhir dilihat. Murni — mudah diuji.
 */

/**
 * Bandingkan daftar survei sebelumnya vs sekarang.
 *
 * @param {Array<{id:string, title?:string}>} prev   Daftar sebelumnya
 * @param {Array<{id:string, title?:string}>} current Daftar sekarang
 * @returns {{ added: Array<{id,title}>, removed: Array<{id,title}> }}
 */
export function diffSurveyAvailability(prev = [], current = []) {
  const prevIds = new Set(prev.map((s) => s.id));
  const currentIds = new Set(current.map((s) => s.id));
  const added = current.filter((s) => !prevIds.has(s.id));
  const removed = prev.filter((s) => !currentIds.has(s.id));
  return { added, removed };
}

/**
 * Ringkas daftar survei menjadi {id,title} (buang field lain).
 * @param {Array} surveys
 */
export function toSurveyStubs(surveys = []) {
  return surveys.map((s) => ({ id: s.id, title: s.title || '(tanpa judul)' }));
}

export default diffSurveyAvailability;
