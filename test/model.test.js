import test from 'node:test'
import assert from 'node:assert/strict'
import { findAnchor, mintId, normalizeStem, questionKey, validateDraft } from '../learning-center/src/model.js'

const base = () => ({
  stem: '什么是闭包？',
  reference: { answer: '函数与其词法环境的组合。', points: ['函数', '词法环境'] },
  nodeId: 'n_1',
  source: { file: 'materials/bank.md', page: 3, anchor: '什么是闭包' },
})

const ctx = () => ({ nodeIds: new Set(['n_1']), materialText: '第 3 页：什么是闭包？', now: '2026-11-14T00:00:00.000Z' })

test('normalizeStem 统一换行与空白', () => {
  assert.equal(normalizeStem('  第一行\r\n\r\n   第二行  '), '第一行\n第二行')
  assert.equal(normalizeStem('单行   多空格'), '单行 多空格')
})

test('questionKey 忽略空白差异', () => {
  const a = questionKey('materials/bank.md', '什么是 闭包？')
  const b = questionKey('./materials/bank.md', '  什么是 闭包？\r\n')
  assert.equal(a, b)
  assert.notEqual(a, questionKey('materials/other.md', '什么是 闭包？'))
})

test('mintId 稳定且带 q_ 前缀', () => {
  assert.match(mintId('seed'), /^q_[0-9a-f]{8}$/)
  assert.equal(mintId('seed'), mintId('seed'))
  assert.notEqual(mintId('seed'), mintId('seed2'))
})

test('正常题通过并是 ok', () => {
  const r = validateDraft(base(), ctx())
  assert.equal(r.ok, true)
  assert.equal(r.q.status, 'ok')
  assert.deepEqual(r.q.flags, [])
  assert.equal(r.q.reference.provenance, 'source')
  assert.equal(r.q.source.hasImage, false)
  assert.equal(r.q.createdAt, '2026-11-14T00:00:00.000Z')
})

test('缺答案与要点都缺 → needs-review + missing_answer', () => {
  const raw = base()
  raw.reference = {}
  const r = validateDraft(raw, ctx())
  assert.equal(r.ok, false)
  assert.equal(r.status, 'needs-review')
  assert.deepEqual(r.flags, ['missing_answer'])
})

test('没有要点但有答案仍可入库', () => {
  const raw = base()
  raw.reference = { answer: '只有答案' }
  const r = validateDraft(raw, ctx())
  assert.equal(r.ok, true)
  assert.deepEqual(r.q.reference.points, [])
})

test('空题干直接 rejected', () => {
  const raw = base()
  raw.stem = '   '
  const r = validateDraft(raw, ctx())
  assert.equal(r.ok, false)
  assert.equal(r.status, 'rejected')
  assert.deepEqual(r.flags, ['empty_stem'])
})

test('题干过短 → truncated', () => {
  const raw = base()
  raw.stem = '闭包？'
  const r = validateDraft(raw, ctx())
  assert.equal(r.ok, false)
  assert.deepEqual(r.flags, ['truncated'])
})

test('知识点不在树里 → node_unknown', () => {
  const raw = base()
  raw.nodeId = 'n_9'
  const r = validateDraft(raw, ctx())
  assert.equal(r.ok, false)
  assert.deepEqual(r.flags, ['node_unknown'])
})

test('锚点不在材料里 → anchor_missing', () => {
  const raw = base()
  raw.source.anchor = '材料里没有这句'
  const r = validateDraft(raw, ctx())
  assert.equal(r.ok, false)
  assert.deepEqual(r.flags, ['anchor_missing'])
})

test('没有抽取文本时标 anchor_unverified 而不是放行', () => {
  const r = validateDraft(base(), { nodeIds: new Set(['n_1']), materialText: null })
  assert.equal(r.ok, false)
  assert.ok(r.flags.includes('anchor_unverified'))
})

test('提到图但没标 hasImage → image_hint_missing', () => {
  const raw = base()
  raw.stem = '见下图，这个结构叫什么？'
  raw.source.anchor = '见下图'
  const c = ctx()
  c.materialText = '……见下图，这个结构叫什么？……'
  const r = validateDraft(raw, c)
  assert.equal(r.ok, false)
  assert.deepEqual(r.flags, ['image_hint_missing'])
})

test('同一个锚点跨行也认', () => {
  const text = '第一段  结束。\n\n第二段：闭包 是指  函数与其词法环境的组合。'
  assert.equal(findAnchor('第二段：闭包 是指 函数与其词法环境的组合。', text), true)
  assert.equal(findAnchor('完全不存在的句子', text), false)
  assert.equal(findAnchor('', text), false)
})

test('tags 去重去空、来源字段有默认值', () => {
  const raw = base()
  raw.tags = ['闭包', '闭包', ' ', '函数']
  raw.source = { file: 'materials/bank.md', anchor: '什么是闭包' }
  const r = validateDraft(raw, ctx())
  assert.deepEqual(r.q.tags, ['闭包', '函数'])
  assert.equal(r.q.source.page, null)
})
