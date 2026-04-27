/**
 * Validates skip logic configuration for cycles using DFS
 * @param {Array} questions - Array of question objects with id and skip_logic
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSkipLogicNoCycles(questions) {
  // Build adjacency list from skip_logic configurations
  // skip_logic format: [{ condition: { question_id, operator, value }, action: 'jump_to', target_question_id }]
  const graph = {};

  for (const q of questions) {
    graph[q.id] = [];
    if (q.skip_logic && Array.isArray(q.skip_logic)) {
      for (const rule of q.skip_logic) {
        if (rule.target_question_id) {
          graph[q.id].push(rule.target_question_id);
        }
      }
    }
  }

  // DFS cycle detection
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(nodeId) {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = graph[nodeId] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true; // cycle detected
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const nodeId of Object.keys(graph)) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) {
        return {
          valid: false,
          error: 'Konfigurasi skip logic membentuk siklus. Periksa kembali aturan yang dikonfigurasi',
        };
      }
    }
  }

  return { valid: true };
}

module.exports = { validateSkipLogicNoCycles };
