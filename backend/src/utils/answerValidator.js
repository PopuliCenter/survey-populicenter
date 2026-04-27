/**
 * Validasi satu jawaban terhadap aturan validasi pertanyaan.
 * Pure function — tidak ada dependensi database.
 *
 * @param {string|null} answerValue - Nilai jawaban (answer_value)
 * @param {object} question - Objek pertanyaan {type, options}
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAnswer(answerValue, question) {
  if (!question || !question.options || !question.options.validation) {
    return { valid: true };
  }

  const validation = question.options.validation;
  const type = question.type;

  // If no validation rules are configured, accept any answer
  if (Object.keys(validation).length === 0) {
    return { valid: true };
  }

  // Skip validation for null/undefined/empty answers (is_required handles that separately)
  if (answerValue === null || answerValue === undefined || answerValue === '') {
    return { valid: true };
  }

  const hasCustomError = validation.custom_error && validation.custom_error.trim() !== '';

  // min_value / max_value for numeric_scale and rating_scale
  if (type === 'numeric_scale' || type === 'rating_scale') {
    const numVal = parseFloat(answerValue);

    if (validation.min_value !== null && validation.min_value !== undefined &&
        validation.max_value !== null && validation.max_value !== undefined) {
      if (numVal < validation.min_value || numVal > validation.max_value) {
        const error = hasCustomError
          ? validation.custom_error
          : `Nilai harus antara ${validation.min_value} dan ${validation.max_value}`;
        return { valid: false, error };
      }
    } else if (validation.min_value !== null && validation.min_value !== undefined) {
      if (numVal < validation.min_value) {
        const error = hasCustomError
          ? validation.custom_error
          : `Nilai minimum adalah ${validation.min_value}`;
        return { valid: false, error };
      }
    } else if (validation.max_value !== null && validation.max_value !== undefined) {
      if (numVal > validation.max_value) {
        const error = hasCustomError
          ? validation.custom_error
          : `Nilai maksimum adalah ${validation.max_value}`;
        return { valid: false, error };
      }
    }
  }

  // min_length / max_length for short_text and long_text
  if (type === 'short_text' || type === 'long_text') {
    const len = answerValue.length;

    if (validation.min_length !== null && validation.min_length !== undefined &&
        validation.max_length !== null && validation.max_length !== undefined) {
      if (len < validation.min_length || len > validation.max_length) {
        const error = hasCustomError
          ? validation.custom_error
          : `Panjang harus antara ${validation.min_length} dan ${validation.max_length} karakter`;
        return { valid: false, error };
      }
    } else if (validation.min_length !== null && validation.min_length !== undefined) {
      if (len < validation.min_length) {
        const error = hasCustomError
          ? validation.custom_error
          : `Panjang minimum adalah ${validation.min_length} karakter`;
        return { valid: false, error };
      }
    } else if (validation.max_length !== null && validation.max_length !== undefined) {
      if (len > validation.max_length) {
        const error = hasCustomError
          ? validation.custom_error
          : `Panjang maksimum adalah ${validation.max_length} karakter`;
        return { valid: false, error };
      }
    }
  }

  // pattern for short_text, long_text, and numeric_scale
  if (type === 'short_text' || type === 'long_text' || type === 'numeric_scale') {
    if (validation.pattern !== null && validation.pattern !== undefined) {
      const regex = new RegExp('^(' + validation.pattern + ')$');
      if (!regex.test(answerValue)) {
        const error = hasCustomError
          ? validation.custom_error
          : 'Format jawaban tidak sesuai';
        return { valid: false, error };
      }
    }
  }

  return { valid: true };
}

/**
 * Validasi semua jawaban dalam satu submission.
 * Pure function — tidak ada dependensi database.
 *
 * @param {Array<{question_id, answer_value, answer_json}>} answers
 * @param {Array<{id, type, options, is_required}>} questions
 * @returns {{ valid: boolean, errors: Array<{question_id, error}> }}
 */
function validateAllAnswers(answers, questions) {
  const errors = [];
  const questionMap = new Map();

  for (const q of questions) {
    questionMap.set(q.id, q);
  }

  for (const answer of answers) {
    const question = questionMap.get(answer.question_id);
    if (!question) continue;

    const result = validateAnswer(answer.answer_value, question);
    if (!result.valid) {
      errors.push({ question_id: answer.question_id, error: result.error });
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateAnswer,
  validateAllAnswers,
};
