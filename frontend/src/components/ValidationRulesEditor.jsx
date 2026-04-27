import React, { useState } from 'react';
import { getValidationFieldsForType } from '../utils/answerValidation';

/**
 * Editor aturan validasi untuk satu pertanyaan.
 * Menampilkan field yang relevan berdasarkan tipe pertanyaan.
 *
 * @param {{
 *   questionType: string,
 *   validation: { min_value?, max_value?, min_length?, max_length?, pattern?, custom_error? } | null,
 *   onChange: (validation: object | null) => void,
 * }} props
 */
function ValidationRulesEditor({ questionType, validation, onChange }) {
  const [expanded, setExpanded] = useState(false);

  const fields = getValidationFieldsForType(questionType);

  // Don't render for types that don't support validation
  if (fields.length === 0) {
    return null;
  }

  const current = validation || {};

  function update(field, value) {
    const next = { ...current, [field]: value };

    // If all fields are empty/null, call onChange with null
    const allEmpty = fields.every((f) => {
      const v = next[f];
      return v === null || v === undefined || v === '';
    });

    onChange(allEmpty ? null : next);
  }

  function handleNumberChange(field, rawValue) {
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      update(field, null);
    } else {
      const parsed = Number(rawValue);
      update(field, isNaN(parsed) ? null : parsed);
    }
  }

  function handleIntegerChange(field, rawValue) {
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      update(field, null);
    } else {
      const parsed = parseInt(rawValue, 10);
      update(field, isNaN(parsed) ? null : parsed);
    }
  }

  const panelId = 'validation-rules-panel';

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded px-1 py-0.5"
      >
        <span
          aria-hidden="true"
          className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        Aturan Validasi
      </button>

      {expanded && (
        <div
          id={panelId}
          className="p-4 bg-teal-50 border border-teal-200 rounded-lg space-y-4"
        >
          {/* min_value / max_value fields */}
          {(fields.includes('min_value') || fields.includes('max_value')) && (
            <div className="flex items-end gap-4 flex-wrap">
              {fields.includes('min_value') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nilai Minimum
                  </label>
                  <input
                    type="number"
                    value={current.min_value ?? ''}
                    onChange={(e) => handleNumberChange('min_value', e.target.value)}
                    className="w-28 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    aria-label="Nilai minimum validasi"
                    placeholder="Min"
                  />
                </div>
              )}
              {fields.includes('max_value') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nilai Maksimum
                  </label>
                  <input
                    type="number"
                    value={current.max_value ?? ''}
                    onChange={(e) => handleNumberChange('max_value', e.target.value)}
                    className="w-28 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    aria-label="Nilai maksimum validasi"
                    placeholder="Max"
                  />
                </div>
              )}
            </div>
          )}

          {/* min_length / max_length fields */}
          {(fields.includes('min_length') || fields.includes('max_length')) && (
            <div className="flex items-end gap-4 flex-wrap">
              {fields.includes('min_length') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Panjang Minimum
                  </label>
                  <input
                    type="number"
                    value={current.min_length ?? ''}
                    onChange={(e) => handleIntegerChange('min_length', e.target.value)}
                    className="w-28 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    aria-label="Panjang minimum validasi"
                    placeholder="Min"
                    min={1}
                    step={1}
                  />
                </div>
              )}
              {fields.includes('max_length') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Panjang Maksimum
                  </label>
                  <input
                    type="number"
                    value={current.max_length ?? ''}
                    onChange={(e) => handleIntegerChange('max_length', e.target.value)}
                    className="w-28 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    aria-label="Panjang maksimum validasi"
                    placeholder="Max"
                    min={1}
                    step={1}
                  />
                </div>
              )}
            </div>
          )}

          {/* pattern field */}
          {fields.includes('pattern') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pola Regex
              </label>
              <input
                type="text"
                value={current.pattern ?? ''}
                onChange={(e) => update('pattern', e.target.value || null)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="Pola regex validasi"
                placeholder="Contoh: ^\d{16}$ untuk NIK"
              />
            </div>
          )}

          {/* custom_error field */}
          {fields.includes('custom_error') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pesan Error Kustom
              </label>
              <textarea
                value={current.custom_error ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  update('custom_error', val || null);
                }}
                maxLength={500}
                rows={2}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                aria-label="Pesan error kustom"
                placeholder="Pesan error yang ditampilkan saat validasi gagal"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {(current.custom_error ?? '').length}/500
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ValidationRulesEditor;
