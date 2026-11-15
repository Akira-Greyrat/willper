/**
 * `/learn` — the human-facing command that asks the session's agent to do the
 * three things only a model can do: split the topic tree, run an import, or
 * answer a follow-up question about the current card.
 * @module @local/learning-center/src/command
 */

/** Shown in every error and in the bare command. */
const USAGE = '用法：/learn plan | /learn import <材料文件> | /learn ask <问题>'

/** What to tell the agent for each subcommand. */
const PROMPTS = {
  plan: [
    '请为这个学习中心做规划，全过程使用工具，不要只给建议。',
    '步骤：1) 调用 learning_status 了解现状；2) 用 learning_plan set_target 记录目标与当前水平（若已有目标则沿用）；',
    '3) 用 learning_plan upsert_tree 写出知识点骨架（10-30 个节点，id 用 n_1、n_1.1 这类稳定编号，weight 取 must/often/aware）；',
    '4) 用 learning_plan set_plan 写 3-5 个阶段，每阶段含 nodeIds、该读材料哪几节、要补的前置知识、一个可交付的实践项目、自查标准。',
    '最后用一两句话告诉我先学哪一块。',
  ].join('\n'),
}

/**
 * Build the prompt for `/learn import <file>`.
 * @param {string} file - material path or name.
 * @returns {string} the prompt.
 */
function importPrompt(file) {
  return [
    `请把材料 ${file} 里的问答题导入学习中心。`,
    '步骤：1) 调用 learning_import brief 拿到格式与三件套路径；',
    '2) 读材料，按 30-60 题一批，把题目写进 inbox/questions.jsonl，把术语写进 inbox/terms.jsonl，把该材料的抽取纯文本写进 materials/<材料名>.txt；',
    '3) 调用 learning_import commit；4) 把 added/merged/needsReview/rejected 的数量和每类原因如实汇报。',
    '注意：source.anchor 必须是原文里逐字出现的一段话；抽不出文字的扫描件，直接说明，不要编锚点。',
  ].join('\n')
}

/**
 * Register the `/learn` command.
 * @param {object} ctx - host context with `commands`.
 * @param {{ storeFor: (agent: object) => Promise<object>, promptAgent: (agent: object, text: string) => Promise<boolean> }} deps - store resolver and session prompt.
 * @returns {() => void} disposer.
 */
export function registerCommand(ctx, { promptAgent }) {
  return ctx.commands.register({
    definitionId: 'learning-center/learn',
    name: 'learn',
    description: '学习中心：规划知识点骨架、导入题库，或就当前题目追问',
    input: { hint: '[plan|import <文件>|ask <问题>]', attachments: true },
    handler(invocation) {
      const raw = typeof invocation.rawInput === 'string' ? invocation.rawInput.trim() : ''
      if (raw.length === 0) return { kind: 'success', text: `学习中心命令。\n${USAGE}` }
      const space = raw.indexOf(' ')
      const head = (space === -1 ? raw : raw.slice(0, space)).toLowerCase()
      const rest = space === -1 ? '' : raw.slice(space + 1).trim()

      /**
       * @param {string} text - prompt for the agent.
       * @returns {{kind: 'success', text: string}} the command result.
       */
      const send = text => {
        Promise.resolve(promptAgent(invocation.agent, text)).catch(() => {})
        return { kind: 'success', text: '已发给当前会话，往下看它的回答。' }
      }

      switch (head) {
        case 'plan':
          return send(PROMPTS.plan)
        case 'import':
          if (rest.length === 0) return { kind: 'error', text: `需要材料文件名。\n${USAGE}` }
          return send(importPrompt(rest))
        case 'ask':
          if (rest.length === 0) return { kind: 'error', text: `需要一个问题。\n${USAGE}` }
          return send(rest)
        default:
          return { kind: 'error', text: `不认识的子命令 ${head}。\n${USAGE}` }
      }
    },
  })
}
