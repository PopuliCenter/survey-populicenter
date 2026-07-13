/**
 * Unit tests untuk mesin agregasi hasil survei (aggregateResults).
 * Fokus: fungsi murni aggregateQuestion — distribusi, persen, rata-rata,
 * pelindungan privasi (bucket "Lainnya" untuk jawaban __other__).
 */

// Mock models agar require tidak menyentuh konfigurasi DB nyata.
jest.mock('../../src/models', () => ({
  Survey: {},
  Question: {},
  Response: {},
  Answer: {},
}));

const { aggregateQuestion } = require('../../src/utils/aggregateResults');

describe('aggregateQuestion', () => {
  test('single_choice — distribusi terurut + persen, pakai label opsi', () => {
    const q = {
      id: 'q1', text: 'Setuju?', type: 'single_choice', order_index: 0,
      options: [{ value: 'a', label: 'Setuju' }, { value: 'b', label: 'Tidak' }],
    };
    const answers = [
      { answer_value: 'a' }, { answer_value: 'a' }, { answer_value: 'b' },
    ];
    const result = aggregateQuestion(q, answers);

    expect(result.total_answered).toBe(3);
    expect(result.distribution[0]).toEqual({ value: 'a', label: 'Setuju', count: 2, pct: 66.7 });
    expect(result.distribution[1]).toEqual({ value: 'b', label: 'Tidak', count: 1, pct: 33.3 });
  });

  test('multiple_choice — hitung tiap nilai dalam array answer_json', () => {
    const q = {
      id: 'q2', text: 'Pilih', type: 'multiple_choice', order_index: 1,
      options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }],
    };
    const answers = [
      { answer_json: ['x', 'y'] }, { answer_json: ['x'] },
    ];
    const result = aggregateQuestion(q, answers);

    const byValue = Object.fromEntries(result.distribution.map((d) => [d.value, d.count]));
    expect(byValue).toEqual({ x: 2, y: 1 });
  });

  test('rating_scale — rata-rata dihitung dari nilai numerik', () => {
    const q = { id: 'q3', text: 'Skor', type: 'rating_scale', order_index: 2, options: null };
    const answers = [{ answer_value: '5' }, { answer_value: '4' }, { answer_value: '5' }];
    const result = aggregateQuestion(q, answers);

    expect(result.average).toBe(4.67);
    expect(result.total_answered).toBe(3);
  });

  test('jawaban __other__ dilebur jadi bucket "Lainnya" (privasi)', () => {
    const q = {
      id: 'q4', text: 'Alasan', type: 'single_choice', order_index: 3,
      options: [{ value: 'a', label: 'A' }],
    };
    const answers = [
      { answer_value: 'a' },
      { answer_value: '__other__:teks rahasia responden' },
      { answer_value: '__other__:hal pribadi lain' },
    ];
    const result = aggregateQuestion(q, answers);

    const other = result.distribution.find((d) => d.value === '__other__');
    expect(other).toBeDefined();
    expect(other.label).toBe('Lainnya');
    expect(other.count).toBe(2);
    // Pastikan tidak ada teks bebas yang bocor ke label/value.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('teks rahasia');
    expect(serialized).not.toContain('hal pribadi');
  });

  test('matrix — satu distribusi per baris', () => {
    const q = {
      id: 'q5', text: 'Matriks', type: 'matrix', order_index: 4,
      options: { rows: ['Baris1', 'Baris2'], columns: ['ya', 'tidak'] },
    };
    const answers = [
      { answer_json: { Baris1: 'ya', Baris2: 'tidak' } },
      { answer_json: { Baris1: 'ya', Baris2: 'ya' } },
    ];
    const result = aggregateQuestion(q, answers);

    expect(result.rows).toHaveLength(2);
    const b1 = result.rows.find((r) => r.row === 'Baris1');
    expect(b1.distribution.find((d) => d.value === 'ya').count).toBe(2);
  });

  test('rating/numeric scale — distribusi diurutkan NAIK menurut nilai, bukan frekuensi', () => {
    const q = { id: 'q7', text: 'Skala 1-10', type: 'numeric_scale', order_index: 6, options: null };
    // Nilai 1 paling sering (harusnya urutan tampil tetap 1,2,3,5,7 — menaik).
    const answers = [
      { answer_value: '1' }, { answer_value: '1' }, { answer_value: '1' },
      { answer_value: '5' }, { answer_value: '3' }, { answer_value: '7' }, { answer_value: '2' },
    ];
    const result = aggregateQuestion(q, answers);
    const order = result.distribution.map((d) => d.value);
    expect(order).toEqual(['1', '2', '3', '5', '7']);
  });

  test('matrix — distribusi tiap baris mengikuti urutan KOLOM, bukan frekuensi', () => {
    const q = {
      id: 'q8', text: 'Kepuasan', type: 'matrix', order_index: 7,
      options: { rows: ['Hukum'], columns: ['1', '2', '3', '4'] },
    };
    // "4" & "2" lebih sering dari "1", tapi urutan tampil harus 1,2,3,4 (urutan kolom).
    const answers = [
      { answer_json: { Hukum: '4' } },
      { answer_json: { Hukum: '4' } },
      { answer_json: { Hukum: '2' } },
      { answer_json: { Hukum: '2' } },
      { answer_json: { Hukum: '1' } },
      { answer_json: { Hukum: '3' } },
    ];
    const result = aggregateQuestion(q, answers);
    const row = result.rows.find((r) => r.row === 'Hukum');
    expect(row.distribution.map((d) => d.value)).toEqual(['1', '2', '3', '4']);
  });

  test('indonesia_region — distribusi per provinsi', () => {
    const q = { id: 'q6', text: 'Wilayah', type: 'indonesia_region', order_index: 5, options: { depth: 'village' } };
    const answers = [
      { answer_json: { province_name: 'Jawa Barat', regency_name: 'Bandung' } },
      { answer_json: { province_name: 'Jawa Barat', regency_name: 'Bogor' } },
      { answer_json: { province_name: 'Bali' } },
    ];
    const result = aggregateQuestion(q, answers);

    const byProv = Object.fromEntries(result.distribution.map((d) => [d.label, d.count]));
    expect(byProv).toEqual({ 'Jawa Barat': 2, Bali: 1 });
    // Tidak membocorkan tingkat kabupaten ke agregat publik.
    expect(JSON.stringify(result)).not.toContain('Bandung');
  });
});
