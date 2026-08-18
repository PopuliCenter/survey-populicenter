import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import SkipLogicEditor from '../components/SkipLogicEditor';
import SkipLogicHint from '../components/SkipLogicHint';
import ValidationRulesEditor from '../components/ValidationRulesEditor';
import IconButton from '../components/IconButton';
import useModalA11y from '../hooks/useModalA11y';
import api from '../services/api';
import ExportQuestionnaireModal from '../components/ExportQuestionnaireModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  { value: 'single_choice', label: 'Pilihan Tunggal' },
  { value: 'multiple_choice', label: 'Pilihan Ganda' },
  { value: 'short_text', label: 'Teks Pendek' },
  { value: 'long_text', label: 'Teks Panjang' },
  { value: 'numeric_scale', label: 'Skala Numerik' },
  { value: 'date', label: 'Tanggal' },
  { value: 'photo', label: 'Upload Foto' },
  { value: 'rating_scale', label: 'Rating Scale' },
  { value: 'phone_number', label: 'Nomor Telepon' },
  { value: 'unique_id', label: 'Nomor Kuesioner (Unik)' },
  { value: 'time', label: 'Waktu' },
  { value: 'matrix', label: 'Matrix/Grid' },
  { value: 'indonesia_region', label: 'Wilayah Indonesia (Dropdown)' },
];

const CHOICE_TYPES = ['single_choice', 'multiple_choice'];

// ─── Field Tools Settings Constants ──────────────────────────────────────────

const DEFAULT_FIELD_TOOLS_SETTINGS = {
  signature_mode: 'required',
  audio_mode: 'required',
  photo_mode: 'required',
  gps_mode: 'required',
  audio_indicator: 'shown', // 'shown' | 'hidden' — tampilkan indikator rekaman di perangkat TPD
  device_lock: 'off', // 'enforced' | 'off' — kunci 1 akun TPD = 1 perangkat saat mengisi survei ini
};

const FIELD_TOOLS = [
  { key: 'signature_mode', label: 'Tanda Tangan' },
  { key: 'audio_mode', label: 'Rekaman Audio' },
  { key: 'photo_mode', label: 'Pengambilan Foto' },
  { key: 'gps_mode', label: 'Lokasi GPS' },
];

const FIELD_TOOL_MODES = [
  { value: 'required', label: 'Wajib' },
  { value: 'optional', label: 'Opsional' },
  { value: 'disabled', label: 'Nonaktif' },
];

