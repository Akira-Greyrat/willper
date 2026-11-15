import test from 'node:test'
import assert from 'node:assert/strict'
import { RELATED_LIMITS, normalizeRelated, resolveRelatedIds } from '../learning-center/src/related.js'

test('normalizeRelated 截量截长并去重', () => {
  const raw = {
    questions: ['甲', '甲', ' ', '乙'],
    deeper: Array.from({ length: 6 }, (_, index) => `问题${index}`),
    broader: ['长'.repeat(200)],
  }
  const out = normalizeRelated(raw)
  assert.deepEqual(out.questions, ['甲', '乙'])
  assert.equal(out.deeper.length, RELATED_LIMITS.perList)
  assert.equal(out.broader[0].length, RELATED_LIMITS.textLength)
})

test('normalizeRelated 容忍缺失与坏类型', () => {
  assert.deepEqual(normalizeRelated(undefined), { questions: [], deeper: [], broader: [] })
  assert.deepEqual(normalizeRelated({ deeper: 'x' }).deeper, [])
  assert.deepEqual(normalizeRelated({ questions: [1, null, '甲'] }).questions, ['甲'])
})

test('resolveRelatedIds 把题干换成题号，找不到的进 missing', () => {
  const bank = [{ id: 'q1', stem: '什么是闭包？' }, { id: 'q2', stem: '什么是作用域？' }]
  const out = resolveRelatedIds(bank, ['什么是 闭包？', '没这题'])
  assert.deepEqual(out.ids, ['q1'])
  assert.deepEqual(out.missing, ['没这题'])
  assert.deepEqual(out.ambiguous, [])
})

test('resolveRelatedIds 遇到撞车的题干记 ambiguous 并取第一个', () => {
  const bank = [{ id: 'q1', stem: '什么是闭包？' }, { id: 'q9', stem: '什么是闭包?' }]
  const out = resolveRelatedIds(bank, ['什么是闭包'])
  assert.deepEqual(out.ids, ['q1'])
  assert.equal(out.ambiguous.length, 1)
})

test('resolveRelatedIds 跳过已经是题号的项', () => {
  const bank = [{ id: 'q1', stem: '什么是闭包？' }, { id: 'q2', stem: '什么是作用域？' }]
  const out = resolveRelatedIds(bank, ['q2'])
  assert.deepEqual(out.ids, ['q2'])
  assert.deepEqual(out.missing, [])
})
