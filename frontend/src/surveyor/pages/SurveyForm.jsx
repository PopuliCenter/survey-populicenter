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
import { saveDraft, loadDraft, clearDraft, answersHaveContent } from '../utils/surveyDraft';
import useAudioRecorder from '../hooks/useAudioRecorder';
import usePhotoCapture from '../hooks/usePhotoCapture';
import useSignaturePad from '../hooks/useSignaturePad';
import { getDisplayOptions } from '../../utils/randomizeOptions';
import { validateAnswer } from '../../utils/answerValidation';
import { cacheSurvey, getCachedSurvey, enqueueResponse, saveMediaFile, saveDraftMedia, getDraftMedia, deleteDraftMedia } from '../../utils/storage';
import { compressIfNeeded } from '../../utils/imageCompressor';
import OfflineStatusBar from '../../components/OfflineStatusBar';
import ConfirmSheet from '../../components/ConfirmSheet';
import AudioRecorderPanel from '../components/AudioRecorderPanel';
import PhotoCapturePanel from '../components/PhotoCapturePanel';
import SignaturePadCanvas from '../components/SignaturePadCanvas';
import { addBackButtonListener, isNativePlatform, getNetworkStatus, primeMediaPermissions } from '../../utils/capacitorBridge';
import { toastError } from '../../utils/toastBus';

// ─── Rekaman audio: batas & strategi "awal + akhir" ─────────────────────────────
// Default total 3 menit (bila survei tak menyetel audio_total_max_sec). Segmen
// pembukaan = separuh total, dihitung per survei (lihat audioFirstSegmentSec).
const AUDIO_TOTAL_MAX_SEC = 180;      // maksimal 3 menit total (terekam) — default

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
  audio_indicator: 'shown',
};

/**
 * Opsi "Lainnya" dipilih tapi teks bebasnya KOSONG?
 * Jawaban "Lainnya" tersimpan sebagai "__other__:<teks>" (single choice) atau
 * sebagai anggota array (multiple choice). Bila teks setelah ":" kosong, TPD
 * belum benar-benar mengisi pilihan Lainnya → wajib diisi sebelum lanjut.
 * @param {*} val
 * @returns {boolean}
 */
function otherTextMissing(val) {
  const emptyOther = (s) => typeof s === 'string' && s.startsWith('__other__:') && s.slice('__other__:'.length).trim() === '';
  if (Array.isArray(val)) return val.some(emptyOther);
  return emptyOther(val);
}

/**
 * Badge live durasi wawancara (mm:ss / h:mm:ss). Berdetak tiap detik dari
 * `startAt` (epoch ms). Dipakai di header form agar TPD & QC melihat berapa lama
 * wawancara berlangsung.
 */