// ─── Status Badge ─────────────────────────────────────────────────────────────
function SurveyStatusBadge({ status }) {
  const map = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-yellow-100 text-yellow-700',
  };
  const label = { draft: 'Draft', active: 'Aktif', inactive: 'Nonaktif' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[status] || map.draft}`}
    >
      {label[status] || status}
    </span>
  );
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const found = QUESTION_TYPES.find((t) => t.value === type);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
      {found ? found.label : type}
    </span>
  );
}

// ─── Options Editor ───────────────────────────────────────────────────────────
/**
 * Editor for adding/removing choice options (value + label).
 *
 * @param {{
 *   options: Array<{ value: string, label: string }>,
 *   onChange: (opts: Array) => void,
 * }} props
 */
function OptionsEditor({ options, onChange }) {
  function addOption() {
    onChange([...options, { value: '', label: '' }]);
  }

  function removeOption(index) {
    onChange(options.filter((_, i) => i !== index));
  }

  function updateOption(index, field, val) {
    onChange(
      options.map((opt, i) => (i === index ? { ...opt, [field]: val } : opt))
    );
  }

  return (
    <div className="space-y-2">
      {options.map((opt, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={opt.value}
            onChange={(e) => updateOption(index, 'value', e.target.value)}
            placeholder="Nilai"
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 w-28"
            aria-label={`Nilai opsi ${index + 1}`}
          />
          <input
            type="text"
            value={opt.label}
            onChange={(e) => updateOption(index, 'label', e.target.value)}
            placeholder="Label tampilan"
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 flex-1"
            aria-label={`Label opsi ${index + 1}`}
          />
          <button
            type="button"
            onClick={() => removeOption(index)}
            className="px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
            aria-label={`Hapus opsi ${index + 1}`}
          >
            Hapus
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addOption}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300"
      >
        <span aria-hidden="true">+</span> Tambah Opsi
      </button>
    </div>
  );
}

// ─── Rating Config Editor ─────────────────────────────────────────────────────
/**
 * Editor konfigurasi untuk tipe pertanyaan rating_scale.
 * Mengelola min, max, display mode, dan label opsional.
 *
 * @param {{
 *   config: { min: number, max: number, display: string, labels: object },
 *   onChange: (config: object) => void,
 * }} props
 */
function RatingConfigEditor({ config, onChange }) {
  const { min = 1, max = 5, display = 'stars', labels = {} } = config || {};

  function update(field, value) {
    onChange({ min, max, display, labels, [field]: value });
  }

  function updateLabel(key, value) {
    onChange({ min, max, display, labels: { ...labels, [key]: value } });
  }

  return (
    <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-sm font-medium text-amber-800">Konfigurasi Rating Scale</p>

      {/* Min / Max / Display */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Nilai Min
          </label>
          <input
            type="number"
            min={1}
            max={9}
            value={min}
            onChange={(e) => update('min', parseInt(e.target.value, 10) || 1)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Nilai minimum rating"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Nilai Max
          </label>
          <input
            type="number"
            min={2}
            max={10}
            value={max}
            onChange={(e) => update('max', parseInt(e.target.value, 10) || 5)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Nilai maksimum rating"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Tampilan
          </label>
          <select
            value={display}
            onChange={(e) => update('display', e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            aria-label="Mode tampilan rating"
          >
            <option value="stars">Bintang (Stars)</option>
            <option value="numbers">Angka (Numbers)</option>
          </select>
        </div>
      </div>

      {/* Preview */}
      <div className="text-xs text-gray-500">
        Skala: {min} – {max} ({max - min + 1} nilai)
      </div>

      {/* Labels opsional */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">Label Ujung Skala (opsional)</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-gray-500 mb-1">Label Min</label>
            <input
              type="text"
              value={labels.min || ''}
              onChange={(e) => updateLabel('min', e.target.value)}
              placeholder="Sangat Tidak Puas"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              aria-label="Label nilai minimum"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-gray-500 mb-1">Label Max</label>
            <input
              type="text"
              value={labels.max || ''}
              onChange={(e) => updateLabel('max', e.target.value)}
              placeholder="Sangat Puas"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              aria-label="Label nilai maksimum"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Phone Config Editor ──────────────────────────────────────────────────────
/**
 * Editor konfigurasi untuk tipe pertanyaan phone_number.
 * Mengelola min_length dan max_length.
 */
function PhoneConfigEditor({ config, onChange }) {
  const { min_length = 10, max_length = 13 } = config || {};

  function update(field, value) {
    onChange({ min_length, max_length, [field]: value });
  }

  return (
    <div className="space-y-4 p-4 bg-green-50 border border-green-200 rounded-lg">
      <p className="text-sm font-medium text-green-800">Konfigurasi Nomor Telepon</p>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Min Digit</label>
          <input
            type="number"
            min={1}
            max={20}
            value={min_length}
            onChange={(e) => update('min_length', parseInt(e.target.value, 10) || 1)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Panjang minimum digit"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Digit</label>
          <input
            type="number"
            min={1}
            max={20}
            value={max_length}
            onChange={(e) => update('max_length', parseInt(e.target.value, 10) || 13)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Panjang maksimum digit"
          />
        </div>
      </div>
      <div className="text-xs text-gray-500">
        Menerima nomor telepon {min_length}–{max_length} digit (angka saja, tanpa +62)
      </div>
    </div>
  );
}

// ─── Unique ID Config Editor ─────────────────────────────────────────────────
/**
 * Editor konfigurasi untuk tipe pertanyaan unique_id.
 * Mengelola min_length dan max_length (opsional).
 */
function UniqueIdConfigEditor({ config, onChange }) {
  const { min_length = 1, max_length = 20 } = config || {};

  function update(field, value) {
    onChange({ min_length, max_length, [field]: value });
  }

  return (
    <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
      <p className="text-sm font-medium text-purple-800">Konfigurasi Nomor Kuesioner (Unik)</p>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Min Digit</label>
          <input
            type="number"
            min={1}
            max={50}
            value={min_length}
            onChange={(e) => update('min_length', parseInt(e.target.value, 10) || 1)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Panjang minimum digit"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Digit</label>
          <input
            type="number"
            min={1}
            max={50}
            value={max_length}
            onChange={(e) => update('max_length', parseInt(e.target.value, 10) || 20)}
            className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Panjang maksimum digit"
          />
        </div>
      </div>
      <div className="text-xs text-gray-500">
        Nomor kuesioner manual {min_length}–{max_length} digit (angka saja, unik per survei)
      </div>
    </div>
  );
}

// ─── Date Config Editor ───────────────────────────────────────────────────────
/**
 * Editor konfigurasi untuk tipe pertanyaan date.
 * Mengelola min_date dan max_date (opsional).
 *
 * @param {{
 *   config: { min_date: string, max_date: string },
 *   onChange: (config: object) => void,
 * }} props
 */
function DateConfigEditor({ config, onChange }) {
  const { min_date = '', max_date = '' } = config || {};

  const hasValidationError = min_date && max_date && min_date > max_date;

  function update(field, value) {
    onChange({ min_date, max_date, [field]: value });
  }

  return (
    <div className="space-y-4 p-4 bg-teal-50 border border-teal-200 rounded-lg">
      <p className="text-sm font-medium text-teal-800">Konfigurasi Tanggal</p>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Tanggal Minimum
          </label>
          <input
            type="date"
            value={min_date}
            onChange={(e) => update('min_date', e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Tanggal minimum"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Tanggal Maksimum
          </label>
          <input
            type="date"
            value={max_date}
            onChange={(e) => update('max_date', e.target.value)}
            className={`border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
              hasValidationError ? 'border-red-400' : 'border-gray-300'
            }`}
            aria-label="Tanggal maksimum"
            aria-invalid={hasValidationError}
          />
        </div>
      </div>
      {hasValidationError && (
        <p className="text-xs text-red-600">
          Tanggal minimum tidak boleh lebih besar dari tanggal maksimum
        </p>
      )}
      <p className="text-xs text-gray-500">
        Kosongkan untuk tanpa batasan tanggal
      </p>
    </div>
  );
}

// ─── Matrix Config Editor ─────────────────────────────────────────────────────
/**
 * Editor konfigurasi untuk tipe pertanyaan matrix.
 * Mengelola daftar baris (rows) dan kolom (columns).
 *
 * @param {{
 *   config: { rows: string[], columns: string[] },
 *   onChange: (config: object) => void,
 * }} props
 */
function MatrixConfigEditor({ config, onChange }) {
  const { rows = [], columns = [] } = config || {};

  // ── Row helpers ──
  function addRow() {
    onChange({ rows: [...rows, ''], columns });
  }

  function removeRow(index) {
    onChange({ rows: rows.filter((_, i) => i !== index), columns });
  }

  function updateRow(index, value) {
    onChange({ rows: rows.map((r, i) => (i === index ? value : r)), columns });
  }

  // ── Column helpers ──
  function addColumn() {
    onChange({ rows, columns: [...columns, ''] });
  }

  function removeColumn(index) {
    onChange({ rows, columns: columns.filter((_, i) => i !== index) });
  }

  function updateColumn(index, value) {
    onChange({ rows, columns: columns.map((c, i) => (i === index ? value : c)) });
  }

  // ── Validation ──
  const trimmedRows = rows.map((r) => r.trim());
  const trimmedCols = columns.map((c) => c.trim());
  const hasEmptyRow = trimmedRows.some((r) => r === '');
  const hasEmptyCol = trimmedCols.some((c) => c === '');
  const hasDuplicateRow = new Set(trimmedRows.filter((r) => r !== '')).size !== trimmedRows.filter((r) => r !== '').length;
  const hasDuplicateCol = new Set(trimmedCols.filter((c) => c !== '')).size !== trimmedCols.filter((c) => c !== '').length;
  const rowCountError = rows.length < 1;
  const colCountError = columns.length < 2;

  const validationErrors = [];
  if (rowCountError) validationErrors.push('Minimal 1 baris diperlukan');
  if (colCountError) validationErrors.push('Minimal 2 kolom diperlukan');
  if (hasEmptyRow) validationErrors.push('Elemen baris tidak boleh kosong');
  if (hasEmptyCol) validationErrors.push('Elemen kolom tidak boleh kosong');
  if (hasDuplicateRow) validationErrors.push('Elemen baris tidak boleh duplikat');
  if (hasDuplicateCol) validationErrors.push('Elemen kolom tidak boleh duplikat');

  // Only show preview when there are valid rows and columns
  const canPreview = rows.length > 0 && columns.length > 0 && trimmedRows.some((r) => r !== '') && trimmedCols.some((c) => c !== '');

  return (
    <div className="space-y-4 p-4 bg-rose-50 border border-rose-200 rounded-lg">
      <p className="text-sm font-medium text-rose-800">Konfigurasi Matrix/Grid</p>

      {/* Rows editor */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">Baris (Sub-pertanyaan)</p>
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={row}
              onChange={(e) => updateRow(index, e.target.value)}
              placeholder={`Baris ${index + 1}`}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 flex-1"
              aria-label={`Baris ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
              aria-label={`Hapus baris ${index + 1}`}
            >
              Hapus
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300"
        >
          <span aria-hidden="true">+</span> Tambah Baris
        </button>
      </div>

      {/* Columns editor */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">Kolom (Opsi Jawaban)</p>
        {columns.map((col, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={col}
              onChange={(e) => updateColumn(index, e.target.value)}
              placeholder={`Kolom ${index + 1}`}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 flex-1"
              aria-label={`Kolom ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => removeColumn(index)}
              className="px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
              aria-label={`Hapus kolom ${index + 1}`}
            >
              Hapus
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300"
        >
          <span aria-hidden="true">+</span> Tambah Kolom
        </button>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="space-y-1">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-xs text-red-600">{err}</p>
          ))}
        </div>
      )}

      {/* Matrix preview */}
      {canPreview && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Preview Matrix</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border border-gray-200 rounded">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600"></th>
                  {columns.map((col, i) => (
                    <th key={i} className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-600">
                      {col.trim() || `Kolom ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 font-medium text-gray-700">
                      {row.trim() || `Baris ${ri + 1}`}
                    </td>
                    {columns.map((_, ci) => (
                      <td key={ci} className="border border-gray-200 px-3 py-2 text-center">
                        <span className="inline-block w-4 h-4 rounded-full border-2 border-gray-300" aria-hidden="true"></span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Region Config Editor ─────────────────────────────────────────────────────
/**
 * Editor konfigurasi untuk tipe pertanyaan indonesia_region.
 * Admin/supervisor dapat memilih kedalaman wilayah yang ditampilkan:
 * - 'province'  → hanya Provinsi
 * - 'regency'   → Provinsi + Kabupaten/Kota
 * - 'district'  → Provinsi + Kabupaten/Kota + Kecamatan
 * - 'village'   → Provinsi + Kabupaten/Kota + Kecamatan + Desa/Kelurahan
 *
 * @param {{
 *   config: { depth: string },
 *   onChange: (config: object) => void,
 * }} props
 */
function RegionConfigEditor({ config, onChange }) {
  const depth = config?.depth || 'village';

  const DEPTH_OPTIONS = [
    {
      value: 'province',
      label: 'Provinsi saja',
      description: 'Hanya menampilkan dropdown Provinsi',
    },
    {
      value: 'regency',
      label: 'Provinsi + Kabupaten/Kota',
      description: 'Menampilkan dropdown Provinsi dan Kabupaten/Kota',
    },
    {
      value: 'district',
      label: 'Provinsi + Kabupaten/Kota + Kecamatan',
      description: 'Menampilkan dropdown hingga tingkat Kecamatan',
    },
    {
      value: 'village',
      label: 'Lengkap (hingga Desa/Kelurahan)',
      description: 'Menampilkan semua dropdown: Provinsi → Kab/Kota → Kecamatan → Desa/Kelurahan',
    },
  ];

  return (
    <div className="space-y-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
      <p className="text-sm font-medium text-emerald-800">Konfigurasi Wilayah Indonesia</p>
      <p className="text-xs text-emerald-700">
        Pilih kedalaman wilayah yang perlu diisi oleh surveyor:
      </p>
      <div className="space-y-2">
        {DEPTH_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              depth === opt.value
                ? 'border-emerald-400 bg-emerald-100'
                : 'border-gray-200 bg-white hover:bg-emerald-50'
            }`}
          >
            <input
              type="radio"
              name="region-depth"
              value={opt.value}
              checked={depth === opt.value}
              onChange={() => onChange({ depth: opt.value })}
              className="mt-0.5 accent-emerald-600 shrink-0"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Data wilayah dimuat dari file lokal — tidak memerlukan koneksi internet.
      </p>
    </div>
  );
}

// ─── Field Tools Settings Section ────────────────────────────────────────────
/**
 * Section for configuring field tools modes per survey.
 *
 * @param {{
 *   settings: object,
 *   onChange: (key: string, value: string) => void,
 * }} props
 */
/**
 * Kelompok setelan field tools yang bisa dibuka-tutup. Daftar setelannya sudah
 * panjang (mode alat, aturan audio, kunci-kunci, RT, kualitas) — default
 * TERTUTUP, dan ringkasan nilai aktif tampil di judul agar keadaan tetap
 * terbaca sekilas tanpa membuka.
 */
function FieldToolsGroup({ title, summary, children }) {
  return (
    <details className="border border-gray-100 rounded-lg px-4 py-2.5">
      <summary className="cursor-pointer select-none text-sm">
        <span className="font-medium text-gray-700">{title}</span>
        {summary && <span className="ml-2 text-xs text-gray-500">— {summary}</span>}
      </summary>
      <div className="pt-3 space-y-3">{children}</div>
    </details>
  );
}

function FieldToolsSettingsSection({ settings, onChange }) {
  const MODE_SHORT = { required: 'wajib', optional: 'opsional', disabled: 'nonaktif' };
  const TOOL_SHORT = { signature_mode: 'TTD', audio_mode: 'Audio', photo_mode: 'Foto', gps_mode: 'GPS' };
  const modesSummary = FIELD_TOOLS
    .map(({ key }) => `${TOOL_SHORT[key] || key} ${MODE_SHORT[settings[key]] || '?'}`)
    .join(' · ');
  const audioAktif = settings.audio_mode !== 'disabled';
  const audioSummary = `indikator ${(settings.audio_indicator || 'shown') === 'shown' ? 'tampil' : 'sembunyi'} · mulai ${((settings.audio_start_delay_sec ?? 0) / 60).toLocaleString('id-ID')} mnt · total ${((settings.audio_total_max_sec ?? 180) / 60).toLocaleString('id-ID')} mnt`;
  const rtAktif = (settings.rt_selection || 'off') === 'enabled';
  const durasiAmbang = settings.min_duration_sec ?? 30;

  return (
    <div className="bg-white rounded-xl shadow px-6 py-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Pengaturan Field Tools</h3>

      <FieldToolsGroup title="Perangkat lapangan" summary={modesSummary}>
        {FIELD_TOOLS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-6 flex-wrap">
            <span className="text-sm text-gray-700 w-36 shrink-0">{label}</span>
            <div className="flex items-center gap-4 flex-wrap">
              {FIELD_TOOL_MODES.map(({ value, label: modeLabel }) => (
                <label
                  key={value}
                  htmlFor={`${key}_${value}`}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="radio"
                    id={`${key}_${value}`}
                    name={key}
                    value={value}
                    checked={settings[key] === value}
                    onChange={() => onChange(key, value)}
                    className="accent-primary-600 focus:ring-2 focus:ring-primary-400"
                  />
                  {modeLabel}
                </label>
              ))}
            </div>
          </div>
        ))}
      </FieldToolsGroup>

      {audioAktif && (
        <FieldToolsGroup title="Rekaman audio" summary={audioSummary}>
          {/* Indikator rekaman audio — opsi tampil/sembunyi (bukan mode wajib) */}
          <div className="flex items-center gap-6 flex-wrap">
            <span className="text-sm text-gray-700 w-36 shrink-0">Indikator Rekaman</span>
            <div className="flex items-center gap-4 flex-wrap">
              {[{ value: 'shown', label: 'Tampil' }, { value: 'hidden', label: 'Sembunyi' }].map(({ value, label: optLabel }) => (
                <label
                  key={value}
                  htmlFor={`audio_indicator_${value}`}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="radio"
                    id={`audio_indicator_${value}`}
                    name="audio_indicator"
                    value={value}
                    checked={(settings.audio_indicator || 'shown') === value}
                    onChange={() => onChange('audio_indicator', value)}
                    className="accent-primary-600 focus:ring-2 focus:ring-primary-400"
                  />
                  {optLabel}
                </label>
              ))}
            </div>
            <span className="text-xs text-gray-500 basis-full">
              Tampilkan saat uji coba; sembunyikan saat survei berlangsung (berlaku di web &amp; Android). Rekaman tetap berjalan.
            </span>
          </div>

          {/* Aturan waktu rekaman — nilai disimpan DETIK; UI memakai MENIT. */}
          <div className="flex items-start gap-6 flex-wrap pt-3 border-t border-gray-100">
            <span className="text-sm text-gray-700 w-36 shrink-0">Aturan Rekaman</span>
            <div className="flex flex-col gap-3 flex-1 min-w-[240px]">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <span className="w-40 shrink-0">Mulai rekam setelah</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.5"
                  value={(settings.audio_start_delay_sec ?? 0) / 60}
                  onChange={(e) => {
                    const mins = parseFloat(e.target.value);
                    const sec = Math.round((Number.isFinite(mins) ? mins : 0) * 60);
                    onChange('audio_start_delay_sec', Math.min(1800, Math.max(0, sec)));
                  }}
                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <span className="text-gray-500">menit</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <span className="w-40 shrink-0">Total durasi rekaman</span>
                <input
                  type="number"
                  min="0.5"
                  max="15"
                  step="0.5"
                  value={(settings.audio_total_max_sec ?? 180) / 60}
                  onChange={(e) => {
                    const mins = parseFloat(e.target.value);
                    const sec = Math.round((Number.isFinite(mins) ? mins : 3) * 60);
                    onChange('audio_total_max_sec', Math.min(900, Math.max(30, sec)));
                  }}
                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <span className="text-gray-500">menit</span>
              </label>
              <span className="text-xs text-gray-500">
                Untuk audio <b>Wajib</b>, rekaman mulai otomatis setelah jeda ini — berguna melewati obrolan
                pembuka sebelum wawancara inti. Total durasi dibagi rata: separuh pembukaan, separuh penutupan.
                Default: mulai langsung (0), total 3 menit.
              </span>
            </div>
          </div>
        </FieldToolsGroup>
      )}

      {/* Kunci Perangkat — 1 akun TPD = 1 perangkat (cegah double user / salah akun) */}
      <FieldToolsGroup
        title="Kunci Perangkat"
        summary={(settings.device_lock || 'off') === 'enforced' ? 'aktif — 1 akun = 1 HP' : 'nonaktif'}
      >
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {[{ value: 'enforced', label: 'Aktif' }, { value: 'off', label: 'Nonaktif' }].map(({ value, label: optLabel }) => (
              <label
                key={value}
                htmlFor={`device_lock_${value}`}
                className="inline-flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="radio"
                  id={`device_lock_${value}`}
                  name="device_lock"
                  value={value}
                  checked={(settings.device_lock || 'off') === value}
                  onChange={() => onChange('device_lock', value)}
                  className="accent-primary-600 focus:ring-2 focus:ring-primary-400"
                />
                {optLabel}
              </label>
            ))}
          </div>
          <span className="text-xs text-gray-500 basis-full">
            1 akun TPD terkunci ke 1 perangkat (HP pertama yang dipakai mengisi) — mencegah pengisian
            memakai akun orang lain. Bila TPD ganti HP, reset dari Manajemen TPD ("Reset Perangkat").
            Nonaktifkan saat uji coba.
          </span>
        </div>
      </FieldToolsGroup>

      {/* Kunci Gender-Paritas — jenis kelamin TERKUNCI mengikuti nomor ganjil/genap.
          Berlaku pada pertanyaan ber-"isi otomatis jenis kelamin" (paritas). */}
      <FieldToolsGroup
        title="Kunci Gender"
        summary={(settings.gender_parity_lock || 'off') === 'locked' ? 'terkunci — ikut paritas nomor' : 'bebas (isi-otomatis saja)'}
      >
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {[{ value: 'locked', label: 'Terkunci' }, { value: 'off', label: 'Bebas (isi-otomatis saja)' }].map(({ value, label: optLabel }) => (
              <label
                key={value}
                htmlFor={`gender_parity_lock_${value}`}
                className="inline-flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="radio"
                  id={`gender_parity_lock_${value}`}
                  name="gender_parity_lock"
                  value={value}
                  checked={(settings.gender_parity_lock || 'off') === value}
                  onChange={() => onChange('gender_parity_lock', value)}
                  className="accent-primary-600 focus:ring-2 focus:ring-primary-400"
                />
                {optLabel}
              </label>
            ))}
          </div>
          <span className="text-xs text-gray-500 basis-full">
            <b>Terkunci</b>: jawaban jenis kelamin dipaksa mengikuti paritas Nomor Kuesioner
            (ganjil = Laki-laki, genap = Perempuan) — TPD tidak bisa mengubahnya & server ikut
            menegakkan saat submit, sehingga mismatch nomor vs gender mustahil terjadi.
            Butuh pertanyaan dengan "isi otomatis jenis kelamin" aktif. Nomor non-angka tidak terkunci.
          </span>
        </div>
      </FieldToolsGroup>

      {/* Pemilihan RT acak — menggantikan Lembar Angka Acak (Form A) + Form B kertas.
          Server yang mengundi & hasilnya terkunci (tak bisa diacak ulang oleh TPD). */}
      <FieldToolsGroup
        title="Pemilihan RT"
        summary={rtAktif ? `aktif — undi ${settings.rt_selection_count ?? 2} RT/kelurahan` : 'nonaktif'}
      >
        <div className="flex items-start gap-6 flex-wrap">
          <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
            <div className="flex items-center gap-4 flex-wrap">
              {[{ value: 'enabled', label: 'Aktif' }, { value: 'off', label: 'Nonaktif' }].map(({ value, label: optLabel }) => (
                <label
                  key={value}
                  htmlFor={`rt_selection_${value}`}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="radio"
                    id={`rt_selection_${value}`}
                    name="rt_selection"
                    value={value}
                    checked={(settings.rt_selection || 'off') === value}
                    onChange={() => onChange('rt_selection', value)}
                    className="accent-primary-600 focus:ring-2 focus:ring-primary-400"
                  />
                  {optLabel}
                </label>
              ))}
            </div>
            {(settings.rt_selection || 'off') === 'enabled' && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <span className="shrink-0">Jumlah RT diundi per kelurahan</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.rt_selection_count ?? 2}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    onChange('rt_selection_count', Math.min(10, Math.max(1, Number.isFinite(n) ? n : 2)));
                  }}
                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <span className="text-gray-500">RT</span>
              </label>
            )}
          </div>
          <span className="text-xs text-gray-500 basis-full">
            Menggantikan <b>Lembar Angka Acak (Form A)</b> yang discan manual. TPD mengisi jumlah RT
            dari aparat desa + foto Form B ber-stempel, lalu <b>server</b> yang mengundi — TPD tidak
            bisa memengaruhi hasil. Undian <b>terkunci satu kali per kelurahan</b> (tidak bisa diacak
            ulang), dan tersimpan lengkap dengan seed sehingga supervisor bisa menghitung ulang untuk
            membuktikan hasilnya bukan karangan. Bila tanpa sinyal, tiket undian offline yang
            sudah diunduh (tombol Perbarui) tetap bisa dipakai.
          </span>
        </div>
      </FieldToolsGroup>

      {/* Kualitas Data — tandai durasi pengisian mencurigakan (terlalu singkat).
          Nilai disimpan dalam DETIK; 0 = penanda nonaktif. */}
      <FieldToolsGroup
        title="Kualitas Data"
        summary={durasiAmbang > 0 ? `tandai durasi < ${durasiAmbang} dtk` : 'penanda durasi nonaktif'}
      >
        <div className="flex items-start gap-6 flex-wrap">
          <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <span className="shrink-0">Tandai bila durasi di bawah</span>
              <input
                type="number"
                min="0"
                max="3600"
                step="5"
                value={settings.min_duration_sec ?? 30}
                onChange={(e) => {
                  const sec = parseInt(e.target.value, 10);
                  onChange('min_duration_sec', Math.min(3600, Math.max(0, Number.isFinite(sec) ? sec : 30)));
                }}
                className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              <span className="text-gray-500">detik</span>
            </label>
            <span className="text-xs text-gray-500">
              Respons yang durasinya di bawah ambang ini ditandai di dashboard (indikasi TPD terburu-buru /
              mengarang), mirip penanda gender-tak-sesuai-paritas. Isi <b>0</b> untuk menonaktifkan. Default: 30 detik.
            </span>
          </div>
        </div>
      </FieldToolsGroup>

      {/* Tampilan Huruf — keterbacaan formulir di lapangan (layar kecil, terik,
          usia TPD beragam). Murni visual; diterapkan di perangkat TPD. */}
      <FieldToolsGroup
        title="Tampilan Huruf"
        summary={[
          { normal: 'ukuran normal', large: 'ukuran besar', xlarge: 'ukuran sangat besar' }[settings.form_font_scale || 'normal'],
          { serif: 'serif', hyperlegible: 'Atkinson Hyperlegible', condensed: 'ringkas' }[settings.form_font_family || 'default'] || null,
        ].filter(Boolean).join(' · ')}
      >
        <div className="flex items-start gap-6 flex-wrap">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="text-xs font-medium text-gray-600">Ukuran huruf formulir TPD</span>
            <select
              value={settings.form_font_scale || 'normal'}
              onChange={(e) => onChange('form_font_scale', e.target.value)}
              className="w-56 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="normal">Normal</option>
              <option value="large">Besar (+12%)</option>
              <option value="xlarge">Sangat besar (+25%)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="text-xs font-medium text-gray-600">Jenis huruf</span>
            <select
              value={settings.form_font_family || 'default'}
              onChange={(e) => onChange('form_font_family', e.target.value)}
              className="w-56 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="default">Bawaan (tanpa kait)</option>
              <option value="serif">Serif (berkait)</option>
              <option value="hyperlegible">Atkinson Hyperlegible (keterbacaan maksimal)</option>
              <option value="condensed">Ringkas (Condensed — muat lebih banyak teks)</option>
            </select>
          </label>
          <span className="text-xs text-gray-500 basis-full">
            Berlaku pada <b>formulir pengisian di aplikasi TPD</b> untuk survei ini — membantu
            keterbacaan di layar kecil/terik atau untuk TPD berusia. Perubahan terasa di HP setelah
            TPD menekan <b>Perbarui</b> saat online.
          </span>
        </div>
      </FieldToolsGroup>
    </div>
  );
}

// ─── Date Picker Section ──────────────────────────────────────────────────────
/**
 * Section for setting survey start_date and end_date.
 *
 * @param {{
 *   startDate: string,
 *   endDate: string,
 *   onStartDateChange: (v: string) => void,
 *   onEndDateChange: (v: string) => void,
 *   dateError: string,
 * }} props
 */
function DatePickerSection({ startDate, endDate, onStartDateChange, onEndDateChange, dateError }) {
  return (
    <div className="bg-white rounded-xl shadow px-6 py-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Periode Pengisian Survei</h3>
      <div className="flex items-start gap-4 flex-wrap">
        <div>
          <label htmlFor="survey-start-date" className="block text-xs font-medium text-gray-600 mb-1">
            Tanggal Mulai
          </label>
          <input
            id="survey-start-date"
            type="datetime-local"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Tanggal mulai survei"
          />
        </div>
        <div>
          <label htmlFor="survey-end-date" className="block text-xs font-medium text-gray-600 mb-1">
            Tanggal Berakhir
          </label>
          <input
            id="survey-end-date"
            type="datetime-local"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
              dateError ? 'border-red-400' : 'border-gray-300'
            }`}
            aria-label="Tanggal berakhir survei"
            aria-describedby={dateError ? 'date-error' : undefined}
            aria-invalid={!!dateError}
          />
        </div>
      </div>
      {dateError && (
        <p id="date-error" className="text-xs text-red-600">{dateError}</p>
      )}
      <p className="text-xs text-gray-500">
        Kosongkan untuk survei tanpa batasan waktu.
      </p>
    </div>
  );
}

// ─── Question Form Modal ──────────────────────────────────────────────────────
/**
 * Modal form for adding or editing a question.
 *
 * @param {{
 *   mode: 'create' | 'edit',
 *   initial: object | null,
 *   surveyId: string,
 *   questions: Array,
 *   onClose: () => void,
 *   onSaved: () => void,
 * }} props
 */
function QuestionFormModal({ mode, initial, surveyId, questions, onClose, onSaved }) {
  const isEdit = mode === 'edit';

  const [text, setText] = useState(initial?.text || '');
  const [type, setType] = useState(initial?.type || 'single_choice');
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false);
  const [options, setOptions] = useState(
    initial?.options && Array.isArray(initial.options) ? [...initial.options] : []
  );
  const [randomizeOptions, setRandomizeOptions] = useState(
    initial?.randomize_options ?? false
  );
  // Blok acak URUTAN pertanyaan — flag bersebelahan membentuk satu blok yang
  // dikocok per responden di app TPD. Server menolak flag pada pertanyaan
  // identitas / ber-skip-logic (lompatan bermakna posisi).
  const [randomizeOrder, setRandomizeOrder] = useState(
    initial?.randomize_order ?? false
  );
  const [allowOther, setAllowOther] = useState(
    // Bug #2: allow_other adalah field langsung di question, bukan di dalam options
    initial?.allow_other === true ? true : false
  );
  const [skipLogic, setSkipLogic] = useState(
    initial?.skip_logic ? [...initial.skip_logic] : []
  );
  // Isi otomatis jenis kelamin dari paritas Nomor Kuesioner (khusus single_choice).
  const [genderAutoFill, setGenderAutoFill] = useState(() =>
    initial?.auto_fill && initial.auto_fill.source === 'questionnaire_number_parity'
      ? { enabled: true, odd_value: initial.auto_fill.odd_value || '', even_value: initial.auto_fill.even_value || '' }
      : { enabled: false, odd_value: '', even_value: '' }
  );
  const [ratingConfig, setRatingConfig] = useState(
    initial?.type === 'rating_scale' && initial?.options && !Array.isArray(initial.options)
      ? initial.options
      : { min: 1, max: 5, display: 'stars', labels: {} }
  );
  const [phoneConfig, setPhoneConfig] = useState(
    initial?.type === 'phone_number' && initial?.options && !Array.isArray(initial.options)
      ? initial.options
      : { min_length: 10, max_length: 13 }
  );
  const [uniqueIdConfig, setUniqueIdConfig] = useState(
    initial?.type === 'unique_id' && initial?.options && !Array.isArray(initial.options)
      ? initial.options
      : { min_length: 1, max_length: 20 }
  );
  const [dateConfig, setDateConfig] = useState(
    initial?.type === 'date' && initial?.options && !Array.isArray(initial.options)
      ? initial.options
      : { min_date: '', max_date: '' }
  );
  const [matrixConfig, setMatrixConfig] = useState(
    initial?.type === 'matrix' && initial?.options && !Array.isArray(initial.options)
      ? initial.options
      : { rows: [], columns: [] }
  );
  const [regionConfig, setRegionConfig] = useState(
    initial?.type === 'indonesia_region' && initial?.options && !Array.isArray(initial.options)
      ? initial.options
      : { depth: 'village' }
  );
  const [validationConfig, setValidationConfig] = useState(() => {
    if (initial?.options && !Array.isArray(initial.options) && initial.options.validation) {
      return initial.options.validation;
    }
    return null;
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [textError, setTextError] = useState('');
  const dialogRef = useRef(null);
  useModalA11y(true, onClose, dialogRef);

  const isChoiceType = CHOICE_TYPES.includes(type);

  // Reset options when type changes away from choice types
  function handleTypeChange(newType) {
    setType(newType);
    if (!CHOICE_TYPES.includes(newType)) {
      setRandomizeOptions(false);
    }
    if (newType !== 'rating_scale') {
      setRatingConfig({ min: 1, max: 5, display: 'stars', labels: {} });
    }
    if (newType !== 'phone_number') setPhoneConfig({ min_length: 10, max_length: 13 });
    if (newType !== 'unique_id') setUniqueIdConfig({ min_length: 1, max_length: 20 });
    if (newType !== 'date') setDateConfig({ min_date: '', max_date: '' });
    if (newType !== 'matrix') setMatrixConfig({ rows: [], columns: [] });
    if (newType !== 'indonesia_region') setRegionConfig({ depth: 'village' });
    // Isi-otomatis jenis kelamin hanya untuk Pilihan Tunggal.
    if (newType !== 'single_choice') setGenderAutoFill((p) => ({ ...p, enabled: false }));
    setValidationConfig(null);
  }

  // Opsi jawaban yang valid (untuk dropdown pemetaan ganjil/genap).
  const validChoiceOptions = options.filter((o) => (o.value || '').trim() || (o.label || '').trim());

  // Aktifkan/nonaktifkan isi-otomatis. Saat mengaktifkan, tebak default dari
  // label opsi: nomor ganjil → Laki-laki/Pria, genap → Perempuan/Wanita.
  function toggleGenderAutoFill() {
    setGenderAutoFill((prev) => {
      if (prev.enabled) return { ...prev, enabled: false };
      const male = validChoiceOptions.find((o) => /laki|pria/i.test(o.label || o.value || ''));
      const female = validChoiceOptions.find((o) => /perempuan|wanita/i.test(o.label || o.value || ''));
      return {
        enabled: true,
        odd_value: prev.odd_value || (male ? male.value : (validChoiceOptions[0]?.value || '')),
        even_value: prev.even_value || (female ? female.value : (validChoiceOptions[1]?.value || '')),
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    setTextError('');

    if (!text.trim()) {
      setTextError('Teks pertanyaan wajib diisi');
      return;
    }

    // Isi-otomatis jenis kelamin: jika diaktifkan, pemetaan ganjil & genap wajib.
    if (type === 'single_choice' && genderAutoFill.enabled &&
        (!genderAutoFill.odd_value || !genderAutoFill.even_value)) {
      setFormError('Tentukan opsi untuk nomor ganjil dan genap pada isi-otomatis jenis kelamin.');
      return;
    }

    // Matrix: buang baris/kolom kosong (slot yang belum diisi) sebelum kirim,
    // lalu validasi di klien agar pesannya jelas. Tanpa ini, satu input kosong
    // membuat server menolak 422 tanpa alasan yang terlihat. Server tetap
    // validator terakhir.
    let matrixClean = null;
    if (type === 'matrix') {
      matrixClean = {
        rows: (matrixConfig.rows || []).map((r) => r.trim()).filter(Boolean),
        columns: (matrixConfig.columns || []).map((c) => c.trim()).filter(Boolean),
      };
      if (matrixClean.rows.length < 1) {
        setFormError('Matrix harus memiliki minimal 1 baris terisi.');
        return;
      }
      if (matrixClean.columns.length < 2) {
        setFormError('Matrix harus memiliki minimal 2 kolom terisi.');
        return;
      }
      if (
        new Set(matrixClean.rows).size !== matrixClean.rows.length ||
        new Set(matrixClean.columns).size !== matrixClean.columns.length
      ) {
        setFormError('Baris/kolom matrix tidak boleh duplikat.');
        return;
      }
    }

    const validationPayload = validationConfig ? { validation: validationConfig } : {};

    const payload = {
      text: text.trim(),
      type,
      is_required: isRequired,
      randomize_order: randomizeOrder,
      ...(isChoiceType
        ? {
            options: options.filter((o) => o.value.trim() || o.label.trim()),
            randomize_options: randomizeOptions,
            allow_other: allowOther,
          }
        : {}),
      ...(type === 'rating_scale' ? { options: { ...ratingConfig, ...validationPayload } } : {}),
      ...(type === 'phone_number' ? { options: { ...phoneConfig, ...validationPayload } } : {}),
      ...(type === 'unique_id' ? { options: { ...uniqueIdConfig, ...validationPayload } } : {}),
      ...(type === 'date' ? { options: { ...dateConfig, ...validationPayload } } : {}),
      ...(type === 'matrix' ? { options: { ...matrixClean, ...validationPayload } } : {}),
      ...(type === 'indonesia_region' ? { options: { ...regionConfig } } : {}),
      // Tipe lain (teks, foto, dst.): KIRIM options secara eksplisit — berisi
      // validasi bila ada, atau null bila tidak. Tanpa ini, mengganti tipe dari
      // pilihan → teks meninggalkan array opsi LAMA di server (update parsial),
      // yang lalu tampil membingungkan sebagai "N pilihan jawaban" di builder.
      ...(!isChoiceType && type !== 'rating_scale' && type !== 'phone_number' && type !== 'unique_id' && type !== 'date' && type !== 'matrix' && type !== 'indonesia_region'
        ? { options: validationConfig ? validationPayload : null }
        : {}),
      skip_logic: skipLogic,
      auto_fill:
        type === 'single_choice' && genderAutoFill.enabled && genderAutoFill.odd_value && genderAutoFill.even_value
          ? {
              source: 'questionnaire_number_parity',
              odd_value: genderAutoFill.odd_value,
              even_value: genderAutoFill.even_value,
            }
          : null,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/surveys/${surveyId}/questions/${initial.id}`, payload);
      } else {
        await api.post(`/surveys/${surveyId}/questions`, payload);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Terjadi kesalahan. Silakan coba lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-modal-title"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6"
      >
        <h2
          id="question-modal-title"
          className="text-lg font-semibold text-gray-800 mb-5"
        >
          {isEdit ? 'Edit Pertanyaan' : 'Tambah Pertanyaan'}
        </h2>

        {formError && (
          <div
            className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"
            role="alert"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Question text */}
          <div>
            <label
              htmlFor="question-text"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Teks Pertanyaan{' '}
              <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <textarea
              id="question-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none ${
                textError ? 'border-red-400' : 'border-gray-300'
              }`}
              aria-describedby={textError ? 'question-text-error' : undefined}
              aria-invalid={!!textError}
              autoFocus
            />
            {textError && (
              <p id="question-text-error" className="mt-1 text-xs text-red-600">
                {textError}
              </p>
            )}
          </div>

          {/* Type selector */}
          <div>
            <label
              htmlFor="question-type"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tipe Pertanyaan
            </label>
            <select
              id="question-type"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Rating Scale Config (hanya untuk tipe rating_scale) */}
          {type === 'rating_scale' && (
            <RatingConfigEditor
              config={ratingConfig}
              onChange={setRatingConfig}
            />
          )}

          {/* Phone Number Config */}
          {type === 'phone_number' && (
            <PhoneConfigEditor config={phoneConfig} onChange={setPhoneConfig} />
          )}

          {/* Unique ID Config */}
          {type === 'unique_id' && (
            <UniqueIdConfigEditor config={uniqueIdConfig} onChange={setUniqueIdConfig} />
          )}

          {/* Date Config */}
          {type === 'date' && (
            <DateConfigEditor config={dateConfig} onChange={setDateConfig} />
          )}

          {/* Matrix Config */}
          {type === 'matrix' && (
            <MatrixConfigEditor config={matrixConfig} onChange={setMatrixConfig} />
          )}

          {/* Indonesia Region Config */}
          {type === 'indonesia_region' && (
            <RegionConfigEditor config={regionConfig} onChange={setRegionConfig} />
          )}

          {/* Is Required toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isRequired}
              onClick={() => setIsRequired((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                isRequired ? 'bg-primary-600' : 'bg-gray-300'
              }`}
              aria-label="Pertanyaan wajib diisi"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  isRequired ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">Pertanyaan wajib diisi</span>
          </div>

          {/* Blok acak urutan pertanyaan — tidak untuk identitas/skip logic
              (server menolak; lihat pesan error saat simpan bila bentrok) */}
          {type !== 'unique_id' && type !== 'indonesia_region' && (
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={randomizeOrder}
                onClick={() => setRandomizeOrder((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                  randomizeOrder ? 'bg-primary-600' : 'bg-gray-300'
                }`}
                aria-label="Ikut blok acak urutan pertanyaan"
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    randomizeOrder ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <span className="text-sm text-gray-700">Ikut blok acak urutan pertanyaan</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pertanyaan ber-tanda ini yang <b>bersebelahan</b> membentuk satu blok — urutannya
                  dikocok berbeda untuk tiap responden (seed nomor kuesioner, stabil saat draft
                  dilanjutkan). Tidak bisa digabung dengan skip logic, dan jawaban tetap tersimpan
                  per pertanyaan sehingga data/ekspor tidak berubah.
                </p>
              </div>
            </div>
          )}

          {/* Options editor (only for choice types) */}
          {isChoiceType && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Pilihan Jawaban
                </p>
                <OptionsEditor options={options} onChange={setOptions} />
              </div>

              {/* Randomize options toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={randomizeOptions}
                  onClick={() => setRandomizeOptions((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                    randomizeOptions ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                  aria-label="Acak urutan pilihan jawaban"
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      randomizeOptions ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  Acak urutan pilihan jawaban
                </span>
              </div>

              {/* Allow "Lainnya" (Other) option toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowOther}
                  onClick={() => setAllowOther((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                    allowOther ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                  aria-label="Tambah opsi Lainnya"
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      allowOther ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  Tambah opsi "Lainnya" (input teks dari surveyor)
                </span>
              </div>

              {/* Isi otomatis jenis kelamin dari paritas Nomor Kuesioner */}
              {type === 'single_choice' && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={genderAutoFill.enabled}
                      onClick={toggleGenderAutoFill}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                        genderAutoFill.enabled ? 'bg-primary-600' : 'bg-gray-300'
                      }`}
                      aria-label="Isi otomatis dari Nomor Kuesioner"
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          genderAutoFill.enabled ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-sm text-gray-700">
                      Isi otomatis dari Nomor Kuesioner (mis. jenis kelamin)
                    </span>
                  </div>

                  {genderAutoFill.enabled && (
                    <div className="space-y-2 pl-1">
                      <p className="text-xs text-gray-500">
                        Jawaban terisi otomatis dari nomor kuesioner terpilih (nomor ganjil vs genap),
                        dan tetap bisa diubah surveyor bila perlu.
                      </p>
                      {validChoiceOptions.length < 2 ? (
                        <p className="text-xs text-amber-600">
                          Tambahkan minimal 2 opsi jawaban terlebih dahulu untuk mengatur pemetaan.
                        </p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="block text-xs font-medium text-gray-600 mb-1">
                              Nomor ganjil (1, 3, 5…) →
                            </span>
                            <select
                              value={genderAutoFill.odd_value}
                              onChange={(e) => setGenderAutoFill((p) => ({ ...p, odd_value: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                            >
                              <option value="">— Pilih opsi —</option>
                              {validChoiceOptions.map((o, i) => (
                                <option key={`${o.value}-${i}`} value={o.value}>{o.label || o.value}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="block text-xs font-medium text-gray-600 mb-1">
                              Nomor genap (2, 4, 6…) →
                            </span>
                            <select
                              value={genderAutoFill.even_value}
                              onChange={(e) => setGenderAutoFill((p) => ({ ...p, even_value: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                            >
                              <option value="">— Pilih opsi —</option>
                              {validChoiceOptions.map((o, i) => (
                                <option key={`${o.value}-${i}`} value={o.value}>{o.label || o.value}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Skip Logic section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Skip Logic</h3>
            <SkipLogicEditor
              questions={questions}
              skipLogic={skipLogic}
              onChange={setSkipLogic}
            />
          </div>

          {/* Validation Rules section */}
          <ValidationRulesEditor
            questionType={type}
            validation={validationConfig}
            onChange={setValidationConfig}
          />

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {submitting
                ? 'Menyimpan…'
                : isEdit
                ? 'Simpan Perubahan'
                : 'Tambah Pertanyaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SurveyBuilder Page ───────────────────────────────────────────────────────
/**
 * Question builder page for a specific survey.
 *
 * Features:
 * - Fetch survey detail + questions from GET /surveys/:id
 * - Display survey title and status
 * - List questions with order, text, type badge, required indicator, edit/delete
 * - "Tambah Pertanyaan" button → modal with all question types, options, skip logic
 * - Edit question: same form pre-filled
 * - Delete question: with confirmation
 * - Reorder: up/down buttons (calls PATCH /surveys/:id/questions/reorder)
 * - Back button to /surveys
 */
function SurveyBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modal state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Date picker state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [savingDates, setSavingDates] = useState(false);

  // Field tools settings state
  const [fieldToolsSettings, setFieldToolsSettings] = useState(null);
  const [savingFieldTools, setSavingFieldTools] = useState(false);

  // Form mode state
  const [formMode, setFormMode] = useState('wizard');
  const [savingFormMode, setSavingFormMode] = useState(false);

  // ── Fetch survey detail ─────────────────────────────────────────────────────
  const fetchSurvey = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get(`/surveys/${id}`);
      setSurvey(res.data);
      const qs = res.data.questions || [];
      // Sort by order_index
      setQuestions([...qs].sort((a, b) => a.order_index - b.order_index));
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          'Gagal memuat data survei.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSurvey();
  }, [fetchSurvey]);

  // ── Blok acak via RENTANG nomor (cara cepat menandai banyak pertanyaan) ─────
  // Penyimpanan tetap PER-PERTANYAAN (randomize_order) sehingga tahan
  // sisip/geser/hapus — rentang di sini hanyalah CARA MENERAPKAN, bukan config
  // tersimpan (rentang tersimpan akan basi saat urutan berubah). Pertanyaan
  // yang tak memenuhi syarat (identitas, isi-otomatis, skip logic) otomatis
  // DILEWATI dan dilaporkan; server tetap validator terakhir (422 → dilewati).
  const [rbFrom, setRbFrom] = useState('');
  const [rbTo, setRbTo] = useState('');
  const [rbBusy, setRbBusy] = useState(false);
  const [rbResult, setRbResult] = useState(null);

  // Inti penerapan rentang — dipakai tombol rentang manual DAN "Hapus blok ini"
  // di rekap (from/to 1-based inklusif).
  const applyRange = useCallback(async (from, to, flagValue) => {
    setRbBusy(true);
    setRbResult(null);
    const skipped = [];
    let changed = 0;
    for (let i = from - 1; i < to; i++) {
      const q = questions[i];
      const no = i + 1;
      if (flagValue) {
        // Pra-saring di klien agar laporannya jelas; server tetap menolak sisanya.
        if (q.type === 'unique_id' || q.type === 'indonesia_region') { skipped.push(`No.${no} (identitas)`); continue; }
        if (q.auto_fill) { skipped.push(`No.${no} (isi-otomatis)`); continue; }
        if (Array.isArray(q.skip_logic) && q.skip_logic.length > 0) { skipped.push(`No.${no} (skip logic)`); continue; }
      }
      if (q.randomize_order === flagValue) { changed += flagValue ? 1 : 0; continue; }
      try {
        await api.put(`/surveys/${id}/questions/${q.id}`, { randomize_order: flagValue });
        changed++;
      } catch (err) {
        // 422 = validator server (mis. berada di dalam interval lompatan).
        skipped.push(`No.${no} (${err.response?.data?.error ? 'ditolak server' : 'gagal'})`);
      }
    }
    await fetchSurvey();
    setRbBusy(false);
    setRbResult({
      ok: true,
      text: flagValue
        ? `${changed} pertanyaan masuk blok acak${skipped.length ? ` · dilewati: ${skipped.join(', ')}` : ''}.`
        : `Blok acak No.${from}–${to} dihapus — urutan kembali normal.`,
    });
  }, [questions, id, fetchSurvey]);

  const applyRandomBlockRange = useCallback(async (flagValue) => {
    const from = parseInt(rbFrom, 10);
    const to = parseInt(rbTo, 10);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > questions.length || from > to) {
      setRbResult({ ok: false, text: `Rentang tidak valid — isi nomor 1 sampai ${questions.length}, "dari" ≤ "sampai".` });
      return;
    }
    await applyRange(from, to, flagValue);
  }, [rbFrom, rbTo, questions.length, applyRange]);

  // Rekap blok terbentuk: deretan pertanyaan bertanda randomize_order yang
  // BERSEBELAHAN = satu blok (persis definisi yang dipakai saat mengocok di
  // aplikasi TPD). Diturunkan langsung dari data — selalu akurat walau tanda
  // dipasang lewat rentang, per-pertanyaan, atau urutan digeser.
  const randomBlocks = useMemo(() => {
    const blocks = [];
    let start = null;
    questions.forEach((q, i) => {
      if (q.randomize_order === true) {
        if (start === null) start = i + 1;
      } else if (start !== null) {
        blocks.push({ from: start, to: i, count: i - start + 1 });
        start = null;
      }
    });
    if (start !== null) blocks.push({ from: start, to: questions.length, count: questions.length - start + 1 });
    return blocks;
  }, [questions]);

  // ── Initialize date picker from survey data ─────────────────────────────────
  useEffect(() => {
    if (survey) {
      // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
      const toLocal = (isoStr) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      setStartDate(toLocal(survey.start_date));
      setEndDate(toLocal(survey.end_date));
      setDateError('');
      setFieldToolsSettings(survey.field_tools_settings || DEFAULT_FIELD_TOOLS_SETTINGS);
      setFormMode(survey.form_mode || 'wizard');
    }
  }, [survey]);

  // ── Date change handlers with validation ────────────────────────────────────
  function handleStartDateChange(value) {
    setStartDate(value);
    if (value && endDate) {
      const s = new Date(value);
      const e = new Date(endDate);
      if (e <= s) {
        setDateError('Tanggal berakhir harus setelah tanggal mulai');
        return;
      }
    }
    setDateError('');
  }

  function handleEndDateChange(value) {
    setEndDate(value);
    if (startDate && value) {
      const s = new Date(startDate);
      const e = new Date(value);
      if (e <= s) {
        setDateError('Tanggal berakhir harus setelah tanggal mulai');
        return;
      }
    }
    setDateError('');
  }

  // ── Save survey dates ───────────────────────────────────────────────────────
  async function handleSaveDates() {
    setActionError(null);

    // Frontend validation
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (e <= s) {
        setDateError('Tanggal berakhir harus setelah tanggal mulai');
        return;
      }
    }
    setDateError('');

    setSavingDates(true);
    try {
      await api.put(`/surveys/${id}`, {
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
      });
      setSuccessMsg('Periode survei berhasil disimpan.');
      fetchSurvey();
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
          err.message ||
          'Gagal menyimpan periode survei.'
      );
    } finally {
      setSavingDates(false);
    }
  }

  // ── Field tools settings handlers ───────────────────────────────────────────
  function handleFieldToolsChange(key, value) {
    setFieldToolsSettings((prev) => ({
      ...(prev || DEFAULT_FIELD_TOOLS_SETTINGS),
      [key]: value,
    }));
  }

  async function handleSaveFieldTools() {
    setActionError(null);
    setSavingFieldTools(true);
    try {
      await api.put(`/surveys/${id}`, {
        field_tools_settings: fieldToolsSettings || DEFAULT_FIELD_TOOLS_SETTINGS,
      });
      setSuccessMsg('Pengaturan field tools berhasil disimpan.');
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Gagal menyimpan pengaturan field tools.'
      );
    } finally {
      setSavingFieldTools(false);
    }
  }

  // ── Save form mode ──────────────────────────────────────────────────────────
  async function handleSaveFormMode(mode) {
    setFormMode(mode);
    setSavingFormMode(true);
    setActionError(null);
    try {
      await api.put(`/surveys/${id}`, { form_mode: mode });
      setSuccessMsg(`Mode formulir berhasil diubah ke "${mode === 'wizard' ? 'Per Pertanyaan' : 'Satu Halaman'}".`);
    } catch (err) {
      setActionError(
        err.response?.data?.error || err.message || 'Gagal menyimpan mode formulir.'
      );
    } finally {
      setSavingFormMode(false);
    }
  }

  // ── Auto-dismiss success message ────────────────────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // ── Delete question ─────────────────────────────────────────────────────────
  async function handleDeleteQuestion(question) {
    setActionError(null);
    try {
      await api.delete(`/surveys/${id}/questions/${question.id}`);
      setSuccessMsg('Pertanyaan berhasil dihapus.');
      setConfirmDeleteId(null);
      fetchSurvey();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal menghapus pertanyaan.'
      );
      setConfirmDeleteId(null);
    }
  }

  // ── Duplicate question (#3) ─────────────────────────────────────────────────
  async function handleDuplicateQuestion(question) {
    setActionError(null);
    try {
      const payload = {
        text: `${question.text} (Salinan)`,
        type: question.type,
        is_required: question.is_required,
        randomize_options: question.randomize_options,
        randomize_order: question.randomize_order === true,
        allow_other: question.allow_other,
        options: question.options,
        skip_logic: null, // skip logic tidak disalin untuk menghindari referensi rusak
      };
      await api.post(`/surveys/${id}/questions`, payload);
      setSuccessMsg('Pertanyaan berhasil diduplikat.');
      fetchSurvey();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal menduplikat pertanyaan.'
      );
    }
  }

  // ── Reorder question ────────────────────────────────────────────────────────
  async function handleReorder(questionId, direction) {
    setActionError(null);
    const sorted = [...questions].sort((a, b) => a.order_index - b.order_index);
    const currentIndex = sorted.findIndex((q) => q.id === questionId);
    if (currentIndex === -1) return;

    const swapIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    // Swap order_index values
    const updated = sorted.map((q, i) => {
      if (i === currentIndex)
        return { ...q, order_index: sorted[swapIndex].order_index };
      if (i === swapIndex)
        return { ...q, order_index: sorted[currentIndex].order_index };
      return q;
    });

    const payload = updated.map((q) => ({
      id: q.id,
      order_index: q.order_index,
    }));

    try {
      await api.patch(`/surveys/${id}/questions/reorder`, {
        order: payload,
      });
      setQuestions(updated.sort((a, b) => a.order_index - b.order_index));
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal mengubah urutan pertanyaan.'
      );
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Back button */}
        <div>
          <button
            onClick={() => navigate('/surveys')}
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 transition-colors focus:outline-none focus:underline"
            aria-label="Kembali ke daftar survei"
          >
            <span aria-hidden="true">←</span> Kembali ke Daftar Survei
          </button>
        </div>

        {loading ? (
          <div
            className="flex items-center justify-center h-48 text-gray-500 text-sm"
            role="status"
            aria-live="polite"
          >
            Memuat data survei…
          </div>
        ) : fetchError ? (
          <div
            className="flex flex-col items-center justify-center h-48 gap-3"
            role="alert"
          >
            <p className="text-red-600 text-sm">{fetchError}</p>
            <button
              onClick={fetchSurvey}
              className="text-sm text-primary-600 underline hover:text-primary-800"
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <>
            {/* Survey header */}
            <div className="bg-white rounded-xl shadow px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-800">
                  {survey?.title}
                </h1>
                {survey?.description && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {survey.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <SurveyStatusBadge status={survey?.status} />
                <a
                  href="/panduan-survei.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
                  title="Buka panduan membuat survei & menyusun pertanyaan (tab baru)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Panduan
                </a>
                <button
                  type="button"
                  onClick={() => setExportOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                  title="Export pertanyaan ke JSON / CSV / Excel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Export
                </button>
                <button
                  onClick={() => {
                    setEditTarget(null);
                    setModalMode('create');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  <span aria-hidden="true">+</span> Tambah Pertanyaan
                </button>
              </div>
            </div>

            {/* Date Picker Section */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <DatePickerSection
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={handleStartDateChange}
                  onEndDateChange={handleEndDateChange}
                  dateError={dateError}
                />
              </div>
              <button
                onClick={handleSaveDates}
                disabled={savingDates || !!dateError}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 shrink-0 self-start mt-8"
              >
                {savingDates ? 'Menyimpan…' : 'Simpan Periode'}
              </button>
            </div>

            {/* Field Tools Settings Section */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <FieldToolsSettingsSection
                  settings={fieldToolsSettings || DEFAULT_FIELD_TOOLS_SETTINGS}
                  onChange={handleFieldToolsChange}
                />
              </div>
              <button
                onClick={handleSaveFieldTools}
                disabled={savingFieldTools}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 shrink-0 self-start mt-8"
              >
                {savingFieldTools ? 'Menyimpan…' : 'Simpan Pengaturan'}
              </button>
            </div>

            {/* Form Mode Toggle */}
            <div className="bg-white rounded-xl shadow px-6 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Mode Tampilan Formulir TPD</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveFormMode('wizard')}
                  disabled={savingFormMode}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                    formMode === 'wizard'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Per Pertanyaan (Wizard)
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveFormMode('scroll')}
                  disabled={savingFormMode}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                    formMode === 'scroll'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Satu Halaman (Scroll)
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {formMode === 'wizard'
                  ? 'TPD melihat satu pertanyaan per halaman dengan navigasi Selanjutnya/Kembali.'
                  : 'TPD melihat semua pertanyaan dalam satu halaman (scroll ke bawah).'}
              </p>
            </div>

            {/* Success message */}
            {successMsg && (
              <div
                className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm"
                role="status"
                aria-live="polite"
              >
                {successMsg}
              </div>
            )}

            {/* Action error */}
            {actionError && (
              <div
                className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"
                role="alert"
              >
                {actionError}
                <button
                  className="ml-3 underline text-red-600 hover:text-red-800 text-xs"
                  onClick={() => setActionError(null)}
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Blok acak via rentang nomor — cara cepat; penyimpanan tetap per-pertanyaan */}
            {questions.length > 1 && (
              <details className="bg-white rounded-xl shadow px-4 py-3">
                <summary className="cursor-pointer select-none text-sm font-semibold text-gray-700">
                  Atur blok acak urutan (rentang nomor)
                  {randomBlocks.length > 0 && (
                    <span className="ml-2 font-normal text-gray-500">
                      — {randomBlocks.length} blok aktif ({randomBlocks.map((b) => `${b.from}–${b.to}`).join(', ')})
                    </span>
                  )}
                </summary>
                <div className="mt-3 space-y-2">
                  {/* Rekap blok terbentuk — jelas mana yang sudah, sisanya normal */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    {randomBlocks.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        Belum ada blok acak — semua pertanyaan tampil urut normal.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {randomBlocks.map((b, i) => (
                          <li key={`${b.from}-${b.to}`} className="flex items-center justify-between gap-3">
                            <span className="text-xs text-gray-700">
                              <span className="font-semibold">Blok {i + 1}:</span>{' '}
                              No. {b.from}{b.to !== b.from ? `–${b.to}` : ''} · {b.count} pertanyaan
                              dikocok urutannya per responden
                            </span>
                            <button
                              type="button"
                              disabled={rbBusy}
                              onClick={() => applyRange(b.from, b.to, false)}
                              title={`Hapus blok No.${b.from}–${b.to} — urutan pertanyaan kembali normal`}
                              className="shrink-0 px-2 py-1 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-medium"
                            >
                              Hapus blok ini
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="text-xs text-gray-500">Dari No.</span>
                      <input type="number" min="1" max={questions.length} value={rbFrom} onChange={(e) => setRbFrom(e.target.value)}
                        className="mt-1 block w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">Sampai No.</span>
                      <input type="number" min="1" max={questions.length} value={rbTo} onChange={(e) => setRbTo(e.target.value)}
                        className="mt-1 block w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </label>
                    <button type="button" disabled={rbBusy} onClick={() => applyRandomBlockRange(true)}
                      className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium">
                      {rbBusy ? 'Menerapkan…' : 'Jadikan blok acak'}
                    </button>
                    <button type="button" disabled={rbBusy} onClick={() => applyRandomBlockRange(false)}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 text-sm font-medium">
                      Hapus tanda di rentang
                    </button>
                  </div>
                  {rbResult && (
                    <p className={`text-xs ${rbResult.ok ? 'text-gray-600' : 'text-red-600'}`}>{rbResult.text}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Pertanyaan identitas, ber-isi-otomatis, dan ber-skip-logic otomatis <b>dilewati</b>.
                    Tanda tersimpan di tiap pertanyaan (badge <b>Blok acak</b>), jadi tetap benar walau
                    urutan digeser atau pertanyaan disisipkan — rentang di sini hanya cara cepat menandai.
                  </p>
                </div>
              </details>
            )}

            {/* Questions list */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              {questions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-500 text-sm">
                  <p>Belum ada pertanyaan.</p>
                  <button
                    onClick={() => {
                      setEditTarget(null);
                      setModalMode('create');
                    }}
                    className="text-primary-600 underline hover:text-primary-800 text-sm"
                  >
                    Tambah pertanyaan pertama
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {questions.map((question, index) => {
                    const isConfirmingDelete =
                      confirmDeleteId === question.id;
                    const isFirst = index === 0;
                    const isLast = index === questions.length - 1;

                    return (
                      <div
                        key={question.id}
                        className="px-5 py-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          {/* Order number */}
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
                            {index + 1}
                          </div>

                          {/* Question content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <TypeBadge type={question.type} />
                              {question.is_required && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                                  Wajib
                                </span>
                              )}
                              {question.randomize_options && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-600">
                                  Acak
                                </span>
                              )}
                              {question.randomize_order && (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600"
                                  title="Masuk blok acak urutan — dikocok per responden bersama pertanyaan ber-tanda sama yang bersebelahan"
                                >
                                  Blok acak
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-800 leading-snug">
                              {question.text}
                            </p>
                            {/* Options preview — HANYA untuk tipe pilihan. Pertanyaan
                                yang diubah tipenya (mis. pilihan → teks) bisa masih
                                menyimpan array opsi sisa; jangan tampilkan "N pilihan
                                jawaban" pada tipe yang tidak memakai opsi (membingungkan). */}
                            {(question.type === 'single_choice' || question.type === 'multiple_choice') &&
                              Array.isArray(question.options) &&
                              question.options.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {question.options.length} pilihan jawaban
                                </p>
                              )}
                            {/* Skip logic preview + tooltip/peringatan */}
                            <SkipLogicHint question={question} questions={questions} />
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {/* Reorder up */}
                            <IconButton
                              icon="moveUp"
                              variant="default"
                              label={`Pindah pertanyaan ${index + 1} ke atas`}
                              onClick={() => handleReorder(question.id, 'up')}
                              disabled={isFirst}
                            />

                            {/* Reorder down */}
                            <IconButton
                              icon="moveDown"
                              variant="default"
                              label={`Pindah pertanyaan ${index + 1} ke bawah`}
                              onClick={() => handleReorder(question.id, 'down')}
                              disabled={isLast}
                            />

                            {/* Edit */}
                            <IconButton
                              icon="edit"
                              variant="primary"
                              label={`Edit pertanyaan ${index + 1}`}
                              onClick={() => {
                                setEditTarget(question);
                                setModalMode('edit');
                              }}
                            />

                            {/* Duplicate (#3) */}
                            <IconButton
                              icon="duplicate"
                              variant="success"
                              label={`Duplikat pertanyaan ${index + 1}`}
                              onClick={() => handleDuplicateQuestion(question)}
                            />

                            {/* Delete with confirmation */}
                            {isConfirmingDelete ? (
                              <span className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-600">
                                  Hapus?
                                </span>
                                <button
                                  onClick={() =>
                                    handleDeleteQuestion(question)
                                  }
                                  className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                  aria-label={`Konfirmasi hapus pertanyaan ${index + 1}`}
                                >
                                  Ya
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                                  aria-label="Batal hapus"
                                >
                                  Batal
                                </button>
                              </span>
                            ) : (
                              <IconButton
                                icon="trash"
                                variant="danger"
                                label={`Hapus pertanyaan ${index + 1}`}
                                onClick={() => setConfirmDeleteId(question.id)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Question Form Modal */}
      {modalMode && (
        <QuestionFormModal
          mode={modalMode}
          initial={editTarget}
          surveyId={id}
          questions={questions}
          onClose={() => {
            setModalMode(null);
            setEditTarget(null);
          }}
          onSaved={() => {
            setModalMode(null);
            setEditTarget(null);
            setSuccessMsg(
              modalMode === 'edit'
                ? 'Pertanyaan berhasil diperbarui.'
                : 'Pertanyaan berhasil ditambahkan.'
            );
            fetchSurvey();
          }}
        />
      )}

      {exportOpen && survey && (
        <ExportQuestionnaireModal
          survey={survey}
          onClose={() => setExportOpen(false)}
        />
      )}
    </Layout>
  );
}

export default SurveyBuilder;
