/**
 * Turn the agent's drafts into the question bank: validate every row, reconcile
 * against what is already stored, keep everything that fails in "needs review",
 * and never delete a question someone may have answered.
 *
 * Identity and duplicate detection are deliberately two different things: a
 * question's `key` says "this is the same row of the same material" (so a
 * re-import updates in place), while `dedupeKey` says "this asks the same thing"
 * (so the same question from another file is caught).
 * @module @local/learning-center/src/ingest
 */

import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { moveInto, readJson, readJsonl, writeJson, writeJsonl, ensureDir } from './io.js'
import { dedupeKey, findAnchor, mintId, normalizePath, normalizeStem, questionKey, validateDraft } from './model.js'
import { normalizeRelated, resolveRelatedIds } from './related.js'

/**
 * Find the extracted text for one question's source file: the exact path first,
 * then the material's file stem (`materials/bank.txt` for `materials/bank.md`).
 * @param {Record<string, string>|undefined} byFile - extracted text table.
 * @param {object} question - a draft or a stored question.
 * @returns {string|null} the text, or null when the material has none.
 */
function pickMaterialText(byFile, question) {
  if (!byFile) return null
  const file = normalizePath(question && question.source && question.source.file)
  if (file.length === 0) return null
  if (Object.hasOwn(byFile, file)) return byFile[file]
  const stem = basename(file, extname(file))
  if (Object.hasOwn(byFile, stem)) return byFile[stem]
  return null
}

/**
 * Read a draft file line by line, keeping parse failures as reasons instead of
 * aborting the whole batch.
 * @param {string} file - absolute path.
 * @returns {Promise<{ rows: object[], reasons: object[] }>} parsed rows and per-line failures.
 */
async function readDraftFile(file) {
  const rows = []
  const reasons = []
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { rows, reasons }
    throw error
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim().length === 0) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      reasons.push({ file, line: i + 1, reason: 'bad_json' })
    }
  }
  return { rows, reasons }
}

/**
 * Import everything waiting in `inbox/`.
 * @param {object} paths - store paths from resolveStore.
 * @param {{ nodeIds: Set<string>, materialTextByFile?: Record<string, string>, now?: string }} options - knowledge nodes and per-file extracted text.
 * @returns {Promise<{ added: number, merged: number, needsReview: number, rejected: number, orphaned: number, terms: number, reasons: object[] }>} import report.
 */
