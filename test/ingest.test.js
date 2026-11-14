import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { writeJsonl, readJsonl, ensureDir, writeJson } from '../learning-center/src/io.js'
import { commitInbox } from '../learning-center/src/ingest.js'
import { withTempStore } from './helpers.js'

const draft = (over = {}) => ({
  stem: '什么是闭包？',
  reference: { answer: '函数与其词法环境的组合。', points: ['函数', '词法环境'] },
  nodeId: 'n_1',
  source: { file: 'materials/bank.md', page: 3, anchor: '什么是闭包' },
  ...over,
})

const options = () => ({
  nodeIds: new Set(['n_1']),
  materialTextByFile: {
    'materials/bank.md': '什么是闭包？函数与其词法环境的组合。\n什么是作用域？作用域决定变量的可见范围。',
  },
})

test('新题入库并移走草稿文件', async () => {
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [draft(), draft({ stem: '什么是作用域？', source: { file: 'materials/bank.md', page: 4, anchor: '什么是作用域' } })])
    const r = await commitInbox(paths, options())
    assert.equal(r.added, 2)
    assert.equal(r.merged, 0)
    assert.equal((await readJsonl(paths.questions)).length, 2)
    assert.deepEqual(await readdir(paths.inboxDir), [])
    assert.equal((await readdir(paths.importedDir)).length, 1)
  })
})

test('同一份材料再导一次是更新，题号不变', async () => {
  const first = draft()
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [first])
    await commitInbox(paths, options())
    const [stored] = await readJsonl(paths.questions)

    await writeJsonl(paths.inboxQuestions, [draft({ reference: { answer: '新的答案', points: ['新要点'] } })])
    const r = await commitInbox(paths, options())
    assert.equal(r.merged, 1)
    assert.equal(r.added, 0)
    const rows = await readJsonl(paths.questions)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, stored.id)
    assert.equal(rows[0].reference.answer, '新的答案')
    assert.equal(rows[0].createdAt, stored.createdAt)
  })
})

test('同一批里重复只收一条并说明原因', async () => {
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [draft(), draft()])
    const r = await commitInbox(paths, options())
    assert.equal(r.added, 1)
    assert.equal((await readJsonl(paths.questions)).length, 1)
    assert.ok(r.reasons.some(x => String(x.reason).startsWith('duplicate_of')))
  })
})

test('缺答案的题进待核对但仍然存下来', async () => {
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [draft({ reference: {} })])
    const r = await commitInbox(paths, options())
    assert.equal(r.needsReview, 1)
    const rows = await readJsonl(paths.questions)
    assert.equal(rows[0].status, 'needs-review')
    assert.deepEqual(rows[0].flags, ['missing_answer'])
  })
})

test('坏 JSON 行只丢那一行，其余照常入库', async () => {
  await withTempStore(async paths => {
    await ensureDir(paths.inboxDir)
    await writeJson(paths.inboxQuestions, {})
    const { writeFile } = await import('node:fs/promises')
    await writeFile(paths.inboxQuestions, `${JSON.stringify(draft())}\n{坏行\n`, 'utf8')
    const r = await commitInbox(paths, options())
    assert.equal(r.added, 1)
    assert.equal(r.rejected, 1)
    assert.ok(r.reasons.some(x => x.reason === 'bad_json'))
  })
})

test('材料里消失的题标 orphaned，不删', async () => {
  await withTempStore(async paths => {
    const a = draft()
    const b = draft({ stem: '什么是作用域？', source: { file: 'materials/bank.md', page: 4, anchor: '什么是作用域' } })
    await writeJsonl(paths.inboxQuestions, [a, b])
    await commitInbox(paths, options())

    await writeJsonl(paths.inboxQuestions, [draft()])
    const r = await commitInbox(paths, options())
    assert.equal(r.orphaned, 1)
    const rows = await readJsonl(paths.questions)
    assert.equal(rows.length, 2)
    const gone = rows.find(x => x.flags.includes('orphaned'))
    assert.ok(gone)
    assert.equal(gone.status, 'needs-review')
  })
})

test('没有锚点文本的题整批标 anchor_unverified', async () => {
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [draft()])
    const r = await commitInbox(paths, { nodeIds: new Set(['n_1']), materialTextByFile: {} })
    assert.equal(r.needsReview, 1)
    const rows = await readJsonl(paths.questions)
    assert.ok(rows[0].flags.includes('anchor_unverified'))
  })
})

test('术语必须出现在题干里，否则丢弃并说明', async () => {
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [draft()])
    await writeJsonl(paths.inboxTerms, [
      { term: '闭包', definition: '函数与其词法环境的组合' },
      { term: '不存在', definition: '……' },
    ])
    const r = await commitInbox(paths, options())
    assert.equal(r.terms, 1)
    const terms = JSON.parse(await (await import('node:fs/promises')).readFile(paths.terms, 'utf8'))
    assert.deepEqual(terms.map(t => t.term), ['闭包'])
    assert.ok(r.reasons.some(x => x.reason === 'term_not_in_bank'))
  })
})

test('空 inbox 时是全零，不写文件', async () => {
  await withTempStore(async paths => {
    const r = await commitInbox(paths, options())
    assert.deepEqual(
      { added: r.added, merged: r.merged, needsReview: r.needsReview, rejected: r.rejected, orphaned: r.orphaned },
      { added: 0, merged: 0, needsReview: 0, rejected: 0, orphaned: 0 },
    )
    assert.deepEqual(await readdir(paths.root).catch(() => []), [])
  })
})
