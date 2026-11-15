import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readJson, readJsonl, writeJsonl, ensureDir } from '../learning-center/src/io.js'
import { createStore } from '../learning-center/src/store.js'
import { handleApi } from '../learning-center/src/route.js'
import { withTempStore } from './helpers.js'

/**
 * Minimal node:http request stand-in: emits one body then ends.
 * @param {object} body - JSON body.
 * @returns {EventEmitter} fake request.
 */
function fakeRequest(body) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.headers = { 'content-type': 'application/json', host: '127.0.0.1:9862' }
  setImmediate(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

/**
 * Minimal node:http response stand-in that records status and payload.
 * @returns {object} fake response.
 */
function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    payload: '',
    writeHead(code, headers) {
      this.statusCode = code
      this.headers = headers ?? {}
      return this
    },
    end(chunk) {
      this.payload = chunk ?? ''
    },
  }
}

const callApi = async (handler, body) => {
  const req = fakeRequest(body)
  const res = fakeResponse()
  await handler(req, res)
  return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null }
}

const withApi = (fn) => withTempStore(async (paths, baseDir) => {
  const store = createStore(baseDir)
  const prompted = []
  const handler = handleApi({
    storeFor: async () => store,
    promptAgent: async (_sessionId, text) => {
      prompted.push(text)
      return true
    },
  })
  await fn({ handler, store, paths, prompted })
})

test('tree op 在空库上返回空节点', async () => {
  await withApi(async ({ handler }) => {
    const r = await callApi(handler, { op: 'tree', sessionId: 's1', params: {} })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.nodes, [])
  })
})

test('未知 op 返回 400 并说明', async () => {
  await withApi(async ({ handler }) => {
    const r = await callApi(handler, { op: 'nope', sessionId: 's1' })
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'unknown op')
  })
})

test('坏 JSON 返回 400', async () => {
  await withApi(async ({ handler }) => {
    const req = new EventEmitter()
    req.method = 'POST'
    req.headers = { 'content-type': 'application/json', host: '127.0.0.1:9862' }
    setImmediate(() => {
      req.emit('data', Buffer.from('{not json'))
      req.emit('end')
    })
    const res = fakeResponse()
    await handler(req, res)
    assert.equal(res.statusCode, 400)
    assert.equal(JSON.parse(res.payload).error, 'bad json')
  })
})

test('GET 方法被拒绝', async () => {
  await withApi(async ({ handler }) => {
    const req = new EventEmitter()
    req.method = 'GET'
    const res = fakeResponse()
    await handler(req, res)
    assert.equal(res.statusCode, 405)
  })
})

test('setTarget 写入目标，meta 读回', async () => {
  await withApi(async ({ handler, store }) => {
    const w = await callApi(handler, { op: 'setTarget', sessionId: 's1', params: { title: '认证', statement: '学会闭包', level: 'beginner' } })
    assert.equal(w.status, 200)
    assert.equal(w.body.target.title, '认证')
    const r = await callApi(handler, { op: 'meta', sessionId: 's1' })
    assert.equal(r.body.target.title, '认证')
    assert.deepEqual((await store.load()).meta.tree, [])
  })
})

test('favorite 与 seen 写进进度', async () => {
  await withApi(async ({ handler, store }) => {
    await callApi(handler, { op: 'favorite', sessionId: 's1', params: { id: 'q1', on: true } })
    await callApi(handler, { op: 'seen', sessionId: 's1', params: { id: 'q1' } })
    const progress = await readJson(store.paths.progress, {})
    assert.equal(progress.q1.favorite, true)
    assert.equal(progress.q1.seen, true)
  })
})

test('setStatus 对未知题返回 400 而不是 500', async () => {
  await withApi(async ({ handler }) => {
    const r = await callApi(handler, { op: 'setStatus', sessionId: 's1', params: { id: 'nope', status: 'ok' } })
    assert.equal(r.status, 400)
    assert.match(r.body.error, /unknown question/)
  })
})

test('checklist 与 favorites 返回列表', async () => {
  await withApi(async ({ handler, store }) => {
    await writeJsonl(store.paths.questions, [
      { id: 'q1', key: 'k1', stem: '待核对？', nodeId: 'n_1', status: 'needs-review', flags: ['missing_answer'], source: { file: 'm.md' }, reference: {}, tags: [], related: {} },
    ])
    const c = await callApi(handler, { op: 'checklist', sessionId: 's1' })
    assert.equal(c.body.items.length, 1)
    const f = await callApi(handler, { op: 'favorites', sessionId: 's1' })
    assert.deepEqual(f.body.items, [])
  })
})

