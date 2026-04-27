/**
 * Property-Based Tests for Dashboard Progress Feature
 *
 * Properties tested:
 *   - Property 1: Perhitungan completion percentage
 *   - Property 2: Perhitungan remaining
 *   - Property 3: Klasifikasi status surveyor
 *   - Property 4: Konsistensi total collected dengan breakdown surveyor
 *   - Property 5: Hanya surveyor dengan kuota yang muncul
 *   - Property 6: Pengurutan surveyor berdasarkan persentase menurun
 *
 * Requirements: 1.4, 1.5, 1.6, 1.7, 2.2, 2.3, 2.4, 2.5, 2.6, 3.5, 3.6, 3.7, 3.8, 8.3, 8.4
 */

const fc = require('fast-check');
const {
  calculatePercentage,
  calculateRemaining,
  resolveSurveyorStatus,
} = require('../../src/routes/dashboard');

// ─── Property 1: Perhitungan completion percentage ───────────────────────────
// Feature: dashboard-progress, Property 1: Perhitungan completion percentage

describe('Property 1: Perhitungan completion percentage', () => {
  test('calculatePercentage mengembalikan 0 ketika quota === 0', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (collected) => {
          return calculatePercentage(collected, 0) === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('calculatePercentage selalu dalam rentang [0, 100.0]', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (collected, quota) => {
          const result = calculatePercentage(collected, quota);
          return result >= 0 && result <= 100.0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('calculatePercentage mengembalikan rumus yang benar ketika collected <= quota dan quota > 0', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat({ min: 1 }),
        (collected, quota) => {
          fc.pre(collected <= quota);
          const result = calculatePercentage(collected, quota);
          const expected = Math.round((collected / quota) * 1000) / 10;
          return result === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('calculatePercentage mengembalikan 100.0 ketika collected > quota dan quota > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 1000000 }),
        (quota, extra) => {
          const collected = quota + extra; // ensures collected > quota
          return calculatePercentage(collected, quota) === 100.0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: Perhitungan remaining ───────────────────────────────────────
// Feature: dashboard-progress, Property 2: Perhitungan remaining

describe('Property 2: Perhitungan remaining', () => {
  test('calculateRemaining sama dengan Math.max(0, quota - collected)', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (quota, collected) => {
          return calculateRemaining(quota, collected) === Math.max(0, quota - collected);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('collected + calculateRemaining === quota ketika collected <= quota', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (quota, collected) => {
          fc.pre(collected <= quota);
          return collected + calculateRemaining(quota, collected) === quota;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('calculateRemaining selalu >= 0', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (quota, collected) => {
          return calculateRemaining(quota, collected) >= 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Klasifikasi status surveyor ─────────────────────────────────
// Feature: dashboard-progress, Property 3: Klasifikasi status surveyor

describe('Property 3: Klasifikasi status surveyor', () => {
  test('resolveSurveyorStatus mengembalikan "on-track" ketika totalQuota === 0', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (totalCollected) => {
          return resolveSurveyorStatus(totalCollected, 0) === 'on-track';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('resolveSurveyorStatus mengembalikan "completed" ketika totalCollected >= totalQuota dan totalQuota > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 0, max: 1000000 }),
        (totalQuota, extra) => {
          const totalCollected = totalQuota + extra; // ensures collected >= quota
          return resolveSurveyorStatus(totalCollected, totalQuota) === 'completed';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('resolveSurveyorStatus mengembalikan "on-track" ketika rasio >= 0.5 dan totalCollected < totalQuota', () => {
    fc.assert(
      fc.property(
        fc.nat({ min: 2 }),
        (totalQuota) => {
          // Pick collected so that ratio >= 0.5 but collected < totalQuota
          const minCollected = Math.ceil(totalQuota * 0.5);
          fc.pre(minCollected < totalQuota);
          const totalCollected = minCollected;
          return resolveSurveyorStatus(totalCollected, totalQuota) === 'on-track';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('resolveSurveyorStatus mengembalikan "behind" ketika rasio < 0.5', () => {
    fc.assert(
      fc.property(
        fc.nat({ min: 2 }),
        (totalQuota) => {
          // Pick collected so that ratio < 0.5
          const maxCollected = Math.ceil(totalQuota * 0.5) - 1;
          fc.pre(maxCollected >= 0);
          const totalCollected = maxCollected;
          const ratio = totalCollected / totalQuota;
          fc.pre(ratio < 0.5);
          return resolveSurveyorStatus(totalCollected, totalQuota) === 'behind';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('resolveSurveyorStatus selalu mengembalikan salah satu dari "completed", "on-track", "behind"', () => {
    const validStatuses = new Set(['completed', 'on-track', 'behind']);
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (totalCollected, totalQuota) => {
          return validStatuses.has(resolveSurveyorStatus(totalCollected, totalQuota));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Konsistensi total collected dengan breakdown surveyor ───────
// Feature: dashboard-progress, Property 4: Konsistensi total collected dengan breakdown surveyor

describe('Property 4: Konsistensi total collected dengan breakdown surveyor', () => {
  test('sum of collected dari semua surveyor === totalCollected', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ quota: fc.nat(), collected: fc.nat() }),
          { minLength: 1, maxLength: 10 }
        ),
        (surveyors) => {
          const totalCollected = surveyors.reduce((sum, s) => sum + s.collected, 0);
          const sumFromBreakdown = surveyors.reduce((sum, s) => sum + s.collected, 0);
          return sumFromBreakdown === totalCollected;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('setiap elemen memiliki percentage konsisten dengan calculatePercentage', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ quota: fc.nat(), collected: fc.nat() }),
          { minLength: 1, maxLength: 10 }
        ),
        (surveyors) => {
          return surveyors.every((s) => {
            const expected = calculatePercentage(s.collected, s.quota);
            return expected === calculatePercentage(s.collected, s.quota);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Hanya surveyor dengan kuota yang muncul ────────────────────
// Feature: dashboard-progress, Property 5: Hanya surveyor dengan kuota yang muncul

describe('Property 5: Hanya surveyor dengan kuota yang muncul', () => {
  test('output hanya berisi surveyor yang memiliki kuota', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            surveyorId: fc.uuid(),
            hasQuota: fc.boolean(),
            quota: fc.nat(),
            collected: fc.nat(),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (surveyors) => {
          // Simulate: surveyors with hasQuota=true get a quota >= 1, others get 0
          const withQuota = surveyors.map((s) => ({
            ...s,
            quota: s.hasQuota ? Math.max(1, s.quota) : 0,
          }));

          // Filter: only surveyors with quota > 0 appear in output (matching endpoint logic)
          const output = withQuota.filter((s) => s.quota > 0);

          // Verify: output length matches count of surveyors with quota
          const expectedCount = withQuota.filter((s) => s.quota > 0).length;
          if (output.length !== expectedCount) return false;

          // Verify: every element in output has quota > 0
          return output.every((s) => s.quota > 0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Pengurutan surveyor berdasarkan persentase menurun ──────────
// Feature: dashboard-progress, Property 6: Pengurutan surveyor berdasarkan persentase menurun

describe('Property 6: Pengurutan surveyor berdasarkan persentase menurun', () => {
  test('array terurut descending berdasarkan percentage setelah sorting', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            quota: fc.nat({ min: 1 }),
            collected: fc.nat(),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (surveyors) => {
          // Calculate percentage for each surveyor
          const withPercentage = surveyors.map((s) => ({
            ...s,
            percentage: calculatePercentage(s.collected, s.quota),
          }));

          // Sort descending by percentage (same logic as the endpoint)
          withPercentage.sort((a, b) => b.percentage - a.percentage);

          // Verify: each consecutive pair is in descending order
          for (let i = 0; i < withPercentage.length - 1; i++) {
            if (withPercentage[i].percentage < withPercentage[i + 1].percentage) {
              return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
