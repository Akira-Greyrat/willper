import test from 'node:test'
import assert from 'node:assert/strict'
import { PLAN_STATUSES, normalizePlan } from '../learning-center/src/plan.js'

test('缺 id 的阶段按顺序补齐，状态默认 todo', () => {
  const out = normalizePlan([{ title: '一' }, { title: '二' }])
  assert.deepEqual(out.map(stage => stage.id), ['p_1', 'p_2'])
  assert.deepEqual(out.map(stage => stage.status), ['todo', 'todo'])
})

test('保留已有的合法 id 与状态', () => {
  const out = normalizePlan([{ id: 'p_9', title: '一', status: 'doing' }])
  assert.equal(out[0].id, 'p_9')
  assert.equal(out[0].status, 'doing')
})

test('重复 id 重新编号，坏状态落回 todo', () => {
  const out = normalizePlan([{ id: 'p_1', status: 'nope' }, { id: 'p_1' }])
  assert.deepEqual(out.map(stage => stage.id), ['p_1', 'p_2'])
  assert.equal(out[0].status, 'todo')
})

test('非数组与非对象元素被丢掉', () => {
  assert.deepEqual(normalizePlan(null), [])
  assert.deepEqual(normalizePlan(['x', { title: '一' }]).length, 1)
})

test('AI 重写计划换了 id 时，旧进度不会串到别的阶段', () => {
  const out = normalizePlan([{ title: '换了一个阶段' }])
  assert.deepEqual(out.map(stage => stage.id), ['p_1'])
  assert.equal(out[0].status, 'todo')
})

test('不改传入数组', () => {
  const input = [{ title: '一' }]
  normalizePlan(input)
  assert.deepEqual(input, [{ title: '一' }])
})

test('状态枚举是三个值', () => {
  assert.deepEqual(PLAN_STATUSES, ['todo', 'doing', 'done'])
})
