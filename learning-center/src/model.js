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
 * Fold full-width ASCII and drop punctuation, symbols and whitespace so that
 * "什么是闭包？" and "什么是闭包?" collapse to one fingerprint.
 * @param {string} stem - question stem.
 * @returns {string} a comparison fingerprint.
 */
export function dedupeKey(stem) {
  return normalizeStem(stem)
    .replace(/[\uFF01-\uFF5E]/gu, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/gu, ' ')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
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

/** Statuses a question may carry. */
export const STATUSES = new Set(['ok', 'needs-review', 'rejected'])

/**
 * Validate a panel/tool edit and return the row it should produce. Identity
 * fields (`id`, `key`, `createdAt`) are the caller's to preserve, never the
 * patch's.
 * @param {object} current - the stored question.
 * @param {object} patch - fields to replace.
 * @param {{ nodeIds: Set<string> }} options - live knowledge-node ids.
 * @returns {object} the next row (without `updatedAt`).
 * @throws {Error} when a field would corrupt the bank.
 */
export function validatePatch(current, patch, options) {
  const next = { ...current }
  for (const [field, value] of Object.entries(patch ?? {})) {
    switch (field) {
      case 'stem': {
        const stem = normalizeStem(value)
        if (stem.length < MIN_STEM) throw new Error('invalid stem')
        next.stem = stem
        break
      }
      case 'nodeId': {
        if (typeof value !== 'string' || !options.nodeIds.has(value)) throw new Error(`unknown node: ${String(value)}`)
        next.nodeId = value
        break
      }
      case 'reference': {
        if (!value || typeof value !== 'object') throw new Error('invalid reference')
        const answer = typeof value.answer === 'string' ? value.answer : ''
        const points = Array.isArray(value.points) ? value.points : []
        if (answer.trim().length === 0 && points.length === 0) throw new Error('invalid reference')
        next.reference = { ...current.reference, ...value }
        break
      }
      case 'source': {
        if (!value || typeof value !== 'object') throw new Error('invalid source')
        next.source = { ...current.source, ...value }
        break
      }
      case 'tags': {
        if (!Array.isArray(value) || value.some(tag => typeof tag !== 'string')) throw new Error('invalid tags')
        next.tags = [...new Set(value.map(tag => tag.trim()).filter(Boolean))]
        break
      }
      case 'flags': {
        if (!Array.isArray(value) || value.some(flag => typeof flag !== 'string')) throw new Error('invalid flags')
        next.flags = [...value]
        break
      }
      case 'related': {
        if (!value || typeof value !== 'object') throw new Error('invalid related')
        next.related = { ...current.related, ...value }
        break
      }
      case 'status': {
        if (!STATUSES.has(value)) throw new Error(`unknown status: ${String(value)}`)
        next.status = value
        if (value === 'ok') next.flags = []
        break
      }
      default:
        throw new Error(`unknown field: ${field}`)
    }
  }
  return next
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
  const unsourced = options.allowUnsourced === true && file.length === 0 && anchor.length === 0
  if (!unsourced) {
    if (materialText === null) flags.push('anchor_unverified')
    else if (!findAnchor(anchor, materialText)) flags.push('anchor_missing')
  }

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
        provenance: unsourced
          ? 'user'
          : (reference.provenance === 'ai-drafted' || reference.provenance === 'user'
            ? reference.provenance
            : 'source'),
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
