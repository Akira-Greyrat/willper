/**
 * Send one line of text into an existing session so the agent answers it in the
 * conversation. The Host half owns this because a bundle cannot import the
 * harness message helpers, so it builds the user message directly — and must
 * give it an id: `agent.followup` accepts an id-less message at runtime, but a
 * persisted v4 `user/message` event requires one, and the cold load rejects the
 * whole session without it.
 * @module @local/learning-center/src/session
 */

import { randomUUID } from 'node:crypto'

/**
 * @param {object} ctx - host context with the `agents` service.
 * @returns {(sessionId: string, text: string) => Promise<true>} the prompt function.
 */
export function createPromptAgent(ctx) {
  return async function prompt(sessionId, text) {
    const agents = ctx.get('agents')
    const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
    if (!agent) throw new Error(`no session: ${sessionId}`)
    agent.followup({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    })
    return true
  }
}
