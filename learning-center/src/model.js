/**
 * Question normalisation, stable keys, and the per-question checks that keep
 * unparsed or fabricated questions out of practice.
 * @module @local/learning-center/src/model
 */

import { createHash } from 'node:crypto'

/** Shortest stem that is plausibly a whole question. */
const MIN_STEM = 6

/**
 * @param {string} input - any text.
 * @returns {string} sha1 hex digest.
 */
function sha1(input) {
  return createHash('sha1').update(input, 'utf8').digest('hex')
}

/**
 * Normalise a stem for comparison and display: one line per original line,
 * each trimmed, blank lines dropped, runs of spaces collapsed.
 * @param {string} stem - raw stem.
 * @returns {string} normalised stem.
 */
export function normalizeStem(stem) {
  return String(stem ?? '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map(line => line.trim().replace(/[ \t\u3000]+/gu, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
}

/**
 * @param {string} file - source path as written by the agent.
 * @returns {string} forward-slash path without a leading `./`.
 */
export function normalizePath(file) {
  return String(file ?? '')
    .replace(/\\/gu, '/')
    .replace(/^(\.\/)+/u, '')
    .trim()
}

/**
 * Stable identity for "the same question from the same material".
 * @param {string} file - source file.
 * @param {string} stem - question stem.
 * @returns {string} hex key.
 */
export function questionKey(file, stem) {
  return sha1(`${normalizePath(file)}\n${normalizeStem(stem)}`)
}

/**
 * @param {string} seed - any stable text.
 * @returns {string} question id.
 */
export function mintId(seed) {
  return `q_${sha1(seed).slice(0, 8)}`
}

/**
 * Whether an anchor appears in the extracted material text, tolerating line
 * breaks and whitespace differences introduced by PDF extraction.
 * @param {string} anchor - verbatim excerpt the agent claims is in the material.
 * @param {string} materialText - extracted text of that material.
 * @returns {boolean} whether the anchor is present.
 */
export function findAnchor(anchor, materialText) {
  const squash = value => String(value ?? '').replace(/\s+/gu, ' ').trim()
  const needle = squash(anchor)
  if (needle.length === 0) return false
  return squash(materialText).includes(needle)
}

/**
 * @param {*} value - candidate.
 * @returns {boolean} whether it is a usable non-empty string.
 */
function filled(value) {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validate one draft question and build the stored shape.
 * @param {object} raw - draft as written by the agent into inbox/questions.jsonl.
 * @param {{ nodeIds: Set<string>, materialText: string | null, now?: string, materialTextByFile?: Record<string, string> }} options - knowledge-node ids and extracted text.
 * @returns {{ ok: true, q: object } | { ok: false, status: 'needs-review' | 'rejected', flags: string[] }} verdict.
 */
export function validateDraft(raw, options) {
  const now = options.now ?? new Date().toISOString()
  const stem = normalizeStem(raw && raw.stem)
  if (stem.length === 0) return { ok: false, status: 'rejected', flags: ['empty_stem'] }

  const flags = []
  const source = (raw && raw.source) || {}
  const file = normalizePath(source.file)
  const materialText = options.materialTextByFile && file
    ? (Object.hasOwn(options.materialTextByFile, file) ? options.materialTextByFile[file] : null)
    : (options.materialText ?? null)

  if (stem.length < MIN_STEM) flags.push('truncated')

  const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId : ''
  if (!options.nodeIds || !options.nodeIds.has(nodeId)) flags.push('node_unknown')

  const reference = (raw && raw.reference) || {}
  const answer = filled(reference.answer) ? reference.answer.trim() : ''
  const points = Array.isArray(reference.points)
    ? reference.points.filter(p => filled(p)).map(p => p.trim())
    : []
  if (answer.length === 0 && points.length === 0) flags.push('missing_answer')

  const anchor = filled(source.anchor) ? String(source.anchor) : ''
  if (materialText === null) flags.push('anchor_unverified')
  else if (!findAnchor(anchor, materialText)) flags.push('anchor_missing')

  if (/见下?图|如图|见图/u.test(stem) && source.hasImage !== true) flags.push('image_hint_missing')

  if (flags.length > 0) return { ok: false, status: 'needs-review', flags }

  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.filter(t => filled(t)).map(t => String(t).trim()))]
    : []
  const key = questionKey(file, stem)

  return {
    ok: true,
    q: {
      id: mintId(key),
      key,
      stem,
      nodeId,
      reference: {
        answer,
        points,
        provenance: reference.provenance === 'ai-drafted' || reference.provenance === 'user'
          ? reference.provenance
          : 'source',
        confidence: typeof reference.confidence === 'number' ? reference.confidence : null,
      },
      source: {
        file,
        page: Number.isInteger(source.page) ? source.page : null,
        anchor,
        hasImage: source.hasImage === true,
      },
      tags,
      related: {
        questions: [],
        deeper: [],
        broader: [],
      },
      status: 'ok',
      flags: [],
      createdAt: now,
      updatedAt: now,
    },
  }
}