export async function commitInbox(paths, options) {
  const now = options.now ?? new Date().toISOString()
  const { rows: drafts, reasons } = await readDraftFile(paths.inboxQuestions)
  const { rows: termDrafts, reasons: termReasons } = await readDraftFile(paths.inboxTerms)
  reasons.push(...termReasons)

  const report = { added: 0, merged: 0, needsReview: 0, rejected: 0, orphaned: 0, terms: 0, reasons }
  report.rejected += reasons.filter(entry => entry.reason === 'bad_json').length
  if (drafts.length === 0 && termDrafts.length === 0) return report

  const existing = await readJsonl(paths.questions)
  const bank = new Map(existing.map(q => [q.key, q]))
  const byPreviousKey = new Map()
  for (const q of existing) {
    for (const key of q.previousKeys ?? []) {
      if (!bank.has(key)) byPreviousKey.set(key, q)
    }
  }
  const stemIndex = new Map()
  for (const q of existing) {
    const dk = dedupeKey(q.stem)
    if (dk.length > 0 && !stemIndex.has(dk)) stemIndex.set(dk, q.id)
  }
  const touched = new Set()

  for (const raw of drafts) {
    const verdict = validateDraft(raw, {
      nodeIds: options.nodeIds,
      materialText: pickMaterialText(options.materialTextByFile, raw),
      now,
    })

    if (!verdict.ok && verdict.status === 'rejected') {
      report.rejected += 1
      reasons.push({ file: paths.inboxQuestions, flags: verdict.flags, reason: verdict.flags.join(',') })
      continue
    }

    const q = verdict.ok ? verdict.q : stashRejectedDraft(verdict, raw, now)
    if (!q) {
      report.rejected += 1
      reasons.push({ file: paths.inboxQuestions, flags: verdict.flags, reason: 'unkeyable' })
      continue
    }
    // Cross-references arrive as stems; ids are minted here, so they are resolved
    // once the whole batch is in the bank (below). A draft that omits the key keeps
    // whatever is already stored: the brief makes `related` optional, and a
    // re-import must not erase a block the learner asked the agent to fill.
    if (Object.hasOwn(raw, 'related')) q.related = normalizeRelated(raw.related)

    const previous = bank.get(q.key) ?? byPreviousKey.get(q.key)
    const duplicateOwner = stemIndex.get(dedupeKey(q.stem))
    if (duplicateOwner !== undefined && (!previous || previous.id !== duplicateOwner)) {
      // Same question asked elsewhere: keep it, but out of practice.
      q.status = 'needs-review'
      q.flags = [...new Set([...q.flags, `duplicate_of:${duplicateOwner}`])]
      bank.set(q.key, q)
      touched.add(q.key)
      report.needsReview += 1
      reasons.push({ file: paths.inboxQuestions, key: q.key, reason: `duplicate_of:${duplicateOwner}` })
      continue
    }

    if (!verdict.ok) {
      report.needsReview += 1
      reasons.push({ file: paths.inboxQuestions, key: q.key, flags: verdict.flags, reason: verdict.flags.join(',') })
    }

    if (previous) {
      if (previous.key !== q.key) bank.delete(previous.key)
      const previousKeys = new Set([...(previous.previousKeys ?? []), previous.key])
      previousKeys.delete(q.key)
      bank.set(q.key, {
        ...q,
        related: Object.hasOwn(raw, 'related') ? q.related : (previous.related ?? q.related),
        id: previous.id,
        createdAt: previous.createdAt,
        updatedAt: now,
        previousKeys: [...previousKeys],
      })
      touched.add(q.key)
      report.merged += 1
    } else {
      bank.set(q.key, q)
      touched.add(q.key)
      if (verdict.ok) report.added += 1
    }
    if (dedupeKey(q.stem).length > 0) stemIndex.set(dedupeKey(q.stem), bank.get(q.key).id)
  }

  // Orphans are decided from the material, not from batch membership: a question
  // is orphaned only when its material's extracted text is available and neither
  // its anchor nor its stem is in it any more.
  if (options.materialTextByFile) {
    for (const [key, q] of bank) {
      if (touched.has(key)) continue
      const text = pickMaterialText(options.materialTextByFile, q)
      if (text === null) continue
      const anchor = q.source && typeof q.source.anchor === 'string' && q.source.anchor.length > 0
        ? q.source.anchor
        : q.stem
      const found = findAnchor(anchor, text)
      const flagged = Array.isArray(q.flags) && q.flags.includes('orphaned')
      if (found && flagged) {
        q.flags = q.flags.filter(flag => flag !== 'orphaned')
        if (q.flags.length === 0) q.status = 'ok'
        q.updatedAt = now
      } else if (!found && !flagged) {
        q.flags = [...new Set([...q.flags, 'orphaned'])]
        q.status = 'needs-review'
        q.updatedAt = now
        report.orphaned += 1
      }
    }
  }

  const next = [...bank.values()]
  let relatedTouched = false
  for (const q of next) {
    const block = q.related && Array.isArray(q.related.questions) ? q.related.questions : []
    const { ids, missing, ambiguous } = resolveRelatedIds(next, block)
    const same = ids.length === block.length && ids.every((id, index) => id === block[index])
    if (!same) relatedTouched = true
    q.related = {
      questions: ids,
      deeper: q.related && Array.isArray(q.related.deeper) ? q.related.deeper : [],
      broader: q.related && Array.isArray(q.related.broader) ? q.related.broader : [],
    }
    for (const stem of missing) {
      reasons.push({ file: paths.inboxQuestions, key: q.key, reason: `related_unresolved:${stem.slice(0, 20)}` })
    }
    for (const stem of ambiguous) {
      reasons.push({ file: paths.inboxQuestions, key: q.key, reason: `related_ambiguous:${stem.slice(0, 20)}` })
    }
  }

  const changed = report.added + report.merged + report.needsReview + report.orphaned > 0 || relatedTouched
  if (changed) await writeJsonl(paths.questions, next)

  report.terms = await commitTerms(paths, termDrafts, next, reasons, now)

  if (drafts.length > 0) await moveInto(paths.inboxQuestions, paths.importedDir)
  if (termDrafts.length > 0) await moveInto(paths.inboxTerms, paths.importedDir)
  return report
}

