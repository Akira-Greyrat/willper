import test from 'node:test'
import assert from 'node:assert/strict'
import { treeView, queueView, questionView, checklistView, favoritesView } from '../learning-center/src/views.js'

const meta = {
  tree: [
    { id: 'n_1', parentId: null, title: '基础', weight: 'must', order: 10 },
    { id: 'n_2', parentId: 'n_1', title: '闭包', weight: 'often', order: 20 },
  ],
}

const q = (id, over = {}) => ({
  id,
  key: `k_${id}`,
  stem: `题目 ${id} 的题干`,
  nodeId: 'n_1',
  status: 'ok',
  flags: [],
  source: { file: 'materials/bank.md', page: 1 },
  ...over,
})

test('树计数只算 ok 且未被孤立的题', () => {
  const questions = [
    q('q1'),
    q('q2', { nodeId: 'n_2' }),
    q('q3', { nodeId: 'n_2', status: 'needs-review', flags: ['missing_answer'] }),
    q('q4', { nodeId: 'n_2', flags: ['orphaned'], status: 'needs-review' }),
  ]
  const view = treeView(meta, questions, { q1: { seen: true } })
  const n1 = view.nodes.find(n => n.id === 'n_1')
  const n2 = view.nodes.find(n => n.id === 'n_2')
  assert.equal(n1.total, 1)
  assert.equal(n1.ok, 1)
  assert.equal(n1.seen, 1)
  assert.equal(n2.total, 1)
  assert.equal(n2.needsReview, 1)
  assert.equal(n2.seen, 0)
})

test('树在没有题时给出零计数', () => {
  const view = treeView(meta, [], {})
  assert.deepEqual(view.nodes.map(n => n.total), [0, 0])
})

test('队列跳过已读，并按知识点过滤、分页', () => {
  const questions = [q('q1'), q('q2'), q('q3'), q('q4', { nodeId: 'n_2' })]
  const progress = { q1: { seen: true } }
  const page = queueView(meta, questions, progress, { offset: 0, limit: 1 })
  assert.equal(page.total, 3)
  assert.deepEqual(page.items.map(i => i.id), ['q2'])
  assert.equal(page.offset, 0)
  const byNode = queueView(meta, questions, progress, { nodeId: 'n_2', offset: 0, limit: 10 })
  assert.deepEqual(byNode.items.map(i => i.id), ['q4'])
  const revisit = queueView(meta, questions, progress, { offset: 0, limit: 10, revisit: true })
  assert.equal(revisit.total, 4)
})

test('队列不含待核对、孤立的题', () => {
  const questions = [q('q1', { status: 'needs-review', flags: ['missing_answer'] }), q('q2', { flags: ['orphaned'], status: 'needs-review' }), q('q3')]
  const page = queueView(meta, questions, {}, { offset: 0, limit: 10 })
  assert.deepEqual(page.items.map(i => i.id), ['q3'])
})

test('题卡给出术语的所有出现位置，长术语优先且不重叠', () => {
  const questions = [q('q1', { stem: '闭包 是函数与其词法环境的组合，闭包很有用。' })]
  const terms = [{ term: '闭包', definition: 'a' }, { term: '词法环境', definition: 'b' }]
  const card = questionView(questions, terms, 'q1')
  assert.equal(card.id, 'q1')
  assert.deepEqual(card.termHits.map(h => h.text), ['闭包', '词法环境', '闭包'])
  for (const hit of card.termHits) {
    assert.equal(card.stem.slice(hit.start, hit.end), hit.text)
  }
})

test('题卡不认识没有释义的术语时不报错', () => {
  const questions = [q('q1', { stem: '闭包 是函数。' })]
  const card = questionView(questions, [], 'q1')
  assert.deepEqual(card.termHits, [])
})

test('题卡对未知 id 返回 null', () => {
  assert.equal(questionView([q('q1')], [], 'nope'), null)
})

test('题卡带上收藏状态', () => {
  const card = questionView([q('q1')], [], 'q1', { q1: { favorite: true } })
  assert.equal(card.favorite, true)
})

test('待核对清单只列 needs-review，并带 flag 说明', () => {
  const questions = [q('q1'), q('q2', { status: 'needs-review', flags: ['missing_answer', 'anchor_missing'] }), q('q3', { status: 'rejected', flags: ['empty_stem'] })]
  const list = checklistView(questions)
  assert.deepEqual(list.items.map(i => i.id), ['q2'])
  assert.deepEqual(list.items[0].flags, ['missing_answer', 'anchor_missing'])
  assert.equal(list.items[0].source.file, 'materials/bank.md')
})

test('收藏页只列收藏过的题', () => {
  const questions = [q('q1'), q('q2')]
  const list = favoritesView(questions, { q2: { favorite: true } })
  assert.deepEqual(list.items.map(i => i.id), ['q2'])
})

test('空输入返回空集合而不是 undefined', () => {
  assert.deepEqual(treeView({ tree: [] }, [], {}).nodes, [])
  assert.deepEqual(queueView({ tree: [] }, [], {}, { offset: 0, limit: 5 }).items, [])
  assert.deepEqual(checklistView([]).items, [])
  assert.deepEqual(favoritesView([], {}).items, [])
})
