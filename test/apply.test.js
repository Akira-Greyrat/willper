import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { apply } from '../learning-center/index.js'
import { readJson } from '../learning-center/src/io.js'
import { withTempStore } from './helpers.js'

/**
 * Build a fake host context that records every registration.
 * @param {{ withWorkingDirectory?: boolean, withAgents?: boolean, baseDir?: string }} options - which services exist.
 * @returns {{ ctx: object, record: object, agent: object }} fake context, registrations, and the session agent.
 */
function fakeCtx({ withWorkingDirectory = true, withAgents = true, baseDir = process.cwd() } = {}) {
  const record = { tools: [], commands: [], routes: [] }
  const agent = { session: { id: 's_1' }, followup() {} }
  const services = {}
  if (withWorkingDirectory) {
    services.workingDirectory = { get: () => baseDir, defaultDirectory: baseDir }
  }
  if (withAgents) {
    services.agents = { get: id => (id === 's_1' ? agent : undefined) }
  }
  const ctx = {
    get: name => services[name],
    tools: { register: def => { record.tools.push(def); return () => {} } },
    commands: { register: def => { record.commands.push(def); return () => {} } },
    webServer: { register: route => { record.routes.push(route); return () => {} } },
  }
  return { ctx, record, agent }
}

/**
 * @param {object} handler - route handler.
 * @param {object} body - JSON body.
 * @returns {Promise<{status: number, body: object|null}>} response.
 */
async function post(handler, body) {
  const req = new EventEmitter()
  req.method = 'POST'
  setImmediate(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  const res = {
    statusCode: 0,
    payload: '',
    writeHead(code) { this.statusCode = code; return this },
    end(chunk) { this.payload = chunk ?? '' },
  }
  await handler(req, res)
  return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null }
}

test('apply 注册四个工具、一个命令、一个路由', () => {
  const { ctx, record } = fakeCtx()
  apply(ctx, {})
  assert.equal(record.tools.length, 4)
  assert.deepEqual(record.tools.map(t => t.name).sort(), ['learning_import', 'learning_plan', 'learning_question', 'learning_status'])
  assert.equal(record.commands.length, 1)
  assert.equal(record.commands[0].name, 'learn')
  assert.equal(record.routes.length, 1)
  assert.equal(record.routes[0].path, '/api/learning')
  assert.equal(record.routes[0].kind, 'exact')
  assert.equal(typeof record.routes[0].handler, 'function')
})

test('apply 返回清理函数', () => {
  const { ctx } = fakeCtx()
  assert.equal(typeof apply(ctx, {}), 'function')
})

test('工具跑在会话工作目录下的 learning 里', async () => {
  await withTempStore(async (paths, baseDir) => {
    const { ctx, record, agent } = fakeCtx({ baseDir })
    apply(ctx, {})
    const tool = record.tools.find(t => t.name === 'learning_plan')
    await tool.execute({ action: 'set_target', target: { title: '认证', statement: '学会', level: 'beginner' } }, { agent })
    const meta = await readJson(paths.meta, null)
    assert.equal(meta.target.title, '认证')
  })
})

test('没有 workingDirectory 时 apply 不抛错，工具给出明确错误', async () => {
  const { ctx, record } = fakeCtx({ withWorkingDirectory: false })
  apply(ctx, {})
  const status = record.tools.find(t => t.name === 'learning_status')
  await assert.rejects(
    () => status.execute({}, { agent: { session: { id: 's_1' } } }),
    /没有工作目录|no working directory/,
  )
})

test('路由的 prompt 在没有 agents 服务时返回 400', async () => {
  await withTempStore(async (_paths, baseDir) => {
    const { ctx, record } = fakeCtx({ withAgents: false, baseDir })
    apply(ctx, {})
    const r = await post(record.routes[0].handler, { op: 'prompt', sessionId: 's_1', params: { text: '在吗' } })
    assert.equal(r.status, 400)
    assert.match(r.body.error, /no session/)
  })
})

test('路由的 prompt 在有会话时把话发出去', async () => {
  await withTempStore(async (_paths, baseDir) => {
    const { ctx, record, agent } = fakeCtx({ baseDir })
    const sent = []
    agent.followup = message => sent.push(message)
    apply(ctx, {})
    const r = await post(record.routes[0].handler, { op: 'prompt', sessionId: 's_1', params: { text: '解释闭包' } })
    assert.equal(r.status, 200)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].content[0].text, '解释闭包')
  })
})
