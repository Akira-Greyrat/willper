import test from 'node:test'
import assert from 'node:assert/strict'
import { writeJson, writeJsonl, readJsonl, ensureDir } from '../learning-center/src/io.js'
import { createStore } from '../learning-center/src/store.js'
import { toolDefinitions } from '../learning-center/src/tools.js'
import { withTempStore } from './helpers.js'

const agent = { session: { id: 's_1' } }

const wire = (fn) => withTempStore(async (paths, baseDir) => {
  const store = createStore(baseDir)
  const tools = Object.fromEntries(toolDefinitions(() => store).map(t => [t.name, t]))
  await fn({ tools, store, paths, baseDir })
})

const call = (tool, args) => tool.execute(args, { agent })

test('四个工具都带 name/description/parameters/output/execute', () => {
  const defs = toolDefinitions(() => null)
  assert.deepEqual(defs.map(d => d.name).sort(), ['learning_import', 'learning_plan', 'learning_question', 'learning_status'])
  for (const def of defs) {
    assert.ok(def.description.length > 10)
    assert.equal(typeof def.execute, 'function')
    assert.ok(def.parameters)
    assert.ok(def.output.schema)
    assert.equal(typeof def.output.render, 'function')
  }
})

test('status 在空库上给出空统计与下一步', async () => {
  await wire(async ({ tools }) => {
    const r = await call(tools.learning_status, {})
    assert.equal(r.counts.total, 0)
    assert.equal(r.target, null)
    assert.ok(r.nextActions.some(x => x.includes('目标')))
    assert.ok(r.nextActions.some(x => x.includes('知识点')))
  })
})

test('status 统计题库并给出待核对提示', async () => {
  await wire(async ({ tools, store }) => {
    const { meta } = await store.load()
    meta.tree = [{ id: 'n_1', title: '基础', order: 10 }]
    meta.target = { title: '认证', statement: '学会', level: 'beginner' }
    await store.saveMeta(meta)
    await writeJsonl(store.paths.questions, [
      { id: 'q1', key: 'k1', stem: '一题？', nodeId: 'n_1', status: 'ok', flags: [], source: { file: 'm.md' } },
      { id: 'q2', key: 'k2', stem: '二题？', nodeId: 'n_1', status: 'needs-review', flags: ['missing_answer'], source: { file: 'm.md' } },
      { id: 'q3', key: 'k3', stem: '三题？', nodeId: 'n_1', status: 'needs-review', flags: ['orphaned'], source: { file: 'm.md' } },
    ])
    const r = await call(tools.learning_status, {})
    assert.equal(r.counts.total, 3)
    assert.equal(r.counts.ok, 1)
    assert.equal(r.counts.needsReview, 1)
    assert.equal(r.counts.orphaned, 1)
    assert.deepEqual(r.nodes, [{ id: 'n_1', title: '基础', total: 1, ok: 1 }])
    assert.ok(r.nextActions.some(x => x.includes('待核对')))
  })
})

test('plan 能写目标、合并知识点、替换阶段计划', async () => {
  await wire(async ({ tools, store }) => {
    const t = await call(tools.learning_plan, { action: 'set_target', target: { title: '认证', statement: '学会闭包', level: 'beginner' } })
    assert.equal(t.ok, true)
    assert.equal(t.target.title, '认证')

    const a = await call(tools.learning_plan, { action: 'upsert_tree', nodes: [{ id: 'n_1', title: '基础' }, { id: 'n_2', title: '闭包', parentId: 'n_1' }] })
    assert.equal(a.nodeCount, 2)
    const b = await call(tools.learning_plan, { action: 'upsert_tree', nodes: [{ id: 'n_1', title: '基础（改）' }] })
    assert.equal(b.nodeCount, 2)
    const read = await call(tools.learning_plan, { action: 'get' })
    assert.equal(read.tree.find(n => n.id === 'n_1').title, '基础（改）')

    const p = await call(tools.learning_plan, { action: 'set_plan', plan: [{ id: 'p_1', title: '第一阶段' }] })
    assert.equal(p.stageCount, 1)
    assert.equal((await call(tools.learning_plan, { action: 'get' })).plan.length, 1)
  })
})

