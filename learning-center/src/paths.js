/**
 * Store layout: every learning-center file lives under one directory inside the
 * session working directory, so a backup or a git diff covers the whole library.
 * @module @local/learning-center/src/paths
 */

import { join, resolve, sep } from 'node:path'

/**
 * Build every absolute path the store uses.
 * @param {string} baseDir - the session's working directory.
 * @param {string} [storeDir] - directory name under `baseDir`.
 * @returns {object} absolute paths for the store's files and directories.
 */
export function resolveStore(baseDir, storeDir = 'learning') {
  const root = resolve(baseDir, storeDir)
  return {
    root,
    meta: join(root, 'meta.json'),
    questions: join(root, 'questions.jsonl'),
    terms: join(root, 'terms.json'),
    attempts: join(root, 'attempts.jsonl'),
    progress: join(root, 'progress.json'),
    inboxDir: join(root, 'inbox'),
    inboxQuestions: join(root, 'inbox', 'questions.jsonl'),
    inboxTerms: join(root, 'inbox', 'terms.jsonl'),
    importedDir: join(root, 'imported'),
    materialsDir: join(root, 'materials'),
    reportsDir: join(root, 'reports'),
  }
}

/**
 * Refuse any path outside the store root.
 * @param {string} root - the store root directory.
 * @param {string} target - the path about to be read or written.
 * @returns {string} the resolved target.
 * @throws {Error} when `target` is outside `root`.
 */
export function assertInside(root, target) {
  const base = resolve(root)
  const full = resolve(target)
  if (full === base || full.startsWith(base + sep)) return full
  throw new Error(`path escapes store: ${target}`)
}
