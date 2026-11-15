/**
 * The staged study plan: the AI authors the content, the host owns the identity
 * and the status default, so the panel can address a stage by id.
 * @module @local/learning-center/src/plan
 */

/** Statuses a stage may carry. */
export const PLAN_STATUSES = ['todo', 'doing', 'done']

/**
 * Normalise a plan array: objects only, ids filled in order, duplicate ids
 * renumbered, unknown statuses reset to `todo`. Nothing else is rewritten, so a
 * model's own fields (`reading`, `project`, …) survive verbatim.
 * @param {*} input - the plan as written by the agent.
 * @returns {object[]} the plan to store.
 */
export function normalizePlan(input) {
  if (!Array.isArray(input)) return []
  const stages = []
  const used = new Set()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    let id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `p_${stages.length + 1}`
    if (used.has(id)) {
      id = `p_${stages.length + 1}`
      while (used.has(id)) id = `${id}_`
    }
    used.add(id)
    const status = PLAN_STATUSES.includes(raw.status) ? raw.status : 'todo'
    stages.push({ ...raw, id, status })
  }
  return stages
}
