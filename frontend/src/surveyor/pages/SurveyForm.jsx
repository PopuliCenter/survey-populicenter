/**
 * SurveyForm.jsx
 *
 * Survey form page for the TPD Interface.
 * Renders all question types, evaluates skip logic in real-time,
 * randomises option order where configured, validates required questions,
 * requests geolocation on submit, and posts the completed response.
 *
 * Route: /surveyor/survey/:id
 *
 * Requirements: 9.1, 9.5, 9.6, 4.4, 5.2, 5.3, 5.4, 6.2, 16.1
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../../services/api';
import useSkipLogic from '../hooks/useSkipLogic';
import useGeolocation from '../hooks/useGeolocation';
import useSyncManager from '../hooks/useSyncManager';
import useAudioRecorder from '../hooks/useAudioRecorder';
import usePhotoCapture from '../hooks/usePhotoCapture';
import useSignaturePad from '../hooks/useSignaturePad';
import { getDisplayOptions } from '../../utils/randomizeOptions';
import { validateAnswer } from '../../utils/answerValidation';
import { cacheSurvey, getCachedSurvey, enqueueResponse, saveMediaFile } from '../../utils/storage';
import { compressIfNeeded } from '../../utils/imageCompressor';
import OfflineStatusBar from '../../components/OfflineStatusBar';
import AudioRecorderPanel from '../components/AudioRecorderPanel';
import PhotoCapturePanel from '../components/PhotoCapturePanel';
import SignaturePadCanvas from '../components/SignaturePadCanvas';

// ─── Field Tools Settings ─────────────────────────────────────────────────────

/**
 * Default field tools settings — all required.
 * Used as fallback when survey has no field_tools_settings (backward compatibility).
 */
const DEFAULT_FIELD_TOOLS = {
  signature_mode: 'required',
  audio_mode: 'required',
  photo_mode: 'required',
  gps_mode: 'required',
};

// ─── Wilayah Indonesia ────────────────────────────────────────────────────────

let cachedRegionData = null;
/**
 * Lazy-load data wilayah Indonesia dari file JSON publik via fetch.
 * Di-cache setelah pertama kali dimuat agar tidak membebani memori.
 * File disimpan di /public/wilayahIndonesia.json (tidak di-bundle ke JS).
 */
async function loadRegionData() {
  if (cachedRegionData) return cachedRegionData;
  const res = await fetch('/wilayahIndonesia.json');
  if (!res.ok) throw new Error('Gagal memuat data wilayah');
  cachedRegionData = await res.json();
  return cachedRegionData;
}

/**
 * Komponen input untuk pertanyaan indonesia_region.
 * Menampilkan dropdown wilayah berjenjang sesuai konfigurasi depth:
 *   - 'province'  → hanya Provinsi
 *   - 'regency'   → Provinsi + Kabupaten/Kota
 *   - 'district'  → Provinsi + Kabupaten/Kota + Kecamatan
 *   - 'village'   → Provinsi + Kabupaten/Kota + Kecamatan + Desa/Kelurahan (default)
 *
 * Data dimuat dari file JSON lokal (tidak memerlukan API call).
 * Jawaban disimpan sebagai objek: { province_id, province_name, regency_id, ... }
 *
 * @param {{ question: object, answer: object, onChange: function, hasError: boolean }} props
 */
