import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDigest } from '../learning-center/src/audit.js'

const meta = { tree: [{ id: 'n_1', title: '基础' }, { id: 'n_2', title: '事件循环' }] }

test('auditDigest 覆盖整个题库并按知识点计数', () => {
  const questions = [
    { id: 'q1', nodeId: 'n_1', status: 'ok', flags: [] },
    { id: 'q2', nodeId: 'n_1', status: 'needs-review', flags: ['missing_answer'] },
    { id: 'q3', nodeId: 'n_2', status: 'needs-review', flags: ['orphaned'] },
    { id: 'q4', nodeId: 'n_1', status: 'ok', flags: ['duplicate_of:q1'] },
  ]
  const digest = auditDigest({ meta, questions, materials: ['materials/a.md'] })
  assert.equal(digest.nodes.find(node => node.id === 'n_1').count, 3)
  assert.deepEqual(digest.needsReview.map(item => item.id), ['q2'])
  assert.deepEqual(digest.duplicates, ['q4'])
  assert.deepEqual(digest.orphans, ['q3'])
  assert.deepEqual(digest.missingAnswer, ['q2'])
  assert.deepEqual(digest.materials, ['materials/a.md'])
})

test('超过上限时按类报告总数与剩余条数', () => {
  const questions = Array.from({ length: 30 }, (_, index) => ({ id: `q${String(index).padStart(2, '0')}`, nodeId: 'n_1', status: 'ok', flags: ['duplicate_of:q00'] }))
  const digest = auditDigest({ meta, questions, materials: [] })
  assert.equal(digest.duplicates.length, 20)
  assert.equal(digest.totals.duplicates, 30)
  assert.equal(digest.overflow.duplicates, 10)
  assert.equal(digest.totals.orphans, 0)
})

test('零题知识点也在列表里', () => {
  const digest = auditDigest({ meta, questions: [{ id: 'q1', nodeId: 'n_1', status: 'ok', flags: [] }], materials: [] })
  assert.equal(digest.nodes.find(node => node.id === 'n_2').count, 0)
})
