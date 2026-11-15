/**
 * Host half of the learning-center bundle: registers the four model-facing
 * tools, the `/learn` command, and the panel's single HTTP route. All three go
 * through the same store, so the model and the panel never disagree about the
 * library.
 * @module @local/learning-center
 */

import { registerCommand } from './src/command.js'
import { readConfig } from './src/config.js'
import { handleApi } from './src/route.js'
import { createPromptAgent } from './src/session.js'
import { createStore } from './src/store.js'
import { toolDefinitions } from './src/tools.js'

export const name = 'learning-center'

export const inject = ['tools', 'commands', 'webServer', 'workingDirectory']

/**
 * Resolve the session's working directory, or explain why it cannot be found.
 * @param {object} ctx - host context.
 * @param {object|string} target - an agent, or a session id.
 * @returns {string} absolute base directory.
 */
function baseDirFor(ctx, target) {
  const workingDirectory = ctx.get('workingDirectory')
  if (!workingDirectory) throw new Error('当前会话没有工作目录')
  const sessionId = typeof target === 'string' ? target : target && target.session ? target.session.id : undefined
  const agents = ctx.get('agents')
  const agent = sessionId && agents ? agents.get(sessionId) : (typeof target === 'object' ? target : undefined)
  const session = agent && agent.session
  const fromSession = session && typeof workingDirectory.get === 'function' ? workingDirectory.get(session) : undefined
  const baseDir = fromSession || workingDirectory.defaultDirectory
  if (!baseDir) throw new Error('当前会话没有工作目录')
  return baseDir
}

/**
 * Register everything the bundle contributes.
 * @param {object} ctx - registrant context.
 * @param {object} [config] - loader row config.
 * @returns {() => void} disposer removing every registration.
 */
export function apply(ctx, config) {
  const resolved = readConfig(config)
  const disposers = []

  /**
   * Run one registration under the context's effect scope when it has one. A
   * context without `effect` still gets a working plugin rather than a failed
   * activation: the registration happens and its disposer is returned.
   * @param {() => (() => void)} register - performs the registration.
   * @param {string} label - effect label.
   * @returns {() => void} disposer.
   */
  const effect = (register, label) => {
    if (typeof ctx.effect === 'function') return ctx.effect(register, label)
    return register()
  }

  /**
   * @param {object|string} target - agent or session id.
   * @returns {Promise<object>} the store for that session's directory.
   */
  const storeFor = async target => createStore(baseDirFor(ctx, target), resolved)

  const prompt = createPromptAgent(ctx)

  for (const definition of toolDefinitions(storeFor)) {
    disposers.push(effect(
      () => ctx.tools.register(definition),
      `learning-center/tool/${definition.name}`,
    ))
  }
  disposers.push(effect(
    () => registerCommand(ctx, {
      promptAgent: (agent, text) => prompt(agent && agent.session ? agent.session.id : undefined, text),
    }),
    'learning-center/command',
  ))
  disposers.push(effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/api/learning',
      handler: handleApi({
        storeFor,
        promptAgent: (sessionId, text) => prompt(sessionId, text),
        listSessions: async () => {
          const agents = ctx.get('agents')
          const list = agents && typeof agents.list === 'function' ? agents.list() : []
          return list.map(agent => ({
            id: agent.session.id,
            title: (agent.session.header && agent.session.header.title) || agent.session.id,
          }))
        },
        maxBytes: resolved.maxDraftBytes,
      }),
    }),
    'learning-center/route',
  ))

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // A registration already removed by its owning context is not an error here.
      }
    }
  }
}
