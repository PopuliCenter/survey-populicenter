/**
 * Property-Based Tests for Skip Logic Cycle Detection
 *
 * Property 3: Skip Logic Bebas Siklus
 * Validates: Requirements 4.6
 */

const fc = require('fast-check');
const { validateSkipLogicNoCycles } = require('../../src/utils/skipLogicValidator');

/**
 * Independent DFS cycle detection to verify the validator's result.
 * Used as a reference implementation for cross-checking.
 * @param {Array} questions
 * @returns {boolean} true if a cycle exists
 */
function hasCycleIndependent(questions) {
  const graph = {};
  for (const q of questions) {
    graph[q.id] = [];
    if (q.skip_logic && Array.isArray(q.skip_logic)) {
      for (const rule of q.skip_logic) {
        if (rule.target_question_id) {
          graph[q.id].push(rule.target_question_id);
        }
      }
    }
  }

  const WHITE = 0; // unvisited
  const GRAY = 1;  // in recursion stack
  const BLACK = 2; // fully processed

  const color = {};
  for (const id of Object.keys(graph)) {
    color[id] = WHITE;
  }

  function dfs(nodeId) {
    color[nodeId] = GRAY;
    for (const neighbor of (graph[nodeId] || [])) {
      if (color[neighbor] === GRAY) return true; // back edge = cycle
      if (color[neighbor] === WHITE) {
        if (dfs(neighbor)) return true;
      }
    }
    color[nodeId] = BLACK;
    return false;
  }

  for (const nodeId of Object.keys(graph)) {
    if (color[nodeId] === WHITE) {
      if (dfs(nodeId)) return true;
    }
  }
  return false;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

// Generate a random question configuration
const questionArb = fc.record({
  id: fc.uuid(),
  skip_logic: fc.array(
    fc.record({
      condition: fc.record({
        question_id: fc.uuid(),
        operator: fc.constantFrom('equals', 'not_equals', 'contains', 'greater_than', 'less_than'),
        value: fc.string(),
      }),
      action: fc.constant('jump_to'),
      target_question_id: fc.uuid(),
    }),
    { maxLength: 3 }
  ),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 3: Skip Logic Bebas Siklus', () => {
  /**
   * Validates: Requirements 4.6
   *
   * For any skip logic configuration that passes validation (valid=true),
   * no cycle should exist in the question graph.
   * Verified by running an independent DFS implementation.
   */

  test('jika validateSkipLogicNoCycles mengembalikan valid=true, maka tidak ada siklus dalam graf', () => {
    fc.assert(
      fc.property(
        fc.array(questionArb, { minLength: 1, maxLength: 10 }),
        (questions) => {
          const result = validateSkipLogicNoCycles(questions);

          if (result.valid === true) {
            // If validator says valid, independent check must also find no cycle
            const cycleExists = hasCycleIndependent(questions);
            return !cycleExists;
          }

          // If validator says invalid, we don't need to verify further
          // (the validator may be conservative)
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });

  test('jika ada siklus dalam graf, validateSkipLogicNoCycles harus mengembalikan valid=false', () => {
    fc.assert(
      fc.property(
        fc.array(questionArb, { minLength: 1, maxLength: 10 }),
        (questions) => {
          const cycleExists = hasCycleIndependent(questions);
          const result = validateSkipLogicNoCycles(questions);

          if (cycleExists) {
            // If independent check finds a cycle, validator must also detect it
            return result.valid === false;
          }

          // No cycle found by independent check — validator may return either
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });

  test('konfigurasi tanpa skip_logic selalu valid (tidak ada siklus)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.uuid(), skip_logic: fc.constant([]) }),
          { minLength: 1, maxLength: 10 }
        ),
        (questions) => {
          const result = validateSkipLogicNoCycles(questions);
          return result.valid === true;
        }
      ),
      { numRuns: 25 }
    );
  });

  test('siklus langsung (A → B → A) selalu terdeteksi', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
        ([idA, idB]) => {
          const questions = [
            {
              id: idA,
              skip_logic: [
                {
                  condition: { question_id: idA, operator: 'equals', value: 'yes' },
                  action: 'jump_to',
                  target_question_id: idB,
                },
              ],
            },
            {
              id: idB,
              skip_logic: [
                {
                  condition: { question_id: idB, operator: 'equals', value: 'yes' },
                  action: 'jump_to',
                  target_question_id: idA,
                },
              ],
            },
          ];

          const result = validateSkipLogicNoCycles(questions);
          return result.valid === false && typeof result.error === 'string';
        }
      ),
      { numRuns: 25 }
    );
  });

  test('skip logic linear (A → B → C) selalu valid', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.uuid(), fc.uuid(), fc.uuid()).filter(
          ([a, b, c]) => a !== b && b !== c && a !== c
        ),
        ([idA, idB, idC]) => {
          const questions = [
            {
              id: idA,
              skip_logic: [
                {
                  condition: { question_id: idA, operator: 'equals', value: 'yes' },
                  action: 'jump_to',
                  target_question_id: idB,
                },
              ],
            },
            {
              id: idB,
              skip_logic: [
                {
                  condition: { question_id: idB, operator: 'equals', value: 'yes' },
                  action: 'jump_to',
                  target_question_id: idC,
                },
              ],
            },
            {
              id: idC,
              skip_logic: [],
            },
          ];

          const result = validateSkipLogicNoCycles(questions);
          return result.valid === true;
        }
      ),
      { numRuns: 25 }
    );
  });

  test('pesan error harus berupa string ketika siklus terdeteksi', () => {
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          { condition: { question_id: 'q1', operator: 'equals', value: 'yes' }, action: 'jump_to', target_question_id: 'q2' },
        ],
      },
      {
        id: 'q2',
        skip_logic: [
          { condition: { question_id: 'q2', operator: 'equals', value: 'yes' }, action: 'jump_to', target_question_id: 'q1' },
        ],
      },
    ];

    const result = validateSkipLogicNoCycles(questions);
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });
});
