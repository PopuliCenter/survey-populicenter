/**
 * surveyDraft.js — draft jawaban survei (localStorage).
 *
 * Dipakai bersama oleh SurveyForm (tulis & pulihkan) dan SurveyList (tampilkan
 * progres "sedang dikerjakan" + tombol Lanjut). Satu draft per survei:
 *   { answers, currentStep, totalSteps, savedAt }
 * Media (audio/foto/tanda tangan) TIDAK ikut. Draft dihapus setelah submit
 * berhasil atau saat pengguna menekan "Mulai Baru".
 */

const DRAFT_PREFIX = 'survey_draft_';

export function draftKey(surveyId) {
  return `${DRAFT_PREFIX}${surveyId}`;
}

/** Apakah sebuah nilai jawaban berisi konten bermakna. */
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
 * Simpan draft.
 * @param {string} surveyId
 * @param {{ answers: object, currentStep?: number, totalSteps?: number }} data
 */
export function saveDraft(surveyId, data) {
  try {
    const payload = {
      answers: data.answers || {},
      currentStep: Number.isInteger(data.currentStep) ? data.currentStep : 0,
      totalSteps: Number.isInteger(data.totalSteps) ? data.totalSteps : 0,
      savedAt: Date.now(),
    };
    localStorage.setItem(draftKey(surveyId), JSON.stringify(payload));
  } catch { /* storage penuh / tidak tersedia — abaikan */ }
}

export function loadDraft(surveyId) {
  try {
    const raw = localStorage.getItem(draftKey(surveyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.answers ? parsed : null;
  } catch { return null; }
}

export function clearDraft(surveyId) {
  try { localStorage.removeItem(draftKey(surveyId)); } catch { /* abaikan */ }
}

/** Baca draft (yang berisi konten) untuk banyak survei → { [surveyId]: draft }. */
export function loadAllDrafts(surveyIds) {
  const map = {};
  for (const id of surveyIds || []) {
    const d = loadDraft(id);
    if (d && answersHaveContent(d.answers)) map[id] = d;
  }
  return map;
}
