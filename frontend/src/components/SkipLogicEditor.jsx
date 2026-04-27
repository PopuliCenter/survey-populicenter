import React from 'react';

// Question types that support skip logic
const SKIP_LOGIC_SUPPORTED_TYPES = [
  'single_choice',
  'multiple_choice',
  'short_text',
  'numeric_scale',
];

// Operator options
const OPERATORS = [
  { value: 'equals', label: 'sama dengan' },
  { value: 'not_equals', label: 'tidak sama dengan' },
  { value: 'contains', label: 'mengandung' },
  { value: 'greater_than', label: 'lebih dari' },
  { value: 'less_than', label: 'kurang dari' },
];

/**
 * Visual skip logic configuration component.
 *
 * @param {{
 *   questions: Array<{ id: string, text: string, order_index: number, type: string }>,
 *   skipLogic: Array<{
 *     condition: { question_id: string, operator: string, value: string },
 *     action: string,
 *     target_question_id: string
 *   }>,
 *   onChange: (newSkipLogic: Array) => void,
 * }} props
 */
function SkipLogicEditor({ questions = [], skipLogic = [], onChange }) {
  // Only questions that support skip logic can be used as condition sources
  const eligibleQuestions = questions.filter((q) =>
    SKIP_LOGIC_SUPPORTED_TYPES.includes(q.type)
  );

  // ── Add a new empty rule ──────────────────────────────────────────────────
  function addRule() {
    const firstEligible = eligibleQuestions[0];
    const newRule = {
      condition: {
        question_id: firstEligible?.id || '',
        operator: 'equals',
        value: '',
      },
      action: 'jump_to',
      target_question_id: '',
    };
    onChange([...skipLogic, newRule]);
  }

  // ── Remove a rule by index ────────────────────────────────────────────────
  function removeRule(index) {
    const updated = skipLogic.filter((_, i) => i !== index);
    onChange(updated);
  }

  // ── Update a rule field ───────────────────────────────────────────────────
  function updateRule(index, path, value) {
    const updated = skipLogic.map((rule, i) => {
      if (i !== index) return rule;
      if (path === 'condition.question_id') {
        return {
          ...rule,
          condition: { ...rule.condition, question_id: value },
        };
      }
      if (path === 'condition.operator') {
        return {
          ...rule,
          condition: { ...rule.condition, operator: value },
        };
      }
      if (path === 'condition.value') {
        return {
          ...rule,
          condition: { ...rule.condition, value },
        };
      }
      if (path === 'target_question_id') {
        return { ...rule, target_question_id: value };
      }
      return rule;
    });
    onChange(updated);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function questionLabel(q) {
    return `Q${q.order_index + 1}: ${q.text.length > 50 ? q.text.slice(0, 50) + '…' : q.text}`;
  }

  if (eligibleQuestions.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Tidak ada pertanyaan yang mendukung skip logic (single choice, multiple
        choice, teks pendek, atau skala numerik).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {skipLogic.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          Belum ada aturan skip logic. Klik "Tambah Aturan" untuk menambahkan.
        </p>
      )}

      {skipLogic.map((rule, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2"
          aria-label={`Aturan skip logic ${index + 1}`}
        >
          {/* Condition row */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500 font-medium whitespace-nowrap">
              Jika pertanyaan
            </span>

            {/* Source question dropdown */}
            <select
              value={rule.condition.question_id}
              onChange={(e) =>
                updateRule(index, 'condition.question_id', e.target.value)
              }
              className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white max-w-[200px]"
              aria-label={`Pertanyaan sumber aturan ${index + 1}`}
            >
              <option value="">— pilih pertanyaan —</option>
              {eligibleQuestions.map((q) => (
                <option key={q.id} value={q.id}>
                  {questionLabel(q)}
                </option>
              ))}
            </select>

            {/* Operator dropdown */}
            <select
              value={rule.condition.operator}
              onChange={(e) =>
                updateRule(index, 'condition.operator', e.target.value)
              }
              className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              aria-label={`Operator aturan ${index + 1}`}
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value input */}
            <input
              type="text"
              value={rule.condition.value}
              onChange={(e) =>
                updateRule(index, 'condition.value', e.target.value)
              }
              placeholder="nilai"
              className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 w-28"
              aria-label={`Nilai kondisi aturan ${index + 1}`}
            />
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500 font-medium whitespace-nowrap">
              Maka lompat ke pertanyaan
            </span>

            {/* Target question dropdown */}
            <select
              value={rule.target_question_id}
              onChange={(e) =>
                updateRule(index, 'target_question_id', e.target.value)
              }
              className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white max-w-[200px]"
              aria-label={`Pertanyaan target aturan ${index + 1}`}
            >
              <option value="">— pilih target —</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {questionLabel(q)}
                </option>
              ))}
            </select>

            {/* Delete rule button */}
            <button
              type="button"
              onClick={() => removeRule(index)}
              className="ml-auto px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
              aria-label={`Hapus aturan skip logic ${index + 1}`}
            >
              Hapus Aturan
            </button>
          </div>
        </div>
      ))}

      {/* Add rule button */}
      <button
        type="button"
        onClick={addRule}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        <span aria-hidden="true">+</span> Tambah Aturan
      </button>
    </div>
  );
}

export default SkipLogicEditor;
