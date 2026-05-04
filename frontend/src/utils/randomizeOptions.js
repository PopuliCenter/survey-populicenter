/**
 * randomizeOptions.js
 *
 * Utility for randomising question option order in the TPD Interface.
 *
 * Key guarantee (Requirement 5.4):
 *   Answers are always stored by OPTION VALUE, never by display position.
 *   The shuffle only affects the visual order; the value submitted to the API
 *   is always the `value` field of the chosen option object.
 *
 * Requirements: 5.2, 5.3, 5.4
 */

/**
 * Fisher-Yates (Knuth) shuffle — returns a NEW array, never mutates the input.
 *
 * @template T
 * @param {T[]} array  The array to shuffle
 * @returns {T[]}      A new array with the same elements in a random order
 */
export function fisherYatesShuffle(array) {
  // Copy so we never mutate the original options stored in state/props
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements at i and j
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Return the display-order options for a question.
 *
 * - If `randomize_options` is true, the options are shuffled with Fisher-Yates.
 * - Otherwise, the original order is preserved.
 * - The returned objects are the same references as the input (no deep clone),
 *   so `option.value` is always the canonical answer value to submit.
 *
 * @param {{ value: string, label: string }[]} options          Original options array
 * @param {boolean}                            randomizeOptions  Whether to shuffle
 * @returns {{ value: string, label: string }[]}
 */
export function getDisplayOptions(options, randomizeOptions) {
  if (!options || options.length === 0) return [];
  if (!randomizeOptions) return options;
  return fisherYatesShuffle(options);
}
