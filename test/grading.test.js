import test from 'node:test'
import assert from 'node:assert/strict'
import { GRADE_LIMITS, needsSuggestion, normalizeGrading } from '../learning-center/src/grading.js'

test('normalizeGrading 算分并规整数组', () => {
  const out = normalizeGrading({ covered: ['函数', '函数'], missed: ['私有化'], wrong: [], feedback: '  ', suggestion: '' })
  assert.equal(out.score, 0.5)
  assert.deepEqual(out.covered, ['函数'])
  assert.equal(out.feedback, '')
})

test('covered 与 missed 都空时拒绝', () => {
  assert.throws(() => normalizeGrading({ covered: [], missed: [] }), /empty grading/)
})

test('needsSuggestion 在低于 0.6 时为真', () => {
  assert.equal(needsSuggestion(0.5), true)
  assert.equal(needsSuggestion(0.6), false)
  assert.equal(needsSuggestion(null), false)
})

test('score 保留两位小数', () => {
  const out = normalizeGrading({ covered: ['a', 'b'], missed: ['c'] })
  assert.equal(out.score, 0.67)
})

test('超长文本截断到上限', () => {
  const out = normalizeGrading({ covered: ['a'], missed: [], feedback: '长'.repeat(3000) })
  assert.equal(out.feedback.length, GRADE_LIMITS.textLength)
})

test('非数组输入按空处理，坏元素被丢掉', () => {
  const out = normalizeGrading({ covered: 'x', missed: ['b', '', 3], feedback: 42 })
  assert.deepEqual(out.covered, [])
  assert.deepEqual(out.missed, ['b'])
  assert.equal(out.feedback, '')
})
