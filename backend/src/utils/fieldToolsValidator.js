'use strict';

const VALID_MODES = ['required', 'optional', 'disabled'];
const REQUIRED_PROPERTIES = ['signature_mode', 'audio_mode', 'photo_mode', 'gps_mode'];

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
  const hasExtraProps = keys.some((key) => !REQUIRED_PROPERTIES.includes(key));

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
