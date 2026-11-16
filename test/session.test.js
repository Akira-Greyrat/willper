import test from 'node:test'
import assert from 'node:assert/strict'
import { createPromptAgent } from '../learning-center/src/session.js'

test('按会话 id 找到 agent 并投递一条用户消息', async () => {
  const sent = []
  const agent = {
    session: { id: 's_1' },
    followup(message) {
      sent.push(message)
    },
  }
  const ctx = { get: name => (name === 'agents' ? { get: id => (id === 's_1' ? agent : undefined) } : undefined) }
  const prompt = createPromptAgent(ctx)
  assert.equal(await prompt('s_1', '解释闭包'), true)
  assert.equal(sent.length, 1)
  assert.match(sent[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  assert.equal(sent[0].role, 'user')
  assert.deepEqual(sent[0].content, [{ type: 'text', text: '解释闭包' }])
  assert.deepEqual(sent[0].source, { kind: 'user' })
})

test('会话不存在时抛错而不是静默丢弃', async () => {
  const ctx = { get: name => (name === 'agents' ? { get: () => undefined } : undefined) }
  const prompt = createPromptAgent(ctx)
  await assert.rejects(() => prompt('nope', 'x'), /no session/)
})

test('没有 agents 服务时也抛错', async () => {
  const ctx = { get: () => undefined }
  const prompt = createPromptAgent(ctx)
  await assert.rejects(() => prompt('s_1', 'x'), /no session/)
})