/**
 * Build a stored row for a draft that failed validation, so it can be reviewed
 * rather than silently dropped. It keeps the same key scheme as a passing
 * draft, so a later clean import reconciles with it instead of duplicating.
 * @param {{ status: string, flags: string[] }} verdict - failed verdict.
 * @param {object} raw - the draft.
 * @param {string} now - timestamp.
 * @returns {object|null} a question-shaped row, or null when it cannot be keyed.
 */
function stashRejectedDraft(verdict, raw, now) {
  const stem = normalizeStem(raw && raw.stem)
  if (stem.length === 0) return null
  const source = (raw && raw.source) || {}
  const file = normalizePath(source.file)
  const key = questionKey(file, stem)
  return {
    id: mintId(key),
    key,
    stem,
    nodeId: typeof raw.nodeId === 'string' ? raw.nodeId : '',
    reference: {
      answer: raw && raw.reference && typeof raw.reference.answer === 'string' ? raw.reference.answer : '',
      points: Array.isArray(raw && raw.reference && raw.reference.points) ? raw.reference.points : [],
      supplement: raw && raw.reference && typeof raw.reference.supplement === 'string' ? raw.reference.supplement : '',
      provenance: 'source',
      confidence: null,
    },
    source: {
      file,
      page: Number.isInteger(source.page) ? source.page : null,
      anchor: typeof source.anchor === 'string' ? source.anchor : '',
      hasImage: source.hasImage === true,
    },
    tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string') : [],
    related: { questions: [], deeper: [], broader: [] },
    status: verdict.status,
    flags: [...verdict.flags],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Merge validated terms into terms.json; a term that appears in no stem is
 * dropped with a reason.
 * @param {object} paths - store paths.
 * @param {object[]} drafts - term drafts.
 * @param {object[]} questions - the bank after this commit.
 * @param {object[]} reasons - report reasons, appended to.
 * @param {string} now - timestamp.
 * @returns {Promise<number>} how many terms were stored.
 */
async function commitTerms(paths, drafts, questions, reasons, now) {
  if (drafts.length === 0) return 0
  const existing = await readJson(paths.terms, [])
  const byTerm = new Map(existing.map(t => [t.term, t]))
  const stems = questions.map(q => normalizeStem(q.stem)).join('\n')
  let stored = 0
  for (const draft of drafts) {
    const term = typeof draft.term === 'string' ? draft.term.trim() : ''
    const definition = typeof draft.definition === 'string' ? draft.definition.trim() : ''
    if (term.length === 0 || definition.length === 0) {
      reasons.push({ file: paths.inboxTerms, reason: 'term_incomplete' })
      continue
    }
    if (!stems.includes(term)) {
      reasons.push({ file: paths.inboxTerms, term, reason: 'term_not_in_bank' })
      continue
    }
    byTerm.set(term, {
      term,
      definition,
      example: typeof draft.example === 'string' ? draft.example : '',
      aliases: Array.isArray(draft.aliases) ? draft.aliases.filter(a => typeof a === 'string') : [],
      updatedAt: now,
    })
    stored += 1
  }
  await ensureDir(paths.root)
  await writeJson(paths.terms, [...byTerm.values()])
  return stored
}
