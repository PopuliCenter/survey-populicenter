/**
 * Unit tests untuk generator laporan PPTX:
 *   - reportNarrative.narrateQuestion (fungsi murni) — diuji di sini.
 *
 * Catatan: buildReportPptx TIDAK diuji di Jest karena pptxgenjs.write()
 * memakai dynamic import() yang tidak didukung VM Jest ("A dynamic import
 * callback was invoked without --experimental-vm-modules"). Generator sudah
 * divalidasi di runtime Node nyata (menghasilkan deck PPTX valid: 8 slide,
 * 3 grafik native, header ZIP "PK"). Lihat buildReportPptx.js.
 */

const { narrateQuestion } = require('../../src/utils/reportNarrative');

describe('narrateQuestion', () => {
  test('single_choice → sebut persentase & label tertinggi', () => {
    const s = narrateQuestion({
      type: 'single_choice', total_answered: 100,
      distribution: [{ label: 'Setuju', count: 60, pct: 60 }, { label: 'Tidak', count: 40, pct: 40 }],
    });
    expect(s).toMatch(/60 persen/);
    expect(s).toMatch(/Setuju/);
  });

  test('skala dengan rata-rata disebut', () => {
    const s = narrateQuestion({ type: 'rating_scale', total_answered: 50, average: 3.8, distribution: [{ label: '4', count: 30, pct: 60 }] });
    expect(s).toMatch(/Rata-rata/);
    expect(s).toMatch(/3,8/); // format koma Indonesia
  });

  test('tanpa data → kalimat default', () => {
    const s = narrateQuestion({ type: 'single_choice', total_answered: 0, distribution: [] });
    expect(s).toMatch(/Belum ada data/i);
  });

  test('matriks → ringkasan per baris', () => {
    const s = narrateQuestion({
      type: 'matrix',
      rows: [{ row: 'Kesehatan', distribution: [{ label: 'Puas', count: 5, pct: 50 }] }],
    });
    expect(s).toMatch(/Kesehatan/);
    expect(s).toMatch(/Puas/);
  });
});
