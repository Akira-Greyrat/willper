/**
 * Read-only projections the panel renders: the topic tree, the practice queue,
 * one question card, the review checklist and the favourites list. Pure
 * functions over data the store already read.
 * @module @local/learning-center/src/views
 */

import { normalizePlan } from './plan.js'

/**
 * @param {object} q - one question.
 * @returns {boolean} whether the question may be practised.
 */
function practiceable(q) {
  return q.status === 'ok' && !(Array.isArray(q.flags) && q.flags.includes('orphaned'))
}

/**
 * @param {object} q - one question.
 * @returns {boolean} whether the question is waiting for a human decision.
 */
function needsReview(q) {
  return q.status === 'needs-review' && !(Array.isArray(q.flags) && q.flags.includes('orphaned'))
}

/**
 * Topic tree with per-node counts.
 * @param {object} meta - target, tree, plan.
 * @param {object[]} questions - the bank.
 * @param {object} progress - per-question progress.
 * @returns {{ nodes: object[] }} nodes sorted by `order`.
 */
export function treeView(meta, questions, progress) {
  const tree = Array.isArray(meta && meta.tree) ? meta.tree : []
  const nodes = [...tree]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(node => {
      const own = (questions ?? []).filter(q => q.nodeId === node.id)
      const usable = own.filter(practiceable)
      return {
        id: node.id,
        title: node.title,
        parentId: node.parentId ?? null,
        weight: node.weight ?? 'must',
        order: node.order ?? 0,
        total: usable.length,
        ok: usable.length,
        needsReview: own.filter(needsReview).length,
        seen: usable.filter(q => Boolean(progress && progress[q.id] && progress[q.id].seen)).length,
      }
    })
  return { nodes }
}

/**
 * One page of the practice queue.
 * @param {object} meta - unused today, kept for symmetry.
 * @param {object[]} questions - the bank.
 * @param {object} progress - per-question progress.
 * @param {{ nodeId?: string, offset?: number, limit?: number, revisit?: boolean }} options - filter and page.
 * @returns {{ items: {id: string, stem: string, firstLine: string}[], total: number, offset: number }} a page.
 */
export function queueView(meta, questions, progress, options = {}) {
  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.max(1, options.limit ?? 20)
  const seen = id => Boolean(progress && progress[id] && progress[id].seen)
  const usable = (questions ?? [])
    .filter(practiceable)
    .filter(q => (options.nodeId ? q.nodeId === options.nodeId : true))
    .filter(q => (options.revisit ? true : !seen(q.id)))
  const items = usable.slice(offset, offset + limit).map(q => {
    const firstLine = q.stem.split('\n')[0]
    return { id: q.id, stem: q.stem, firstLine: firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine }
  })
  return { items, total: usable.length, offset }
}

/**
 * One question card, with every place a known term occurs in the stem.
 * @param {object[]} questions - the bank.
 * @param {{term: string, definition: string}[]} terms - the glossary.
 * @param {string} id - question id.
 * @param {object} [progress] - per-question progress.
 * @returns {object|null} the card, or null when the id is unknown.
 */
export function questionView(questions, terms, id, progress = {}, attempts = []) {
  const q = (questions ?? []).find(item => item.id === id)
  if (!q) return null
  const related = q.related ?? { questions: [], deeper: [], broader: [] }
  const byId = new Map((questions ?? []).map(item => [item.id, item]))
  const relatedQuestions = (Array.isArray(related.questions) ? related.questions : [])
    .map(relatedId => byId.get(relatedId))
    .filter(Boolean)
    .map(item => ({ id: item.id, stem: item.stem }))
  const own = (attempts ?? []).filter(attempt => attempt.questionId === id)
  const latest = own.length === 0
    ? null
    : own.reduce((newest, attempt) => (attempt.at > newest.at ? attempt : newest))
  return {
    id: q.id,
    stem: q.stem,
    termHits: findTermHits(q.stem, terms ?? []),
    reference: q.reference,
    source: q.source,
    tags: q.tags ?? [],
    related,
    relatedQuestions,
    lastAttempt: latest
      ? { id: latest.id, at: latest.at, kind: latest.kind, grade: latest.grade }
      : null,
    favorite: Boolean(progress && progress[id] && progress[id].favorite),
    nodeId: q.nodeId,
    status: q.status,
    flags: q.flags ?? [],
  }
}

