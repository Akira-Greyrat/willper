/**
 * The four model-facing tools: read the library's state, write the plan, run an
 * import, and fix one question. Each tool is one operation the panel also has,
 * so both callers go through the same store method.
 * @module @local/learning-center/src/tools
 */

import { readdir } from 'node:fs/promises'
import { auditDigest } from './audit.js'
import { needsSuggestion } from './grading.js'
import { normalizePlan } from './plan.js'
import { treeView } from './views.js'

/** Platform-neutral wording for the three draft files an import needs. */
const IMPORT_FILES = {
  questions: 'learning/inbox/questions.jsonl',
  terms: 'learning/inbox/terms.jsonl',
  materials: 'learning/materials/<材料名>.txt',
}

/**
 * @param {object} def - tool definition.
 * @returns {object} def with a text render for the Chat row.
 */
function withRender(def) {
  return def
}

/**
 * @param {unknown} value - tool output.
 * @returns {{type: 'text', text: string}[]} a one-line summary.
 */
function text(value) {
  return [{ type: 'text', text: value }]
}

/** Output schema shared by every tool: a JSON object. */
const OBJECT_OUTPUT = { type: 'object', additionalProperties: true }

/**
 * Build the tool definitions bound to one store resolver.
 * @param {(agent: object) => object|Promise<object>} storeFor - resolves the store for the calling agent.
 * @returns {object[]} tool definitions.
 */
