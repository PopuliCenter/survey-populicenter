'use strict';

const VALID_MODES = ['required', 'optional', 'disabled'];
const REQUIRED_PROPERTIES = ['signature_mode', 'audio_mode', 'photo_mode', 'gps_mode'];

// Properti OPSIONAL (kompatibel mundur — survei lama tanpa properti ini valid).
// audio_indicator: apakah indikator rekaman ditampilkan di perangkat TPD.
// device_lock: kunci 1 user = 1 perangkat saat mengisi survei ini
//   ('enforced' = aktif, 'off' = nonaktif; admin bisa reset ikatan per TPD).
const OPTIONAL_ENUMS = {
  audio_indicator: ['shown', 'hidden'],
  device_lock: ['enforced', 'off'],
};

// Properti OPSIONAL numerik (detik) — ATURAN WAKTU REKAMAN AUDIO yang bisa
// disetel admin/supervisor per survei di builder (kompatibel mundur — absen = default).
//   audio_start_delay_sec : jeda sebelum rekaman pembukaan auto-mulai (0 = langsung).
//     Dipakai melewati obrolan pembuka ("small talk") sebelum wawancara inti.
//   audio_total_max_sec   : total durasi terekam (segmen pembukaan + penutup).
const OPTIONAL_NUMERICS = {
  audio_start_delay_sec: { min: 0, max: 1800 }, // 0–30 menit
  audio_total_max_sec: { min: 30, max: 900 },   // 0,5–15 menit
};
const ALLOWED_PROPERTIES = [
  ...REQUIRED_PROPERTIES,
  ...Object.keys(OPTIONAL_ENUMS),
  ...Object.keys(OPTIONAL_NUMERICS),
];

/**
 * Mengembalikan default field_tools_settings.
 * @returns {object}
 */
function getDefaultFieldToolsSettings() {
  return {
    signature_mode: 'required',
    audio_mode: 'required',
    photo_mode: 'required',
    gps_mode: 'required',
    audio_indicator: 'shown',
    device_lock: 'off',
  };
}

/**
 * Validasi objek field_tools_settings.
 * @param {object} settings - Objek field_tools_settings
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFieldToolsSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {
      valid: false,
      error: 'Field tools settings harus memiliki properti: signature_mode, audio_mode, photo_mode, gps_mode',
    };
  }

  const keys = Object.keys(settings);
  const hasAllRequired = REQUIRED_PROPERTIES.every((prop) => keys.includes(prop));
  const hasExtraProps = keys.some((key) => !ALLOWED_PROPERTIES.includes(key));

  if (!hasAllRequired || hasExtraProps) {
    return {
      valid: false,
      error: 'Field tools settings harus memiliki properti: signature_mode, audio_mode, photo_mode, gps_mode',
    };
  }

  for (const prop of REQUIRED_PROPERTIES) {
    if (!VALID_MODES.includes(settings[prop])) {
      return {
        valid: false,
        error: 'Nilai field tool mode tidak valid. Gunakan: required, optional, atau disabled',
      };
    }
  }

  // Validasi properti opsional enum bila ada.
  for (const [prop, allowed] of Object.entries(OPTIONAL_ENUMS)) {
    if (settings[prop] !== undefined && !allowed.includes(settings[prop])) {
      return {
        valid: false,
        error: `Nilai ${prop} tidak valid. Gunakan: ${allowed.join(', ')}`,
      };
    }
  }

  // Validasi properti opsional numerik (detik) bila ada.
  for (const [prop, range] of Object.entries(OPTIONAL_NUMERICS)) {
    const v = settings[prop];
    if (v !== undefined) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < range.min || v > range.max) {
        return {
          valid: false,
          error: `Nilai ${prop} harus bilangan bulat ${range.min}–${range.max} (detik)`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validasi submission data terhadap field_tools_settings survei.
 * @param {object} submissionData - { signature_path, audio_path, photo_paths, latitude, longitude }
 * @param {object} settings - field_tools_settings dari survei
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFieldToolsSubmission(submissionData, settings) {
  if (!settings) {
    return { valid: true };
  }

  // Signature validation
  if (settings.signature_mode === 'required') {
    if (!submissionData.signature_path) {
      return { valid: false, error: 'Tanda tangan wajib diisi' };
    }
  }

  // Audio validation
  if (settings.audio_mode === 'required') {
    if (!submissionData.audio_path) {
      return { valid: false, error: 'Rekaman audio wajib diisi' };
    }
  }

  // Photo validation
  if (settings.photo_mode === 'required') {
    if (!submissionData.photo_paths || !Array.isArray(submissionData.photo_paths) || submissionData.photo_paths.length === 0) {
      return { valid: false, error: 'Foto wajib diisi' };
    }
  }

  // GPS validation
  if (settings.gps_mode === 'required') {
    if (submissionData.latitude == null || submissionData.longitude == null) {
      return { valid: false, error: 'Lokasi GPS wajib diisi' };
    }
  }

  return { valid: true };
}

module.exports = {
  validateFieldToolsSettings,
  validateFieldToolsSubmission,
  getDefaultFieldToolsSettings,
};
