/**
 * The grading result an agent returns for one attempt: shape it, cap it, and
 * turn coverage into a score. Pure: no files, no services.
 * @module @local/learning-center/src/grading
 */

/** Numeric limits shared by the store and the panel. */
export const GRADE_LIMITS = { suggestionBelow: 0.6, textLength: 2000 }

/**
 * @param {*} value - candidate list.
 * @returns {string[]} trimmed, de-duplicated, non-empty strings, each capped.
 */
function texts(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim().slice(0, GRADE_LIMITS.textLength)
    if (text.length === 0) continue
    if (out.includes(text)) continue
    out.push(text)
  }
  return out
}

/**
 * @param {*} value - candidate text.
 * @returns {string} trimmed, capped text; empty when absent.
 */
function one(value) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, GRADE_LIMITS.textLength)
}

/**
 * Normalise one grading payload and derive its score.
 * @param {*} raw - what the agent submitted.
 * @returns {{ covered: string[], missed: string[], wrong: string[], feedback: string, suggestion: string, score: number }} the grade to store.
 * @throws {Error} when there is nothing to score.
 */
export function normalizeGrading(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const covered = texts(source.covered)
  const missed = texts(source.missed)
  if (covered.length === 0 && missed.length === 0) throw new Error('empty grading')
  const total = covered.length + missed.length
  const score = Math.round((covered.length / total) * 100) / 100
  return {
    covered,
    missed,
    wrong: texts(source.wrong),
    feedback: one(source.feedback),
    suggestion: one(source.suggestion),
    score,
  }
}

/**
 * @param {number|null} score - the attempt's score.
 * @returns {boolean} whether the grader was expected to supply a better answer.
 */
export function needsSuggestion(score) {
  return typeof score === 'number' && score < GRADE_LIMITS.suggestionBelow
}
