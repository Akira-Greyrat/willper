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
import { registerTools } from './src/tools.js'

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
   * @param {object|string} target - agent or session id.
   * @returns {Promise<object>} the store for that session's directory.
   */
  const storeFor = async target => createStore(baseDirFor(ctx, target), resolved)

  const prompt = createPromptAgent(ctx)

  for (const dispose of registerTools(ctx, storeFor)) disposers.push(dispose)
  disposers.push(registerCommand(ctx, {
    promptAgent: (agent, text) => prompt(agent && agent.session ? agent.session.id : undefined, text),
  }))
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/api/learning',
    handler: handleApi({
      storeFor,
      promptAgent: (sessionId, text) => prompt(sessionId, text),
      maxBytes: resolved.maxDraftBytes,
    }),
  }))

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
