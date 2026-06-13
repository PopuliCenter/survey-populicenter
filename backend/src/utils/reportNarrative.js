'use strict';

/**
 * reportNarrative — susun kalimat narasi (Bahasa Indonesia) otomatis dari
 * ringkasan agregat satu pertanyaan, meniru gaya deck laporan Populi
 * ("Sebesar X persen masyarakat menjawab ...").
 *
 * Narasi ini default; admin dapat menimpanya lewat halaman Laporan.
 */

function fmtPct(p) {
  if (p == null) return '0';
  // Format ala Indonesia: koma sebagai desimal.
  return String(p).replace('.', ',');
}

/**
 * narrateQuestion — kembalikan paragraf narasi untuk satu pertanyaan.
 * @param {object} q ringkasan pertanyaan dari buildSnapshot
 * @returns {string}
 */
function narrateQuestion(q) {
  if (!q) return '';

  // Matriks: ringkas baris dengan nilai tertinggi pada tiap baris.
  if (q.type === 'matrix' && Array.isArray(q.rows)) {
    const parts = q.rows
      .filter((r) => r.distribution && r.distribution.length > 0)
      .slice(0, 4)
      .map((r) => `${r.row}: "${r.distribution[0].label}" (${fmtPct(r.distribution[0].pct)}%)`);
    return parts.length ? `Ringkasan jawaban tertinggi tiap aspek — ${parts.join('; ')}.` : '';
  }

  const dist = Array.isArray(q.distribution) ? q.distribution : [];
  if (dist.length === 0) {
    if (q.average != null) return `Rata-rata penilaian responden adalah ${fmtPct(q.average)}.`;
    return 'Belum ada data jawaban untuk pertanyaan ini.';
  }

  const top = dist[0];
  let s = `Sebesar ${fmtPct(top.pct)} persen responden menjawab "${top.label}"`;
  if (dist[1]) s += `, diikuti "${dist[1].label}" (${fmtPct(dist[1].pct)} persen)`;
  if (dist[2]) s += ` dan "${dist[2].label}" (${fmtPct(dist[2].pct)} persen)`;
  s += '.';

  if (q.average != null) {
    s += ` Rata-rata penilaian berada pada angka ${fmtPct(q.average)}.`;
  }
  if (q.total_answered != null) {
    s += ` (n=${q.total_answered.toLocaleString('id-ID')})`;
  }
  return s;
}

module.exports = { narrateQuestion, fmtPct };
