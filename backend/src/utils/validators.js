/**
 * Validates password meets security requirements
 * @param {string} password - Password to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validatePassword(password) {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

/**
 * Validates quota value is a positive integer greater than 0
 * @param {*} value - Value to validate
 * @returns {boolean} - True if valid positive integer > 0, false otherwise
 */
function validateQuota(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Validates email format using regex.
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format, false otherwise
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates a single surveyor row for bulk upload.
 * Checks: nama not empty, email valid, password meets security rules.
 * @param {{ nama: string, email: string, password: string }} row
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBulkSurveyorRow(row) {
  const errors = [];

  if (!row.nama || (typeof row.nama === 'string' && row.nama.trim() === '')) {
    errors.push('Nama tidak boleh kosong');
  }

  if (!validateEmail(row.email)) {
    errors.push('Email tidak valid');
  }

  if (!validatePassword(row.password)) {
    errors.push('Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a single assignment row for bulk assign.
 * Checks: email not empty, kuota is positive integer > 0.
 * @param {{ email_surveyor: string, kuota: * }} row
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBulkAssignRow(row) {
  const errors = [];

  if (!row.email_surveyor || (typeof row.email_surveyor === 'string' && row.email_surveyor.trim() === '')) {
    errors.push('Email tidak boleh kosong');
  }

  const kuotaValue = typeof row.kuota === 'string' ? Number(row.kuota) : row.kuota;
  if (!validateQuota(kuotaValue)) {
    errors.push('Kuota harus berupa bilangan bulat positif lebih dari 0');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validasi format tanggal YYYY-MM-DD dan pastikan tanggal valid.
 * @param {string} dateStr
 * @returns {boolean}
 */
function validateDateFormat(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Validasi format waktu HH:mm (24 jam).
 * @param {string} timeStr
 * @returns {boolean}
 */
function validateTimeFormat(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const regex = /^\d{2}:\d{2}$/;
  if (!regex.test(timeStr)) return false;

  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Validasi jawaban date terhadap konfigurasi min/max.
 * @param {string} dateStr - Jawaban tanggal
 * @param {object} config - { min_date, max_date }
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDateAnswer(dateStr, config) {
  if (!validateDateFormat(dateStr)) {
    return { valid: false, error: 'Format tanggal harus YYYY-MM-DD' };
  }

  if (config) {
    const minDate = config.min_date;
    const maxDate = config.max_date;

    if (minDate && dateStr < minDate) {
      return { valid: false, error: `Tanggal harus antara ${minDate} dan ${maxDate || '...'}` };
    }
    if (maxDate && dateStr > maxDate) {
      return { valid: false, error: `Tanggal harus antara ${minDate || '...'} dan ${maxDate}` };
    }
  }

  return { valid: true };
}

/**
 * Validasi jawaban matrix terhadap konfigurasi rows/columns.
 * @param {object} answer - Objek jawaban { "row1": "col1", ... }
 * @param {object} config - { rows: [...], columns: [...] }
 * @param {boolean} isRequired - Apakah pertanyaan wajib
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMatrixAnswer(answer, config, isRequired) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    if (isRequired) {
      return { valid: false, error: 'Semua baris matrix wajib dijawab' };
    }
    return { valid: true };
  }

  const rows = config.rows || [];
  const columns = config.columns || [];

  // Validate each key is in rows and each value is in columns
  const answerKeys = Object.keys(answer);
  for (const key of answerKeys) {
    if (!rows.includes(key)) {
      return { valid: false, error: 'Jawaban matrix tidak valid' };
    }
    if (!columns.includes(answer[key])) {
      return { valid: false, error: 'Jawaban matrix tidak valid' };
    }
  }

  // If required, all rows must have an answer
  if (isRequired) {
    for (const row of rows) {
      if (!(row in answer)) {
        return { valid: false, error: 'Semua baris matrix wajib dijawab' };
      }
    }
  }

  return { valid: true };
}

module.exports = {
  validatePassword,
  validateQuota,
  validateEmail,
  validateBulkSurveyorRow,
  validateBulkAssignRow,
  validateDateFormat,
  validateTimeFormat,
  validateDateAnswer,
  validateMatrixAnswer,
};
