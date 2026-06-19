import React, { useState } from 'react';

// Tipe pertanyaan yang bisa dijadikan kondisi skip logic
const SKIP_LOGIC_SUPPORTED_TYPES = [
  'single_choice',
  'multiple_choice',
  'short_text',
  'numeric_scale',
];

// Operator yang tersedia dengan label ramah pengguna
const OPERATORS = [
  { value: 'equals', label: 'sama dengan' },
  { value: 'not_equals', label: 'tidak sama dengan' },
  { value: 'contains', label: 'mengandung kata' },
  { value: 'greater_than', label: 'lebih besar dari' },
  { value: 'less_than', label: 'lebih kecil dari' },
];

/**
 * Komponen satu baris kondisi dalam sebuah aturan.
 */
function ConditionRow({ condition, questionIndex, condIndex, questions, onUpdate, onRemove, canRemove }) {
  const sourceQuestion = questions.find((q) => q.id === condition.question_id);
  const isChoiceType = sourceQuestion && ['single_choice', 'multiple_choice'].includes(sourceQuestion.type);
  const choiceOptions = isChoiceType && Array.isArray(sourceQuestion.options) ? sourceQuestion.options : [];

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg p-2">
      {condIndex > 0 && (
        <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-0.5">
          DAN
        </span>
      )}

      {/* Pertanyaan sumber */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-gray-400">Pertanyaan</span>
        <select
          value={condition.question_id}
          onChange={(e) => onUpdate(questionIndex, condIndex, 'question_id', e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white max-w-[180px]"
          aria-label="Pilih pertanyaan sumber"
        >
          <option value="">— pilih —</option>
          {questions.filter((q) => SKIP_LOGIC_SUPPORTED_TYPES.includes(q.type)).map((q) => (
            <option key={q.id} value={q.id}>
              P{q.order_index + 1}: {q.text.length > 40 ? q.text.slice(0, 40) + '…' : q.text}
            </option>
          ))}
        </select>
      </div>

      {/* Operator */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-400">Kondisi</span>
        <select
          value={condition.operator}
          onChange={(e) => onUpdate(questionIndex, condIndex, 'operator', e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
          aria-label="Pilih operator"
        >
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      </div>

      {/* Nilai — dropdown jika pilihan ganda, input teks jika lainnya */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-400">Nilai</span>
        {isChoiceType && choiceOptions.length > 0 ? (
          <select
            value={condition.value}
            onChange={(e) => onUpdate(questionIndex, condIndex, 'value', e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white max-w-[160px]"
            aria-label="Pilih nilai kondisi"
          >
            <option value="">— pilih jawaban —</option>
            {choiceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={condition.value}
            onChange={(e) => onUpdate(questionIndex, condIndex, 'value', e.target.value)}
            placeholder="ketik nilai..."
            className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 w-28"
            aria-label="Masukkan nilai kondisi"
          />
        )}
      </div>

      {/* Tombol hapus kondisi */}
      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(questionIndex, condIndex)}
          className="self-end p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          aria-label="Hapus kondisi ini"
          title="Hapus kondisi"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * SkipLogicEditor — Editor aturan skip logic yang ramah pengguna awam.
 *
 * Setiap aturan terdiri dari:
 * - Satu atau lebih kondisi (semua harus terpenuhi = AND)
 * - Satu aksi: lompat ke pertanyaan tertentu
 *
 * Mendukung skip logic bercabang: beberapa aturan dengan kondisi berbeda
 * bisa mengarahkan ke pertanyaan yang berbeda-beda.
 *
 * @param {{
 *   questions: Array,
 *   skipLogic: Array,
 *   onChange: (newSkipLogic: Array) => void,
 * }} props
 */
function SkipLogicEditor({ questions = [], skipLogic = [], onChange }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const eligibleQuestions = questions.filter((q) =>
    SKIP_LOGIC_SUPPORTED_TYPES.includes(q.type)
  );

  if (eligibleQuestions.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Tidak ada pertanyaan yang mendukung skip logic. Tambahkan pertanyaan bertipe
        Pilihan Tunggal, Pilihan Ganda, Teks Pendek, atau Skala Numerik terlebih dahulu.
      </p>
    );
  }

  // ── Tambah aturan baru ──────────────────────────────────────────────────────
  function addRule() {
    const firstEligible = eligibleQuestions[0];
    const newRule = {
      // conditions: array untuk mendukung multi-kondisi (AND)
      conditions: [
        {
          question_id: firstEligible?.id || '',
          operator: 'equals',
          value: '',
        },
      ],
      // Backward compat: juga simpan condition tunggal
      condition: {
        question_id: firstEligible?.id || '',
        operator: 'equals',
        value: '',
      },
      action: 'jump_to',
      target_question_id: '',
    };
    const updated = [...skipLogic, newRule];
    onChange(updated);
    setExpandedIndex(updated.length - 1);
  }

  // ── Hapus aturan ────────────────────────────────────────────────────────────
  function removeRule(index) {
    onChange(skipLogic.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  }

  // ── Tambah kondisi ke aturan ────────────────────────────────────────────────
  function addCondition(ruleIndex) {
    const firstEligible = eligibleQuestions[0];
    const updated = skipLogic.map((rule, i) => {
      if (i !== ruleIndex) return rule;
      const conditions = rule.conditions || [rule.condition];
      return {
        ...rule,
        conditions: [
          ...conditions,
          { question_id: firstEligible?.id || '', operator: 'equals', value: '' },
        ],
      };
    });
    onChange(updated);
  }

  // ── Hapus kondisi dari aturan ───────────────────────────────────────────────
  function removeCondition(ruleIndex, condIndex) {
    const updated = skipLogic.map((rule, i) => {
      if (i !== ruleIndex) return rule;
      const conditions = (rule.conditions || [rule.condition]).filter((_, ci) => ci !== condIndex);
      return { ...rule, conditions, condition: conditions[0] || rule.condition };
    });
    onChange(updated);
  }

  // ── Update field kondisi ────────────────────────────────────────────────────
  function updateCondition(ruleIndex, condIndex, field, value) {
    const updated = skipLogic.map((rule, i) => {
      if (i !== ruleIndex) return rule;
      const conditions = (rule.conditions || [rule.condition]).map((cond, ci) => {
        if (ci !== condIndex) return cond;
        return { ...cond, [field]: value };
      });
      return { ...rule, conditions, condition: conditions[0] };
    });
    onChange(updated);
  }

  // ── Update target pertanyaan ────────────────────────────────────────────────
  function updateTarget(ruleIndex, targetId) {
    const updated = skipLogic.map((rule, i) => {
      if (i !== ruleIndex) return rule;
      return { ...rule, target_question_id: targetId };
    });
    onChange(updated);
  }

  // ── Label ringkas untuk aturan ──────────────────────────────────────────────
  function getRuleSummary(rule) {
    const conditions = rule.conditions || (rule.condition ? [rule.condition] : []);
    const target = questions.find((q) => q.id === rule.target_question_id);
    const targetLabel = target
      ? `P${target.order_index + 1}: ${target.text.slice(0, 30)}${target.text.length > 30 ? '…' : ''}`
      : '(belum dipilih)';

    if (conditions.length === 0) return `→ Lompat ke ${targetLabel}`;

    const condSummaries = conditions.map((cond) => {
      const srcQ = questions.find((q) => q.id === cond.question_id);
      const srcLabel = srcQ ? `P${srcQ.order_index + 1}` : '?';
      const op = OPERATORS.find((o) => o.value === cond.operator);
      return `${srcLabel} ${op?.label || cond.operator} "${cond.value}"`;
    });

    return `Jika ${condSummaries.join(' DAN ')} → ${targetLabel}`;
  }

  return (
    <div className="space-y-3">
      {/* Penjelasan singkat */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg px-3 py-2 text-xs text-primary-700">
        <strong>Skip Logic</strong> memungkinkan surveyor melompati pertanyaan tertentu berdasarkan jawaban sebelumnya.
        Contoh: Jika jawaban pertanyaan 1 adalah "Ya", langsung lompat ke pertanyaan 5.
      </div>

      {skipLogic.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          Belum ada aturan. Klik "Tambah Aturan Lompat" untuk menambahkan.
        </p>
      )}

      {/* Daftar aturan */}
      {skipLogic.map((rule, ruleIndex) => {
        const isExpanded = expandedIndex === ruleIndex;
        const conditions = rule.conditions || (rule.condition ? [rule.condition] : []);
        const targetQuestion = questions.find((q) => q.id === rule.target_question_id);

        return (
          <div
            key={ruleIndex}
            className="border border-gray-200 rounded-lg overflow-hidden"
            aria-label={`Aturan skip logic ${ruleIndex + 1}`}
          >
            {/* Header aturan — klik untuk expand/collapse */}
            <div
              className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => setExpandedIndex(isExpanded ? null : ruleIndex)}
              role="button"
              aria-expanded={isExpanded}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setExpandedIndex(isExpanded ? null : ruleIndex)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-500 shrink-0">
                  Aturan {ruleIndex + 1}
                </span>
                <span className="text-xs text-gray-600 truncate">
                  {getRuleSummary(rule)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeRule(ruleIndex); }}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 hover:bg-red-50 rounded transition-colors"
                  aria-label={`Hapus aturan ${ruleIndex + 1}`}
                >
                  Hapus
                </button>
                <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Body aturan */}
            {isExpanded && (
              <div className="p-3 space-y-3 bg-white">
                {/* Kondisi-kondisi */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">
                    Kondisi <span className="text-gray-400 font-normal">(semua kondisi harus terpenuhi)</span>
                  </p>
                  {conditions.map((cond, condIndex) => (
                    <ConditionRow
                      key={condIndex}
                      condition={cond}
                      questionIndex={ruleIndex}
                      condIndex={condIndex}
                      questions={questions}
                      onUpdate={updateCondition}
                      onRemove={removeCondition}
                      canRemove={conditions.length > 1}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => addCondition(ruleIndex)}
                    className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1 px-2 py-1 hover:bg-primary-50 rounded transition-colors"
                  >
                    <span aria-hidden="true">+</span> Tambah kondisi DAN
                  </button>
                </div>

                {/* Target lompatan */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-600">Maka lompat ke pertanyaan</p>
                  <select
                    value={rule.target_question_id}
                    onChange={(e) => updateTarget(ruleIndex, e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white w-full max-w-xs"
                    aria-label="Pilih pertanyaan tujuan lompatan"
                  >
                    <option value="">— pilih pertanyaan tujuan —</option>
                    {questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        P{q.order_index + 1}: {q.text.length > 50 ? q.text.slice(0, 50) + '…' : q.text}
                      </option>
                    ))}
                  </select>
                  {targetQuestion && (
                    <p className="text-xs text-green-600">
                      ✓ Pertanyaan antara akan dilewati, langsung ke P{targetQuestion.order_index + 1}
                    </p>
                  )}
                  {!rule.target_question_id && conditions.some((c) => c.question_id && c.value) && (
                    <p className="text-xs text-amber-600">
                      ⚠ Tujuan lompatan belum dipilih — aturan ini belum berfungsi.
                    </p>
                  )}
                </div>

                {/* Preview aturan */}
                {conditions.some((c) => c.question_id && c.value) && rule.target_question_id && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-700">
                    <strong>Preview:</strong> {getRuleSummary(rule)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Tombol tambah aturan */}
      <button
        type="button"
        onClick={addRule}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300"
      >
        <span aria-hidden="true">+</span> Tambah Aturan Lompat
      </button>

      {/* Panduan singkat */}
      {skipLogic.length > 0 && (
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer hover:text-gray-600">Panduan skip logic bercabang</summary>
          <div className="mt-2 space-y-1 pl-3 border-l-2 border-gray-200">
            <p>• Tambahkan beberapa aturan untuk membuat percabangan (misal: A→Q5, B→Q10, C→Q15)</p>
            <p>• Setiap aturan bisa punya beberapa kondisi (semua harus terpenuhi = AND)</p>
            <p>• Pertanyaan di antara sumber dan tujuan akan otomatis dilewati</p>
            <p>• Aturan dievaluasi dari atas ke bawah, aturan pertama yang cocok yang dipakai</p>
          </div>
        </details>
      )}
    </div>
  );
}

export default SkipLogicEditor;
