import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readJson, writeJson, readJsonl, writeJsonl, ensureDir, moveInto } from '../learning-center/src/io.js'
import { tempDir } from './helpers.js'

test('JSONL 一行一题，多行题干与引号原样读回', async () => {
  const dir = await tempDir()
  const file = join(dir, 'questions.jsonl')
  const rows = [
    { id: 'q_1', stem: '第一行\r\n含"引号"和 \\ 反斜杠\n第二行' },
    { id: 'q_2', stem: '第二题\n\n带空行' },
  ]
  await writeJsonl(file, rows)
  assert.deepEqual(await readJsonl(file), rows)
})

test('写 JSONL 不留临时文件', async () => {
  const dir = await tempDir()
  const file = join(dir, 'q.jsonl')
  await writeJsonl(file, [{ a: 1 }])
  const names = await readdir(dir)
  assert.deepEqual(names, ['q.jsonl'])
})

test('读不存在的 JSON 返回 fallback，读不存在的 JSONL 返回空数组', async () => {
  const dir = await tempDir()
  assert.deepEqual(await readJson(join(dir, 'missing.json'), { a: 1 }), { a: 1 })
  assert.deepEqual(await readJsonl(join(dir, 'missing.jsonl')), [])
})

test('JSON 读到坏内容时抛错而不是静默返回 fallback', async () => {
  const dir = await tempDir()
  const file = join(dir, 'bad.json')
  await writeJson(file, { ok: true })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(file, '{not json', 'utf8')
  await assert.rejects(() => readJson(file, {}), /Unexpected|JSON/)
})

test('ensureDir 递归建目录后能写入嵌套 JSON', async () => {
  const dir = await tempDir()
  const file = join(dir, 'reports', 'audit', 'a.json')
  await ensureDir(join(dir, 'reports', 'audit'))
  await writeJson(file, { n: 1 })
  assert.deepEqual(await readJson(file, null), { n: 1 })
})

test('moveInto 遇重名加后缀，不覆盖已有文件', async () => {
  const dir = await tempDir()
  const from = join(dir, 'questions.jsonl')
  const to = join(dir, 'imported')
  await ensureDir(to)
  await writeJsonl(from, [{ a: 1 }])
  await writeJsonl(join(to, 'questions.jsonl'), [{ old: true }])
  const moved = await moveInto(from, to)
  assert.equal(moved, join(to, 'questions-1.jsonl'))
  assert.deepEqual(await readJsonl(join(to, 'questions.jsonl')), [{ old: true }])
})

test('BOM 开头的 JSON 也能解析', async () => {
  const dir = await tempDir()
  const file = join(dir, 'bom.json')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(file, '\uFEFF{"a":1}', 'utf8')
  assert.deepEqual(await readJson(file, null), { a: 1 })
})

test('JSONL 首行的 BOM 也去掉', async () => {
  const dir = await tempDir()
  const file = join(dir, 'bom.jsonl')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(file, '\uFEFF{"a":1}\n{"b":2}\n', 'utf8')
  assert.deepEqual(await readJsonl(file), [{ a: 1 }, { b: 2 }])
})