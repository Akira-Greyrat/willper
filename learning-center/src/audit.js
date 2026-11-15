/**
 * The audit digest: a bounded, host-computed summary of the whole bank that the
 * agent reads before writing a report. Pure — it takes data, never files.
 * @module @local/learning-center/src/audit
 */

/** How many rows each section may carry before it counts as overflow. */
export const AUDIT_LIMITS = { nodes: 20, needsReview: 40, others: 20 }

/**
 * @param {string[]} list - full list.
 * @param {number} limit - cap.
 * @returns {{ items: string[], extra: number }} capped list and how many were dropped.
 */
function cap(list, limit) {
  return { items: list.slice(0, limit), extra: Math.max(0, list.length - limit) }
}

/**
 * @param {object} input - meta, questions, materials.
 * @returns {object} the digest handed to the model.
 */
export function auditDigest({ meta, questions, materials }) {
  const tree = Array.isArray(meta && meta.tree) ? meta.tree : []
  const rows = Array.isArray(questions) ? questions : []
  const countByNode = new Map()
  for (const question of rows) {
    if (!question || typeof question.nodeId !== 'string') continue
    countByNode.set(question.nodeId, (countByNode.get(question.nodeId) ?? 0) + 1)
  }
  const allNodes = tree
    .map(node => ({ id: node.id, title: node.title, count: countByNode.get(node.id) ?? 0 }))
    .sort((a, b) => (a.count - b.count) || String(a.id).localeCompare(String(b.id)))
  const nodes = cap(allNodes, AUDIT_LIMITS.nodes)

  const needsReview = rows
    .filter(question => question && question.status === 'needs-review'
      && !(Array.isArray(question.flags) && question.flags.includes('orphaned')))
    .map(question => ({ id: question.id, flags: Array.isArray(question.flags) ? question.flags : [] }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const review = cap(needsReview, AUDIT_LIMITS.needsReview)

  const withFlag = prefix => rows
    .filter(question => question && Array.isArray(question.flags) && question.flags.some(flag => String(flag).startsWith(prefix)))
    .map(question => question.id)
    .sort()
  const duplicates = cap(withFlag('duplicate_of'), AUDIT_LIMITS.others)
  const orphans = cap(withFlag('orphaned'), AUDIT_LIMITS.others)
  const missingAnswer = cap(withFlag('missing_answer'), AUDIT_LIMITS.others)

  return {
    nodes: nodes.items,
    needsReview: review.items,
    duplicates: duplicates.items,
    orphans: orphans.items,
    missingAnswer: missingAnswer.items,
    materials: Array.isArray(materials) ? materials : [],
    totals: {
      questions: rows.length,
      nodes: allNodes.length,
      needsReview: needsReview.length,
      duplicates: duplicates.items.length + duplicates.extra,
      orphans: orphans.items.length + orphans.extra,
      missingAnswer: missingAnswer.items.length + missingAnswer.extra,
    },
    overflow: {
      nodes: nodes.extra,
      needsReview: review.extra,
      duplicates: duplicates.extra,
      orphans: orphans.extra,
      missingAnswer: missingAnswer.extra,
    },
  }
}
