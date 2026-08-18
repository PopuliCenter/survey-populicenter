/**
 * reportFeedCsv.js
 * ================
 * Ubah snapshot AGREGAT (buildSnapshot) dan MONITORING (buildMonitoringSnapshot)
 * menjadi tabel CSV rapi (header + baris) yang enak ditarik ke spreadsheet.
 *
 * Header UPPERCASE mengikuti konvensi ekspor yang dipakai klien (SPSS).
 * Nilai berupa string/number; escaping CSV ditangani oleh csv-stringify di rute.
 */

/**
 * Rekap jawaban agregat → baris per (pertanyaan × [baris matrix] × opsi).
 * @param {object} snapshot hasil buildSnapshot()
 * @returns {{ headers: string[], rows: Array<Array<string|number>> }}
 */
function aggregateToCsv(snapshot) {
  const headers = ['NO', 'PERTANYAAN', 'TIPE', 'BARIS', 'OPSI', 'JUMLAH', 'PERSEN'];
  const rows = [];
  const questions = Array.isArray(snapshot?.questions) ? snapshot.questions : [];

  let no = 0;
  for (const q of questions) {
    no += 1;
    if (Array.isArray(q.rows)) {
      // Matriks: satu distribusi per baris.
      for (const r of q.rows) {
        const dist = Array.isArray(r.distribution) ? r.distribution : [];
        if (dist.length === 0) {
          rows.push([no, q.text, q.type, r.row, '', 0, 0]);
          continue;
        }
        for (const d of dist) {
          rows.push([no, q.text, q.type, r.row, d.label, d.count, d.pct]);
        }
      }
    } else {
      const dist = Array.isArray(q.distribution) ? q.distribution : [];
      if (dist.length === 0) {
        rows.push([no, q.text, q.type, '', '', 0, 0]);
        continue;
      }
      for (const d of dist) {
        rows.push([no, q.text, q.type, '', d.label, d.count, d.pct]);
      }
    }
  }
  return { headers, rows };
}

/**
 * Monitoring capaian vs target → baris TOTAL lalu per provinsi.
 * @param {object} snapshot hasil buildMonitoringSnapshot()
 * @returns {{ headers: string[], rows: Array<Array<string|number>> }}
 */
function monitoringToCsv(snapshot) {
  const headers = ['PROVINSI', 'TARGET', 'CAPAIAN', 'PERSEN'];
  const rows = [];
  const total = snapshot?.total || {};
  rows.push(['TOTAL', total.target || 0, total.achieved || 0, total.pct == null ? '' : total.pct]);
  const regions = Array.isArray(snapshot?.regions) ? snapshot.regions : [];
  for (const r of regions) {
    rows.push([r.province, r.target || 0, r.actual || 0, r.pct == null ? '' : r.pct]);
  }
  return { headers, rows };
}

module.exports = { aggregateToCsv, monitoringToCsv };
