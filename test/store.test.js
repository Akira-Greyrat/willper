import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createStore } from '../learning-center/src/store.js'
import { writeJson, writeJsonl, readJsonl, ensureDir } from '../learning-center/src/io.js'
import { withTempStore } from './helpers.js'

const withStore = (fn) => withTempStore(async (paths, baseDir) => {
  await fn(createStore(baseDir), paths, baseDir)
})

test('空库 load 给空默认值', async () => {
  await withStore(async store => {
    const data = await store.load()
    assert.equal(data.meta.target, null)
    assert.deepEqual(data.meta.tree, [])
    assert.deepEqual(data.questions, [])
    assert.deepEqual(data.terms, [])
    assert.deepEqual(data.progress, {})
    assert.deepEqual(data.attempts, [])
    assert.equal(data.meta.settings.leavePromptRate, 0.15)
  })
})

test('saveMeta 之后能读回', async () => {
  await withStore(async store => {
    const { meta } = await store.load()
    meta.target = { title: '某某认证', statement: '学会闭包', level: 'beginner' }
    await store.saveMeta(meta)
    const again = await store.load()
    assert.equal(again.meta.target.title, '某某认证')
  })
})

test('setFavorite 只改进度文件', async () => {
  await withStore(async store => {
    await store.setFavorite('q_1', true)
    const data = await store.load()
    assert.equal(data.progress.q_1.favorite, true)
    await store.setFavorite('q_1', false)
    assert.equal((await store.load()).progress.q_1.favorite, false)
  })
})

test('markSeen 记下已读', async () => {
  await withStore(async store => {
    await store.markSeen('q_1')
    const data = await store.load()
    assert.equal(data.progress.q_1.seen, true)
    assert.ok(data.progress.q_1.seenAt)
  })
})

test('updateQuestion 拒绝坏 patch，库保持原样', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [{
      id: 'q_1', key: 'k1', stem: '原题干是什么？', nodeId: 'n_1', status: 'ok', flags: [],
      reference: { answer: 'a', points: [] }, source: { file: 'm.md', page: 1, anchor: 'a', hasImage: false },
      tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
    }])
    await assert.rejects(() => store.updateQuestion('q_1', { stem: ' ' }), /invalid stem/)
    await assert.rejects(() => store.updateQuestion('q_1', { reference: null }), /invalid reference/)
    await assert.rejects(() => store.updateQuestion('q_1', { status: 'bogus' }), /unknown status/)
    await assert.rejects(() => store.updateQuestion('q_1', { nodeId: 'n_404' }), /unknown node/)
    const [row] = await readJsonl(store.paths.questions)
    assert.equal(row.stem, '原题干是什么？')
    assert.equal(row.status, 'ok')
    assert.equal(row.reference.answer, 'a')
  })
})

test('改题干会重算指纹并记住旧指纹', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [{
      id: 'q_1', key: 'k1', stem: '原题干是什么？', nodeId: 'n_1', status: 'ok', flags: [],
      reference: { answer: 'a', points: [] }, source: { file: 'm.md', page: 1, anchor: 'a', hasImage: false },
      tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
    }])
    const next = await store.updateQuestion('q_1', { stem: '换了一个更好的题干？' })
    assert.notEqual(next.key, 'k1')
    assert.deepEqual(next.previousKeys, ['k1'])
    assert.equal(next.id, 'q_1')
  })
})
test('updateQuestion 保留身份字段，未知 id 抛错', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [{
      id: 'q_1', key: 'k1', stem: '原题干是什么？', nodeId: 'n_1', status: 'ok', flags: [],
      reference: { answer: 'a', points: [] }, source: { file: 'm.md', page: 1, anchor: 'a', hasImage: false },
      tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
    }])
    await store.updateQuestion('q_1', { tags: ['x'] })
    const [row] = await readJsonl(store.paths.questions)
    assert.equal(row.stem, '原题干是什么？')
    assert.deepEqual(row.tags, ['x'])
    assert.equal(row.id, 'q_1')
    assert.equal(row.key, 'k1')
    assert.equal(row.createdAt, 'T0')
    assert.notEqual(row.updatedAt, 'T0')
    await assert.rejects(() => store.updateQuestion('nope', { stem: 'x' }), /unknown question: nope/)
  })
})