/**
 * The staged plan with knowledge-node ids resolved to titles.
 * @param {object} meta - target, tree, plan.
 * @returns {{ stages: object[] }} stages in author order.
 */
export function planView(meta) {
  const tree = Array.isArray(meta && meta.tree) ? meta.tree : []
  const titles = new Map(tree.map(node => [node.id, node.title]))
  const plan = normalizePlan(meta && meta.plan)
  const stages = plan.map(stage => ({
    id: stage.id,
    title: typeof stage.title === 'string' ? stage.title : '',
    status: typeof stage.status === 'string' ? stage.status : 'todo',
    nodeTitles: (Array.isArray(stage.nodeIds) ? stage.nodeIds : [])
      .map(id => titles.get(id))
      .filter(Boolean),
    reading: stage.reading ?? [],
    prereqs: Array.isArray(stage.prereqs) ? stage.prereqs : [],
    perspectives: Array.isArray(stage.perspectives) ? stage.perspectives : [],
    project: stage.project ?? null,
    checkpoints: Array.isArray(stage.checkpoints) ? stage.checkpoints : [],
  }))
  return { stages }
}

/**
 * The weak-question list: questions practised and never fully covered, most
 * missed first. A dismissed row stays out until it is dismissed again.
 * @param {object[]} questions - the bank.
 * @param {object} progress - per-question progress.
 * @returns {{ items: object[] }} weak questions.
 */
export function weakView(questions, progress) {
  const items = (questions ?? [])
    .map(q => {
      const entry = (progress && progress[q.id]) || {}
      return {
        id: q.id,
        stem: q.stem,
        nodeId: q.nodeId,
        misses: entry.misses ?? 0,
        lastScore: entry.lastScore ?? null,
        lastAttemptAt: entry.lastAttemptAt ?? null,
        dismissed: entry.dismissed === true,
      }
    })
    .filter(item => item.misses > 0 && !item.dismissed)
    .sort((a, b) => {
      if (b.misses !== a.misses) return b.misses - a.misses
      return String(b.lastAttemptAt ?? '').localeCompare(String(a.lastAttemptAt ?? ''))
    })
  return { items }
}

/**
 * Locate glossary terms in a stem: longest term first, no overlaps.
 * @param {string} stem - question text.
 * @param {{term: string}[]} terms - the glossary.
 * @returns {{start: number, end: number, termId: string, text: string}[]} matches left to right.
 */
export function findTermHits(stem, terms) {
  const known = terms
    .filter(t => t && typeof t.term === 'string' && t.term.length > 0)
    .sort((a, b) => b.term.length - a.term.length)
  const hits = []
  const occupied = new Uint8Array(stem.length)
  for (let i = 0; i < stem.length;) {
    const match = known.find(t => stem.startsWith(t.term, i))
    if (!match) {
      i += 1
      continue
    }
    const end = i + match.term.length
    let free = true
    for (let k = i; k < end; k += 1) {
      if (occupied[k]) {
        free = false
        break
      }
    }
    if (free) {
      for (let k = i; k < end; k += 1) occupied[k] = 1
      hits.push({ start: i, end, termId: match.term, text: match.term })
      i = end
    } else {
      i += 1
    }
  }
  return hits
}

/**
 * Questions waiting for a human decision.
 * @param {object[]} questions - the bank.
 * @returns {{ items: object[] }} flagged questions with their reasons.
 */
export function checklistView(questions) {
  const items = (questions ?? [])
    .filter(needsReview)
    .map(q => ({
      id: q.id,
      stem: q.stem,
      flags: q.flags ?? [],
      reason: (q.flags ?? []).join(','),
      nodeId: q.nodeId,
      source: q.source,
    }))
  return { items }
}

/**
 * Favourited questions.
 * @param {object[]} questions - the bank.
 * @param {object} progress - per-question progress.
 * @returns {{ items: object[] }} favourites.
 */
export function favoritesView(questions, progress) {
  const items = (questions ?? [])
    .filter(q => Boolean(progress && progress[q.id] && progress[q.id].favorite))
    .map(q => ({ id: q.id, stem: q.stem, nodeId: q.nodeId, status: q.status }))
  return { items }
}
