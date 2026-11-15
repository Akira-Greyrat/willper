import test from 'node:test'
import assert from 'node:assert/strict'
import { treeView, queueView, questionView, checklistView, favoritesView, weakView, planView } from '../learning-center/src/views.js'

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

test('队列包含已读、按知识点过滤、可分页', () => {
  const questions = [q('q1'), q('q2'), q('q3'), q('q4', { nodeId: 'n_2' })]
  const progress = { q1: { seen: true } }
  const page = queueView(meta, questions, progress, { offset: 0, limit: 1 })
  assert.equal(page.total, 4)
  assert.deepEqual(page.items.map(i => i.id), ['q2'])
  assert.equal(page.offset, 0)
  const byNode = queueView(meta, questions, progress, { nodeId: 'n_2', offset: 0, limit: 10 })
  assert.deepEqual(byNode.items.map(i => i.id), ['q4'])
  const unseenOnly = queueView(meta, questions, progress, { offset: 0, limit: 10, onlyUnseen: true })
  assert.equal(unseenOnly.total, 3)
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

test('题卡给关联题带上题干，目标不存在的丢掉', () => {
  const questions = [
    q('q1', { related: { questions: ['q2', 'gone'], deeper: ['为什么？'], broader: [] } }),
    q('q2'),
  ]
  const card = questionView(questions, [], 'q1')
  assert.deepEqual(card.relatedQuestions, [{ id: 'q2', stem: '题目 q2 的题干' }])
  assert.deepEqual(card.related.deeper, ['为什么？'])
})

test('题卡没有关联网时给空数组而不是 undefined', () => {
  const card = questionView([q('q1')], [], 'q1')
  assert.deepEqual(card.relatedQuestions, [])
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

test('题卡带最近一次作答，错题本按漏点排序', () => {
  const questions = [q('q1'), q('q2')]
  const progress = { q1: { misses: 2, lastScore: 0.5 }, q2: { misses: 3, lastScore: 0.4 } }
  const card = questionView(questions, [], 'q1', progress, [
    { id: 'a1', questionId: 'q1', at: 'T1', kind: 'study', grade: { score: 1 } },
    { id: 'a2', questionId: 'q1', at: 'T2', kind: 'quiz', grade: { score: 0.5 } },
  ])
  assert.equal(card.lastAttempt.id, 'a2')
  assert.equal(card.lastAttempt.kind, 'quiz')
  const weak = weakView(questions, progress)
  assert.deepEqual(weak.items.map(item => item.id), ['q2', 'q1'])
  assert.equal(weak.items[0].misses, 3)
})

test('没有作答记录时 lastAttempt 是 null', () => {
  const card = questionView([q('q1')], [], 'q1', {}, [])
  assert.equal(card.lastAttempt, null)
})

test('移出的错题不出现在错题本', () => {
  const weak = weakView([q('q1')], { q1: { misses: 2, dismissed: true } })
  assert.deepEqual(weak.items, [])
})

test('没答过的题不进错题本', () => {
  const weak = weakView([q('q1'), q('q2')], { q1: { seen: true } })
  assert.deepEqual(weak.items, [])
})
test('planView 把知识点 id 换成标题', () => {
  const view = planView({ tree: [{ id: 'n_1', title: '基础' }], plan: [{ id: 'p_1', title: '一', nodeIds: ['n_1', 'gone'], reading: '第 3 节', project: '写个计数器' }] })
  assert.deepEqual(view.stages[0].nodeTitles, ['基础'])
  assert.equal(view.stages[0].reading, '第 3 节')
  assert.equal(view.stages[0].status, 'todo')
  assert.deepEqual(view.stages[0].checkpoints, [])
  assert.equal(view.stages[0].project, '写个计数器')
})

test('planView 在没有计划时给空数组', () => {
  assert.deepEqual(planView({ tree: [], plan: [] }).stages, [])
  assert.deepEqual(planView(null).stages, [])
})
test('过题队列默认包含已过的题，未过的排在前面', () => {
  const questions = [
    { id: 'q1', key: 'k1', stem: '一', nodeId: 'n_1', status: 'ok', flags: [], reference: { answer: 'a', points: ['p'] } },
    { id: 'q2', key: 'k2', stem: '二', nodeId: 'n_1', status: 'ok', flags: [], reference: { answer: 'a', points: ['p'] } },
    { id: 'q3', key: 'k3', stem: '三', nodeId: 'n_1', status: 'ok', flags: [], reference: { answer: 'a', points: ['p'] } },
  ]
  const progress = { q1: { seen: true }, q3: { seen: true } }
  const view = queueView(meta, questions, progress, { limit: 10 })
  assert.equal(view.total, 3)
  assert.deepEqual(view.items.map(item => item.id), ['q2', 'q1', 'q3'])
  assert.equal(view.items[0].seen, false)
  assert.equal(view.items[1].seen, true)
})

test('只看未过会过滤掉已过的题', () => {
  const questions = [
    { id: 'q1', key: 'k1', stem: '一', nodeId: 'n_1', status: 'ok', flags: [], reference: { answer: 'a', points: ['p'] } },
    { id: 'q2', key: 'k2', stem: '二', nodeId: 'n_1', status: 'ok', flags: [], reference: { answer: 'a', points: ['p'] } },
  ]
  const view = queueView(meta, questions, { q1: { seen: true } }, { limit: 10, onlyUnseen: true })
  assert.equal(view.total, 1)
  assert.deepEqual(view.items.map(item => item.id), ['q2'])
})

test('题卡带上是否已过', () => {
  const card = questionView([q('q1')], [], 'q1', { q1: { seen: true } })
  assert.equal(card.seen, true)
})