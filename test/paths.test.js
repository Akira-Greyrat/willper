import test from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { resolveStore, assertInside } from '../learning-center/src/paths.js'

test('resolveStore 把全部路径放在 learning 下', () => {
  const p = resolveStore('D:/work')
  assert.equal(p.questions, join(p.root, 'questions.jsonl'))
  assert.equal(p.meta, join(p.root, 'meta.json'))
  assert.equal(p.inboxDir, join(p.root, 'inbox'))
  assert.equal(p.materialsDir, join(p.root, 'materials'))
  assert.equal(p.reportsDir, join(p.root, 'reports'))
  assert.ok(p.inboxDir.startsWith(p.root))
})

test('resolveStore 用配置里的目录名', () => {
  const p = resolveStore('D:/work', 'study')
  assert.equal(p.root, resolve('D:/work', 'study'))
})

test('assertInside 接受库内路径', () => {
  const root = resolve('D:/work/learning')
  assert.equal(assertInside(root, join(root, 'materials', 'a.txt')), join(root, 'materials', 'a.txt'))
})

test('assertInside 拒绝穿越', () => {
  const root = resolve('D:/work/learning')
  assert.throws(() => assertInside(root, resolve(root, '../secret.txt')), /path escapes/)
  assert.throws(() => assertInside(root, resolve(root, '..', '..', 'windows', 'system32')), /path escapes/)
})

test('assertInside 拒绝同名前缀的兄弟目录', () => {
  const root = resolve('D:/work/learning')
  assert.throws(() => assertInside(root, resolve('D:/work/learning-evil/x.json')), /path escapes/)
})
