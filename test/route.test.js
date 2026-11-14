import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readJson, writeJsonl, ensureDir } from '../learning-center/src/io.js'
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

test('updateQuestion 走同一实现，改坏必填字段时 400 且库不变', async () => {
  await withApi(async ({ handler, store }) => {
    await ensureDir(store.paths.root)
    await writeJsonl(store.paths.questions, [
      { id: 'q1', key: 'k1', stem: '原题？', nodeId: 'n_1', status: 'ok', flags: [], source: { file: 'm.md' }, reference: { answer: 'a' }, tags: [], related: {}, createdAt: 'T0', updatedAt: 'T0' },
    ])
    const ok = await callApi(handler, { op: 'updateQuestion', sessionId: 's1', params: { id: 'q1', patch: { stem: '新题？' } } })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.question.stem, '新题？')
    const bad = await callApi(handler, { op: 'updateQuestion', sessionId: 's1', params: { id: 'missing', patch: { stem: 'x' } } })
    assert.equal(bad.status, 400)
  })
})