test('prompt 走 promptAgent，缺 text 时 400', async () => {
  await withApi(async ({ handler, prompted }) => {
    const ok = await callApi(handler, { op: 'prompt', sessionId: 's1', params: { text: '解释一下闭包' } })
    assert.equal(ok.status, 200)
    assert.equal(prompted.length, 1)
    assert.equal(prompted[0], '解释一下闭包')
    const bad = await callApi(handler, { op: 'prompt', sessionId: 's1', params: {} })
    assert.equal(bad.status, 400)
  })
})

test('请求体超过上限返回 413', async () => {
  await withTempStore(async (_paths, baseDir) => {
    const store = createStore(baseDir)
    const handler = handleApi({ storeFor: async () => store, promptAgent: async () => true, maxBytes: 64 })
    const req = new EventEmitter()
    req.method = 'POST'
    req.headers = { 'content-type': 'application/json', host: '127.0.0.1:9862' }
    setImmediate(() => {
      req.emit('data', Buffer.from(JSON.stringify({ op: 'meta', pad: 'x'.repeat(200) })))
      req.emit('end')
    })
    const res = fakeResponse()
    await handler(req, res)
    assert.equal(res.statusCode, 413)
  })
})

test('没有会话时 400 而不是崩', async () => {
  await withTempStore(async (_paths, baseDir) => {
    const store = createStore(baseDir)
    const handler = handleApi({ storeFor: async () => store, promptAgent: async () => true })
    const r = await callApi(handler, { op: 'tree' })
    assert.equal(r.status, 400)
    assert.match(r.body.error, /session/)
  })
})

test('sessions op 不需要 sessionId', async () => {
  await withTempStore(async (_paths, baseDir) => {
    const store = createStore(baseDir)
    const handler = handleApi({
      storeFor: async () => store,
      promptAgent: async () => true,
      listSessions: async () => [{ id: 's1', title: '我的会话' }],
    })
    const r = await callApi(handler, { op: 'sessions' })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.sessions, [{ id: 's1', title: '我的会话' }])
  })
})

test('store 解析失败时返回真实原因而不是 bad json', async () => {
  const handler = handleApi({
    storeFor: async () => {
      throw new Error('当前会话没有工作目录')
    },
    promptAgent: async () => true,
  })
  const r = await callApi(handler, { op: 'tree', sessionId: 's1' })
  assert.equal(r.status, 400)
  assert.match(r.body.error, /工作目录/)
  assert.doesNotMatch(r.body.error, /bad json/)
})

test('跨源 Origin 的写请求被拒绝，同源放行', async () => {
  await withApi(async ({ handler }) => {
    const evil = fakeRequest({ op: 'tree', sessionId: 's1' })
    evil.headers = { origin: 'http://evil.example', host: '127.0.0.1:9862', 'content-type': 'application/json' }
    const evilRes = fakeResponse()
    await handler(evil, evilRes)
    assert.equal(evilRes.statusCode, 403)

    const same = fakeRequest({ op: 'tree', sessionId: 's1' })
    same.headers = { origin: 'http://127.0.0.1:9862', host: '127.0.0.1:9862', 'content-type': 'application/json' }
    const sameRes = fakeResponse()
    await handler(same, sameRes)
    assert.equal(sameRes.statusCode, 200)
  })
})

test('非 JSON content-type 被拒绝', async () => {
  await withApi(async ({ handler }) => {
    const req = fakeRequest({ op: 'tree', sessionId: 's1' })
    req.headers = { 'content-type': 'text/plain' }
    const res = fakeResponse()
    await handler(req, res)
    assert.equal(res.statusCode, 415)
  })
})

test('updateQuestion 改坏必填字段时 400 且库不变', async () => {
  await withApi(async ({ handler, store }) => {
    await ensureDir(store.paths.root)
    await writeJsonl(store.paths.questions, [
      { id: 'q1', key: 'k1', stem: '原题？', nodeId: 'n_1', status: 'ok', flags: [], source: { file: 'm.md' }, reference: { answer: 'a' }, tags: [], related: {}, createdAt: 'T0', updatedAt: 'T0' },
    ])
    const ok = await callApi(handler, { op: 'updateQuestion', sessionId: 's1', params: { id: 'q1', patch: { tags: ['x'] } } })
    assert.equal(ok.status, 200)
    assert.deepEqual(ok.body.question.tags, ['x'])
    const bad = await callApi(handler, { op: 'updateQuestion', sessionId: 's1', params: { id: 'q1', patch: { stem: '  ' } } })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /invalid stem/)
    const [row] = await readJsonl(store.paths.questions)
    assert.equal(row.stem, '原题？')
  })
})

