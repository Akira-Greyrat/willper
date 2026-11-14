import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, readConfig } from '../learning-center/src/config.js'

test('没有配置时全用默认值', () => {
  assert.deepEqual(readConfig(undefined), DEFAULTS)
})

test('给了同名字段就覆盖', () => {
  const c = readConfig({ storeDir: 'study', maxDraftBytes: 1024 })
  assert.equal(c.storeDir, 'study')
  assert.equal(c.maxDraftBytes, 1024)
  assert.equal(c.leavePromptRate, DEFAULTS.leavePromptRate)
})

test('类型不对时退回默认值而不是把坏值带进存储', () => {
  const c = readConfig({ storeDir: 42, leavePromptRate: 'x', quizCooldownMinutes: null })
  assert.equal(c.storeDir, DEFAULTS.storeDir)
  assert.equal(c.leavePromptRate, DEFAULTS.leavePromptRate)
  assert.equal(c.quizCooldownMinutes, DEFAULTS.quizCooldownMinutes)
})

test('概率被夹在 0 到 1 之间', () => {
  assert.equal(readConfig({ leavePromptRate: 3 }).leavePromptRate, 1)
  assert.equal(readConfig({ leavePromptRate: -1 }).leavePromptRate, 0)
})
