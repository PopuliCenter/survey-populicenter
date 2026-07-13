/**
 * surveyDraft.js — draft jawaban survei (localStorage), PER NOMOR KUESIONER.
 *
 * Dipakai bersama SurveyForm (tulis & pulihkan) dan SurveyList (tampilkan
 * progres "sedang dikerjakan" + Lanjut). Kunci: `survey_draft_<surveyId>__<num>`
 * sehingga BANYAK nomor bisa ditunda paralel — TPD bisa menunda No. 1 dan
 * lanjut mengerjakan No. 2, lalu meneruskan No. 1 kapan saja.
 *
 * Isi tiap draft: { answers, currentStep, totalSteps, signatureStrokes, savedAt }.
 * `num` adalah nomor kuesioner (string). Slot tanpa nomor memakai '' (draft
 * "scratch" saat nomor belum diisi). Tanda tangan disimpan sebagai strokes di
 * sini; segmen AUDIO & FOTO disimpan terpisah di IndexedDB/SQLite (draft_media,
 * lihat storage.js) agar tidak hilang saat di-pending. Draft dihapus setelah
 * submit berhasil atau "Mulai Baru".
 */

const DRAFT_PREFIX = 'survey_draft_';
const SEP = '__';

export function draftKey(surveyId, number) {
  return `${DRAFT_PREFIX}${surveyId}${SEP}${number ?? ''}`;
}

function valueHasContent(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** Apakah map jawaban berisi konten bermakna (bukan sekadar field kosong). */
export function answersHaveContent(answers) {
  return Object.values(answers || {}).some(valueHasContent);
}

/** Jumlah pertanyaan yang sudah terisi pada map jawaban. */
export function countAnswered(answers) {
  return Object.values(answers || {}).filter(valueHasContent).length;
}

/**
 * Simpan draft untuk satu nomor kuesioner.
 * @param {string} surveyId
 * @param {string|number} number - nomor kuesioner ('' bila belum ada)
 * @param {{ answers: object, currentStep?: number, totalSteps?: number }} data
 */
export function saveDraft(surveyId, number, data) {
  try {
    const payload = {
      answers: data.answers || {},
      currentStep: Number.isInteger(data.currentStep) ? data.currentStep : 0,
      totalSteps: Number.isInteger(data.totalSteps) ? data.totalSteps : 0,
      // Tanda tangan (strokes) ikut agar tidak hilang saat di-pending.
      signatureStrokes: Array.isArray(data.signatureStrokes) ? data.signatureStrokes : undefined,
      savedAt: Date.now(),
    };
    localStorage.setItem(draftKey(surveyId, number), JSON.stringify(payload));
  } catch { /* storage penuh / tidak tersedia — abaikan */ }
}

export function loadDraft(surveyId, number) {
  try {
    const raw = localStorage.getItem(draftKey(surveyId, number));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.answers ? parsed : null;
  } catch { return null; }
}

export function clearDraft(surveyId, number) {
  try { localStorage.removeItem(draftKey(surveyId, number)); } catch { /* abaikan */ }
}

/**
 * Semua draft (berisi konten) untuk satu survei.
 * @returns {Array<{ number: string, answers, currentStep, totalSteps, savedAt }>}
 */
export function loadDraftsForSurvey(surveyId) {
  const out = [];
  const prefix = `${DRAFT_PREFIX}${surveyId}${SEP}`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const number = key.slice(prefix.length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw);
        if (d && answersHaveContent(d.answers)) {
          out.push({
            number,
            answers: d.answers,
            currentStep: d.currentStep || 0,
            totalSteps: d.totalSteps || 0,
            savedAt: d.savedAt || 0,
            // Ada tanda tangan tersimpan? (untuk ikon kecil di Daftar Survei)
            hasSignature: Array.isArray(d.signatureStrokes) && d.signatureStrokes.length > 0,
          });
        }
      } catch { /* entri rusak — lewati */ }
    }
  } catch { /* localStorage tak tersedia */ }
  return out;
}

/** Draft untuk banyak survei → { [surveyId]: Array<draft> } (hanya yang ada). */
export function loadAllDraftsBySurvey(surveyIds) {
  const map = {};
  for (const id of surveyIds || []) {
    const arr = loadDraftsForSurvey(id);
    if (arr.length) map[id] = arr;
  }
  return map;
}