export function toolDefinitions(storeFor) {
  const status = withRender({
    name: 'learning_status',
    description: 'Read the learning library: target, question counts, topic coverage, weakest topics and what to do next. Use it before planning or importing.',
    parameters: {},
    output: {
      schema: OBJECT_OUTPUT,
      render: (_args, value) => text(`题库 ${value.counts.total} 题：可练 ${value.counts.ok}，待核对 ${value.counts.needsReview}。下一步：${value.nextActions[0] ?? '无'}`),
    },
    async execute(_args, exec) {
      const store = await storeFor(exec.agent)
      const { meta, questions, progress } = await store.load()
      const orphaned = q => Array.isArray(q.flags) && q.flags.includes('orphaned')
      const counts = {
        total: questions.length,
        ok: questions.filter(q => q.status === 'ok' && !orphaned(q)).length,
        needsReview: questions.filter(q => q.status === 'needs-review' && !orphaned(q)).length,
        orphaned: questions.filter(orphaned).length,
        duplicates: questions.filter(q => (q.flags ?? []).some(f => String(f).startsWith('duplicate_of'))).length,
      }
      const nodes = treeView(meta, questions, progress).nodes.map(n => ({ id: n.id, title: n.title, total: n.total, ok: n.ok }))
      const weak = questions
        .map(q => ({ questionId: q.id, stem: q.stem.split('\n')[0], misses: (progress[q.id] && progress[q.id].misses) || 0 }))
        .filter(item => item.misses > 0)
        .sort((a, b) => b.misses - a.misses)
        .slice(0, 5)
      const nextActions = []
      if (!meta.target) nextActions.push('还没有学习目标：用 learning_plan set_target 记录目标与当前水平。')
      if (!Array.isArray(meta.tree) || meta.tree.length === 0) nextActions.push('还没有知识点骨架：用 learning_plan upsert_tree 先写出一层知识点。')
      if (counts.needsReview > 0) nextActions.push(`有 ${counts.needsReview} 道题待核对：用 learning_question accept/reject/update 处理。`)
      if (counts.total === 0) nextActions.push('题库是空的：用 learning_import brief 拿到入库格式，再写草稿并 commit。')
      if (nextActions.length === 0) nextActions.push('题库与骨架都就绪，可以开始过题。')
      return { target: meta.target, counts, nodes, weak, nextActions }
    },
  })

  const plan = withRender({
    name: 'learning_plan',
    description: 'Read or write the learning target, the topic tree and the staged plan. Actions: get, set_target, upsert_tree, set_plan.',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'set_target', 'upsert_tree', 'set_plan'], description: 'Which part to read or replace.' },
      target: { type: 'object', description: 'For set_target: { title, statement, level }.' },
      nodes: { type: 'array', description: 'For upsert_tree: knowledge nodes { id, parentId?, title, weight?, order? }.', items: { type: 'object' } },
      plan: { type: 'array', description: 'For set_plan: stages { id?, title, nodeIds?, reading?: [{ file, section?, pages? }], prereqs?: string[], perspectives?: string[], project?: { title, deliverable? }, checkpoints?: string[], status?: "todo" | "doing" | "done" }. Ids are assigned by the host when omitted; status defaults to todo.', items: { type: 'object' } },
    },
    output: {
      schema: OBJECT_OUTPUT,
      render: (_args, value) => text(value.ok ? `已更新：${JSON.stringify(value).slice(0, 160)}` : '已读取学习计划'),
    },
    async execute(args, exec) {
      const store = await storeFor(exec.agent)
      const { meta } = await store.load()
      switch (args.action) {
        case 'get':
          return { target: meta.target, tree: meta.tree, plan: meta.plan }
        case 'set_target': {
          const next = { ...(meta.target ?? {}), ...(args.target ?? {}) }
          if (!next.startedAt) next.startedAt = new Date().toISOString()
          meta.target = next
          await store.saveMeta(meta)
          return { ok: true, target: next }
        }
        case 'upsert_tree': {
          const incoming = Array.isArray(args.nodes) ? args.nodes : []
          const byId = new Map((meta.tree ?? []).map(node => [node.id, node]))
          incoming.forEach((node, index) => {
            if (!node || typeof node.id !== 'string') return
            const previous = byId.get(node.id) ?? {}
            byId.set(node.id, {
              ...previous,
              ...node,
              parentId: node.parentId ?? previous.parentId ?? null,
              weight: node.weight ?? previous.weight ?? 'must',
              order: node.order ?? previous.order ?? (index + 1) * 10,
            })
          })
          meta.tree = [...byId.values()]
          await store.saveMeta(meta)
          return { ok: true, nodeCount: meta.tree.length }
        }
        case 'set_plan': {
          meta.plan = normalizePlan(args.plan)
          await store.saveMeta(meta)
          return { ok: true, stageCount: meta.plan.length }
        }
        default:
          throw new Error(`unknown action: ${String(args.action)}`)
      }
    },
  })

  const importTool = withRender({
    name: 'learning_import',
    description: 'Brief, run, or inspect a question-bank import. The brief states the exact draft files to write; commit validates them against the topic tree and the extracted material text.',
    parameters: {
      action: { type: 'string', required: true, enum: ['brief', 'commit', 'list'], description: 'brief = instructions and schema; commit = validate inbox and merge; list = what is waiting.' },
    },
    output: {
      schema: OBJECT_OUTPUT,
      render: (_args, value) => text(value.instructions ? '入库说明已生成' : `入库：新增 ${value.added ?? 0}、合并 ${value.merged ?? 0}、待核对 ${value.needsReview ?? 0}、丢弃 ${value.rejected ?? 0}、孤儿 ${value.orphaned ?? 0}`),
    },
    async execute(args, exec) {
      const store = await storeFor(exec.agent)
      switch (args.action) {
        case 'brief':
          return {
            files: IMPORT_FILES,
            instructions: [
              '读材料，把题写成 JSONL：一行一题，字段 stem、reference{answer,points}、nodeId、source{file,page,anchor,hasImage}、tags。',
              'source.anchor 必须是原文里逐字出现的一段话（建议 10-30 字），用于核对题目确实来自材料；找不到锚点的题会被退回待核对。',
              '同时把材料的纯文本写进 materials/<材料名>.txt，否则整批都会被标成无法核对。',
              '术语另写一行一个：{ term, definition, example? }，术语必须出现在某些题干里。',
              '每题可选给 related：questions 写题库里另一道题的题干原文（不是题号），deeper / broader 各 1-3 条你自己的问题。',
              'related 只写你确信相关的，宁少勿多；空着比凑数好。写错题干的关联会被丢弃。',
              '写标准答案的同时补一段 supplement：面试里被追问时你会怎么讲这道题（遇到过什么问题、怎么解决的），或这道题的陷阱与常见错误；两样都能写，都不确定就留空。',
              '一次 30-60 题；写完调用 learning_import commit。commit 会新增、合并、待核对分开计数，并逐条给出原因。',
              '同一份材料重导是对账：题干相同的题会被更新而不是重复。',
            ].join('\n'),
            schema: {
              question: { stem: 'string', reference: { answer: 'string', points: 'string[]' }, nodeId: 'string', source: { file: 'string', page: 'number', anchor: 'string', hasImage: 'boolean' }, tags: 'string[]' },
              term: { term: 'string', definition: 'string', example: 'string' },
            },
          }
        case 'commit':
          return store.commitInbox()
        case 'list': {
          let names = []
          try {
            names = await readdir(store.paths.inboxDir)
          } catch (error) {
            if (!error || error.code !== 'ENOENT') throw error
          }
          return { files: names }
        }
        default:
          throw new Error(`unknown action: ${String(args.action)}`)
      }
    },
  })

  const question = withRender({
    name: 'learning_question',
    description: 'Fix one question: update fields, accept a flagged question into practice, reject it, or add a hand-written one.',
    parameters: {
      action: { type: 'string', required: true, enum: ['update', 'accept', 'reject', 'add'], description: 'What to do with the question.' },
      id: { type: 'string', description: 'Question id, for update/accept/reject.' },
      patch: { type: 'object', description: 'For update: fields to replace (stem, nodeId, reference, source, tags, related).' },
      question: { type: 'object', description: 'For add: the full draft question.' },
    },
    output: {
      schema: OBJECT_OUTPUT,
      render: (_args, value) => text(`题目 ${value.question.id} → ${value.question.status}`),
    },
    async execute(args, exec) {
      const store = await storeFor(exec.agent)
      switch (args.action) {
        case 'update': {
          const result = await store.updateQuestion(args.id, args.patch ?? {})
          return { ok: true, question: result.question, relatedDropped: result.relatedDropped }
        }
        case 'accept':
          return { ok: true, question: await store.setStatus(args.id, 'ok') }
        case 'reject':
          return { ok: true, question: await store.setStatus(args.id, 'rejected') }
        case 'add':
          return { ok: true, question: await store.addQuestion(args.question ?? {}) }
        default:
          throw new Error(`unknown action: ${String(args.action)}`)
      }
    },
  })

  const grade = withRender({
    name: 'learning_grade',
    description: 'Grade one answer against the question reference. Call `open` first to read the question, its reference answer and points, and what the learner wrote; then call `submit` with your judgement. `covered`/`missed`/`wrong` are short paraphrases, never the reference text verbatim. Add `suggestion` (a better answer) whenever the hit rate is below 60%.',
    parameters: {
      action: { type: 'string', required: true, enum: ['open', 'submit'], description: 'open = read question + answer; submit = write the grade back.' },
      attemptId: { type: 'string', required: true, description: 'The attempt being graded.' },
      covered: { type: 'array', required: false, description: 'For submit: points the answer did hit, paraphrased.', items: { type: 'string' } },
      missed: { type: 'array', required: false, description: 'For submit: points it missed.', items: { type: 'string' } },
      wrong: { type: 'array', required: false, description: 'For submit: things the answer got wrong.', items: { type: 'string' } },
      feedback: { type: 'string', required: false, description: 'For submit: one or two sentences of correction.' },
      suggestion: { type: 'string', required: false, description: 'For submit: a better version of the answer; required by convention when the hit rate is below 60%.' },
    },
    output: {
      schema: OBJECT_OUTPUT,
      // `open` must hand the model everything it needs to judge: the rendered
      // text is the only part of a tool result the model reads.
      render: (_args, value) => {
        if (!value || !value.question) return text(`已批改：得分 ${value.score}`)
        const question = value.question
        const lines = [
          `题目：${question.stem}`,
          `参考答案：${question.answer || '（无）'}`,
          `要点：${Array.isArray(question.points) && question.points.length > 0
            ? question.points.map((point, index) => `${index + 1}) ${point}`).join('  ')
            : '（无）'}`,
        ]
        if (question.supplement) lines.push(`补充答案：${question.supplement}`)
        if (value.attempt) lines.push(`学习者的答案：${value.attempt.answer}`)
        return text(lines.join('\n'))
      },
    },
    async execute(args, exec) {
      const store = await storeFor(exec.agent)
      if (args.action === 'open') {
        const attempt = await store.getAttempt(args.attemptId)
        if (!attempt) throw new Error(`unknown attempt: ${String(args.attemptId)}`)
        const { questions } = await store.load()
        const question = questions.find(item => item.id === attempt.questionId)
        if (!question) throw new Error(`unknown question: ${attempt.questionId}`)
        return {
          question: {
            id: question.id,
            stem: question.stem,
            answer: question.reference && question.reference.answer ? question.reference.answer : '',
            points: question.reference && Array.isArray(question.reference.points) ? question.reference.points : [],
            supplement: question.reference && question.reference.supplement ? question.reference.supplement : '',
          },
          attempt: { id: attempt.id, kind: attempt.kind, answer: attempt.answer, at: attempt.at },
        }
      }
      if (args.action === 'submit') {
        const result = await store.gradeAttempt(args.attemptId, {
          covered: args.covered,
          missed: args.missed,
          wrong: args.wrong,
          feedback: args.feedback,
          suggestion: args.suggestion,
        })
        return { ok: true, score: result.score, misses: result.misses, needsSuggestion: needsSuggestion(result.score) }
      }
      throw new Error(`unknown action: ${String(args.action)}`)
    },
  })

  const audit = withRender({
    name: 'learning_audit',
    description: 'Audit the question bank against the learning target. Call `brief` for a bounded digest (per-topic counts, flagged questions, duplicates, orphans, missing answers) plus the report requirements; then read `learning/questions.jsonl` for detail and call `write` with the finished markdown report.',
    parameters: {
      action: { type: 'string', required: true, enum: ['brief', 'write'], description: 'brief = digest + rules; write = store the report.' },
      markdown: { type: 'string', description: 'For write: the full report body.' },
    },
    output: {
      schema: OBJECT_OUTPUT,
      // The rendered text is the only part of a tool result the model reads, so
      // the digest has to be in it — totals alone cannot be audited.
      render: (_args, value) => {
        if (value && value.file) return text(`已生成报告 ${value.file}`)
        const digest = value.digest
        const lines = [value.instructions]
        const overflow = digest.overflow ?? { nodes: 0, needsReview: 0, others: 0 }
        lines.push(`知识点题数（共 ${digest.totals.nodes} 个）：${digest.nodes.map(node => `${node.title}:${node.count}`).join('  ')}`)
        if (overflow.nodes > 0) lines.push(`还有 ${overflow.nodes} 个知识点未列出，见 learning/questions.jsonl`)
        lines.push(`待核对：${digest.needsReview.length > 0 ? digest.needsReview.map(item => `${item.id}(${item.flags.join(',')})`).join('  ') : '无'}`)
        if (overflow.needsReview > 0) lines.push(`还有 ${overflow.needsReview} 条待核对未列出`)
        lines.push(`重复：${digest.duplicates.join(',') || '无'}`)
        lines.push(`孤儿：${digest.orphans.join(',') || '无'}`)
        lines.push(`缺答案：${digest.missingAnswer.join(',') || '无'}`)
        if (overflow.others > 0) lines.push(`其余分类还有 ${overflow.others} 条未列出，见 learning/questions.jsonl`)
        lines.push(`材料：${digest.materials.join(',') || '无'}`)
        lines.push(`题库共 ${digest.totals.questions} 题`)
        return text(lines.join('\n'))
      },
    },
    async execute(args, exec) {
      const store = await storeFor(exec.agent)
      if (args.action === 'brief') {
        const { meta, questions } = await store.load()
        let materials = []
        try {
          materials = (await readdir(store.paths.materialsDir)).map(name => `materials/${name}`)
        } catch {
          materials = []
        }
        return {
          files: { questions: 'learning/questions.jsonl', materials: 'learning/materials/', reports: 'learning/reports/' },
          digest: auditDigest({ meta, questions, materials }),
          instructions: [
            '按这六类体检：覆盖缺口（零题或题太少的知识点）、重复、可疑过时、跑出范围、缺答案、答案存疑。',
            '每类最多 5 条，必须点出题号或知识点；没有就写"无"。',
            '报告用 markdown，开头一句总体判断；结尾必须给"下一步三件事"。',
            '每条结论后面注明它对应的题目状态（ok / needs-review / rejected / orphaned）。',
            '摘要只列到上限；要看全量就读 learning/questions.jsonl。',
          ].join('\n'),
        }
      }
      if (args.action === 'write') {
        const result = await store.saveReport(args.markdown)
        return { ok: true, ...result }
      }
      throw new Error(`unknown action: ${String(args.action)}`)
    },
  })

  return [status, plan, importTool, question, grade, audit]
}
