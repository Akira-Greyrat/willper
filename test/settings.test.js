import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettingsPatch } from '../learning-center/src/settings.js'

test('抽查概率被夹在 0 到 1 之间', () => {
  assert.equal(normalizeSettingsPatch({ leavePromptRate: 1.5 }).leavePromptRate, 1)
  assert.equal(normalizeSettingsPatch({ leavePromptRate: -0.2 }).leavePromptRate, 0)
  assert.equal(normalizeSettingsPatch({ leavePromptRate: 0.35 }).leavePromptRate, 0.35)
})

test('冷却分钟取整且不小于 0', () => {
  assert.equal(normalizeSettingsPatch({ quizCooldownMinutes: -5 }).quizCooldownMinutes, 0)
  assert.equal(normalizeSettingsPatch({ quizCooldownMinutes: 12.7 }).quizCooldownMinutes, 13)
})

test('自动接受只认布尔值', () => {
  assert.equal(normalizeSettingsPatch({ autoAcceptDrafts: true }).autoAcceptDrafts, true)
  assert.equal(normalizeSettingsPatch({ autoAcceptDrafts: 'yes' }).autoAcceptDrafts, undefined)
})

test('未知字段与非数字被忽略', () => {
  assert.deepEqual(normalizeSettingsPatch({ gradingMode: 'ai', leavePromptRate: 'x' }), {})
  assert.deepEqual(normalizeSettingsPatch(null), {})
})

test('空补丁不产生任何键', () => {
  assert.deepEqual(normalizeSettingsPatch({}), {})
})