test('import brief 给出三件套路径与字段要求', async () => {
  await wire(async ({ tools }) => {
    const r = await call(tools.learning_import, { action: 'brief' })
    const text = JSON.stringify(r)
    assert.ok(text.includes('inbox/questions.jsonl'))
    assert.ok(text.includes('inbox/terms.jsonl'))
    assert.ok(text.includes('materials/'))
    assert.ok(r.instructions.includes('anchor'))
  })
})

test('import commit 转调入库并回传计数', async () => {
  await wire(async ({ tools, store, paths }) => {
    const { meta } = await store.load()
    meta.tree = [{ id: 'n_1', title: '基础', order: 10 }]
    await store.saveMeta(meta)
    await ensureDir(paths.inboxDir)
    await ensureDir(paths.materialsDir)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(`${paths.materialsDir}/bank.txt`, '什么是闭包？', 'utf8')
    await writeFile(paths.inboxQuestions, `${JSON.stringify({
      stem: '什么是闭包？',
      reference: { answer: '函数与其词法环境', points: [] },
      nodeId: 'n_1',
      source: { file: 'materials/bank.md', page: 1, anchor: '什么是闭包' },
    })}\n`, 'utf8')
    const r = await call(tools.learning_import, { action: 'commit' })
    assert.equal(r.added, 1)
    assert.equal(r.needsReview, 0)
  })
})

test('import list 列出待入库文件，空时为 0', async () => {
  await wire(async ({ tools, paths }) => {
    assert.deepEqual((await call(tools.learning_import, { action: 'list' })).files, [])
    await ensureDir(paths.inboxDir)
    await writeJsonl(paths.inboxQuestions, [{ stem: 'x' }])
    const r = await call(tools.learning_import, { action: 'list' })
    assert.equal(r.files.length, 1)
  })
})

test('question accept / reject / update', async () => {
  await wire(async ({ tools, store }) => {
    await writeJsonl(store.paths.questions, [{
      id: 'q1', key: 'k1', stem: '一题？', nodeId: 'n_1', status: 'needs-review', flags: ['missing_answer'],
      reference: { answer: '', points: [] }, source: { file: 'm.md' }, tags: [], related: { questions: [], deeper: [], broader: [] },
      createdAt: 'T0', updatedAt: 'T0',
    }])
    const acc = await call(tools.learning_question, { action: 'accept', id: 'q1' })
    assert.equal(acc.question.status, 'ok')
    const rej = await call(tools.learning_question, { action: 'reject', id: 'q1' })
    assert.equal(rej.question.status, 'rejected')
    const upd = await call(tools.learning_question, { action: 'update', id: 'q1', patch: { stem: '改过的题干？' } })
    assert.equal(upd.question.stem, '改过的题干？')
  })
})

test('question add 校验后追加，AI 加的题进待核对', async () => {
  await wire(async ({ tools, store }) => {
    const { meta } = await store.load()
    meta.tree = [{ id: 'n_1', title: '基础', order: 10 }]
    await store.saveMeta(meta)
    const good = await call(tools.learning_question, {
      action: 'add',
      question: { stem: '什么是闭包？', reference: { answer: '组合', points: [] }, nodeId: 'n_1' },
    })
    assert.equal(good.question.status, 'needs-review')
    assert.equal(good.question.reference.provenance, 'ai-drafted')
    assert.equal((await readJsonl(store.paths.questions)).length, 1)
    await assert.rejects(
      () => call(tools.learning_question, { action: 'add', question: { stem: '什么是闭包？', nodeId: 'n_1' } }),
      /missing_answer/,
    )
  })
})

test('未知 action 报错而不是静默成功', async () => {
  await wire(async ({ tools }) => {
    await assert.rejects(() => call(tools.learning_plan, { action: 'nope' }), /unknown action/)
    await assert.rejects(() => call(tools.learning_question, { action: 'nope' }), /unknown action/)
  })
})
