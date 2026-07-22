/**
 * Unit Tests — utils/randomizeOrderValidator.js
 *
 * Aturan yang dijaga (alasan metodologis di header modulnya):
 *   - blok acak TIDAK boleh berisi: pertanyaan identitas (unique_id/region),
 *     pertanyaan ber-auto_fill, pertanyaan yang punya skip logic
 *   - blok acak TIDAK boleh jadi target lompatan
 *   - blok acak TIDAK boleh berada DI ANTARA sumber dan tujuan lompatan
 *   - lompatan MELEWATI blok utuh tetap sah (blok di luar interval? tidak —
 *     justru: interval memuat blok → tak sah; blok setelah target → sah)
 */

const { validateRandomizeOrderState } = require('../../src/utils/randomizeOrderValidator');

function q(id, order, over = {}) {
  return {
    id, order_index: order, type: 'single_choice',
    randomize_order: false, skip_logic: null, auto_fill: null,
    ...over,
  };
}
const jump = (targetId) => ([{ condition: {}, action: 'jump_to', target_question_id: targetId }]);

describe('validateRandomizeOrderState — kasus sah', () => {
  test('tanpa flag sama sekali → valid', () => {
    expect(validateRandomizeOrderState([q('a', 0), q('b', 1, { skip_logic: jump('c') }), q('c', 2)]).valid).toBe(true);
  });

  test('blok acak murni tanpa skip logic di survei → valid', () => {
    const state = [q('a', 0), q('b', 1, { randomize_order: true }), q('c', 2, { randomize_order: true })];
    expect(validateRandomizeOrderState(state).valid).toBe(true);
  });

  test('lompatan SEBELUM blok (interval tak menyentuh blok) → valid', () => {
    // a --jump--> c ; blok acak d,e ada SETELAH target.
    const state = [
      q('a', 0, { skip_logic: jump('c') }), q('b', 1), q('c', 2),
      q('d', 3, { randomize_order: true }), q('e', 4, { randomize_order: true }),
    ];
    expect(validateRandomizeOrderState(state).valid).toBe(true);
  });
});

describe('validateRandomizeOrderState — penolakan', () => {
  test('pertanyaan identitas (unique_id / indonesia_region) ditolak', () => {
    for (const type of ['unique_id', 'indonesia_region']) {
      const r = validateRandomizeOrderState([q('a', 0, { type, randomize_order: true })]);
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/identitas/i);
    }
  });

  test('pertanyaan ber-isi-otomatis (gender paritas) ditolak', () => {
    const r = validateRandomizeOrderState([
      q('a', 0, { randomize_order: true, auto_fill: { source: 'questionnaire_number_parity' } }),
    ]);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/isi-otomatis/i);
  });

  test('pertanyaan yang PUNYA aturan lompatan ditolak', () => {
    const r = validateRandomizeOrderState([
      q('a', 0, { randomize_order: true, skip_logic: jump('b') }), q('b', 1),
    ]);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/lompatan/i);
  });

  test('pertanyaan TARGET lompatan ditolak', () => {
    const r = validateRandomizeOrderState([
      q('a', 0, { skip_logic: jump('b') }),
      q('b', 1, { randomize_order: true }),
    ]);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/tujuan lompatan/i);
  });

  test('blok DI ANTARA sumber dan tujuan lompatan ditolak', () => {
    // a --jump--> d ; b (diacak) berada di antara → makna "dilewati" jadi
    // berbeda-beda per responden bila b berpindah posisi.
    const r = validateRandomizeOrderState([
      q('a', 0, { skip_logic: jump('d') }),
      q('b', 1, { randomize_order: true }),
      q('c', 2),
      q('d', 3),
    ]);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/di antara/i);
  });

  test('interval lompatan MUNDUR (target sebelum sumber) juga dihormati', () => {
    const r = validateRandomizeOrderState([
      q('a', 0),
      q('b', 1, { randomize_order: true }),
      q('c', 2, { skip_logic: jump('a') }),
    ]);
    expect(r.valid).toBe(false);
  });
});
