/**
 * Store facade: the only place the rest of the plugin reads or writes the
 * learning library. Reads are tolerant (missing files mean empty data); writes
 * are atomic and validated.
 * @module @local/learning-center/src/store
 */

import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { readConfig } from './config.js'
import { commitInbox } from './ingest.js'
import { readJson, readJsonl, writeJson, writeJsonl } from './io.js'
import { normalizePath, questionKey, validateDraft, validatePatch } from './model.js'
import { resolveStore } from './paths.js'

/** Statuses the panel may set. */
const STATUSES = new Set(['ok', 'needs-review', 'rejected'])

/**
 * @param {ReturnType<typeof readConfig>} config - resolved config.
 * @returns {object} a fresh meta document.
 */
function emptyMeta(config) {
  return {
    version: 1,
    target: null,
    tree: [],
    plan: [],
    settings: {
      leavePromptRate: config.leavePromptRate,
      quizCooldownMinutes: config.quizCooldownMinutes,
      autoAcceptDrafts: config.autoAcceptDrafts,
      gradingMode: 'ai',
    },
  }
}

/**
 * Build the store for one session working directory.
 * @param {string} baseDir - session working directory.
 * @param {object} [rawConfig] - loader row config.
 * @returns {object} the store facade.
 */
export function createStore(baseDir, rawConfig) {
  const config = readConfig(rawConfig)
  const paths = resolveStore(baseDir, config.storeDir)

  /**
   * @returns {Promise<object>} every document the store owns.
   */
  async function load() {
    const [meta, questions, terms, progress, attempts] = await Promise.all([
      readJson(paths.meta, null),
      readJsonl(paths.questions),
      readJson(paths.terms, []),
      readJson(paths.progress, {}),
      readJsonl(paths.attempts),
    ])
    return {
      meta: meta ?? emptyMeta(config),
      questions,
      terms,
      progress,
      attempts,
    }
  }

  /**
   * @param {object} meta - the whole meta document.
   * @returns {Promise<void>} resolves after the write.
   */
  async function saveMeta(meta) {
    await writeJson(paths.meta, meta)
  }

  /**
   * @returns {Promise<Set<string>>} the knowledge-node ids currently in the tree.
   */
  async function nodeIds() {
    const meta = await readJson(paths.meta, null)
    const tree = meta && Array.isArray(meta.tree) ? meta.tree : []
    return new Set(tree.map(node => node.id))
  }

  /**
   * @param {string} id - question id.
   * @param {boolean} on - whether the question is favourited.
   * @returns {Promise<void>} resolves after the write.
   */
  async function setFavorite(id, on) {
    const progress = await readJson(paths.progress, {})
    progress[id] = { ...(progress[id] ?? {}), favorite: on === true, updatedAt: new Date().toISOString() }
    await writeJson(paths.progress, progress)
  }

  /**
   * @param {string} id - question id.
   * @returns {Promise<void>} resolves after the write.
   */
  async function markSeen(id) {
    const progress = await readJson(paths.progress, {})
    progress[id] = { ...(progress[id] ?? {}), seen: true, seenAt: new Date().toISOString() }
    await writeJson(paths.progress, progress)
  }

  /**
   * Rewrite one question through the same validation the importer uses, keeping
   * its identity. Editing the stem recomputes the fingerprint and remembers the
   * old one, so a later re-import still recognises the question.
   * @param {string} id - question id.
   * @param {object} patch - fields to replace.
   * @returns {Promise<object>} the stored question.
   */
  async function updateQuestion(id, patch) {
    const questions = await readJsonl(paths.questions)
    const index = questions.findIndex(q => q.id === id)
    if (index === -1) throw new Error(`unknown question: ${id}`)
    const current = questions[index]
    const next = validatePatch(current, patch ?? {}, { nodeIds: await nodeIds() })
    if (next.stem !== current.stem) {
      const newKey = questionKey(current.source && current.source.file ? current.source.file : '', next.stem)
      const history = [...(current.previousKeys ?? []), current.key]
      next.key = newKey
      next.previousKeys = [...new Set(history)].filter(key => key !== newKey)
    }
    next.id = current.id
    next.createdAt = current.createdAt
    next.updatedAt = new Date().toISOString()
    questions[index] = next
    await writeJsonl(paths.questions, questions)
    return next
  }

  /**
   * Accept, reject, or re-flag one question. Accepting clears the flags that
   * kept it out of practice.
   * @param {string} id - question id.
   * @param {string} status - one of ok, needs-review, rejected.
   * @returns {Promise<object>} the stored question.
   */
  async function setStatus(id, status) {
    if (!STATUSES.has(status)) throw new Error(`unknown status: ${status}`)
    const questions = await readJsonl(paths.questions)
    const index = questions.findIndex(q => q.id === id)
    if (index === -1) throw new Error(`unknown question: ${id}`)
    const next = { ...questions[index], status, updatedAt: new Date().toISOString() }
    if (status === 'ok') next.flags = []
    questions[index] = next
    await writeJsonl(paths.questions, questions)
    return next
  }

  /**
   * Append one answer attempt and fold it into progress.
   * @param {object} attempt - the attempt record.
   * @returns {Promise<void>} resolves after both writes.
   */
  async function recordAttempt(attempt) {
    const attempts = await readJsonl(paths.attempts)
    attempts.push(attempt)
    await writeJsonl(paths.attempts, attempts)
    const progress = await readJson(paths.progress, {})
    const entry = progress[attempt.questionId] ?? {}
    const score = attempt.grade && typeof attempt.grade.score === 'number' ? attempt.grade.score : null
    progress[attempt.questionId] = {
      ...entry,
      attempts: (entry.attempts ?? 0) + 1,
      lastScore: score,
      misses: (entry.misses ?? 0) + (score !== null && score < 1 ? 1 : 0),
      lastAttemptAt: attempt.at,
    }
    await writeJson(paths.progress, progress)
  }

  /**
   * Merge glossary entries by term.
   * @param {object[]} entries - term records.
   * @returns {Promise<void>} resolves after the write.
   */
  async function upsertTerms(entries) {
    const terms = await readJson(paths.terms, [])
    const byTerm = new Map(terms.map(term => [term.term, term]))
    for (const entry of entries ?? []) {
      if (!entry || typeof entry.term !== 'string' || entry.term.length === 0) continue
      byTerm.set(entry.term, { ...byTerm.get(entry.term), ...entry })
    }
    await writeJson(paths.terms, [...byTerm.values()])
  }

  /**
   * Collect `materials/*.txt` as extracted text, keyed by file stem and by
   * `materials/<stem>.txt`, so an anchor can be checked against the source the
   * agent named.
   * @returns {Promise<Record<string, string>>} extracted text by key.
   */
  async function materialTexts() {
    let names = []
    try {
      names = await readdir(paths.materialsDir)
    } catch (error) {
      if (error && error.code === 'ENOENT') return {}
      throw error
    }
    const map = {}
    for (const name of names) {
      if (extname(name).toLowerCase() !== '.txt') continue
      const text = await readFile(join(paths.materialsDir, name), 'utf8')
      const stem = basename(name, extname(name))
      map[stem] = text
      map[`materials/${name}`] = text
    }
    return map
  }

  /**
   * Validate and append one hand-written question.
   * @param {object} raw - draft question.
   * @returns {Promise<object>} the stored question.
   */
  async function addQuestion(raw) {
    const ids = await nodeIds()
    const texts = await materialTexts()
    const file = normalizePath(raw && raw.source && raw.source.file)
    const stemKey = basename(file, extname(file))
    const verdict = validateDraft(raw, {
      nodeIds: ids,
      materialText: texts[file] ?? texts[stemKey] ?? null,
      allowUnsourced: true,
    })
    if (!verdict.ok) throw new Error(`question rejected: ${verdict.flags.join(',')}`)
    const rows = await readJsonl(paths.questions)
    if (rows.some(q => q.key === verdict.q.key)) throw new Error('duplicate question: already in bank')
    // Questions the model writes are AI drafts by definition: they wait for a
    // human to accept them, and statistics count them separately.
    verdict.q.status = 'needs-review'
    verdict.q.reference.provenance = 'ai-drafted'
    rows.push(verdict.q)
    await writeJsonl(paths.questions, rows)
    return verdict.q
  }

  /**
   * @returns {Promise<object>} the ingest report.
   */
  async function commit() {
    return commitInbox(paths, {
      nodeIds: await nodeIds(),
      materialTextByFile: await materialTexts(),
    })
  }

  return {
    paths,
    config,
    load,
    saveMeta,
    nodeIds,
    setFavorite,
    markSeen,
    updateQuestion,
    setStatus,
    recordAttempt,
    upsertTerms,
    materialTexts,
    addQuestion,
    commitInbox: commit,
  }
}
