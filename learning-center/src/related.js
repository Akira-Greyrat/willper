/**
 * The "related questions" block on a question: the same-bank questions worth
 * reading next, plus the deeper and broader questions to ask the agent.
 *
 * The model writes bank cross-references as stems, because a draft has no id yet
 * (ids are minted at commit); this module normalises that block and resolves the
 * stems against the finished bank.
 * @module @local/learning-center/src/related
 */

import { dedupeKey, normalizeStem } from './model.js'

/** Caps that keep a generated block small enough to read at a glance. */
export const RELATED_LIMITS = { perList: 3, textLength: 120 }

/**
 * @param {*} value - candidate list.
 * @returns {string[]} trimmed, de-duplicated, non-empty strings.
 */
function strings(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (text.length === 0) continue
    if (out.includes(text)) continue
    out.push(text)
  }
  return out
}

/**
 * Normalise one `related` block: strings only, at most three per list, texts cut
 * to the limit, no duplicates.
 * @param {*} raw - the draft's or patch's related block.
 * @returns {{ questions: string[], deeper: string[], broader: string[] }} the block to store.
 */
export function normalizeRelated(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const cut = text => (text.length > RELATED_LIMITS.textLength ? text.slice(0, RELATED_LIMITS.textLength) : text)
  return {
    questions: strings(source.questions).map(question => normalizeStem(question)).slice(0, RELATED_LIMITS.perList),
    deeper: strings(source.deeper).map(cut).slice(0, RELATED_LIMITS.perList),
    broader: strings(source.broader).map(cut).slice(0, RELATED_LIMITS.perList),
  }
}

/**
 * Resolve bank cross-references to question ids. An id that is already an id
 * passes through; anything else is matched by stem fingerprint, so punctuation
 * and spacing differences do not lose a link.
 * @param {{ id: string, stem: string }[]} questions - the finished bank.
 * @param {string[]} items - ids or stems written into `related.questions`.
 * @returns {{ ids: string[], missing: string[], ambiguous: string[] }} resolved ids and what did not resolve.
 */
export function resolveRelatedIds(questions, items) {
  const byId = new Set((questions ?? []).map(question => question.id))
  const byStem = new Map()
  for (const question of questions ?? []) {
    const key = dedupeKey(question.stem)
    if (key.length === 0) continue
    const entry = byStem.get(key)
    if (entry) entry.count += 1
    else byStem.set(key, { id: question.id, count: 1 })
  }
  const ids = []
  const missing = []
  const ambiguous = []
  for (const item of items ?? []) {
    if (typeof item !== 'string' || item.length === 0) continue
    if (byId.has(item)) {
      ids.push(item)
      continue
    }
    const key = dedupeKey(item)
    if (key.length === 0) continue
    const entry = byStem.get(key)
    if (!entry) {
      missing.push(item)
      continue
    }
    if (entry.count > 1) ambiguous.push(item)
    ids.push(entry.id)
  }
  return { ids: [...new Set(ids)], missing, ambiguous }
}
