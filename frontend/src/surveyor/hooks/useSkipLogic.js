/**
 * useSkipLogic.js
 *
 * React hook for evaluating skip logic rules locally in the Surveyor Interface.
 * Determines which questions should be visible based on current answers.
 *
 * Supports operators: equals, not_equals, contains, greater_than, less_than
 * Supports chained skip logic (a skip triggered by one question can cascade
 * to hide further questions whose own skip logic is also satisfied).
 *
 * Requirements: 4.4, 4.5
 */

import { useMemo } from 'react';

/**
 * Evaluate a single skip logic condition against the current answers.
 *
 * @param {{ question_id: string, operator: string, value: string }} condition
 * @param {Object.<string, string|string[]>} answers  Map of question_id → answer value(s)
 * @returns {boolean}  true if the condition is satisfied
 */
function evaluateCondition(condition, answers) {
  const { question_id, operator, value: conditionValue } = condition;
  const answer = answers[question_id];

  // No answer recorded yet → condition is not satisfied
  if (answer === undefined || answer === null || answer === '') {
    return false;
  }

  // Normalise to string for comparison; handle array answers (multiple_choice)
  const answerStr = Array.isArray(answer) ? answer.join(',') : String(answer);
  const conditionStr = String(conditionValue);

  switch (operator) {
    case 'equals':
      return answerStr === conditionStr;

    case 'not_equals':
      return answerStr !== conditionStr;

    case 'contains':
      // For multiple_choice arrays, check if the value is one of the selected items
      if (Array.isArray(answer)) {
        return answer.includes(conditionValue);
      }
      return answerStr.includes(conditionStr);

    case 'greater_than': {
      const numAnswer = parseFloat(answerStr);
      const numCondition = parseFloat(conditionStr);
      if (isNaN(numAnswer) || isNaN(numCondition)) return false;
      return numAnswer > numCondition;
    }

    case 'less_than': {
      const numAnswer = parseFloat(answerStr);
      const numCondition = parseFloat(conditionStr);
      if (isNaN(numAnswer) || isNaN(numCondition)) return false;
      return numAnswer < numCondition;
    }

    default:
      return false;
  }
}

/**
 * Compute the set of question IDs that should be HIDDEN given the current answers.
 *
 * Algorithm:
 *  "jump_to" semantics: when a rule on question X says "jump to question Y",
 *  all questions BETWEEN X and Y (exclusive) are hidden — not Y itself.
 *  Y remains visible as the landing point.
 *
 *  We iterate until stable to handle chained skip logic.
 *
 * @param {Array<{ id: string, skip_logic: Array|null }>} questions  Ordered question list
 * @param {Object.<string, string|string[]>} answers
 * @returns {Set<string>}  Set of question IDs that should be hidden
 */
function computeHiddenQuestions(questions, answers) {
  const hidden = new Set();

  // Build an index map for O(1) position lookup
  const indexMap = {};
  questions.forEach((q, i) => { indexMap[q.id] = i; });

  // Iterate until stable (handles chained skip logic)
  let changed = true;
  while (changed) {
    changed = false;

    for (const question of questions) {
      // Skip questions that are already hidden — their rules don't apply
      if (hidden.has(question.id)) continue;

      const rules = question.skip_logic;
      if (!rules || !Array.isArray(rules) || rules.length === 0) continue;

      for (const rule of rules) {
        if (!rule.condition || !rule.target_question_id) continue;

        const conditionMet = evaluateCondition(rule.condition, answers);
        if (!conditionMet) continue;

        const sourceIndex = indexMap[question.id];
        const targetIndex = indexMap[rule.target_question_id];

        // Only hide questions that come AFTER the source and BEFORE the target
        if (sourceIndex == null || targetIndex == null) continue;
        if (targetIndex <= sourceIndex) continue; // target must be after source

        // Hide all questions between source (exclusive) and target (exclusive)
        for (let i = sourceIndex + 1; i < targetIndex; i++) {
          const qid = questions[i].id;
          if (!hidden.has(qid)) {
            hidden.add(qid);
            changed = true;
          }
        }
      }
    }
  }

  return hidden;
}

/**
 * useSkipLogic
 *
 * @param {Array<{ id: string, skip_logic: Array|null }>} questions  Full ordered question list
 * @param {Object.<string, string|string[]>} answers  Current answers keyed by question_id
 * @returns {{
 *   visibleQuestions: Array,
 *   isVisible: (questionId: string) => boolean,
 *   hiddenQuestionIds: Set<string>
 * }}
 */
function useSkipLogic(questions, answers) {
  const hiddenQuestionIds = useMemo(
    () => computeHiddenQuestions(questions || [], answers || {}),
    [questions, answers]
  );

  const visibleQuestions = useMemo(
    () => (questions || []).filter((q) => !hiddenQuestionIds.has(q.id)),
    [questions, hiddenQuestionIds]
  );

  /**
   * Check whether a specific question should be visible.
   * @param {string} questionId
   * @returns {boolean}
   */
  function isVisible(questionId) {
    return !hiddenQuestionIds.has(questionId);
  }

  return { visibleQuestions, isVisible, hiddenQuestionIds };
}

export default useSkipLogic;
export { evaluateCondition, computeHiddenQuestions };