function InterviewTimerBadge({ startAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startAt) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startAt]);
  if (!startAt) return null;
  const secs = Math.max(0, Math.floor((now - startAt) / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(secs / 3600);
  const label = `${h > 0 ? `${h}:` : ''}${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2 py-1"
      title="Durasi wawancara"
      aria-label={`Durasi wawancara ${label}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      {label}
    </span>
  );
}

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

  const selectClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed';

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
  // Jaminan UPPERCASE untuk teks bebas (KEBUTUHAN KLIEN — ekspor SPSS).
  // Input tidak lagi meng-kapital-kan saat mengetik (bug keyboard Samsung);
  // kapital dijamin di sini + saat blur. Berlaku juga untuk teks "__other__:".
  const upper = (v) => {
    if (typeof v !== 'string') return v;
    return v.startsWith('__other__:')
      ? `__other__:${v.slice('__other__:'.length).toUpperCase()}`
      : v.toUpperCase();
  };
  return questions.map((q) => {
    if (q.type === 'photo') {
      return { question_id: q.id, photo_path: photoPaths[q.id] || null };
    }
    if (q.type === 'multiple_choice') {
      const arr = answers[q.id] || [];
      // Hanya entri "Lainnya" yang berupa teks bebas; nilai opsi jangan diubah.
      return {
        question_id: q.id,
        answer_json: Array.isArray(arr)
          ? arr.map((v) => (typeof v === 'string' && v.startsWith('__other__:') ? upper(v) : v))
          : arr,
      };
    }
    if (q.type === 'matrix' || q.type === 'indonesia_region') {
      return { question_id: q.id, answer_json: answers[q.id] || {} };
    }
    const val = answers[q.id] ?? '';
    // Teks bebas (short/long text & "Lainnya" pada single choice) → kapital.
    // Tipe lain (angka, tanggal, pilihan) tidak berubah oleh toUpperCase.
    return {
      question_id: q.id,
      answer_value: (q.type === 'short_text' || q.type === 'long_text' || (typeof val === 'string' && val.startsWith('__other__:')))
        ? upper(val)
        : val,
    };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Panel status GPS lokasi awal wawancara.
 * Menampilkan: terkunci (akurasi), sedang mencari, atau belum didapat + tombol
 * ambil ulang. GPS dipantau otomatis sejak form dibuka (lihat efek di SurveyForm).
 *
 * @param {{ mode: string, startGeo: object|null, searching: boolean, onRefresh: () => void }} props
 */
function GpsStatusPanel({ mode, startGeo, searching, onRefresh }) {
  if (mode === 'disabled') return null;

  const available = !!(startGeo && startGeo.status === 'available' && startGeo.lat != null && startGeo.lng != null);
  const required = mode === 'required';
  const accuracyText = available && startGeo.accuracy != null ? ` (akurasi ±${Math.round(startGeo.accuracy)} m)` : '';

  let tone, icon, message;
  if (available) {
    tone = 'bg-green-50 border-green-200 text-green-700';
    icon = (
      <svg className="w-5 h-5 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
    );
    message = `Lokasi terkunci${accuracyText}`;
  } else if (searching) {
    tone = 'bg-accent-50 border-accent-200 text-accent-700';
    icon = (
      <svg className="animate-spin w-5 h-5 text-accent-600 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
    );
    message = 'Mencari sinyal GPS… boleh lanjut mengisi, lokasi diambil otomatis. Pastikan di luar ruangan.';
  } else {
    // Bedakan "izin ditolak / tidak tersedia" dari "belum dapat fix" — solusinya beda:
    // izin ditolak harus dibuka di Pengaturan, bukan sekadar keluar ruangan.
    const denied = !!(startGeo && startGeo.status && startGeo.status !== 'available');
    tone = 'bg-amber-50 border-amber-200 text-amber-700';
    icon = (
      <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" /></svg>
    );
    message = denied
      ? 'Lokasi tidak tersedia. Pastikan izin lokasi untuk aplikasi ini aktif di Pengaturan HP, lalu tekan "Coba Lagi".'
      : 'Lokasi GPS belum didapat. Pastikan di luar ruangan, lalu ambil lokasi.';
  }

  return (
    <div id="gps-status-section" className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs font-semibold text-gray-700">Lokasi GPS</span>
        {required && <span className="text-red-500 text-xs">*</span>}
      </div>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm flex-1">{message}</span>
        {!available && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={searching}
            className="shrink-0 min-h-[40px] px-3 text-sm font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {searching ? 'Mencari…' : 'Coba Ambil Lokasi'}
          </button>
        )}
      </div>
    </div>
  );
}

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
              className={`w-10 h-10 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400 ${
                isSelected
                  ? 'bg-accent-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-accent-100 hover:text-accent-700'
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
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors ${
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
 * Anti-dobel antar TPD: saat nomor dipilih/diketik (online), ketersediaan dicek
 * LANGSUNG ke server — nomor yang baru saja diisi TPD lain ditolak di DEPAN,
 * bukan gagal di akhir saat simpan.
 *
 * @param {{ question: object, answer: string, onChange: function, hasError: boolean, surveyId: string, isOnline: boolean, assignedNumbers: string[]|null, usedNumbers: string[], onAvailabilityChange?: function, onNumberTaken?: function }} props
 */
function UniqueIdField({ question, answer, onChange, hasError, surveyId, isOnline, assignedNumbers, usedNumbers, onAvailabilityChange, onNumberTaken }) {
  const config = question.options && !Array.isArray(question.options) ? question.options : {};
  const { min_length, max_length } = config;

  const [availability, setAvailability] = useState(null);
  // Nomor tugasan yang baru saja ketahuan sudah dipakai TPD lain (notif inline).
  const [takenNumber, setTakenNumber] = useState(null);
  const debounceRef = useRef(null);

  const usedSet = useMemo(() => new Set(usedNumbers || []), [usedNumbers]);

  // Laporkan status ketersediaan ke induk (dipakai memblokir Lanjut/Simpan).
  const updateAvailability = (v) => {
    setAvailability(v);
    if (onAvailabilityChange) onAvailabilityChange(v);
  };

  // Bersihkan timer debounce saat unmount. WAJIB dipanggil SEBELUM early-return
  // di bawah agar urutan hook konsisten di kedua mode (rules-of-hooks).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Jika ada assigned_numbers dari admin, tampilkan dropdown
  if (assignedNumbers && Array.isArray(assignedNumbers) && assignedNumbers.length > 0) {
    const availableNumbers = assignedNumbers.filter((num) => !usedSet.has(num));

    // Pilih nomor: cek ketersediaan LIVE ke server (online). Bila ternyata baru
    // saja diisi TPD lain → batalkan pilihan + tandai "Sudah diisi".
    async function handlePickNumber(num) {
      setTakenNumber(null);
      onChange(num);
      if (!isOnline) return;
      updateAvailability('checking');
      try {
        const res = await api.post('/responses/check-unique', {
          survey_id: surveyId,
          question_id: question.id,
          value: num,
        });
        if (res.data.available) {
          updateAvailability('available');
        } else {
          updateAvailability(null);
          setTakenNumber(num);
          onChange(''); // batalkan pilihan
          if (onNumberTaken) onNumberTaken(num);
        }
      } catch {
        updateAvailability(null); // cek gagal — biarkan; gerbang simpan & server tetap menjaga
      }
    }

    return (
      <div className="space-y-3">
        {/* Info status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-600">
            {availableNumbers.length} dari {assignedNumbers.length} nomor tersedia
          </span>
          {!isOnline && (
            <span className="text-xs font-medium text-accent-600 bg-accent-50 border border-accent-200 rounded-full px-2 py-0.5">
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
              badgeClass = 'bg-accent-100 text-accent-800 border-accent-400 ring-2 ring-accent-400 shadow-sm';
              icon = '●';
              label = 'Terpilih';
            } else if (isUsed) {
              badgeClass = 'bg-green-50 text-green-700 border-green-300 cursor-not-allowed';
              icon = '✓';
              label = 'Sudah diisi';
            } else {
              badgeClass = 'bg-white text-gray-700 border-gray-300 hover:bg-accent-50 hover:border-accent-300 cursor-pointer';
              icon = '○';
              label = 'Belum diisi — ketuk untuk memilih';
            }
            return (
              <button
                key={num}
                type="button"
                disabled={isUsed}
                onClick={() => !isUsed && handlePickNumber(num)}
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
            <span className="w-2.5 h-2.5 rounded-full bg-accent-500 inline-block" /> Terpilih
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" /> Tersedia
          </span>
        </div>

        {/* Cek live saat memilih nomor */}
        {availability === 'checking' && (
          <p className="text-xs text-gray-400">Memeriksa ketersediaan nomor…</p>
        )}
        {takenNumber && (
          <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Nomor {takenNumber} baru saja diisi TPD lain — pilih nomor lain.
          </p>
        )}

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
      updateAvailability(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (digits.length > 0) {
      updateAvailability('checking');
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await api.post('/responses/check-unique', {
            survey_id: surveyId,
            question_id: question.id,
            value: digits,
          });
          updateAvailability(res.data.available ? 'available' : 'taken');
        } catch {
          updateAvailability(null);
        }
      }, 500);
    } else {
      updateAvailability(null);
    }
  }

  return (
    <div className="space-y-1">
      <input
        type="text"
        inputMode="numeric"
        value={answer || ''}
        onChange={handleChange}
        maxLength={max_length || undefined}
        placeholder="Masukkan nomor kuesioner"
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors ${
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
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors';
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
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors';
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
                    <td key={col} className="text-center px-1 py-0.5 border-b border-gray-100">
                      {/* Seluruh sel jadi area ketuk (≥44px) agar mudah di lapangan */}
                      <label className="flex items-center justify-center min-h-[44px] cursor-pointer">
                        <input
                          type="radio"
                          name={`matrix_${question.id}_${row}`}
                          checked={value[row] === col}
                          onChange={() => handleSelect(row, col)}
                          className="accent-accent-600 w-6 h-6"
                          aria-label={`${row}: ${col}`}
                        />
                      </label>
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
function QuestionField({ question, answer, onChange, hasError, displayOptions, surveyId, isOnline, assignedNumbers, usedNumbers, onAvailabilityChange, onNumberTaken }) {
  const baseInputClass =
    'w-full border rounded-lg px-3 py-2 text-base leading-6 focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors';
  const errorBorder = hasError ? 'border-red-400 bg-red-50' : 'border-gray-300';

  switch (question.type) {
    case 'single_choice': {
      const otherSel = !!(answer && answer.startsWith && answer.startsWith('__other__:'));
      return (
        <div role="radiogroup" aria-label={question.text} className={`space-y-2.5 ${hasError ? 'p-2 rounded-xl border border-red-400 bg-red-50' : ''}`}>
          {displayOptions.map((opt) => {
            const isSel = answer === opt.value || (otherSel && opt.value === '__other__');
            return (
              <button
                type="button"
                key={opt.value}
                role="radio"
                aria-checked={isSel}
                onClick={() => onChange(opt.value)}
                className={`w-full flex items-center gap-3 text-left rounded-2xl border px-4 min-h-[54px] transition-colors ${
                  isSel ? 'border-accent-500 bg-accent-50' : 'border-gray-200 bg-white hover:border-gray-300 active:bg-gray-50'
                }`}
              >
                <span className={`flex-shrink-0 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-colors ${isSel ? 'border-accent-500 bg-accent-500' : 'border-gray-300'}`}>
                  {isSel && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <span className={`text-base ${isSel ? 'text-accent-900 font-medium' : 'text-gray-800'}`}>{opt.label}</span>
              </button>
            );
          })}
          {question.allow_other && (
            <div className="space-y-2">
              <button
                type="button"
                role="radio"
                aria-checked={otherSel}
                onClick={() => onChange('__other__:')}
                className={`w-full flex items-center gap-3 text-left rounded-2xl border px-4 min-h-[54px] transition-colors ${
                  otherSel ? 'border-accent-500 bg-accent-50' : 'border-gray-200 bg-white hover:border-gray-300 active:bg-gray-50'
                }`}
              >
                <span className={`flex-shrink-0 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center ${otherSel ? 'border-accent-500 bg-accent-500' : 'border-gray-300'}`}>
                  {otherSel && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <span className={`text-base ${otherSel ? 'text-accent-900 font-medium' : 'text-gray-800'}`}>Lainnya</span>
              </button>
              {otherSel && (
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  value={answer.replace('__other__:', '')}
                  // JANGAN toUpperCase() saat mengetik: keyboard Samsung (composition/
                  // prediksi) bentrok dgn nilai yang ditimpa → huruf yang dihapus balik
                  // lagi (bug S23). Simpan apa adanya; tampilan tetap kapital via CSS;
                  // data di-kapital-kan saat blur + saat buildAnswersPayload (SPSS).
                  onChange={(e) => onChange(`__other__:${e.target.value}`)}
                  onBlur={(e) => onChange(`__other__:${e.target.value.toUpperCase()}`)}
                  placeholder="Ketik jawaban lainnya…"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-accent-400"
                  style={{ textTransform: 'uppercase' }}
                  autoFocus
                />
              )}
            </div>
          )}
          {question.auto_fill?.source === 'questionnaire_number_parity' && (
            <p className="text-xs text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 mt-1">
              Terisi otomatis dari Nomor Kuesioner (ganjil vs genap). Bisa diubah bila perlu.
            </p>
          )}
        </div>
      );
    }

    case 'multiple_choice': {
      const Check = () => (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
      return (
        <div role="group" aria-label={question.text} className={`space-y-2.5 ${hasError ? 'p-2 rounded-xl border border-red-400 bg-red-50' : ''}`}>
          {displayOptions.map((opt) => {
            const checked = Array.isArray(answer) && answer.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                role="checkbox"
                aria-checked={checked}
                onClick={() => {
                  const current = Array.isArray(answer) ? answer : [];
                  if (checked) onChange(current.filter((v) => v !== opt.value));
                  else onChange([...current, opt.value]);
                }}
                className={`w-full flex items-center gap-3 text-left rounded-2xl border px-4 min-h-[54px] transition-colors ${
                  checked ? 'border-accent-500 bg-accent-50' : 'border-gray-200 bg-white hover:border-gray-300 active:bg-gray-50'
                }`}
              >
                <span className={`flex-shrink-0 w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center ${checked ? 'border-accent-500 bg-accent-500' : 'border-gray-300'}`}>
                  {checked && <Check />}
                </span>
                <span className={`text-base ${checked ? 'text-accent-900 font-medium' : 'text-gray-800'}`}>{opt.label}</span>
              </button>
            );
          })}
          {question.allow_other && (() => {
            const currentArr = Array.isArray(answer) ? answer : [];
            const otherEntry = currentArr.find((v) => v.startsWith('__other__:'));
            const otherChecked = !!otherEntry;
            return (
              <div className="space-y-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={otherChecked}
                  onClick={() => {
                    if (otherChecked) onChange(currentArr.filter((v) => !v.startsWith('__other__:')));
                    else onChange([...currentArr, '__other__:']);
                  }}
                  className={`w-full flex items-center gap-3 text-left rounded-2xl border px-4 min-h-[54px] transition-colors ${
                    otherChecked ? 'border-accent-500 bg-accent-50' : 'border-gray-200 bg-white hover:border-gray-300 active:bg-gray-50'
                  }`}
                >
                  <span className={`flex-shrink-0 w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center ${otherChecked ? 'border-accent-500 bg-accent-500' : 'border-gray-300'}`}>
                    {otherChecked && <Check />}
                  </span>
                  <span className={`text-base ${otherChecked ? 'text-accent-900 font-medium' : 'text-gray-800'}`}>Lainnya</span>
                </button>
                {otherChecked && (
                  <input
                    type="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    value={(otherEntry || '').replace('__other__:', '')}
                    // Tanpa toUpperCase() saat mengetik (bug keyboard Samsung — lihat
                    // input Lainnya single choice). Kapital saat blur + payload.
                    onChange={(e) => {
                      const updated = currentArr.map((v) =>
                        v.startsWith('__other__:') ? `__other__:${e.target.value}` : v
                      );
                      onChange(updated);
                    }}
                    onBlur={(e) => {
                      const updated = currentArr.map((v) =>
                        v.startsWith('__other__:') ? `__other__:${e.target.value.toUpperCase()}` : v
                      );
                      onChange(updated);
                    }}
                    placeholder="Ketik jawaban lainnya…"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-accent-400"
                    style={{ textTransform: 'uppercase' }}
                    autoFocus
                  />
                )}
              </div>
            );
          })()}
        </div>
      );
    }

    case 'short_text':
      return (
        <input
          type="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck="false"
          value={answer || ''}
          // Tanpa toUpperCase() saat mengetik (bug keyboard Samsung — huruf yang
          // dihapus balik lagi). Tampilan tetap kapital via CSS; data dikapitalkan
          // saat blur + buildAnswersPayload (jaminan UPPERCASE utk ekspor SPSS).
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.toUpperCase())}
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
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.toUpperCase())}
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
            className={`block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent-50 file:text-accent-700 hover:file:bg-accent-100 ${hasError ? 'border border-red-400 rounded-lg p-1 bg-red-50' : ''}`}
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
          onAvailabilityChange={onAvailabilityChange}
          onNumberTaken={onNumberTaken}
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
  const { getLocation, watchLocation } = useGeolocation();

  // Nomor kuesioner yang dipilih dari Daftar Survei (jika ada). Disimpan di ref
  // agar stabil sepanjang masa hidup form (tidak ikut berubah saat re-render).
  const preselectedNumberRef = useRef(location.state?.preselectedNumber ?? null);
  // Penanda agar lompatan langkah hanya dilakukan sekali.
  const preselectJumpedRef = useRef(false);
  // Nomor kuesioner untuk identitas draft (per-nomor). draftNumberRef dipakai
  // saat clear (submit/discard); prevDraftNumberRef untuk re-key bila berubah.
  const draftNumberRef = useRef('');
  const prevDraftNumberRef = useRef('');
  // Nomor kuesioner terakhir yang sudah dipakai mengisi-otomatis jenis kelamin.
  // Mencegah menimpa koreksi manual TPD selama nomornya tidak berubah.
  const genderAppliedNumberRef = useRef(null);

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
  // Aturan rekaman audio bisa disetel admin/SPV per survei (dalam DETIK):
  //   audio_start_delay_sec : jeda sebelum rekaman pembukaan auto-mulai (0 = langsung)
  //                           → melewati obrolan pembuka sebelum wawancara inti.
  //   audio_total_max_sec   : total durasi terekam; dibagi rata pembukaan/penutup.
  // Absen → pakai default lama (langsung mulai, 3 mnt, segmen awal 1,5 mnt).
  const _audioCfg = survey?.field_tools_settings || DEFAULT_FIELD_TOOLS;
  const audioTotalMaxSec = Number(_audioCfg.audio_total_max_sec) > 0
    ? Number(_audioCfg.audio_total_max_sec) : AUDIO_TOTAL_MAX_SEC;
  const audioStartDelaySec = Number(_audioCfg.audio_start_delay_sec) > 0
    ? Number(_audioCfg.audio_start_delay_sec) : 0;
  // Segmen pembukaan = separuh total (default 90s saat total 180s → perilaku lama).
  const audioFirstSegmentSec = Math.round(audioTotalMaxSec / 2);
  const audioRecorder = useAudioRecorder({ maxDurationSec: audioTotalMaxSec });
  const photoCapture = usePhotoCapture();
  const signaturePad = useSignaturePad();

  // ─── Start geolocation ──────────────────────────────────────────────────────
  const [startGeo, setStartGeo] = useState(null);
  const [gpsSearching, setGpsSearching] = useState(false);

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

  // ─── Timer wawancara ────────────────────────────────────────────────────────
  // Waktu mulai wawancara (epoch ms). Sumber kebenaran = ref (dibaca callback
  // saveDraft tanpa memicu render); state dipakai untuk merender badge live.
  // Persist di draft agar tidak reset saat pending/lanjut atau WebView reload.
  const interviewStartRef = useRef(null);
  const [interviewStartAt, setInterviewStartAt] = useState(null);
  const startInterviewClock = useCallback((ts) => {
    const val = Number.isFinite(ts) ? ts : Date.now();
    interviewStartRef.current = val;
    setInterviewStartAt(val);
  }, []);

  // ─── Exit guard & draft state ───────────────────────────────────────────────
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftRestoredRef = useRef(false);

  // ─── Randomised display options (stable per mount) ──────────────────────────
  // We compute shuffled options once when questions load and keep them stable
  // so the order doesn't change as the user fills in the form.
  const [displayOptionsMap, setDisplayOptionsMap] = useState({});

  // ─── Assigned questionnaire numbers (from admin) ────────────────────────────
  const [assignedNumbers, setAssignedNumbers] = useState(null); // string[] | null
  const [usedNumbers, setUsedNumbers] = useState([]); // string[]

  // Ketersediaan nomor kuesioner terkini dari cek live server (via UniqueIdField):
  // null | 'checking' | 'available' | 'taken'. Dipakai memblokir Lanjut/Simpan
  // agar bentrok nomor antar TPD ketahuan di DEPAN, bukan gagal di akhir.
  const [uniqueAvailability, setUniqueAvailability] = useState(null);

  // Tandai nomor sudah terpakai (mis. baru saja diisi TPD lain) → badge "Sudah diisi".
  const markNumberUsed = useCallback((num) => {
    const n = String(num || '').trim();
    if (!n) return;
    setUsedNumbers((prev) => (prev.includes(n) ? prev : [...prev, n]));
  }, []);

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
  // Jaga ref tetap terkini untuk clearDraft di handler (submit/discard).
  useEffect(() => {
    draftNumberRef.current = String(currentQuestionnaireNumber || '');
  }, [currentQuestionnaireNumber]);

  // Kembali ke pertanyaan Nomor Kuesioner (mis. saat nomor ternyata sudah dipakai
  // TPD lain) — di wizard pindah step; di mode scroll cukup scroll ke elemennya.
  const goToUniqueIdStep = useCallback(() => {
    if (!uniqueIdQuestion) return;
    const idx = visibleQuestions.findIndex((q) => q.id === uniqueIdQuestion.id);
    if (idx >= 0) {
      setShowOverview(false);
      setCurrentStep(idx);
    }
    // Scroll bila elemennya ada (mode scroll; di wizard baru ada setelah re-render).
    setTimeout(() => {
      const el = document.getElementById(`question-${uniqueIdQuestion.id}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }, [uniqueIdQuestion, visibleQuestions]);

  // ─── Isi otomatis jenis kelamin dari paritas Nomor Kuesioner ────────────────
  // Pertanyaan single_choice yang ditandai admin (auto_fill) akan terisi otomatis
  // dari nomor kuesioner: ganjil → odd_value, genap → even_value. Tetap bisa
  // diubah TPD (auto-fill hanya diterapkan ulang saat nomor berubah).
  const genderAutoFillQuestion = useMemo(
    () => questions.find(
      (q) => q.type === 'single_choice' && q.auto_fill && q.auto_fill.source === 'questionnaire_number_parity'
    ) || null,
    [questions]
  );
  useEffect(() => {
    if (!genderAutoFillQuestion) return;
    const numStr = String(currentQuestionnaireNumber || '').trim();
    // Butuh bilangan bulat untuk menentukan paritas ganjil/genap.
    if (!/^\d+$/.test(numStr)) return;
    if (genderAppliedNumberRef.current === numStr) return; // sudah diterapkan untuk nomor ini
    const isEven = parseInt(numStr, 10) % 2 === 0;
    const value = isEven ? genderAutoFillQuestion.auto_fill.even_value : genderAutoFillQuestion.auto_fill.odd_value;
    genderAppliedNumberRef.current = numStr;
    setAnswers((prev) => {
      if (prev[genderAutoFillQuestion.id] === value) return prev;
      return { ...prev, [genderAutoFillQuestion.id]: value };
    });
  }, [currentQuestionnaireNumber, genderAutoFillQuestion]);

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
        } else if (!cancelled) {
          // Server menolak membuka form (mis. kunci perangkat, kuota habis,
          // survei tidak aktif). Tampilkan POP-UP lalu kembali ke Daftar Survei —
          // lebih ramah daripada laman peringatan buntu (terutama di Android).
          const msg = err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.';
          toastError(msg, { duration: 6000 });
          navigate('/surveyor', { replace: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  // navigate stabil dari react-router; sengaja tidak masuk deps agar init tak berulang.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ─── Capture start geolocation on form load (Requirement 2.1) ──────────────
  // Pantau GPS sejak form dibuka. Fix valid PERTAMA disimpan sebagai lokasi awal
  // wawancara lalu pantauan dihentikan (hemat baterai). Pendekatan ini memberi
  // GPS waktu menit-an untuk mengunci satelit — penting saat OFFLINE (fix lambat),
  // sehingga lokasi hampir selalu tersedia saat submit tanpa perlu internet.
  useEffect(() => {
    if (fieldToolsSettings.gps_mode === 'disabled') return undefined;

    let cancelled = false;
    let stopped = false;
    let cleanup = () => {};
    setGpsSearching(true);

    watchLocation((pos) => {
      if (cancelled || stopped || pos.lat == null || pos.lng == null) return;
      stopped = true;
      setStartGeo({ status: 'available', lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
      setGpsSearching(false);
      cleanup(); // hentikan pantauan setelah dapat fix pertama
    }).then((fn) => {
      cleanup = fn;
      if (cancelled || stopped) fn();
    });

    return () => {
      cancelled = true;
      setGpsSearching(false);
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldToolsSettings.gps_mode]);

  // ─── Auto-mulai rekaman saat audio WAJIB ───────────────────────────────────
  // Jika audio_mode = 'required', rekaman dimulai otomatis begitu form survei
  // terbuka sehingga surveyor tidak perlu menekan tombol dan tidak lupa merekam.
  // Untuk mode 'optional', perilaku tetap manual seperti semula (tidak auto-mulai).
  // Bila izin mikrofon ditolak, panel tetap menampilkan tombol rekam manual.
  const autoRecordAttemptedRef = useRef(false);
  useEffect(() => {
    if (loading || !survey) return;
    if (fieldToolsSettings.audio_mode !== 'required') return;
    if (!audioRecorder.isSupported) return;
    if (autoRecordAttemptedRef.current) return;
    autoRecordAttemptedRef.current = true;
    // Aturan jeda mulai (audio_start_delay_sec): tunda rekaman agar obrolan
    // pembuka tidak ikut terekam. Bila 0 → mulai langsung seperti sebelumnya.
    if (audioStartDelaySec > 0) {
      const delayId = setTimeout(() => { audioRecorder.startRecording(); }, audioStartDelaySec * 1000);
      return () => clearTimeout(delayId);
    }
    audioRecorder.startRecording();
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, survey, fieldToolsSettings.audio_mode, audioRecorder.isSupported]);

  // ─── Orkestrasi rekaman "awal + akhir" ──────────────────────────────────────
  // Jeda otomatis setelah segmen awal (~1,5 mnt) BILA belum di pertanyaan
  // terakhir — sisa jatah dipakai merekam penutupan. Bila wawancara singkat
  // (sampai pertanyaan terakhir sebelum jatah awal habis), rekaman lanjut terus.
  useEffect(() => {
    if (fieldToolsSettings.audio_mode === 'disabled') return;
    const lastIndex = visibleQuestions.length - 1;
    if (
      audioRecorder.status === 'recording' &&
      audioRecorder.duration >= audioFirstSegmentSec &&
      currentStep < lastIndex
    ) {
      audioRecorder.pauseRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioRecorder.status, audioRecorder.duration, currentStep, visibleQuestions.length, fieldToolsSettings.audio_mode]);

  // Lanjutkan rekaman saat SAMPAI pertanyaan terakhir (menangkap penutupan).
  useEffect(() => {
    if (fieldToolsSettings.audio_mode === 'disabled') return;
    const lastIndex = visibleQuestions.length - 1;
    if (lastIndex < 0 || currentStep !== lastIndex) return;
    if (audioRecorder.status === 'paused') {
      audioRecorder.resumeRecording();
    } else if (
      audioRecorder.status === 'idle' &&
      audioRecorder.isSupported &&
      fieldToolsSettings.audio_mode === 'required'
    ) {
      // Wawancara mencapai akhir SEBELUM jeda-mulai berlalu (wawancara singkat +
      // jeda besar) → mulai rekam sekarang agar penutupan tetap terekam & audio
      // wajib tidak kosong. Batalkan jeda tertunda bila masih ada.
      autoRecordAttemptedRef.current = true;
      audioRecorder.startRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, visibleQuestions.length, audioRecorder.status, audioRecorder.isSupported, fieldToolsSettings.audio_mode]);

  // ─── Izin di AWAL (priming) ──────────────────────────────────────────────────
  // Dialog izin mik/kamera yang muncul di TENGAH wawancara mengganggu dan bisa
  // membuyarkan responden (dilaporkan di web iPhone & APK Realme). Minta sekali
  // saat form siap:
  // - GPS: sudah diminta alur startGeo di atas.
  // - Mik: prime untuk SEMUA mode aktif (required & optional) — auto-rekam pada
  //   mode required TIDAK bisa diandalkan memunculkan dialog di awal (uji Realme:
  //   banner "izin mikrofon diperlukan" muncul di tengah pertanyaan).
  // - Kamera: prime bila foto diaktifkan (native via plugin, web via getUserMedia).
  // Catatan: bila izin sudah DITOLAK PERMANEN di HP, Android tidak menampilkan
  // dialog lagi — banner error tiap fitur yang memandu ke Pengaturan HP.
  const permsPrimedRef = useRef(false);
  useEffect(() => {
    if (permsPrimedRef.current) return;
    if (loading || questions.length === 0) return;
    permsPrimedRef.current = true;
    primeMediaPermissions({
      audio: fieldToolsSettings.audio_mode !== 'disabled',
      camera: fieldToolsSettings.photo_mode !== 'disabled',
    }).catch(() => { /* non-kritis */ });
  }, [loading, questions.length, fieldToolsSettings]);

  // Ambil lokasi GPS secara manual (tombol "Coba Ambil Lokasi").
  const refreshStartGeo = useCallback(async () => {
    setGpsSearching(true);
    try {
      const geo = await getLocation();
      setStartGeo(geo);
    } catch {
      setStartGeo({ status: 'lokasi_tidak_tersedia', lat: null, lng: null });
    } finally {
      setGpsSearching(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          timeout: 120000, // unggah media: beri waktu lebih untuk koneksi lambat
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

      // Skip photo validation when offline (photos are optional offline).
      // Pakai isOnline (@capacitor/network) — navigator.onLine tak akurat di WebView.
      if (q.type === 'photo' && !isOnline) continue;

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
  }, [visibleQuestions, answers, photoPaths, isOnline]);

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
      // Skip photo validation when offline (isOnline = @capacitor/network)
      if (question.type === 'photo' && !isOnline) {
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

    // Nomor kuesioner yang sudah dipakai TPD lain (cek live) → blokir Lanjut.
    if (question.type === 'unique_id' && isOnline && uniqueAvailability === 'taken') {
      setErrorQuestionIds(new Set([question.id]));
      return false;
    }

    // Opsi "Lainnya" dipilih tapi teks kosong → wajib diisi sebelum lanjut.
    // Berlaku walau pertanyaan tidak wajib: kalau memilih Lainnya, teksnya harus ada.
    if (otherTextMissing(answers[question.id])) {
      setValidationErrors((prev) => ({ ...prev, [question.id]: 'Isi teks untuk pilihan "Lainnya" sebelum lanjut.' }));
      return false;
    }

    // Check answer validation errors
    if (validationErrors[question.id]) {
      return false;
    }

    return true;
  }, [visibleQuestions, currentStep, answers, photoPaths, validationErrors, isOnline, uniqueAvailability]);

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

    // 2a. Opsi "Lainnya" dipilih tapi teks kosong (di pertanyaan mana pun yang
    // terlihat) → blokir. Menangkap kasus TPD melompati pertanyaan via grid
    // ikhtisar tanpa lewat tombol "Lanjut".
    const otherMissing = visibleQuestions.filter((q) => otherTextMissing(answers[q.id])).map((q) => q.id);
    if (otherMissing.length > 0) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        otherMissing.forEach((qid) => { next[qid] = 'Isi teks untuk pilihan "Lainnya" sebelum menyimpan.'; });
        return next;
      });
      const el = document.getElementById(`question-${otherMissing[0]}`);
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

    // 2b-2. Validate required FOTO & AUDIO di KLIEN — cermin persis aturan server
    // (fieldToolsValidator: 'Foto wajib diisi' / 'Rekaman audio wajib diisi').
    // Tanpa ini, jalur simpan OFFLINE membolehkan foto/audio kosong lalu GAGAL
    // saat sinkron (422) dan data nyangkut di antrean "Gagal". Gate ini berlaku
    // untuk online DAN offline (sebelum antre), jadi kegagalan muncul di depan.
    if (fieldToolsSettings.photo_mode === 'required' && photoCapture.photos.length === 0) {
      setSubmitError('Foto wajib diisi. Tekan "Ambil Foto" dan ambil minimal satu foto sebelum menyimpan.');
      return;
    }
    // Audio dianggap ada bila: sedang/pernah direkam sesi ini, atau ada segmen
    // dari pending sebelumnya (draft_media). audio_mode='required' otomatis mulai
    // merekam, jadi ini menangkap kasus izin mikrofon ditolak (rekaman kosong).
    const audioAvailable =
      audioRecorder.status === 'recording' ||
      audioRecorder.status === 'paused' ||
      !!audioRecorder.audioBlob ||
      priorAudioCount > 0;
    if (fieldToolsSettings.audio_mode === 'required' && !audioAvailable) {
      setSubmitError('Rekaman audio wajib diisi, tetapi belum ada rekaman. Pastikan izin mikrofon diberikan lalu ulangi wawancara.');
      return;
    }

    // 2c. Validate required GPS — pastikan lokasi awal sudah didapat sebelum submit.
    // Hard-block HANYA di platform native (Android APK) yang bisa fix satelit
    // murni tanpa internet. Di WEB (mis. iPhone/Safari) geolokasi sering tak
    // dapat fix saat offline/di dalam ruangan, sehingga GPS wajib akan MEMBLOKIR
    // pengumpulan data — di sana GPS jadi "best-effort": tetap dicoba & statusnya
    // direkam, tapi tidak menghalangi simpan/kirim. (Mengutamakan data terkumpul.)
    if (
      isNativePlatform() &&
      fieldToolsSettings.gps_mode === 'required' &&
      (!startGeo || startGeo.status !== 'available' || startGeo.lat == null || startGeo.lng == null)
    ) {
      setSubmitError(
        gpsSearching
          ? 'Lokasi GPS wajib dan masih dicari. Tunggu sebentar lalu coba lagi — pastikan berada di luar ruangan.'
          : 'Lokasi GPS wajib tapi belum didapat. Tekan "Coba Ambil Lokasi" dan pastikan berada di luar ruangan.'
      );
      const el = document.getElementById('gps-status-section');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // ─── Gerbang AWAL nomor kuesioner (online) ─────────────────────────────
    // Cek ke server SEBELUM menghentikan rekaman / mengunggah media: bila nomor
    // ternyata sudah diisi TPD lain (race saat mengisi bersamaan), hentikan di
    // sini dengan pesan jelas — jawaban tetap ada, TPD tinggal ganti nomor.
    // Tanpa gerbang ini kegagalan baru muncul di ujung (constraint DB) setelah
    // media terunggah — buang waktu.
    const uniqueVal = uniqueIdQuestion ? String(answers[uniqueIdQuestion.id] || '').trim() : '';
    if (uniqueIdQuestion && uniqueVal && isOnline) {
      try {
        const chk = await api.post('/responses/check-unique', {
          survey_id: id,
          question_id: uniqueIdQuestion.id,
          value: uniqueVal,
        });
        if (!chk.data.available) {
          markNumberUsed(uniqueVal);
          setSubmitError(
            `Nomor kuesioner ${uniqueVal} sudah diisi TPD lain. Pilih/ganti nomor lain lalu simpan lagi — jawaban Anda tetap tersimpan.`
          );
          goToUniqueIdStep();
          return;
        }
      } catch { /* cek gagal (jaringan) — lanjutkan; server tetap penjaga akhir */ }
    }

    // Auto-stop rekaman & ambil blob final sebelum menyusun payload — rekaman
    // otomatis ikut terkirim tanpa perlu menekan tombol berhenti.
    let recordedAudioBlob = audioRecorder.audioBlob;
    if (
      fieldToolsSettings.audio_mode !== 'disabled' &&
      (audioRecorder.status === 'recording' || audioRecorder.status === 'paused')
    ) {
      recordedAudioBlob = await audioRecorder.stopAndGetBlob();
    }

    // Kumpulkan SEMUA segmen audio: segmen dari pending sebelumnya (tersimpan di
    // draft_media) + segmen sesi ini. Agar wawancara yang sempat di-pending lalu
    // dilanjutkan tetap terekam utuh (beberapa bagian).
    async function collectAudioSegments() {
      const segments = [];
      if (fieldToolsSettings.audio_mode === 'disabled') return segments;
      try {
        const dm = await getDraftMedia(id, draftNumberRef.current);
        for (const m of dm) if (m.type === 'audio' && m.blob) segments.push(m.blob);
      } catch { /* draft media tak tersedia — abaikan */ }
      if (recordedAudioBlob) segments.push(recordedAudioBlob);
      return segments;
    }

    const hasMediaUpload =
      (fieldToolsSettings.audio_mode !== 'disabled' && recordedAudioBlob) ||
      (fieldToolsSettings.photo_mode !== 'disabled' && photoCapture.photos.length > 0) ||
      (fieldToolsSettings.signature_mode !== 'disabled' && !signaturePad.isEmpty);

    if (hasMediaUpload) {
      setMediaUploadMessage('Mengunggah file media...');
    }

    setSubmitting(true);

    // Simpan jawaban + media ke antrean offline (IndexedDB). Dipakai saat
    // offline terdeteksi DAN sebagai jaring pengaman bila kirim online gagal
    // karena jaringan / sesi kedaluwarsa — supaya data tidak pernah hilang.
    const enqueueOffline = async () => {
      setMediaUploadMessage('Menyimpan data ke perangkat...');

      const audioSegments = await collectAudioSegments();

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
        has_audio: fieldToolsSettings.audio_mode !== 'disabled' && audioSegments.length > 0,
        has_signature: fieldToolsSettings.signature_mode !== 'disabled' && !signaturePad.isEmpty,
        photo_count: fieldToolsSettings.photo_mode !== 'disabled' ? photoCapture.photos.length : 0,
        // Waktu wawancara ASLI (mulai → tekan simpan). WAJIB untuk data offline:
        // sesi /responses/start baru dibuat saat SINKRON (bisa berjam/hari kemudian),
        // sehingga tanpa ini durasi server ≈ 0. Dikirim ke server oleh sync manager.
        client_start_time: interviewStartRef.current ? new Date(interviewStartRef.current).toISOString() : null,
        client_end_time: new Date().toISOString(),
      });

      // Save media files to offline storage in parallel (with compression)
      const offlineMediaSaves = [];
      if (fieldToolsSettings.audio_mode !== 'disabled' && audioSegments.length > 0) {
        setMediaUploadMessage('Menyimpan rekaman audio...');
        audioSegments.forEach((seg, i) => {
          offlineMediaSaves.push(
            saveMediaFile({
              localId,
              type: 'audio',
              blob: seg,
              filename: `recording-${i}.webm`,
            })
          );
        });
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

      // Sukses tersimpan ke antrian — hapus draft (jawaban + media pending) & buka sukses.
      clearDraft(id, draftNumberRef.current);
      try { await deleteDraftMedia(id, draftNumberRef.current); } catch { /* non-kritis */ }
      navigate(`/surveyor/survey/${id}/success`, {
        state: { offline: true, survey_id: id },
      });
    };

    // Deteksi jaringan yang ANDAL. navigator.onLine TIDAK akurat di WebView
    // Android (mis. Realme Narzo 50 / IQOO Z10R bisa tetap melaporkan "online"
    // padahal tak ada internet) — akibatnya data salah jalur ke pengiriman
    // online lalu hilang saat sesi ditolak. @capacitor/network membaca status
    // OS, jadi jadikan sumber kebenaran; fallback ke navigator.onLine hanya
    // bila plugin gagal.
    let networkConnected = navigator.onLine;
    try {
      const netStatus = await getNetworkStatus();
      networkConnected = netStatus.connected;
    } catch { /* pakai navigator.onLine */ }

    if (!networkConnected) {
      // ─── Offline submit: enqueue to IndexedDB ───────────────────────
      try {
        await enqueueOffline();
      } catch {
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
      let signature_path = null;
      const media_photo_paths = [];
      const media_audio_paths = [];

      // Audio: bisa beberapa segmen (wawancara di-pending lalu dilanjutkan).
      // Diunggah BERURUTAN agar audio_paths tetap urut.
      if (fieldToolsSettings.audio_mode !== 'disabled') {
        const audioSegments = await collectAudioSegments();
        for (let i = 0; i < audioSegments.length; i++) {
          setMediaUploadMessage('Mengunggah rekaman audio...');
          const audioFormData = new FormData();
          audioFormData.append('audio', audioSegments[i], `recording-${i}.webm`);
          const uploadRes = await api.post('/upload/audio', audioFormData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
          });
          media_audio_paths.push(uploadRes.data.path);
        }
      }

      const uploadPromises = [];
      if (fieldToolsSettings.photo_mode !== 'disabled') {
        for (const photo of photoCapture.photos) {
          const compressed = await compressIfNeeded(photo.blob);
          const photoFormData = new FormData();
          photoFormData.append('photo', compressed, photo.blob.name || 'photo.jpg');
          uploadPromises.push(
            api.post('/upload/photo', photoFormData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 120000,
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
              timeout: 120000,
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

      if (media_audio_paths.length > 0) submitPayload.audio_paths = media_audio_paths;
      if (signature_path) submitPayload.signature_path = signature_path;
      if (media_photo_paths.length > 0) submitPayload.photo_paths = media_photo_paths;
      if (fieldToolsSettings.gps_mode !== 'disabled' && startGeo) {
        submitPayload.start_latitude = startGeo.lat;
        submitPayload.start_longitude = startGeo.lng;
        submitPayload.start_geo_status = startGeo.status;
      }
      // Durasi wawancara AKURAT dari klien (mulai wawancara → tekan simpan).
      if (interviewStartRef.current) {
        submitPayload.client_start_time = new Date(interviewStartRef.current).toISOString();
        submitPayload.client_end_time = new Date().toISOString();
      }

      const res = await api.post('/responses/submit', submitPayload);

      const { questionnaire_number } = res.data;

      // Sukses terkirim — hapus draft (jawaban + media pending).
      clearDraft(id, draftNumberRef.current);
      try { await deleteDraftMedia(id, draftNumberRef.current); } catch { /* non-kritis */ }

      // 6. Navigate to success page (Requirement 13.3)
      navigate(`/surveyor/survey/${id}/success`, {
        state: { questionnaire_number, survey_id: id },
      });
    } catch (err) {
      const errData = err.response?.data;
      // Jaring pengaman: gagal karena JARINGAN (tak ada respons server) atau
      // sesi kedaluwarsa (401) → simpan ke antrean offline agar data TIDAK
      // hilang. Deteksi online di atas bisa keliru, atau koneksi putus/lemah
      // di tengah pengiriman. Data tersinkron otomatis setelah online / login
      // ulang. (Pada 401 interceptor tetap mengalihkan ke login, tapi data
      // sudah aman tersimpan lebih dulu.)
      if (!err.response || err.response.status === 401) {
        try {
          await enqueueOffline();
          return;
        } catch {
          setSubmitError('Koneksi bermasalah dan gagal menyimpan ke perangkat. Data masih tampil di layar — coba lagi.');
        }
      } else if (errData?.validation_errors) {
        // Backend validation errors: populate validationErrors and scroll to first
        const backendErrors = {};
        for (const ve of errData.validation_errors) {
          backendErrors[ve.question_id] = ve.error;
        }
        setValidationErrors((prev) => ({ ...prev, ...backendErrors }));
        const firstQid = errData.validation_errors[0]?.question_id;
        // Nomor kuesioner keburu dipakai TPD lain (race di detik terakhir) →
        // tandai terpakai & kembali ke langkah nomor agar mudah diganti.
        if (uniqueIdQuestion && backendErrors[uniqueIdQuestion.id]) {
          markNumberUsed(String(answers[uniqueIdQuestion.id] || ''));
          goToUniqueIdStep();
        } else if (firstQid) {
          // Wizard: lompat ke langkah pertanyaan bermasalah (scroll saja tidak
          // cukup karena elemennya belum dirender di step lain).
          const idx = visibleQuestions.findIndex((q) => q.id === firstQid);
          if (idx >= 0) { setShowOverview(false); setCurrentStep(idx); }
          setTimeout(() => {
            const el = document.getElementById(`question-${firstQid}`);
            if (el && typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 50);
        }
        setSubmitError(errData.error || 'Validasi jawaban gagal');
      } else if (errData?.missing_questions) {
        // Server-side validation: highlight missing questions
        setErrorQuestionIds(new Set(errData.missing_questions));
        setSubmitError('Harap isi semua pertanyaan wajib yang ditandai.');
      } else {
        // Backstop unique-constraint (422 tanpa validation_errors) yang pesannya
        // menyebut nomor sudah digunakan → perlakukan sama: tandai & kembali.
        const msg = errData?.error || errData?.message || '';
        if (uniqueIdQuestion && err.response?.status === 422 && /nomor|unik|sudah digunakan/i.test(msg)) {
          markNumberUsed(String(answers[uniqueIdQuestion.id] || ''));
          goToUniqueIdStep();
        }
        setSubmitError(
          msg || 'Gagal menyimpan data. Silakan coba kembali.'
        );
      }
    } finally {
      setSubmitting(false);
      setMediaUploadMessage('');
    }
    // Deps di-kurasi manual untuk handler submit besar ini; menyerahkan ke
    // exhaustive-deps berisiko memicu pembuatan-ulang callback yang tak perlu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    uniqueIdQuestion,
    markNumberUsed,
    goToUniqueIdStep,
  ]);

  // ─── Pending (tunda) media: audio segmen sebelumnya + status simpan ─────────
  const [priorAudioCount, setPriorAudioCount] = useState(0);
  const [savingPend, setSavingPend] = useState(false);

  // Simpan media sesi ini ke draft_media agar TIDAK hilang saat nomor kuesioner
  // di-pending (audio dihentikan & disimpan sebagai segmen; foto & tanda tangan
  // ikut). Dipanggil sebelum keluar form (pending).
  const persistPendMedia = useCallback(async () => {
    const num = draftNumberRef.current;
    // Audio: hentikan rekaman sesi ini & simpan sebagai segmen berikutnya.
    if (fieldToolsSettings.audio_mode !== 'disabled') {
      let sessionBlob = null;
      if (audioRecorder.status === 'recording' || audioRecorder.status === 'paused') {
        sessionBlob = await audioRecorder.stopAndGetBlob();
      } else if (audioRecorder.status === 'stopped') {
        sessionBlob = audioRecorder.audioBlob;
      }
      if (sessionBlob && sessionBlob.size > 0) {
        try {
          const existing = await getDraftMedia(id, num);
          const audioCount = existing.filter((m) => m.type === 'audio').length;
          await saveDraftMedia({ surveyId: id, number: num, type: 'audio', blob: sessionBlob, filename: `recording-${audioCount}.webm`, seq: audioCount });
        } catch { /* non-kritis */ }
      }
    }
    // Foto: ganti set foto draft dengan yang ada di layar (restored + baru).
    if (fieldToolsSettings.photo_mode !== 'disabled') {
      try {
        await deleteDraftMedia(id, num, 'photo');
        let i = 0;
        for (const photo of photoCapture.photos) {
          const compressed = await compressIfNeeded(photo.blob);
          await saveDraftMedia({ surveyId: id, number: num, type: 'photo', blob: compressed, filename: photo.blob.name || `photo-${i}.jpg`, seq: i });
          i += 1;
        }
      } catch { /* non-kritis */ }
    }
    // Tanda tangan: strokes → localStorage draft.
    const strokes = fieldToolsSettings.signature_mode !== 'disabled' ? signaturePad.getStrokes() : [];
    saveDraft(id, num, { answers, currentStep, totalSteps: visibleQuestions.length, signatureStrokes: strokes, startedAt: interviewStartRef.current });
  }, [id, fieldToolsSettings, audioRecorder, photoCapture, signaturePad, answers, currentStep, visibleQuestions.length]);

  // Amankan draft SEBELUM membuka kamera native. Tidak menyentuh audio (rekaman
  // tetap berjalan); hanya menyimpan jawaban + tanda tangan + foto yang sudah ada
  // agar cold-reload akibat activity-kill (HP RAM kecil) tidak menghilangkan data.
  const persistBeforeCamera = useCallback(async () => {
    const num = draftNumberRef.current;
    const strokes = fieldToolsSettings.signature_mode !== 'disabled' ? signaturePad.getStrokes() : [];
    saveDraft(id, num, { answers, currentStep, totalSteps: visibleQuestions.length, signatureStrokes: strokes, startedAt: interviewStartRef.current });
    if (fieldToolsSettings.photo_mode !== 'disabled' && photoCapture.photos.length > 0) {
      try {
        await deleteDraftMedia(id, num, 'photo');
        let i = 0;
        for (const photo of photoCapture.photos) {
          const compressed = await compressIfNeeded(photo.blob);
          await saveDraftMedia({ surveyId: id, number: num, type: 'photo', blob: compressed, filename: photo.blob.name || `photo-${i}.jpg`, seq: i });
          i += 1;
        }
      } catch { /* non-kritis */ }
    }
  }, [id, fieldToolsSettings, photoCapture, signaturePad, answers, currentStep, visibleQuestions.length]);

  // ─── Exit guard: cegah kehilangan data saat keluar form ─────────────────────
  const hasUnsavedContent = useCallback(() => {
    const anyMedia =
      !!audioRecorder.audioBlob ||
      audioRecorder.status === 'recording' ||
      audioRecorder.status === 'paused' ||
      photoCapture.photos.length > 0 ||
      !signaturePad.isEmpty;
    return answersHaveContent(answers) || anyMedia;
  }, [answers, audioRecorder.audioBlob, audioRecorder.status, photoCapture.photos.length, signaturePad.isEmpty]);

  // Keluar form: konfirmasi bila ada data belum dikirim (draft tetap disimpan).
  const handleBackClick = useCallback(() => {
    if (hasUnsavedContent()) {
      setShowExitConfirm(true);
    } else {
      clearDraft(id, draftNumberRef.current);
      navigate('/surveyor');
    }
  }, [hasUnsavedContent, id, navigate]);

  const pendingExitRef = useRef(false);
  const handleConfirmExit = useCallback(async () => {
    if (pendingExitRef.current) return; // cegah dobel-tap → segmen audio ganda
    pendingExitRef.current = true;
    // Pending: simpan data + media (rekaman/foto/ttd) dulu agar bisa dilanjutkan
    // nanti tanpa kehilangan apa pun. Draft sengaja TIDAK dihapus.
    setSavingPend(true);
    try {
      await persistPendMedia();
    } catch { /* tetap keluar; jawaban sudah tersimpan via autosave */ }
    setSavingPend(false);
    setShowExitConfirm(false);
    navigate('/surveyor');
  }, [navigate, persistPendMedia]);

  // Hapus draft & mulai dari awal (dipicu dari banner "Draft dipulihkan").
  const handleDiscardDraft = useCallback(() => {
    clearDraft(id, draftNumberRef.current);
    deleteDraftMedia(id, draftNumberRef.current).catch(() => {});
    setPriorAudioCount(0);
    photoCapture.clearPhotos();
    signaturePad.clear();
    setAnswers(applyPreselectedNumber(questions, buildEmptyAnswers(questions)));
    setDraftRestored(false);
    startInterviewClock(Date.now()); // wawancara baru → timer mulai ulang
  }, [id, questions, photoCapture, signaturePad, startInterviewClock]);

  // Tombol back Android — daftarkan listener sekali, baca logic terkini via ref.
  const exitGuardRef = useRef(() => {});
  exitGuardRef.current = handleBackClick;
  useEffect(() => {
    let cleanup = () => {};
    addBackButtonListener(() => { exitGuardRef.current(); return true; })
      .then((fn) => { cleanup = fn; });
    return () => cleanup();
  }, []);

  // Cegah refresh/close browser saat ada data belum dikirim (web).
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedContent()) { e.preventDefault(); e.returnValue = ''; return ''; }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedContent]);

  // ─── Draft autosave & restore ───────────────────────────────────────────────
  // Pulihkan draft sekali setelah pertanyaan dimuat.
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (loading || questions.length === 0) return;
    draftRestoredRef.current = true;
    // Nomor saat form dibuka (dari Daftar Survei) menentukan draft mana dipulihkan.
    const entryNumber = preselectedNumberRef.current != null ? String(preselectedNumberRef.current) : '';
    prevDraftNumberRef.current = entryNumber;
    const draft = loadDraft(id, entryNumber);
    // Mulai/lanjutkan jam wawancara: pakai startedAt draft bila ada (lanjutan),
    // kalau tidak mulai sekarang (wawancara baru).
    startInterviewClock(draft && Number.isFinite(draft.startedAt) ? draft.startedAt : Date.now());
    if (draft && answersHaveContent(draft.answers)) {
      setAnswers((prev) => ({ ...prev, ...draft.answers }));
      // Jangan timpa jenis kelamin yang mungkin sudah dikoreksi manual di draft:
      // tandai nomor ini sudah "diterapkan" agar efek isi-otomatis tidak menimpanya.
      const restoredNum = String(
        (uniqueIdQuestion && draft.answers[uniqueIdQuestion.id]) || entryNumber || ''
      ).trim();
      if (/^\d+$/.test(restoredNum)) genderAppliedNumberRef.current = restoredNum;
      // Pulihkan posisi pertanyaan terakhir (fitur "Lanjut" dari daftar).
      if (Number.isInteger(draft.currentStep) && draft.currentStep > 0) {
        preselectJumpedRef.current = true; // jangan ditimpa lompatan preselect
        setCurrentStep(Math.min(draft.currentStep, Math.max(visibleQuestions.length - 1, 0)));
      }
      // Pulihkan tanda tangan (strokes) bila ada.
      if (Array.isArray(draft.signatureStrokes) && draft.signatureStrokes.length > 0) {
        signaturePad.loadStrokes(draft.signatureStrokes);
      }
      setDraftRestored(true);
    }
    // Pulihkan media pending (segmen audio + foto) dari draft_media agar tidak
    // hilang. Foto dimuat kembali ke panel; jumlah segmen audio ditampilkan.
    (async () => {
      try {
        const media = await getDraftMedia(id, entryNumber);
        const audioSegs = media.filter((m) => m.type === 'audio');
        if (audioSegs.length > 0) setPriorAudioCount(audioSegs.length);
        for (const m of media) {
          if (m.type === 'photo' && m.blob) {
            const file = m.blob instanceof File ? m.blob : new File([m.blob], m.filename || 'photo.jpg', { type: m.blob.type || 'image/jpeg' });
            photoCapture.addPhoto(file);
          }
        }
      } catch { /* non-kritis */ }
    })();
  // Pemulihan sekali-jalan (dijaga draftRestoredRef); deps dikurasi manual.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, questions.length, id, visibleQuestions.length]);

  // Simpan draft (debounced) per NOMOR saat jawaban / posisi berubah.
  useEffect(() => {
    if (loading || questions.length === 0 || !draftRestoredRef.current) return;
    const num = String(currentQuestionnaireNumber || '');
    const t = setTimeout(() => {
      // Nomor berubah (mis. baru diisi) → pindah slot, bersihkan slot lama.
      if (prevDraftNumberRef.current !== num) {
        clearDraft(id, prevDraftNumberRef.current);
        prevDraftNumberRef.current = num;
      }
      if (answersHaveContent(answers)) {
        saveDraft(id, num, { answers, currentStep, totalSteps: visibleQuestions.length, startedAt: interviewStartRef.current });
      } else {
        clearDraft(id, num);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [answers, currentStep, visibleQuestions.length, currentQuestionnaireNumber, loading, questions.length, id]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-600" />
        <span className="ml-3 text-gray-500">Memuat survei…</span>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-screen">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full text-center">
          <p className="text-red-700 text-sm mb-4">{loadingError}</p>
          <button
            onClick={() => navigate('/surveyor')}
            className="text-sm text-accent-600 underline"
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
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-screen py-4 flex items-center gap-3">
          <button
            onClick={handleBackClick}
            className="text-gray-500 hover:text-gray-700 transition-colors p-1 -ml-1"
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
              <span className="inline-flex items-center gap-1 mt-0.5 text-xs font-semibold text-accent-700 bg-accent-50 border border-accent-200 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Kuesioner No. {currentQuestionnaireNumber}
              </span>
            ) : survey?.description ? (
              <p className="text-xs text-gray-500 truncate">{survey.description}</p>
            ) : null}
          </div>
          <InterviewTimerBadge startAt={interviewStartAt} />
          <OfflineStatusBar isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} />
        </div>

        {/* Progress indicator — only in wizard mode */}
        {formMode === 'wizard' && totalSteps > 0 && !showOverview && (
          <div className="max-w-2xl mx-auto px-screen pb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-600">
                Pertanyaan {currentStep + 1} dari {totalSteps}
              </span>
              <button
                type="button"
                onClick={() => setShowOverview(true)}
                className="text-xs text-accent-600 hover:text-accent-800 font-medium transition-colors"
              >
                Lihat Semua
              </button>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-600 transition-all duration-300"
                style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Audio recorder panel — sticky in header */}
        <div className="max-w-2xl mx-auto px-screen pb-2">
          {fieldToolsSettings.audio_mode !== 'disabled' && (
            <div>
              {/* Indikator rekaman diatur admin per survei (audio_indicator).
                  'hidden' → tak tampil sama sekali di web & Android; rekaman
                  tetap berjalan otomatis. 'shown' → tampil (mis. saat uji). */}
              {fieldToolsSettings.audio_indicator !== 'hidden' && (
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs font-medium text-gray-600">Rekaman Audio</span>
                  <FieldToolModeLabel mode={fieldToolsSettings.audio_mode} />
                </div>
              )}
              <AudioRecorderPanel
                audioRecorder={audioRecorder}
                hideControlsDefault={isNativePlatform()}
                hideIndicator={fieldToolsSettings.audio_indicator === 'hidden'}
              />
              {fieldToolsSettings.audio_indicator !== 'hidden' && priorAudioCount > 0 && (
                <p className="mt-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                  {priorAudioCount} bagian rekaman sebelumnya tersimpan &amp; akan ikut terkirim. Rekaman baru menjadi bagian lanjutan.
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-screen py-6 space-y-6">
        {/* Banner draft dipulihkan */}
        {draftRestored && (
          <div className="bg-accent-50 border border-accent-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm text-accent-800">Draft dipulihkan — jawaban, rekaman, foto &amp; tanda tangan sebelumnya ikut.</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-xs font-semibold text-accent-700 hover:text-accent-900 underline"
              >
                Mulai Baru
              </button>
              <button
                type="button"
                onClick={() => setDraftRestored(false)}
                className="text-xs font-medium text-accent-600 hover:text-accent-800"
                aria-label="Tutup pemberitahuan draft"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

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
                  className={`bg-white rounded-2xl border border-gray-200 border-l-4 border-l-accent-400 p-5 transition-colors ${
                    hasError ? 'border-red-400 border-l-red-500' : ''
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <p className="font-serif text-lg text-gray-900 leading-snug">
                      <span className="font-sans font-semibold text-accent-500 mr-2">{index + 1}.</span>
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
                          className={`block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent-50 file:text-accent-700 hover:file:bg-accent-100 ${
                            hasError ? 'border border-red-400 rounded-lg p-1 bg-red-50' : ''
                          }`}
                          disabled={uploadingPhoto[question.id]}
                        />
                        {uploadingPhoto[question.id] && (
                          <p className="text-xs text-accent-500 mt-1">Mengunggah foto…</p>
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
                      onAvailabilityChange={setUniqueAvailability}
                      onNumberTaken={markNumberUsed}
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
                <PhotoCapturePanel photoCapture={photoCapture} onBeforeCapture={persistBeforeCamera} />
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

            <GpsStatusPanel
              mode={fieldToolsSettings.gps_mode}
              startGeo={startGeo}
              searching={gpsSearching}
              onRefresh={refreshStartGeo}
            />

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                {submitError}
              </div>
            )}

            {/* Tombol simpan — sticky di bawah, mudah dijangkau jempol */}
            <div className="sticky bottom-0 -mx-screen px-screen pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-cream via-cream/95 to-transparent">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-accent-600 hover:bg-accent-700 disabled:bg-accent-300 text-white font-semibold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-accent-600/20"
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
                className="text-xs text-accent-600 hover:text-accent-800 font-medium transition-colors"
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
                    className={`bg-white rounded-xl border p-3 shadow-sm text-left transition-colors hover:border-accent-400 hover:shadow-md ${
                      index === currentStep ? 'border-accent-500 ring-2 ring-accent-200' : 'border-gray-200'
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
                  className={`transition-colors ${
                    hasError ? 'rounded-2xl border border-red-300 bg-red-50/60 p-4' : ''
                  }`}
                >
                  {/* Question label — gaya editorial (serif) */}
                  <div className="mb-5">
                    <p className="font-serif text-xl text-gray-900 leading-snug">
                      <span className="font-sans font-semibold text-accent-500 mr-1.5">{currentStep + 1}.</span>
                      {question.text}
                      {question.is_required && (
                        <span className="text-red-500 ml-1" aria-label="wajib diisi">*</span>
                      )}
                    </p>
                    {hasError && (
                      <p className="text-sm text-red-500 mt-1.5">Pertanyaan ini wajib diisi</p>
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
                          className={`block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent-50 file:text-accent-700 hover:file:bg-accent-100 ${
                            hasError ? 'border border-red-400 rounded-lg p-1 bg-red-50' : ''
                          }`}
                          disabled={uploadingPhoto[question.id]}
                        />
                        {uploadingPhoto[question.id] && (
                          <p className="text-xs text-accent-500 mt-1">Mengunggah foto…</p>
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
                      onAvailabilityChange={setUniqueAvailability}
                      onNumberTaken={markNumberUsed}
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
                    <PhotoCapturePanel photoCapture={photoCapture} onBeforeCapture={persistBeforeCamera} />
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

                <GpsStatusPanel
                  mode={fieldToolsSettings.gps_mode}
                  startGeo={startGeo}
                  searching={gpsSearching}
                  onRefresh={refreshStartGeo}
                />

                {/* Submit error */}
                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                    {submitError}
                  </div>
                )}
                {mediaUploadMessage && (
                  <div className="flex items-center gap-2 rounded-xl border border-accent-100 bg-accent-50 px-4 py-3 text-sm text-accent-700">
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-accent-700" />
                    <span>{mediaUploadMessage}</span>
                  </div>
                )}
              </div>
            )}

            {/* ─── Navigation buttons (sticky bottom bar) ──────────────────── */}
            {totalSteps > 0 && (
              <div className="sticky bottom-0 -mx-screen px-screen pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3 bg-gradient-to-t from-cream via-cream/95 to-transparent">
                {/* Back button */}
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isFirstStep}
                  className="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-3.5 px-6 rounded-xl transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Kembali
                </button>

                {/* Next / Submit button */}
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-300 text-white font-semibold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-accent-600/20"
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
                    className="flex-1 bg-accent-600 hover:bg-accent-700 text-white font-semibold py-3.5 px-6 rounded-xl transition-colors shadow-lg shadow-accent-600/20"
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

      {/* Konfirmasi pending (tunda) saat ada data belum dikirim */}
      <ConfirmSheet
        open={showExitConfirm}
        iconType="warning"
        title="Tunda nomor kuesioner ini?"
        description="Semua yang sudah diisi — jawaban, rekaman audio, foto, dan tanda tangan — disimpan di perangkat ini dan bisa DILANJUTKAN nanti dari Daftar Survei. Tidak ada yang hilang."
        confirmLabel={savingPend ? 'Menyimpan…' : 'Tunda & Simpan'}
        cancelLabel="Lanjut Mengisi"
        onConfirm={handleConfirmExit}
        onCancel={() => { if (!savingPend) setShowExitConfirm(false); }}
      />
    </div>
  );
}

export default SurveyForm;