test('updateQuestion 写 related 时把题干解析成题号', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [
      {
        id: 'q_1', key: 'k1', stem: '什么是闭包？', nodeId: 'n_1', status: 'ok', flags: [],
        reference: { answer: 'a', points: [] }, source: { file: 'm.md', page: 1, anchor: 'a', hasImage: false },
        tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
      },
      {
        id: 'q_2', key: 'k2', stem: '什么是作用域？', nodeId: 'n_1', status: 'ok', flags: [],
        reference: { answer: 'b', points: [] }, source: { file: 'm.md', page: 2, anchor: 'b', hasImage: false },
        tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
      },
    ])
    const next = await store.updateQuestion('q_1', { related: { questions: ['什么是作用域？'], deeper: ['为什么？'] } })
    assert.deepEqual(next.related.questions, ['q_2'])
    assert.deepEqual(next.related.deeper, ['为什么？'])
    await assert.rejects(() => store.updateQuestion('q_1', { related: null }), /invalid related/)
  })
})

test('接受待核对题会清掉 flags', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [{
      id: 'q_1', key: 'k1', stem: '什么题？', nodeId: 'n_1', status: 'needs-review', flags: ['missing_answer'],
      reference: { answer: '', points: [] }, source: { file: 'm.md', page: 1, anchor: 'a', hasImage: false },
      tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
    }])
    await store.setStatus('q_1', 'ok')
    const [row] = await readJsonl(store.paths.questions)
    assert.equal(row.status, 'ok')
    assert.deepEqual(row.flags, [])
    await assert.rejects(() => store.setStatus('q_1', 'nonsense'), /unknown status/)
  })
})

test('recordAttempt 追加记录并累计进度', async () => {
  await withStore(async store => {
    await store.recordAttempt({ id: 'a_1', questionId: 'q_1', at: 'T1', kind: 'quiz', grade: { score: 0.5 } })
    await store.recordAttempt({ id: 'a_2', questionId: 'q_1', at: 'T2', kind: 'quiz', grade: { score: 1 } })
    const data = await store.load()
    assert.equal(data.attempts.length, 2)
    assert.equal(data.progress.q_1.attempts, 2)
    assert.equal(data.progress.q_1.lastScore, 1)
    assert.equal(data.progress.q_1.misses, 1)
  })
})

test('upsertTerms 按术语合并', async () => {
  await withStore(async store => {
    await store.upsertTerms([{ term: '闭包', definition: '旧' }])
    await store.upsertTerms([{ term: '闭包', definition: '新' }, { term: '作用域', definition: 'b' }])
    const data = await store.load()
    assert.equal(data.terms.length, 2)
    assert.equal(data.terms.find(t => t.term === '闭包').definition, '新')
  })
})

test('nodeIds 来自知识点树', async () => {
  await withStore(async store => {
    const { meta } = await store.load()
    meta.tree = [{ id: 'n_1' }, { id: 'n_2' }]
    await store.saveMeta(meta)
    assert.deepEqual([...(await store.nodeIds())].sort(), ['n_1', 'n_2'])
  })
})

test('commitInbox 会用 materials 下的同名 txt 做锚定', async () => {
  await withStore(async store => {
    const { meta } = await store.load()
    meta.tree = [{ id: 'n_1', title: '基础', order: 10 }]
    await store.saveMeta(meta)
    await ensureDir(store.paths.materialsDir)
    await ensureDir(store.paths.inboxDir)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(store.paths.materialsDir, 'bank.txt'), '第 3 页 什么是闭包？', 'utf8')
    await writeFile(store.paths.inboxQuestions, `${JSON.stringify({
      stem: '什么是闭包？',
      reference: { answer: '函数与其词法环境', points: [] },
      nodeId: 'n_1',
      source: { file: 'materials/bank.md', page: 3, anchor: '什么是闭包' },
    })}\n`, 'utf8')
    const report = await store.commitInbox()
    assert.equal(report.added, 1)
    const [row] = await readJsonl(store.paths.questions)
    assert.equal(row.status, 'ok')
  })
})