test('attempt start 落盘、get 取回', async () => {
  await withApi(async ({ handler }) => {
    const start = await callApi(handler, { op: 'attempt', sessionId: 's1', params: { action: 'start', questionId: 'q1', answer: '我的答案', kind: 'study' } })
    assert.equal(start.status, 200)
    const got = await callApi(handler, { op: 'attempt', sessionId: 's1', params: { action: 'get', attemptId: start.body.attemptId } })
    assert.equal(got.status, 200)
    assert.equal(got.body.attempt.answer, '我的答案')
    assert.equal(got.body.attempt.grade, null)
  })
})

test('空答案是 400，未知 attempt 是 404', async () => {
  await withApi(async ({ handler }) => {
    const empty = await callApi(handler, { op: 'attempt', sessionId: 's1', params: { action: 'start', questionId: 'q1', answer: '   ', kind: 'study' } })
    assert.equal(empty.status, 400)
    const missing = await callApi(handler, { op: 'attempt', sessionId: 's1', params: { action: 'get', attemptId: 'a_nope' } })
    assert.equal(missing.status, 404)
  })
})

test('quiz 在冷却内不抽，过期后抽中并写下 lastQuizAt', async () => {
  await withApi(async ({ handler, store }) => {
    await writeJsonl(store.paths.questions, [{ id: 'q1', key: 'k1', stem: '什么是闭包？', nodeId: 'n_1', status: 'ok', flags: [], reference: { answer: 'a', points: ['a'] }, source: { file: 'm.md' }, tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0' }])
    const row = { id: 'q1' }
    const attempt = await store.createAttempt({ questionId: row.id, answer: 'x', kind: 'study' })
    await store.gradeAttempt(attempt.id, { covered: [], missed: ['a'] })

    const meta = (await store.load()).meta
    meta.settings.leavePromptRate = 1
    meta.settings.quizCooldownMinutes = 10
    meta.settings.lastQuizAt = new Date().toISOString()
    await store.saveMeta(meta)

    const cooled = await callApi(handler, { op: 'quiz', sessionId: 's1' })
    assert.equal(cooled.status, 200)
    assert.equal(cooled.body.question, null)

    const meta2 = (await store.load()).meta
    meta2.settings.lastQuizAt = '2000-01-01T00:00:00.000Z'
    await store.saveMeta(meta2)

    const hit = await callApi(handler, { op: 'quiz', sessionId: 's1' })
    assert.equal(hit.body.question.id, row.id)
    assert.notEqual((await store.load()).meta.settings.lastQuizAt, '2000-01-01T00:00:00.000Z')
  })
})

test('weak 与 setDismissed', async () => {
  await withApi(async ({ handler, store }) => {
    await writeJsonl(store.paths.questions, [{ id: 'q1', key: 'k1', stem: '什么是闭包？', nodeId: 'n_1', status: 'ok', flags: [], reference: { answer: 'a', points: ['a'] }, source: { file: 'm.md' }, tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0' }])
    const row = { id: 'q1' }
    const attempt = await store.createAttempt({ questionId: row.id, answer: 'x', kind: 'study' })
    await store.gradeAttempt(attempt.id, { covered: [], missed: ['a'] })
    const weak = await callApi(handler, { op: 'weak', sessionId: 's1' })
    assert.equal(weak.body.items.length, 1)
    const dismissed = await callApi(handler, { op: 'setDismissed', sessionId: 's1', params: { questionId: row.id, on: true } })
    assert.equal(dismissed.status, 200)
    const after = await callApi(handler, { op: 'weak', sessionId: 's1' })
    assert.deepEqual(after.body.items, [])
  })
})
test('setStageStatus 改状态，未知阶段 400', async () => {
  await withApi(async ({ handler, store }) => {
    const { meta } = await store.load()
    meta.plan = [{ id: 'p_1', title: '一', status: 'todo' }, { id: 'p_2', title: '二', status: 'todo' }]
    await store.saveMeta(meta)
    const ok = await callApi(handler, { op: 'setStageStatus', sessionId: 's1', params: { stageId: 'p_2', status: 'done' } })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.plan.find(stage => stage.id === 'p_2').status, 'done')
    const bad = await callApi(handler, { op: 'setStageStatus', sessionId: 's1', params: { stageId: 'p_9', status: 'done' } })
    assert.equal(bad.status, 400)
  })
})

test('report 取回最近一份，没有时是 null', async () => {
  await withApi(async ({ handler, store }) => {
    const empty = await callApi(handler, { op: 'report', sessionId: 's1' })
    assert.equal(empty.body.report, null)
    await store.saveReport('# 体检\n覆盖缺口 1 个', '2026-11-16T00:00:00.000Z')
    const got = await callApi(handler, { op: 'report', sessionId: 's1' })
    assert.ok(got.body.report.markdown.includes('覆盖缺口'))
  })
})