function IndonesiaRegionField({ question, answer = {}, onChange, hasError }) {
  const [regionData, setRegionData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ambil konfigurasi depth dari options pertanyaan (default: 'village' = lengkap)
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const depth = config.depth || 'village';

  const showRegency = depth === 'regency' || depth === 'district' || depth === 'village';
  const showDistrict = depth === 'district' || depth === 'village';
  const showVillage = depth === 'village';

  useEffect(() => {
    let active = true;
    loadRegionData()
      .then((data) => {
        if (!active) return;
        setRegionData(data);
      })
      .catch(() => {
        if (!active) return;
        setRegionData({ provinces: [], regenciesByProvince: {}, districtsByRegency: {}, villagesByDistrict: {} });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const provinceOptions = regionData?.provinces || [];
  const regencyOptions = regionData?.regenciesByProvince?.[answer.province_id] || [];
  const districtOptions = regionData?.districtsByRegency?.[answer.regency_id] || [];
  const villageOptions = regionData?.villagesByDistrict?.[answer.district_id] || [];

  function handleSelect(field, value, label) {
    const nextAnswer = {
      ...answer,
      [field]: value,
      [field.replace('_id', '_name')]: label,
    };
    // Reset downstream fields when parent changes
    if (field === 'province_id') {
      nextAnswer.regency_id = '';
      nextAnswer.regency_name = '';
      nextAnswer.district_id = '';
      nextAnswer.district_name = '';
      nextAnswer.village_id = '';
      nextAnswer.village_name = '';
    }
    if (field === 'regency_id') {
      nextAnswer.district_id = '';
      nextAnswer.district_name = '';
      nextAnswer.village_id = '';
      nextAnswer.village_name = '';
    }
    if (field === 'district_id') {
      nextAnswer.village_id = '';
      nextAnswer.village_name = '';
    }
    onChange(nextAnswer);
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Memuat data wilayah Indonesia…</p>;
  }

  const selectClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed';

  return (
    <div className={`${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Provinsi — selalu tampil */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provinsi</label>
          <select
            value={answer.province_id || ''}
            onChange={(e) => {
              const sel = provinceOptions.find((o) => o.id === e.target.value);
              handleSelect('province_id', e.target.value, sel?.name || '');
            }}
            className={selectClass}
            aria-label="Pilih provinsi"
          >
            <option value="">— Pilih provinsi —</option>
            {provinceOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Kabupaten/Kota */}
        {showRegency && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kabupaten/Kota</label>
            <select
              value={answer.regency_id || ''}
              onChange={(e) => {
                const sel = regencyOptions.find((o) => o.id === e.target.value);
                handleSelect('regency_id', e.target.value, sel?.name || '');
              }}
              disabled={!answer.province_id}
              className={selectClass}
              aria-label="Pilih kabupaten/kota"
            >
              <option value="">— Pilih kabupaten/kota —</option>
              {regencyOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Kecamatan */}
        {showDistrict && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kecamatan</label>
            <select
              value={answer.district_id || ''}
              onChange={(e) => {
                const sel = districtOptions.find((o) => o.id === e.target.value);
                handleSelect('district_id', e.target.value, sel?.name || '');
              }}
              disabled={!answer.regency_id}
              className={selectClass}
              aria-label="Pilih kecamatan"
            >
              <option value="">— Pilih kecamatan —</option>
              {districtOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Desa/Kelurahan */}
        {showVillage && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desa/Kelurahan</label>
            <select
              value={answer.village_id || ''}
              onChange={(e) => {
                const sel = villageOptions.find((o) => o.id === e.target.value);
                handleSelect('village_id', e.target.value, sel?.name || '');
              }}
              disabled={!answer.district_id}
              className={selectClass}
              aria-label="Pilih desa/kelurahan"
            >
              <option value="">— Pilih desa/kelurahan —</option>
              {villageOptions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a small mode label for a field tool.
 * Shows "(Opsional)" or "(Wajib)" based on mode.
 *
 * @param {{ mode: 'required' | 'optional' | 'disabled' }} props
 */
function FieldToolModeLabel({ mode }) {
  if (mode === 'optional') return <span className="text-xs text-gray-500 ml-1">(Opsional)</span>;
  if (mode === 'required') return <span className="text-xs text-gray-500 ml-1">(Wajib)</span>;
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the initial (empty) answers map from a list of questions.
 * @param {Array} questions
 * @returns {Object.<string, any>}
 */
function buildEmptyAnswers(questions) {
  const map = {};
  for (const q of questions) {
    if (q.type === 'multiple_choice') {
      map[q.id] = [];
    } else if (q.type === 'matrix' || q.type === 'indonesia_region') {
      map[q.id] = {};
    } else {
      map[q.id] = '';
    }
  }
  return map;
}

/**
 * Convert the answers map to the API payload format.
 * @param {Array} questions
 * @param {Object} answers
 * @param {Object} photoPaths  Map of question_id → uploaded path
 * @returns {Array}
 */
function buildAnswersPayload(questions, answers, photoPaths) {
  return questions.map((q) => {
    if (q.type === 'photo') {
      return { question_id: q.id, photo_path: photoPaths[q.id] || null };
    }
    if (q.type === 'multiple_choice') {
      return { question_id: q.id, answer_json: answers[q.id] || [] };
    }
    if (q.type === 'matrix' || q.type === 'indonesia_region') {
      return { question_id: q.id, answer_json: answers[q.id] || {} };
    }
    return { question_id: q.id, answer_value: answers[q.id] ?? '' };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Komponen input untuk pertanyaan rating_scale.
 * Mendukung mode tampilan "stars" dan "numbers".
 *
 * @param {{ question: object, answer: string, onChange: function, hasError: boolean }} props
 */
function RatingScaleField({ question, answer, onChange, hasError }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { min = 1, max = 5, display = 'stars', labels = {} } = config;
  const selectedValue = answer ? parseInt(answer, 10) : null;

  const values = [];
  for (let i = min; i <= max; i++) values.push(i);

  if (display === 'stars') {
    return (
      <div className={`space-y-2 ${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={`Rating bintang untuk: ${question.text}`}
        >
          {values.map((val) => {
            const filled = selectedValue !== null && val <= selectedValue;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onChange(String(val))}
                className={`text-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 rounded ${
                  filled ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'
                }`}
                aria-label={`Beri rating ${val} dari ${max}`}
                aria-pressed={selectedValue === val}
              >
                ★
              </button>
            );
          })}
          {selectedValue !== null && (
            <span className="ml-2 text-sm text-gray-500">{selectedValue}/{max}</span>
          )}
        </div>
        {(labels.min || labels.max) && (
          <div className="flex justify-between text-xs text-gray-400 px-1">
            <span>{labels.min || ''}</span>
            <span>{labels.max || ''}</span>
          </div>
        )}
      </div>
    );
  }

  // display === 'numbers'
  return (
    <div className={`space-y-2 ${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={`Rating angka untuk: ${question.text}`}
      >
        {values.map((val) => {
          const isSelected = selectedValue === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onChange(String(val))}
              className={`w-10 h-10 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700'
              }`}
              aria-label={`Pilih nilai ${val}`}
              aria-pressed={isSelected}
            >
              {val}
            </button>
          );
        })}
      </div>
      {(labels.min || labels.max) && (
        <div className="flex justify-between text-xs text-gray-400">
          <span>{labels.min || ''}</span>
          <span>{labels.max || ''}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Komponen input untuk pertanyaan phone_number.
 * Hanya menerima karakter digit (0-9).
 *
 * @param {{ question: object, answer: string, onChange: function, hasError: boolean }} props
 */
function PhoneNumberField({ question, answer, onChange, hasError }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { min_length = 10, max_length = 13 } = config;

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(digits);
  }

  const currentLength = (answer || '').length;
  const isValidLength = currentLength >= min_length && currentLength <= max_length;

  return (
    <div className="space-y-1">
      <input
        type="tel"
        inputMode="numeric"
        value={answer || ''}
        onChange={handleChange}
        maxLength={max_length}
        placeholder="Masukkan nomor telepon"
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
          hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
        aria-label={`Nomor telepon untuk: ${question.text}`}
      />
      {currentLength > 0 && !isValidLength && (
        <p className="text-xs text-amber-600">
          Masukkan {min_length}-{max_length} digit angka ({currentLength} digit saat ini)
        </p>
      )}
    </div>
  );
}

/**
 * Komponen input untuk pertanyaan unique_id.
 * Jika admin sudah menugaskan nomor kuesioner (assignedNumbers), tampilkan dropdown.
 * Jika tidak, tampilkan input bebas digit (0-9) dengan indikator ketersediaan real-time.
 *
 * @param {{ question: object, answer: string, onChange: function, hasError: boolean, surveyId: string, isOnline: boolean, assignedNumbers: string[]|null, usedNumbers: string[] }} props
 */
function UniqueIdField({ question, answer, onChange, hasError, surveyId, isOnline, assignedNumbers, usedNumbers }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { min_length, max_length } = config;

  const [availability, setAvailability] = useState(null);
  const debounceRef = useRef(null);

  const usedSet = useMemo(() => new Set(usedNumbers || []), [usedNumbers]);

  // Jika ada assigned_numbers dari admin, tampilkan dropdown
  if (assignedNumbers && Array.isArray(assignedNumbers) && assignedNumbers.length > 0) {
    const availableNumbers = assignedNumbers.filter((num) => !usedSet.has(num));

    return (
      <div className="space-y-3">
        {/* Info status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-600">
            {availableNumbers.length} dari {assignedNumbers.length} nomor tersedia
          </span>
          {!isOnline && (
            <span className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
              📱 Data offline
            </span>
          )}
        </div>

        {/* Daftar visual nomor — klik untuk memilih */}
        <div className="flex flex-wrap gap-2">
          {assignedNumbers.map((num) => {
            const isUsed = usedSet.has(num);
            const isSelected = answer === num;
            let badgeClass, icon, label;
            if (isSelected) {
              badgeClass = 'bg-blue-100 text-blue-800 border-blue-400 ring-2 ring-blue-400 shadow-sm';
              icon = '●';
              label = 'Terpilih';
            } else if (isUsed) {
              badgeClass = 'bg-green-50 text-green-700 border-green-300 cursor-not-allowed';
              icon = '✓';
              label = 'Sudah diisi';
            } else {
              badgeClass = 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300 cursor-pointer';
              icon = '○';
              label = 'Belum diisi — ketuk untuk memilih';
            }
            return (
              <button
                key={num}
                type="button"
                disabled={isUsed}
                onClick={() => !isUsed && onChange(num)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all min-w-[48px] min-h-[44px] ${badgeClass}`}
                title={`Nomor ${num}: ${label}`}
                aria-label={`Nomor ${num}: ${label}`}
              >
                <span className="text-base">{icon}</span>
                {num}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 pt-1 border-t border-gray-100">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Sudah diisi
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Terpilih
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" /> Tersedia
          </span>
        </div>

        {availableNumbers.length === 0 && (
          <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Semua nomor kuesioner sudah diisi.
          </p>
        )}
      </div>
    );
  }

  // Fallback: input bebas (tidak ada assigned_numbers dari admin)
  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(digits);

    if (!isOnline) {
      setAvailability(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (digits.length > 0) {
      setAvailability('checking');
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await api.post('/responses/check-unique', {
            survey_id: surveyId,
            question_id: question.id,
            value: digits,
          });
          setAvailability(res.data.available ? 'available' : 'taken');
        } catch {
          setAvailability(null);
        }
      }, 500);
    } else {
      setAvailability(null);
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-1">
      <input
        type="text"
        inputMode="numeric"
        value={answer || ''}
        onChange={handleChange}
        maxLength={max_length || undefined}
        placeholder="Masukkan nomor kuesioner"
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
          hasError || availability === 'taken' ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
        aria-label={`Nomor kuesioner untuk: ${question.text}`}
      />
      {!isOnline && (
        <p className="text-xs text-amber-600">Validasi ketersediaan nomor akan dilakukan saat sinkronisasi</p>
      )}
      {isOnline && availability === 'checking' && (
        <p className="text-xs text-gray-400">Memeriksa ketersediaan...</p>
      )}
      {isOnline && availability === 'available' && (
        <p className="text-xs text-green-600">Nomor tersedia</p>
      )}
      {isOnline && availability === 'taken' && (
        <p className="text-xs text-red-600">Nomor sudah digunakan</p>
      )}
      {min_length && max_length && (answer || '').length > 0 &&
        ((answer || '').length < min_length || (answer || '').length > max_length) && (
          <p className="text-xs text-amber-600">
            Masukkan {min_length}-{max_length} digit angka
          </p>
        )}
    </div>
  );
}

/**
 * Komponen input untuk pertanyaan date dengan konfigurasi min/max opsional.
 * Backward compatible — jika tidak ada konfigurasi min/max, berfungsi seperti input date biasa.
 *
 * @param {{ question: object, answer: string, onChange: function, hasError: boolean }} props
 */
function DatePickerField({ question, answer, onChange, hasError }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { min_date, max_date } = config;

  const baseInputClass =
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors';
  const errorBorder = hasError ? 'border-red-400 bg-red-50' : 'border-gray-300';

  // Check if the current value is out of range
  let rangeError = null;
  if (answer) {
    if (min_date && answer < min_date) {
      rangeError = `Tanggal harus tidak lebih awal dari ${min_date}`;
    } else if (max_date && answer > max_date) {
      rangeError = `Tanggal harus tidak lebih dari ${max_date}`;
    }
  }

  return (
    <div className="space-y-1">
      <input
        type="date"
        value={answer || ''}
        onChange={(e) => onChange(e.target.value)}
        min={min_date || undefined}
        max={max_date || undefined}
        className={`${baseInputClass} ${errorBorder} max-w-xs`}
        aria-label={`Tanggal untuk: ${question.text}`}
      />
      {rangeError && (
        <p className="text-xs text-red-500">{rangeError}</p>
      )}
    </div>
  );
}

/**
 * Komponen input untuk pertanyaan time (format 24 jam HH:mm).
 *
 * @param {{ question: object, answer: string, onChange: function, hasError: boolean }} props
 */
function TimePickerField({ question, answer, onChange, hasError }) {
  const baseInputClass =
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors';
  const errorBorder = hasError ? 'border-red-400 bg-red-50' : 'border-gray-300';

  return (
    <input
      type="time"
      value={answer || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`${baseInputClass} ${errorBorder} max-w-xs`}
      aria-label={`Waktu untuk: ${question.text}`}
    />
  );
}

/**
 * Komponen input untuk pertanyaan matrix/grid.
 * Tabel HTML dengan radio button per baris (satu pilihan per baris).
 * Responsive dengan horizontal scroll pada layar kecil.
 * Kolom pertama (label baris) di-freeze/sticky agar tidak terpotong di mobile.
 *
 * @param {{ question: object, answer: object, onChange: function, hasError: boolean }} props
 */
function MatrixField({ question, answer, onChange, hasError }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { rows = [], columns = [] } = config;
  const value = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};

  // Determine which rows are unanswered (for error highlighting)
  const unansweredRows = hasError
    ? rows.filter((row) => !value[row])
    : [];

  function handleSelect(row, col) {
    const updated = { ...value, [row]: col };
    onChange(updated);
  }

  return (
    <div
      className={`${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}
    >
      {/* Petunjuk scroll untuk mobile */}
      {columns.length > 3 && (
        <p className="text-xs text-gray-400 mb-1 md:hidden">← Geser ke kanan untuk melihat semua kolom</p>
      )}
      {/* Wrapper dengan overflow-x-auto dan max-height untuk freeze header */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-sm border-collapse" style={{ minWidth: `${120 + columns.length * 90}px` }}>
          <thead>
            <tr className="bg-gray-50">
              {/* Kolom pertama (label baris) — sticky kiri */}
              <th
                className="text-left p-2 border-b border-gray-200 text-gray-500 font-medium bg-gray-50"
                style={{ position: 'sticky', left: 0, zIndex: 2, minWidth: '120px', maxWidth: '180px' }}
              />
              {columns.map((col) => (
                <th
                  key={col}
                  className="text-center p-2 border-b border-gray-200 text-gray-600 font-medium bg-gray-50"
                  style={{ minWidth: '80px' }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isUnanswered = unansweredRows.includes(row);
              return (
                <tr
                  key={row}
                  className={`${isUnanswered ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors`}
                >
                  {/* Label baris — sticky kiri agar tidak terpotong saat scroll horizontal */}
                  <td
                    className={`p-2 border-b border-gray-100 text-gray-700 font-medium text-sm ${isUnanswered ? 'bg-red-50' : 'bg-white'}`}
                    style={{ position: 'sticky', left: 0, zIndex: 1, minWidth: '120px', maxWidth: '180px' }}
                  >
                    <span className="block truncate" title={row}>{row}</span>
                    {isUnanswered && (
                      <span className="text-red-500 ml-1 text-xs">*</span>
                    )}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="text-center p-2 border-b border-gray-100">
                      <input
                        type="radio"
                        name={`matrix_${question.id}_${row}`}
                        checked={value[row] === col}
                        onChange={() => handleSelect(row, col)}
                        className="accent-blue-600 w-5 h-5"
                        aria-label={`${row}: ${col}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasError && unansweredRows.length > 0 && (
        <p className="text-xs text-red-500 mt-1">Semua baris wajib dijawab</p>
      )}
    </div>
  );
}

/**
 * Renders a single question based on its type.
 */
function QuestionField({ question, answer, onChange, hasError, displayOptions, surveyId, isOnline, assignedNumbers, usedNumbers }) {
  const baseInputClass =
    'w-full border rounded-lg px-3 py-2 text-base leading-6 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors';
  const errorBorder = hasError ? 'border-red-400 bg-red-50' : 'border-gray-300';

  switch (question.type) {
    case 'single_choice':
      return (
        <div className={`space-y-2 ${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}>
          {displayOptions.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-gray-50"
            >
              <input
                type="radio"
                name={`q_${question.id}`}
                value={opt.value}
                checked={answer === opt.value || (answer && answer.startsWith && answer.startsWith('__other__:') && opt.value === '__other__')}
                onChange={() => onChange(opt.value)}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-800">{opt.label}</span>
            </label>
          ))}
          {question.allow_other && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`q_${question.id}`}
                  value="__other__"
                  checked={answer && answer.startsWith && answer.startsWith('__other__:')}
                  onChange={() => onChange('__other__:')}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700">Lainnya</span>
              </label>
              {answer && answer.startsWith && answer.startsWith('__other__:') && (
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  value={answer.replace('__other__:', '')}
                  onChange={(e) => onChange(`__other__:${e.target.value.toUpperCase()}`)}
                  placeholder="Ketik jawaban lainnya…"
                  className="ml-6 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={{ textTransform: 'uppercase' }}
                  autoFocus
                />
              )}
            </div>
          )}
        </div>
      );

    case 'multiple_choice':
      return (
        <div className={`space-y-2 ${hasError ? 'p-2 rounded-lg border border-red-400 bg-red-50' : ''}`}>
          {displayOptions.map((opt) => {
            const checked = Array.isArray(answer) && answer.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  value={opt.value}
                  checked={checked}
                  onChange={(e) => {
                    const current = Array.isArray(answer) ? answer : [];
                    if (e.target.checked) {
                      onChange([...current, opt.value]);
                    } else {
                      onChange(current.filter((v) => v !== opt.value));
                    }
                  }}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-800">{opt.label}</span>
              </label>
            );
          })}
          {question.allow_other && (() => {
            const currentArr = Array.isArray(answer) ? answer : [];
            const otherEntry = currentArr.find((v) => v.startsWith('__other__:'));
            const otherChecked = !!otherEntry;
            return (
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={otherChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChange([...currentArr, '__other__:']);
                      } else {
                        onChange(currentArr.filter((v) => !v.startsWith('__other__:')));
                      }
                    }}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Lainnya</span>
                </label>
                {otherChecked && (
                  <input
                    type="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    value={(otherEntry || '').replace('__other__:', '')}
                    onChange={(e) => {
                      const updated = currentArr.map((v) =>
                        v.startsWith('__other__:') ? `__other__:${e.target.value.toUpperCase()}` : v
                      );
                      onChange(updated);
                    }}
                    placeholder="Ketik jawaban lainnya…"
                    className="ml-6 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    style={{ textTransform: 'uppercase' }}
                    autoFocus
                  />
                )}
              </div>
            );
          })()}
        </div>
      );

    case 'short_text':
      return (
        <input
          type="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck="false"
          value={answer || ''}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className={`${baseInputClass} ${errorBorder}`}
          placeholder="Ketik jawaban di sini…"
          style={{ textTransform: 'uppercase' }}
        />
      );

    case 'long_text':
      return (
        <textarea
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck="false"
          value={answer || ''}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          rows={4}
          className={`${baseInputClass} ${errorBorder} resize-y`}
          placeholder="Ketik jawaban di sini…"
          style={{ textTransform: 'uppercase' }}
        />
      );

    case 'numeric_scale':
      return (
        <input
          type="number"
          value={answer || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInputClass} ${errorBorder} max-w-xs`}
          placeholder="Masukkan angka…"
        />
      );

    case 'date':
      return (
        <DatePickerField
          question={question}
          answer={answer}
          onChange={onChange}
          hasError={hasError}
        />
      );

    case 'time':
      return (
        <TimePickerField
          question={question}
          answer={answer}
          onChange={onChange}
          hasError={hasError}
        />
      );

    case 'photo':
      return (
        <div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => onChange(e.target.files?.[0] || null)}
            className={`block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 ${hasError ? 'border border-red-400 rounded-lg p-1 bg-red-50' : ''}`}
          />
          {hasError && (
            <p className="text-xs text-red-500 mt-1">Foto wajib diunggah</p>
          )}
        </div>
      );

    case 'rating_scale':
      return (
        <RatingScaleField
          question={question}
          answer={answer}
          onChange={onChange}
          hasError={hasError}
        />
      );

    case 'phone_number':
      return (
        <PhoneNumberField
          question={question}
          answer={answer}
          onChange={onChange}
          hasError={hasError}
        />
      );

    case 'unique_id':
      return (
        <UniqueIdField
          question={question}
          answer={answer}
          onChange={onChange}
          hasError={hasError}
          surveyId={surveyId}
          isOnline={isOnline}
          assignedNumbers={assignedNumbers}
          usedNumbers={usedNumbers}
        />
      );

    case 'matrix':
      return (
        <MatrixField
          question={question}
          answer={answer}
          onChange={onChange}
          hasError={hasError}
        />
      );

    case 'indonesia_region':
      return (
        <IndonesiaRegionField
          question={question}
          answer={answer && typeof answer === 'object' ? answer : {}}
          onChange={onChange}
          hasError={hasError}
        />
      );

    default:
      return (
        <input
          type="text"
          value={answer || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInputClass} ${errorBorder}`}
        />
      );
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

function SurveyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getLocation } = useGeolocation();

  // Nomor kuesioner yang dipilih dari Daftar Survei (jika ada). Disimpan di ref
  // agar stabil sepanjang masa hidup form (tidak ikut berubah saat re-render).
  const preselectedNumberRef = useRef(location.state?.preselectedNumber ?? null);
  // Penanda agar lompatan langkah hanya dilakukan sekali.
  const preselectJumpedRef = useRef(false);

  /**
   * Terapkan nomor kuesioner terpilih ke jawaban pertanyaan unique_id (jika ada).
   * @param {Array} qs - daftar pertanyaan
   * @param {Object} base - peta jawaban kosong
   * @returns {Object} peta jawaban dengan nomor terisi
   */
  function applyPreselectedNumber(qs, base) {
    const pre = preselectedNumberRef.current;
    if (pre == null) return base;
    const uq = qs.find((q) => q.type === 'unique_id');
    return uq ? { ...base, [uq.id]: String(pre) } : base;
  }

  // ─── Offline support ────────────────────────────────────────────────────────
  const { isOnline, isSyncing, pendingCount } = useSyncManager();

  // ─── Field tools hooks ──────────────────────────────────────────────────────
  const audioRecorder = useAudioRecorder();
  const photoCapture = usePhotoCapture();
  const signaturePad = useSignaturePad();

  // ─── Start geolocation ──────────────────────────────────────────────────────
  const [startGeo, setStartGeo] = useState(null);

  // ─── Signature validation ───────────────────────────────────────────────────
  const [signatureError, setSignatureError] = useState(false);

  // ─── Survey data ────────────────────────────────────────────────────────────
  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingError, setLoadingError] = useState(null);
  const [loading, setLoading] = useState(true);

  // ─── Field tools settings (derived from survey, with backward-compat fallback) ─
  const fieldToolsSettings = survey?.field_tools_settings || DEFAULT_FIELD_TOOLS;

  // ─── Form mode (wizard or scroll) ──────────────────────────────────────────
  const formMode = survey?.form_mode || 'wizard';

  // ─── Session token (from /responses/start) ──────────────────────────────────
  const sessionTokenRef = useRef(null);

  // ─── Answers state ──────────────────────────────────────────────────────────
  const [answers, setAnswers] = useState({});

  // ─── Photo upload state ─────────────────────────────────────────────────────
  // Map of question_id → uploaded server path
  const [photoPaths, setPhotoPaths] = useState({});
  // Map of question_id → uploading boolean
  const [uploadingPhoto, setUploadingPhoto] = useState({});

  // ─── Validation errors ──────────────────────────────────────────────────────
  const [errorQuestionIds, setErrorQuestionIds] = useState(new Set());

  // ─── Answer validation errors (separate from required-field errors) ─────────
  const [validationErrors, setValidationErrors] = useState({});

  // ─── Submit state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [mediaUploadMessage, setMediaUploadMessage] = useState('');

  // ─── Randomised display options (stable per mount) ──────────────────────────
  // We compute shuffled options once when questions load and keep them stable
  // so the order doesn't change as the user fills in the form.
  const [displayOptionsMap, setDisplayOptionsMap] = useState({});

  // ─── Assigned questionnaire numbers (from admin) ────────────────────────────
  const [assignedNumbers, setAssignedNumbers] = useState(null); // string[] | null
  const [usedNumbers, setUsedNumbers] = useState([]); // string[]

  // ─── Skip logic ─────────────────────────────────────────────────────────────
  const { visibleQuestions } = useSkipLogic(questions, answers);

  // ─── Wizard navigation ────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0); // index into visibleQuestions
  const [showOverview, setShowOverview] = useState(false); // grid overview mode

  // Clamp currentStep when visibleQuestions changes (e.g. skip logic hides questions)
  useEffect(() => {
    if (currentStep >= visibleQuestions.length && visibleQuestions.length > 0) {
      setCurrentStep(visibleQuestions.length - 1);
    }
  }, [visibleQuestions.length, currentStep]);

  // ─── Pertanyaan unique_id (nomor kuesioner) + nomor saat ini ────────────────
  const uniqueIdQuestion = useMemo(
    () => questions.find((q) => q.type === 'unique_id') || null,
    [questions]
  );
  const currentQuestionnaireNumber = uniqueIdQuestion ? (answers[uniqueIdQuestion.id] || '') : '';

  // Jika TPD memilih nomor dari Daftar Survei, lompat ke pertanyaan SETELAH
  // pertanyaan nomor kuesioner (sekali saja, setelah daftar pertanyaan siap).
  useEffect(() => {
    if (preselectJumpedRef.current) return;
    if (preselectedNumberRef.current == null || visibleQuestions.length === 0) return;
    preselectJumpedRef.current = true;
    if (!uniqueIdQuestion) return;
    const idx = visibleQuestions.findIndex((q) => q.id === uniqueIdQuestion.id);
    if (idx >= 0) {
      setCurrentStep(Math.min(idx + 1, visibleQuestions.length - 1));
    }
  }, [visibleQuestions, uniqueIdQuestion]);

  // ─── Load survey + start session ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadingError(null);

      // Selalu coba online dulu, fallback ke cache jika gagal
      // (navigator.onLine unreliable di Capacitor WebView)
      try {
        // ─── Online mode: fetch from API ────────────────────────────────
        // Start response session — records start_time on server (Requirement 15.1)
        const startRes = await api.post('/responses/start', { survey_id: id });
        if (!cancelled) {
          sessionTokenRef.current = startRes.data.session_token;
        }

        // Fetch survey details + questions
        const surveyRes = await api.get(`/surveys/${id}`);
        if (!cancelled) {
          const surveyData = surveyRes.data;
          setSurvey(surveyData);

          const qs = surveyData.questions || [];
          setQuestions(qs);
          setAnswers(applyPreselectedNumber(qs, buildEmptyAnswers(qs)));

          // Compute stable randomised display options for choice questions
          const optMap = {};
          for (const q of qs) {
            if (
              (q.type === 'single_choice' || q.type === 'multiple_choice') &&
              Array.isArray(q.options)
            ) {
              optMap[q.id] = getDisplayOptions(q.options, q.randomize_options === true);
            }
          }
          setDisplayOptionsMap(optMap);

          // Cache survey data for offline use (termasuk assigned numbers)
          await cacheSurvey(surveyData);

          // Fetch assigned questionnaire numbers for this TPD
          try {
            const assignedRes = await api.get(`/responses/assigned-numbers/${id}`);
            if (!cancelled) {
              const an = assignedRes.data.assigned_numbers || null;
              const un = assignedRes.data.used_numbers || [];
              setAssignedNumbers(an);
              setUsedNumbers(un);
              // Simpan ke cache agar tersedia offline
              try {
                const cachedSurvey = await getCachedSurvey(id);
                if (cachedSurvey) {
                  await cacheSurvey({ ...cachedSurvey, _assignedNumbers: an, _usedNumbers: un });
                }
              } catch { /* non-critical */ }
            }
          } catch {
            // Non-critical — coba ambil dari cache
            try {
              const cachedSurvey = await getCachedSurvey(id);
              if (!cancelled && cachedSurvey && cachedSurvey._assignedNumbers) {
                setAssignedNumbers(cachedSurvey._assignedNumbers);
                setUsedNumbers(cachedSurvey._usedNumbers || []);
              }
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        // API gagal — coba offline fallback dari cache
        if (!err.response) {
          // Network error — coba cache
          try {
            const cached = await getCachedSurvey(id);
            if (!cancelled) {
              if (cached) {
                setSurvey(cached);
                const qs = cached.questions || [];
                setQuestions(qs);
                setAnswers(applyPreselectedNumber(qs, buildEmptyAnswers(qs)));
                const optMap = {};
                for (const q of qs) {
                  if ((q.type === 'single_choice' || q.type === 'multiple_choice') && Array.isArray(q.options)) {
                    optMap[q.id] = getDisplayOptions(q.options, q.randomize_options === true);
                  }
                }
                setDisplayOptionsMap(optMap);
                // Load assigned numbers dari cache
                if (cached._assignedNumbers) {
                  setAssignedNumbers(cached._assignedNumbers);
                  setUsedNumbers(cached._usedNumbers || []);
                }
              } else {
                setLoadingError('Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu.');
              }
            }
          } catch {
            if (!cancelled) setLoadingError('Gagal memuat data survei dari cache.');
          }
        } else {
          // Server error (4xx/5xx)
          if (!cancelled) {
            setLoadingError(err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ─── Capture start geolocation on form load (Requirement 2.1) ──────────────
  useEffect(() => {
    let cancelled = false;
    async function captureStartGeo() {
      try {
        const geo = await getLocation();
        if (!cancelled) setStartGeo(geo);
      } catch {
        if (!cancelled) setStartGeo({ status: 'lokasi_tidak_tersedia', lat: null, lng: null });
      }
    }
    captureStartGeo();
    return () => { cancelled = true; };
  }, [getLocation]);

  // ─── Answer change handler ───────────────────────────────────────────────────
  const handleAnswerChange = useCallback((questionId, value, question) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Clear required-field validation error for this question when user provides an answer
    setErrorQuestionIds((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
    // Run answer validation if question object is provided
    if (question) {
      const result = validateAnswer(value, question);
      setValidationErrors((prev) => {
        if (!result.valid) {
          return { ...prev, [questionId]: result.error };
        }
        if (prev[questionId] !== undefined) {
          const next = { ...prev };
          delete next[questionId];
          return next;
        }
        return prev;
      });
    }
  }, []);

  // ─── Photo upload handler ────────────────────────────────────────────────────
  const handlePhotoChange = useCallback(
    async (questionId, file) => {
      if (!file) return;

      setUploadingPhoto((prev) => ({ ...prev, [questionId]: true }));
      try {
        const formData = new FormData();
        formData.append('photo', file);
        const res = await api.post('/upload/photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploadedPath = res.data.path;
        setPhotoPaths((prev) => ({ ...prev, [questionId]: uploadedPath }));
        // Mark as answered so validation passes
        handleAnswerChange(questionId, uploadedPath);
      } catch (err) {
        setSubmitError(
          err.response?.data?.error || err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.'
        );
      } finally {
        setUploadingPhoto((prev) => ({ ...prev, [questionId]: false }));
      }
    },
    [handleAnswerChange]
  );

  // ─── Validation ──────────────────────────────────────────────────────────────
  /**
   * Returns the set of visible required question IDs that have no answer.
   */
  const validateRequiredQuestions = useCallback(() => {
    const missing = new Set();
    for (const q of visibleQuestions) {
      if (!q.is_required) continue;

      // Skip photo validation when offline (photos are optional offline)
      if (q.type === 'photo' && !navigator.onLine) continue;

      if (q.type === 'photo') {
        if (!photoPaths[q.id]) missing.add(q.id);
      } else if (q.type === 'multiple_choice') {
        const val = answers[q.id];
        if (!Array.isArray(val) || val.length === 0) missing.add(q.id);
      } else if (q.type === 'matrix') {
        const val = answers[q.id];
        const config = q.options && !Array.isArray(q.options) ? q.options : {};
        const rows = config.rows || [];
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          missing.add(q.id);
        } else {
          // Check that all rows have an answer
          const allAnswered = rows.every((row) => val[row] && val[row] !== '');
          if (!allAnswered) missing.add(q.id);
        }
      } else if (q.type === 'indonesia_region') {
        const val = answers[q.id];
        const config = q.options && !Array.isArray(q.options) ? q.options : {};
        const depth = config.depth || 'village';
        // Minimal: provinsi harus diisi
        if (!val || typeof val !== 'object' || !val.province_id) {
          missing.add(q.id);
        } else if (depth === 'regency' && !val.regency_id) {
          missing.add(q.id);
        } else if (depth === 'district' && (!val.regency_id || !val.district_id)) {
          missing.add(q.id);
        } else if (depth === 'village' && (!val.regency_id || !val.district_id || !val.village_id)) {
          missing.add(q.id);
        }
      } else {
        const val = answers[q.id];
        if (val === undefined || val === null || val === '') missing.add(q.id);
      }
    }
    return missing;
  }, [visibleQuestions, answers, photoPaths]);

  // ─── Wizard helpers ──────────────────────────────────────────────────────────

  /**
   * Check if a question has been answered (for overview status indicators).
   */
  const isQuestionAnswered = useCallback((questionId, questionType) => {
    if (questionType === 'photo') return !!photoPaths[questionId];
    if (questionType === 'multiple_choice') {
      const val = answers[questionId];
      return Array.isArray(val) && val.length > 0;
    }
    if (questionType === 'matrix') {
      const val = answers[questionId];
      return val && typeof val === 'object' && Object.keys(val).length > 0;
    }
    if (questionType === 'indonesia_region') {
      const val = answers[questionId];
      return val && typeof val === 'object' && !!val.province_id;
    }
    const val = answers[questionId];
    return val !== undefined && val !== null && val !== '';
  }, [answers, photoPaths]);

  /**
   * Validate the current question before advancing to the next step.
   * Returns true if valid (or not required), false if blocked.
   */
  const validateCurrentQuestion = useCallback(() => {
    if (visibleQuestions.length === 0) return true;
    const question = visibleQuestions[currentStep];
    if (!question) return true;

    // Check required-field validation
    if (question.is_required) {
      // Skip photo validation when offline
      if (question.type === 'photo' && !navigator.onLine) {
        // allow advancing
      } else if (question.type === 'photo') {
        if (!photoPaths[question.id]) {
          setErrorQuestionIds(new Set([question.id]));
          return false;
        }
      } else if (question.type === 'multiple_choice') {
        const val = answers[question.id];
        if (!Array.isArray(val) || val.length === 0) {
          setErrorQuestionIds(new Set([question.id]));
          return false;
        }
      } else if (question.type === 'matrix') {
        const val = answers[question.id];
        const config = question.options && !Array.isArray(question.options) ? question.options : {};
        const rows = config.rows || [];
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          setErrorQuestionIds(new Set([question.id]));
          return false;
        }
        const allAnswered = rows.every((row) => val[row] && val[row] !== '');
        if (!allAnswered) {
          setErrorQuestionIds(new Set([question.id]));
          return false;
        }
      } else if (question.type === 'indonesia_region') {
        const val = answers[question.id];
        const config = question.options && !Array.isArray(question.options) ? question.options : {};
        const depth = config.depth || 'village';
        let invalid = !val || typeof val !== 'object' || !val.province_id;
        if (!invalid && depth === 'regency') invalid = !val.regency_id;
        if (!invalid && depth === 'district') invalid = !val.regency_id || !val.district_id;
        if (!invalid && depth === 'village') invalid = !val.regency_id || !val.district_id || !val.village_id;
        if (invalid) {
          setErrorQuestionIds(new Set([question.id]));
          return false;
        }
      } else {
        const val = answers[question.id];
        if (val === undefined || val === null || val === '') {
          setErrorQuestionIds(new Set([question.id]));
          return false;
        }
      }
    }

    // Check answer validation errors
    if (validationErrors[question.id]) {
      return false;
    }

    return true;
  }, [visibleQuestions, currentStep, answers, photoPaths, validationErrors]);

  /**
   * Navigate to the next question. Validates current question first.
   */
  const handleNext = useCallback(() => {
    if (!validateCurrentQuestion()) return;
    setCurrentStep((prev) => Math.min(prev + 1, visibleQuestions.length - 1));
  }, [validateCurrentQuestion, visibleQuestions.length]);

  /**
   * Navigate to the previous question.
   */
  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  /**
   * Jump to a specific question from the overview grid.
   */
  const handleGoToStep = useCallback((index) => {
    setCurrentStep(index);
    setShowOverview(false);
  }, []);

  // ─── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSubmitError(null);

    // 1. Validate required questions (Requirement 9.5, 9.6)
    const missing = validateRequiredQuestions();
    if (missing.size > 0) {
      setErrorQuestionIds(missing);
      // Scroll to first error
      const firstId = [...missing][0];
      const el = document.getElementById(`question-${firstId}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // 2. Check answer validation errors for visible questions (Requirement 6.4)
    const visibleIds = new Set(visibleQuestions.map((q) => q.id));
    const activeValidationErrors = Object.keys(validationErrors).filter((qid) => visibleIds.has(qid));
    if (activeValidationErrors.length > 0) {
      const firstId = activeValidationErrors[0];
      const el = document.getElementById(`question-${firstId}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // 2b. Validate required signature (Requirement 4.10)
    if (fieldToolsSettings.signature_mode === 'required' && signaturePad.isEmpty) {
      setSignatureError(true);
      const el = document.getElementById('signature-pad-section');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    setSignatureError(false);

    const hasMediaUpload =
      (fieldToolsSettings.audio_mode !== 'disabled' && audioRecorder.audioBlob) ||
      (fieldToolsSettings.photo_mode !== 'disabled' && photoCapture.photos.length > 0) ||
      (fieldToolsSettings.signature_mode !== 'disabled' && !signaturePad.isEmpty);

    if (hasMediaUpload) {
      setMediaUploadMessage('Mengunggah file media...');
    }

    setSubmitting(true);

    if (!navigator.onLine) {
      // ─── Offline submit: enqueue to IndexedDB ───────────────────────
      try {
        setMediaUploadMessage('Menyimpan data ke perangkat...');

        // Build answers payload — only include visible questions, skip photo questions
        const visibleQs = questions.filter((q) => visibleIds.has(q.id));
        const answersPayload = buildAnswersPayload(visibleQs, answers, {});

        // Get geolocation with fallback
        let geo;
        try {
          geo = await getLocation();
        } catch {
          geo = { status: 'unavailable', lat: null, lng: null };
        }

        // Enqueue response to offline queue
        const localId = await enqueueResponse({
          survey_id: id,
          answers: answersPayload,
          geo: {
            status: geo.status,
            lat: geo.lat,
            lng: geo.lng,
          },
          start_geo: fieldToolsSettings.gps_mode !== 'disabled' && startGeo ? {
            status: startGeo.status,
            lat: startGeo.lat,
            lng: startGeo.lng,
          } : null,
          has_audio: fieldToolsSettings.audio_mode !== 'disabled' && !!audioRecorder.audioBlob,
          has_signature: fieldToolsSettings.signature_mode !== 'disabled' && !signaturePad.isEmpty,
          photo_count: fieldToolsSettings.photo_mode !== 'disabled' ? photoCapture.photos.length : 0,
        });

        // Save media files to offline storage in parallel (with compression)
        const offlineMediaSaves = [];
        if (fieldToolsSettings.audio_mode !== 'disabled' && audioRecorder.audioBlob) {
          setMediaUploadMessage('Menyimpan rekaman audio...');
          offlineMediaSaves.push(
            saveMediaFile({
              localId,
              type: 'audio',
              blob: audioRecorder.audioBlob,
              filename: 'recording.webm',
            })
          );
        }
        if (fieldToolsSettings.photo_mode !== 'disabled') {
          for (const photo of photoCapture.photos) {
            setMediaUploadMessage('Mengompresi dan menyimpan foto...');
            // Kompresi foto sebelum simpan offline (hemat storage + lebih cepat)
            const compressed = await compressIfNeeded(photo.blob);
            offlineMediaSaves.push(
              saveMediaFile({
                localId,
                type: 'photo',
                blob: compressed,
                filename: photo.blob.name || 'photo.jpg',
              })
            );
          }
        }
        if (fieldToolsSettings.signature_mode !== 'disabled' && !signaturePad.isEmpty) {
          setMediaUploadMessage('Menyimpan tanda tangan...');
          const sigBlob = await signaturePad.toBlob();
          if (sigBlob) {
            offlineMediaSaves.push(
              saveMediaFile({
                localId,
                type: 'signature',
                blob: sigBlob,
                filename: 'signature.png',
              })
            );
          }
        }
        if (offlineMediaSaves.length > 0) {
          setMediaUploadMessage('Menyimpan file media ke perangkat...');
        }
        await Promise.all(offlineMediaSaves);

        // Navigate to success page with offline flag
        navigate(`/surveyor/survey/${id}/success`, {
          state: { offline: true, survey_id: id },
        });
      } catch (err) {
        setSubmitError('Gagal menyimpan data secara lokal. Silakan coba kembali.');
      } finally {
        setSubmitting(false);
        setMediaUploadMessage('');
      }
      return;
    }

    // ─── Online submit: existing flow ───────────────────────────────────
    try {
      // 3. Request geolocation (Requirement 16.1)
      const geo = await getLocation();

      // 4. Upload media files
      let audio_path = null;
      let signature_path = null;
      const media_photo_paths = [];

      const uploadPromises = [];
      if (fieldToolsSettings.audio_mode !== 'disabled' && audioRecorder.audioBlob) {
        const audioFormData = new FormData();
        audioFormData.append('audio', audioRecorder.audioBlob, 'recording.webm');
        uploadPromises.push(
          api.post('/upload/audio', audioFormData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          }).then((uploadRes) => {
            audio_path = uploadRes.data.path;
          })
        );
      }

      if (fieldToolsSettings.photo_mode !== 'disabled') {
        for (const photo of photoCapture.photos) {
          const compressed = await compressIfNeeded(photo.blob);
          const photoFormData = new FormData();
          photoFormData.append('photo', compressed, photo.blob.name || 'photo.jpg');
          uploadPromises.push(
            api.post('/upload/photo', photoFormData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            }).then((uploadRes) => {
              media_photo_paths.push(uploadRes.data.path);
            })
          );
        }
      }

      if (fieldToolsSettings.signature_mode !== 'disabled' && !signaturePad.isEmpty) {
        const sigBlob = await signaturePad.toBlob();
        if (sigBlob) {
          const signatureFormData = new FormData();
          signatureFormData.append('signature', sigBlob, 'signature.png');
          uploadPromises.push(
            api.post('/upload/signature', signatureFormData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            }).then((uploadRes) => {
              signature_path = uploadRes.data.path;
            })
          );
        }
      }

      await Promise.all(uploadPromises);

      // 5. Build answers payload — only include visible questions
      const visibleQs = questions.filter((q) => visibleIds.has(q.id));
      const answersPayload = buildAnswersPayload(visibleQs, answers, photoPaths);

      // 6. Submit response with media paths and start geo (Requirement 9.7, 13.1, 15.2, 16.2)
      const submitPayload = {
        session_token: sessionTokenRef.current,
        survey_id: id,
        answers: answersPayload,
        geo: {
          status: geo.status,
          lat: geo.lat,
          lng: geo.lng,
        },
      };

      if (audio_path) submitPayload.audio_path = audio_path;
      if (signature_path) submitPayload.signature_path = signature_path;
      if (media_photo_paths.length > 0) submitPayload.photo_paths = media_photo_paths;
      if (fieldToolsSettings.gps_mode !== 'disabled' && startGeo) {
        submitPayload.start_latitude = startGeo.lat;
        submitPayload.start_longitude = startGeo.lng;
        submitPayload.start_geo_status = startGeo.status;
      }

      const res = await api.post('/responses/submit', submitPayload);

      const { questionnaire_number } = res.data;

      // 6. Navigate to success page (Requirement 13.3)
      navigate(`/surveyor/survey/${id}/success`, {
        state: { questionnaire_number, survey_id: id },
      });
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.validation_errors) {
        // Backend validation errors: populate validationErrors and scroll to first
        const backendErrors = {};
        for (const ve of errData.validation_errors) {
          backendErrors[ve.question_id] = ve.error;
        }
        setValidationErrors((prev) => ({ ...prev, ...backendErrors }));
        const firstQid = errData.validation_errors[0]?.question_id;
        if (firstQid) {
          const el = document.getElementById(`question-${firstQid}`);
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        setSubmitError(errData.error || 'Validasi jawaban gagal');
      } else if (errData?.missing_questions) {
        // Server-side validation: highlight missing questions
        setErrorQuestionIds(new Set(errData.missing_questions));
        setSubmitError('Harap isi semua pertanyaan wajib yang ditandai.');
      } else {
        setSubmitError(
          errData?.error || errData?.message || 'Gagal menyimpan data. Silakan coba kembali.'
        );
      }
    } finally {
      setSubmitting(false);
      setMediaUploadMessage('');
    }
  }, [
    validateRequiredQuestions,
    validationErrors,
    getLocation,
    visibleQuestions,
    questions,
    answers,
    photoPaths,
    id,
    navigate,
    isOnline,
    audioRecorder,
    photoCapture,
    signaturePad,
    startGeo,
    fieldToolsSettings,
  ]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-3 text-gray-500">Memuat survei…</span>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full text-center">
          <p className="text-red-700 text-sm mb-4">{loadingError}</p>
          <button
            onClick={() => navigate('/surveyor')}
            className="text-sm text-blue-600 underline"
          >
            Kembali ke Daftar Survei
          </button>
        </div>
      </div>
    );
  }

  // ─── Wizard derived values ──────────────────────────────────────────────────
  const totalSteps = visibleQuestions.length;
  const currentQuestion = visibleQuestions[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/surveyor')}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Kembali ke daftar survei"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-800 truncate">
              {survey?.title || 'Formulir Survei'}
            </h1>
            {currentQuestionnaireNumber ? (
              <span className="inline-flex items-center gap-1 mt-0.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Kuesioner No. {currentQuestionnaireNumber}
              </span>
            ) : survey?.description ? (
              <p className="text-xs text-gray-500 truncate">{survey.description}</p>
            ) : null}
          </div>
          <OfflineStatusBar isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} />
        </div>

        {/* Progress indicator — only in wizard mode */}
        {formMode === 'wizard' && totalSteps > 0 && !showOverview && (
          <div className="max-w-2xl mx-auto px-4 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-600">
                Pertanyaan {currentStep + 1} dari {totalSteps}
              </span>
              <button
                type="button"
                onClick={() => setShowOverview(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Lihat Semua
              </button>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Audio recorder panel — sticky in header */}
        <div className="max-w-2xl mx-auto px-4 pb-2">
          {fieldToolsSettings.audio_mode !== 'disabled' && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-medium text-gray-600">Rekaman Audio</span>
                <FieldToolModeLabel mode={fieldToolsSettings.audio_mode} />
              </div>
              <AudioRecorderPanel audioRecorder={audioRecorder} />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* ─── Scroll mode (all questions on one page) ─────────────────── */}
        {formMode === 'scroll' ? (
          <>
            {visibleQuestions.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p>Tidak ada pertanyaan yang tersedia.</p>
              </div>
            )}

            {visibleQuestions.map((question, index) => {
              const hasError = errorQuestionIds.has(question.id);
              const displayOptions = displayOptionsMap[question.id] || question.options || [];
              const questionTypeLabel = {
                single_choice: 'Pilihan tunggal',
                multiple_choice: 'Pilihan ganda',
                short_text: 'Teks singkat',
                long_text: 'Teks panjang',
                numeric_scale: 'Skala angka',
                date: 'Tanggal',
                time: 'Waktu',
                photo: 'Foto',
                rating_scale: 'Rating',
                phone_number: 'Telepon',
                unique_id: 'ID unik',
                matrix: 'Matrix',
              }[question.type] || question.type;

              return (
                <div
                  key={question.id}
                  id={`question-${question.id}`}
                  className={`bg-white rounded-xl border border-gray-200 border-l-4 border-l-blue-400 p-5 shadow-sm hover:shadow-md transition-all duration-150 ${
                    hasError ? 'border-red-400 border-l-red-500' : ''
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <p className="text-base font-semibold text-gray-900 leading-relaxed">
                      <span className="text-gray-400 mr-2">{index + 1}.</span>
                      {question.text}
                      {question.is_required && (
                        <span className="text-red-500 ml-1" aria-label="wajib diisi">*</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {questionTypeLabel}
                      </span>
                      {question.is_required && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                          Wajib
                        </span>
                      )}
                    </div>
                  </div>
                  {hasError && (
                    <p className="text-sm text-red-500 mt-2">Pertanyaan ini wajib diisi</p>
                  )}
                  

                  {question.type === 'photo' ? (
                    !isOnline ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs text-amber-700">Upload foto memerlukan koneksi internet</p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handlePhotoChange(question.id, e.target.files?.[0] || null)}
                          className={`block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 ${
                            hasError ? 'border border-red-400 rounded-lg p-1 bg-red-50' : ''
                          }`}
                          disabled={uploadingPhoto[question.id]}
                        />
                        {uploadingPhoto[question.id] && (
                          <p className="text-xs text-blue-500 mt-1">Mengunggah foto…</p>
                        )}
                        {photoPaths[question.id] && !uploadingPhoto[question.id] && (
                          <p className="text-xs text-green-600 mt-1">✓ Foto berhasil diunggah</p>
                        )}
                      </div>
                    )
                  ) : (
                    <QuestionField
                      question={question}
                      answer={answers[question.id]}
                      onChange={(value) => handleAnswerChange(question.id, value, question)}
                      hasError={hasError}
                      displayOptions={displayOptions}
                      surveyId={id}
                      isOnline={isOnline}
                      assignedNumbers={assignedNumbers}
                      usedNumbers={usedNumbers}
                    />
                  )}

                  {validationErrors[question.id] && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors[question.id]}</p>
                  )}
                </div>
              );
            })}

            {/* Field tools in scroll mode */}
            {fieldToolsSettings.photo_mode !== 'disabled' && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs font-medium text-gray-600">Pengambilan Foto</span>
                  <FieldToolModeLabel mode={fieldToolsSettings.photo_mode} />
                </div>
                <PhotoCapturePanel photoCapture={photoCapture} />
              </div>
            )}

            {fieldToolsSettings.signature_mode !== 'disabled' && (
              <div id="signature-pad-section">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs font-medium text-gray-600">Tanda Tangan</span>
                  <FieldToolModeLabel mode={fieldToolsSettings.signature_mode} />
                </div>
                <SignaturePadCanvas
                  signaturePad={signaturePad}
                  required={fieldToolsSettings.signature_mode === 'required'}
                  hasError={signatureError}
                />
              </div>
            )}

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                {submitError}
              </div>
            )}

            <div className="pb-8">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Menyimpan…</span>
                  </>
                ) : (
                  'Simpan Data Responden'
                )}
              </button>
            </div>
          </>
        ) : (
        /* ─── Wizard mode (original refactored code) ─────────────────── */
        <>
        {/* ─── Overview mode ─────────────────────────────────────────────── */}
        {showOverview ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Semua Pertanyaan</h2>
              <button
                type="button"
                onClick={() => setShowOverview(false)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Kembali ke Pertanyaan
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleQuestions.map((question, index) => {
                const answered = isQuestionAnswered(question.id, question.type);
                const isRequired = question.is_required;
                let statusIcon;
                let statusColor;
                if (answered) {
                  statusIcon = '✓';
                  statusColor = 'text-green-600';
                } else if (isRequired) {
                  statusIcon = '⚠️';
                  statusColor = 'text-red-500';
                } else {
                  statusIcon = '○';
                  statusColor = 'text-gray-400';
                }

                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => handleGoToStep(index)}
                    className={`bg-white rounded-xl border p-3 shadow-sm text-left transition-colors hover:border-blue-400 hover:shadow-md ${
                      index === currentStep ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500">{index + 1}</span>
                      <span className={`text-sm ${statusColor}`}>{statusIcon}</span>
                    </div>
                    <p className="text-xs text-gray-700 line-clamp-2">
                      {question.text.length > 50
                        ? question.text.substring(0, 50) + '…'
                        : question.text}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* ─── Question mode (single question) ──────────────────────────── */
          <>
            {totalSteps === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p>Tidak ada pertanyaan yang tersedia.</p>
              </div>
            )}

            {currentQuestion && (() => {
              const question = currentQuestion;
              const hasError = errorQuestionIds.has(question.id);
              const displayOptions = displayOptionsMap[question.id] || question.options || [];

              return (
                <div
                  id={`question-${question.id}`}
                  className={`bg-white rounded-xl border p-5 shadow-sm transition-colors ${
                    hasError ? 'border-red-400' : 'border-gray-200'
                  }`}
                >
                  {/* Question label */}
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-800">
                      <span className="text-gray-400 mr-1">{currentStep + 1}.</span>
                      {question.text}
                      {question.is_required && (
                        <span className="text-red-500 ml-1" aria-label="wajib diisi">*</span>
                      )}
                    </p>
                    {hasError && (
                      <p className="text-xs text-red-500 mt-1">Pertanyaan ini wajib diisi</p>
                    )}
                  </div>

                  {/* Question input */}
                  {question.type === 'photo' ? (
                    !isOnline ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs text-amber-700">Upload foto memerlukan koneksi internet</p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handlePhotoChange(question.id, e.target.files?.[0] || null)}
                          className={`block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 ${
                            hasError ? 'border border-red-400 rounded-lg p-1 bg-red-50' : ''
                          }`}
                          disabled={uploadingPhoto[question.id]}
                        />
                        {uploadingPhoto[question.id] && (
                          <p className="text-xs text-blue-500 mt-1">Mengunggah foto…</p>
                        )}
                        {photoPaths[question.id] && !uploadingPhoto[question.id] && (
                          <p className="text-xs text-green-600 mt-1">✓ Foto berhasil diunggah</p>
                        )}
                        {hasError && (
                          <p className="text-xs text-red-500 mt-1">Foto wajib diunggah</p>
                        )}
                      </div>
                    )
                  ) : (
                    <QuestionField
                      question={question}
                      answer={answers[question.id]}
                      onChange={(value) => handleAnswerChange(question.id, value, question)}
                      hasError={hasError}
                      displayOptions={displayOptions}
                      surveyId={id}
                      isOnline={isOnline}
                      assignedNumbers={assignedNumbers}
                      usedNumbers={usedNumbers}
                    />
                  )}

                  {/* Validation error message (separate from required-field error) */}
                  {validationErrors[question.id] && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors[question.id]}</p>
                  )}

                  {/* Character counter for text questions with max_length */}
                  {(question.type === 'short_text' || question.type === 'long_text') &&
                    question.options?.validation?.max_length && (() => {
                      const currentLen = (answers[question.id] || '').length;
                      const maxLen = question.options.validation.max_length;
                      const isOver = currentLen > maxLen;
                      const isNearLimit = currentLen >= maxLen * 0.9;
                      return (
                        <p
                          className={`text-xs mt-1 ${
                            isOver ? 'text-red-500 font-medium' : isNearLimit ? 'text-red-500' : 'text-gray-400'
                          }`}
                        >
                          {currentLen}/{maxLen}
                        </p>
                      );
                    })()}
                </div>
              );
            })()}

            {/* ─── Last step: field tools + submit ─────────────────────────── */}
            {isLastStep && currentQuestion && (
              <div className="space-y-6">
                {/* Photo capture panel (Requirement 6.2) */}
                {fieldToolsSettings.photo_mode !== 'disabled' && (
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs font-medium text-gray-600">Pengambilan Foto</span>
                      <FieldToolModeLabel mode={fieldToolsSettings.photo_mode} />
                    </div>
                    <PhotoCapturePanel photoCapture={photoCapture} />
                  </div>
                )}

                {/* Signature pad (Requirement 6.3) */}
                {fieldToolsSettings.signature_mode !== 'disabled' && (
                  <div id="signature-pad-section">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs font-medium text-gray-600">Tanda Tangan</span>
                      <FieldToolModeLabel mode={fieldToolsSettings.signature_mode} />
                    </div>
                    <SignaturePadCanvas
                      signaturePad={signaturePad}
                      required={fieldToolsSettings.signature_mode === 'required'}
                      hasError={signatureError}
                    />
                  </div>
                )}

                {/* Submit error */}
                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                    {submitError}
                  </div>
                )}
                {mediaUploadMessage && (
                  <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700" />
                    <span>{mediaUploadMessage}</span>
                  </div>
                )}
              </div>
            )}

            {/* ─── Navigation buttons ──────────────────────────────────────── */}
            {totalSteps > 0 && (
              <div className="flex items-center gap-3 pb-8">
                {/* Back button */}
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isFirstStep}
                  className="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Kembali
                </button>

                {/* Next / Submit button */}
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span>Menyimpan…</span>
                      </>
                    ) : (
                      'Simpan Data Responden'
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                  >
                    Selanjutnya
                  </button>
                )}
              </div>
            )}
          </>
        )}
        </>
        )}
      </main>
    </div>
  );
}

export default SurveyForm;
