/**
 * File primitives for the learning store: JSON and JSONL with atomic replacement.
 * Every write lands in `<file>.tmp` first and is renamed into place, so an
 * interrupted write leaves the previous file intact instead of a half file.
 * @module @local/learning-center/src/io
 */

import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'

/**
 * @param {string} dir - directory to create, including parents.
 * @returns {Promise<void>} resolves when the directory exists.
 */
export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

/**
 * Read one JSON file.
 * @param {string} file - absolute path.
 * @param {*} fallback - returned when the file does not exist.
 * @returns {Promise<*>} the parsed value or `fallback`.
 */
export async function readJson(file, fallback) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback
    throw error
  }
  return JSON.parse(text)
}

/**
 * Replace one JSON file atomically.
 * @param {string} file - absolute path.
 * @param {*} value - JSON-serialisable value.
 * @returns {Promise<void>} resolves after the rename.
 */
export async function writeJson(file, value) {
  await ensureDir(dirname(file))
  const tmp = `${file}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
}

/**
 * Read a JSONL file, one JSON value per line.
 * @param {string} file - absolute path.
 * @returns {Promise<object[]>} parsed rows; empty when the file is absent.
 */
export async function readJsonl(file) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  const rows = []
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    rows.push(JSON.parse(line))
  }
  return rows
}

/**
 * Replace a JSONL file atomically, one row per line.
 * @param {string} file - absolute path.
 * @param {object[]} rows - values to serialise.
 * @returns {Promise<void>} resolves after the rename.
 */
export async function writeJsonl(file, rows) {
  await ensureDir(dirname(file))
  const tmp = `${file}.tmp`
  const body = rows.map(row => JSON.stringify(row)).join('\n')
  await writeFile(tmp, rows.length === 0 ? '' : `${body}\n`, 'utf8')
  await rename(tmp, file)
}

/**
 * Move a file into a directory, never overwriting: `a.json` becomes `a-1.json`
 * when `a.json` is already there. `rename` replaces an existing destination on
 * Windows, so the free name is probed before the move.
 * @param {string} from - source file.
 * @param {string} toDir - destination directory.
 * @returns {Promise<string>} the destination path.
 */
export async function moveInto(from, toDir) {
  await ensureDir(toDir)
  const { name, ext } = parse(from)
  for (let n = 0; ; n += 1) {
    const candidate = join(toDir, n === 0 ? `${name}${ext}` : `${name}-${n}${ext}`)
    if (await exists(candidate)) continue
    await rename(from, candidate)
    return candidate
  }
}

/**
 * @param {string} file - absolute path.
 * @returns {Promise<boolean>} whether the path exists.
 */
async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
