/**
 * Turn the agent's drafts into the question bank: validate every row, reconcile
 * against what is already stored, keep everything that fails in "needs review",
 * and never delete a question someone may have answered.
 * @module @local/learning-center/src/ingest
 */

import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { moveInto, readJson, readJsonl, writeJson, writeJsonl, ensureDir } from './io.js'
import { mintId, normalizePath, normalizeStem, questionKey, validateDraft } from './model.js'

/**
 * Find the extracted text for one draft's source file: the exact path first,
 * then the material's file stem (`materials/bank.txt` for `materials/bank.md`).
 * @param {Record<string, string>|undefined} byFile - extracted text table.
 * @param {object} raw - the draft.
 * @returns {string|null} the text, or null when the material has none.
 */
function pickMaterialText(byFile, raw) {
  if (!byFile) return null
  const file = normalizePath(raw && raw.source && raw.source.file)
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
  const touched = new Set()
  const batchFiles = new Set()

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

    if (touched.has(q.key)) {
      reasons.push({ file: paths.inboxQuestions, key: q.key, reason: `duplicate_of:${bank.get(q.key)?.id ?? '?'}` })
      report.rejected += 1
      continue
    }
    touched.add(q.key)
    if (q.source.file) batchFiles.add(q.source.file)

    if (!verdict.ok) {
      report.needsReview += 1
      reasons.push({ file: paths.inboxQuestions, key: q.key, flags: verdict.flags, reason: verdict.flags.join(',') })
    }

    const previous = bank.get(q.key)
    if (previous) {
      bank.set(q.key, { ...q, id: previous.id, createdAt: previous.createdAt, updatedAt: now })
      report.merged += 1
    } else {
      bank.set(q.key, q)
      if (verdict.ok) report.added += 1
    }
  }

  if (batchFiles.size > 0) {
    for (const [key, q] of bank) {
      if (touched.has(key)) continue
      if (!batchFiles.has(q.source.file)) continue
      q.flags = [...new Set([...q.flags, 'orphaned'])]
      q.status = 'needs-review'
      q.updatedAt = now
      report.orphaned += 1
    }
  }

  const next = [...bank.values()]
  const changed = report.added + report.merged + report.needsReview + report.orphaned > 0
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
  const file = String(source.file ?? '').replace(/\\/gu, '/').replace(/^(\.\/)+/u, '')
  const key = questionKey(file, stem)
  return {
    id: mintId(key),
    key,
    stem,
    nodeId: typeof raw.nodeId === 'string' ? raw.nodeId : '',
    reference: {
      answer: raw && raw.reference && typeof raw.reference.answer === 'string' ? raw.reference.answer : '',
      points: Array.isArray(raw && raw.reference && raw.reference.points) ? raw.reference.points : [],
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
