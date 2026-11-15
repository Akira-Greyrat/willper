import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveStore } from '../learning-center/src/paths.js'

/**
 * Run one test body inside a throwaway directory shaped like a session cwd.
 * @param {(paths: ReturnType<typeof resolveStore>, baseDir: string) => Promise<void>} body test body.
 * @returns {Promise<void>} resolves after the directory is removed.
 */
export async function withTempStore(body) {
  const baseDir = await mkdtemp(join(tmpdir(), 'learning-center-'))
  try {
    await body(resolveStore(baseDir), baseDir)
  } finally {
    await rm(baseDir, { recursive: true, force: true })
  }
}

/** @returns {Promise<string>} a fresh empty directory path. */
export async function tempDir() {
  return mkdtemp(join(tmpdir(), 'learning-center-'))
}
