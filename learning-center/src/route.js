/**
 * The panel's one HTTP endpoint: `POST /api/learning` with `{ op, sessionId,
 * params }`. Every op reads or writes the same store the agent tools use, so the
 * UI and the model never disagree about the library.
 * @module @local/learning-center/src/route
 */

import { checklistView, favoritesView, queueView, questionView, treeView } from './views.js'

/**
 * Read a request body with a hard size cap.
 * @param {object} req - node:http request.
 * @param {number} limit - maximum bytes.
 * @returns {Promise<string>} the raw body.
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        const error = new Error('body too large')
        error.code = 'TOO_LARGE'
        reject(error)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', error => reject(error))
  })
}

/**
 * @param {object} res - node:http response.
 * @param {number} status - HTTP status.
 * @param {object} payload - JSON body.
 * @returns {void}
 */
function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/**
 * Build the route handler.
 * @param {{ storeFor: (sessionId: string) => Promise<object>, promptAgent: (sessionId: string, text: string) => Promise<boolean>, listSessions?: () => Promise<object[]>, maxBytes?: number }} deps - store resolver, session prompt, session list and request size cap.
 * @returns {(req: object, res: object) => Promise<void>} the handler.
 */
export function handleApi({ storeFor, promptAgent, listSessions, maxBytes }) {
  const limit = typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : 8 * 1024 * 1024
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      send(res, 405, { error: 'method not allowed' })
      return
    }
    // A page the user visits must not be able to POST here: browsers send both
    // headers on cross-site requests, and a same-origin fetch always sends the
    // JSON content type.
    const headers = req.headers ?? {}
    const contentType = String(headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (contentType !== 'application/json') {
      send(res, 415, { error: 'unsupported content type' })
      return
    }
    const origin = headers.origin
    if (typeof origin === 'string' && origin.length > 0) {
      let originHost = ''
      try {
        originHost = new URL(origin).host
      } catch {
        originHost = ''
      }
      if (originHost !== headers.host) {
        send(res, 403, { error: 'cross-origin request refused' })
        return
      }
    }

    let body
    try {
      const raw = await readBody(req, limit)
      body = JSON.parse(raw)
      if (!body || typeof body !== 'object') throw new Error('bad json')
    } catch (error) {
      if (error && error.code === 'TOO_LARGE') {
        send(res, 413, { error: 'body too large' })
        return
      }
      send(res, 400, { error: 'bad json' })
      return
    }

    if (body.op !== 'sessions' && (typeof body.sessionId !== 'string' || body.sessionId.length === 0)) {
      send(res, 400, { error: 'missing session' })
      return
    }

    let store
    try {
      store = body.op === 'sessions' ? undefined : await storeFor(body.sessionId)
    } catch (error) {
      // Resolving the library can fail for a real reason (no working directory,
      // unreadable data); say so instead of blaming the JSON body.
      send(res, 400, { error: error && error.message ? error.message : String(error) })
      return
    }

    const params = body.params ?? {}
    try {
      const result = await dispatch(body.op, params, body.sessionId, store, promptAgent, listSessions)
      send(res, 200, result)
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      if (message === 'unknown op') {
        send(res, 400, { error: 'unknown op' })
        return
      }
      send(res, 400, { error: message })
    }
  }
}

/**
 * @param {string} op - operation name.
 * @param {object} params - operation parameters.
 * @param {string} sessionId - calling session.
 * @param {object} store - the store for that session.
 * @param {(sessionId: string, text: string) => Promise<boolean>} promptAgent - session prompt.
 * @param {(() => Promise<object[]>) | undefined} listSessions - live session list.
 * @returns {Promise<object>} JSON payload.
 */
async function dispatch(op, params, sessionId, store, promptAgent, listSessions) {
  switch (op) {
    case 'sessions': {
      const sessions = typeof listSessions === 'function' ? await listSessions() : []
      return { sessions }
    }
    case 'meta': {
      const { meta } = await store.load()
      return meta
    }
    case 'setTarget': {
      const { meta } = await store.load()
      const target = { ...(meta.target ?? {}), ...params }
      if (!target.startedAt) target.startedAt = new Date().toISOString()
      meta.target = target
      await store.saveMeta(meta)
      return { ok: true, target }
    }
    case 'tree': {
      const { meta, questions, progress } = await store.load()
      return treeView(meta, questions, progress)
    }
    case 'queue': {
      const { meta, questions, progress } = await store.load()
      return queueView(meta, questions, progress, params)
    }
    case 'question': {
      const { questions, terms, progress } = await store.load()
      return { question: questionView(questions, terms, params.id, progress) }
    }
    case 'checklist': {
      const { questions } = await store.load()
      return checklistView(questions)
    }
    case 'favorites': {
      const { questions, progress } = await store.load()
      return favoritesView(questions, progress)
    }
    case 'terms': {
      const { terms } = await store.load()
      return { terms }
    }
    case 'favorite': {
      await store.setFavorite(params.id, params.on)
      return { ok: true }
    }
    case 'seen': {
      await store.markSeen(params.id)
      return { ok: true }
    }
    case 'setStatus': {
      return { ok: true, question: await store.setStatus(params.id, params.status) }
    }
    case 'updateQuestion': {
      const result = await store.updateQuestion(params.id, params.patch)
      return { ok: true, question: result.question, relatedDropped: result.relatedDropped }
    }
    case 'prompt': {
      if (typeof params.text !== 'string' || params.text.trim().length === 0) {
        throw new Error('empty prompt')
      }
      await promptAgent(sessionId, params.text.trim())
      return { ok: true }
    }
    default:
      throw new Error('unknown op')
  }
}
