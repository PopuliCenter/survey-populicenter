/**
 * Validasi konsistensi konfigurasi aturan validasi.
 * Pure function — tidak ada dependensi database.
 *
 * @param {object} validation - Objek validation dari options
 * @param {string} questionType - Tipe pertanyaan
 * @returns {{ valid: boolean, error?: string }}
 */
function validateValidationConfig(validation, questionType) {
  if (!validation || typeof validation !== 'object') {
    return { valid: true };
  }

  // Validate min_value is numeric if provided
  if (validation.min_value !== null && validation.min_value !== undefined) {
    if (typeof validation.min_value !== 'number' || isNaN(validation.min_value)) {
      return { valid: false, error: 'min_value harus berupa bilangan numerik' };
    }
  }

  // Validate max_value is numeric if provided
  if (validation.max_value !== null && validation.max_value !== undefined) {
    if (typeof validation.max_value !== 'number' || isNaN(validation.max_value)) {
      return { valid: false, error: 'max_value harus berupa bilangan numerik' };
    }
  }

  // Validate min_value <= max_value if both provided
  if (validation.min_value !== null && validation.min_value !== undefined &&
      validation.max_value !== null && validation.max_value !== undefined) {
    if (validation.min_value > validation.max_value) {
      return { valid: false, error: 'min_value tidak boleh lebih besar dari max_value' };
    }
  }

  // Validate min_length is a positive integer if provided
  if (validation.min_length !== null && validation.min_length !== undefined) {
    if (!Number.isInteger(validation.min_length) || validation.min_length < 1) {
      return { valid: false, error: 'min_length harus berupa bilangan bulat positif' };
    }
  }

  // Validate max_length is a positive integer if provided
  if (validation.max_length !== null && validation.max_length !== undefined) {
    if (!Number.isInteger(validation.max_length) || validation.max_length < 1) {
      return { valid: false, error: 'max_length harus berupa bilangan bulat positif' };
    }
  }

  // Validate min_length <= max_length if both provided
  if (validation.min_length !== null && validation.min_length !== undefined &&
      validation.max_length !== null && validation.max_length !== undefined) {
    if (validation.min_length > validation.max_length) {
      return { valid: false, error: 'min_length tidak boleh lebih besar dari max_length' };
    }
  }

  // Validate pattern is a valid RegExp if provided
  if (validation.pattern !== null && validation.pattern !== undefined) {
    try {
      new RegExp(validation.pattern);
    } catch (e) {
      return { valid: false, error: 'Pola regex tidak valid' };
    }
  }

  // Validate custom_error does not exceed 500 characters if provided
  if (validation.custom_error !== null && validation.custom_error !== undefined) {
    if (typeof validation.custom_error === 'string' && validation.custom_error.length > 500) {
      return { valid: false, error: 'Pesan error kustom tidak boleh melebihi 500 karakter' };
    }
  }

  return { valid: true };
}

module.exports = {
  validateValidationConfig,
};
