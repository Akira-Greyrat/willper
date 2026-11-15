/**
 * Send one line of text into an existing session so the agent answers it in the
 * conversation. The Host half owns this because a bundle cannot import the
 * harness message helpers; a plain user-shaped message is accepted by
 * `agent.followup`.
 * @module @local/learning-center/src/session
 */

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
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    })
    return true
  }
}
