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
    const { question: next } = await store.updateQuestion('q_1', { stem: '换了一个更好的题干？' })
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
    const { question: next } = await store.updateQuestion('q_1', { related: { questions: ['什么是作用域？'], deeper: ['为什么？'] } })
    assert.deepEqual(next.related.questions, ['q_2'])
    assert.deepEqual(next.related.deeper, ['为什么？'])
    await assert.rejects(() => store.updateQuestion('q_1', { related: null }), /invalid related/)
  })
})

test('只改 related 的一栏时不动另外两栏', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [
      {
        id: 'q_1', key: 'k1', stem: '什么是闭包？', nodeId: 'n_1', status: 'ok', flags: [],
        reference: { answer: 'a', points: [] }, source: { file: 'm.md', page: 1, anchor: 'a', hasImage: false },
        tags: [], related: { questions: ['q_2'], deeper: ['深一'], broader: ['宽一'] }, createdAt: 'T0', updatedAt: 'T0',
      },
      {
        id: 'q_2', key: 'k2', stem: '什么是作用域？', nodeId: 'n_1', status: 'ok', flags: [],
        reference: { answer: 'b', points: [] }, source: { file: 'm.md', page: 2, anchor: 'b', hasImage: false },
        tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
      },
    ])
    const result = await store.updateQuestion('q_1', { related: { deeper: ['深二'] } })
    assert.deepEqual(result.question.related.deeper, ['深二'])
    assert.deepEqual(result.question.related.questions, ['q_2'])
    assert.deepEqual(result.question.related.broader, ['宽一'])
  })
})

test('updateQuestion 报告被丢弃的关联题干', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [
      {
        id: 'q_1', key: 'k1', stem: '什么是闭包？', nodeId: 'n_1', status: 'ok', flags: [],
        reference: { answer: 'a', points: [] }, source: { file: 'm.md', page: 1, anchor: 'a', hasImage: false },
        tags: [], related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
      },
    ])
    const result = await store.updateQuestion('q_1', { related: { questions: ['不存在的题干'], deeper: [], broader: [] } })
    assert.deepEqual(result.question.related.questions, [])
    assert.equal(result.relatedDropped.length, 1)
    assert.match(result.relatedDropped[0], /^related_unresolved:/)
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

test('两次作答累计 attempts 计数', async () => {
  await withStore(async store => {
    await store.createAttempt({ questionId: 'q_1', answer: 'a', kind: 'study' })
    await store.createAttempt({ questionId: 'q_1', answer: 'b', kind: 'quiz' })
    const data = await store.load()
    assert.equal(data.attempts.length, 2)
    assert.equal(data.progress.q_1.attempts, 2)
    assert.equal(data.progress.q_1.lastKind, 'quiz')
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

test('createAttempt 写一行 grade:null，gradeAttempt 写回并升 misses', async () => {
  await withStore(async store => {
    const attempt = await store.createAttempt({ questionId: 'q1', answer: '我的答案', kind: 'study' })
    assert.match(attempt.id, /^a_[0-9a-f]{8}$/)
    assert.equal((await store.getAttempt(attempt.id)).grade, null)

    const graded = await store.gradeAttempt(attempt.id, { covered: ['a'], missed: ['b'], feedback: '再补 b' })
    assert.equal(graded.score, 0.5)
    assert.deepEqual(graded.attempt.grade.covered, ['a'])
    assert.equal(graded.attempt.grade.feedback, '再补 b')
    const progress = (await store.load()).progress
    assert.equal(progress.q1.misses, 1)
    assert.equal(progress.q1.lastScore, 0.5)
  })
})

test('重判不重复累加 misses', async () => {
  await withStore(async store => {
    const attempt = await store.createAttempt({ questionId: 'q1', answer: 'x', kind: 'study' })
    await store.gradeAttempt(attempt.id, { covered: ['a'], missed: ['b'] })
    await store.gradeAttempt(attempt.id, { covered: ['a', 'b'], missed: [] })
    const progress = (await store.load()).progress
    assert.equal(progress.q1.misses, 0)
    assert.equal(progress.q1.lastScore, 1)
  })
})

test('latestAttempt 取同题最近一行', async () => {
  await withStore(async store => {
    const first = await store.createAttempt({ questionId: 'q1', answer: 'a', kind: 'study' })
    const second = await store.createAttempt({ questionId: 'q1', answer: 'b', kind: 'quiz' })
    assert.equal((await store.latestAttempt('q1')).id, second.id)
    assert.notEqual(first.id, second.id)
    assert.equal(await store.latestAttempt('nope'), null)
  })
})

test('setDismissed 与 saveSettings 只动指定键', async () => {
  await withStore(async store => {
    await store.setDismissed('q1', true)
    assert.equal((await store.load()).progress.q1.dismissed, true)
    const before = (await store.load()).meta.settings
    await store.saveSettings({ lastQuizAt: 'T1' })
    const after = (await store.load()).meta.settings
    assert.equal(after.lastQuizAt, 'T1')
    assert.equal(after.leavePromptRate, before.leavePromptRate)
  })
})
test('抽查不会抽到没有要点的题', async () => {
  await withStore(async store => {
    await writeJsonl(store.paths.questions, [{
      id: 'q1', key: 'k1', stem: '没有要点的题', nodeId: 'n_1', status: 'ok', flags: [],
      reference: { answer: 'a', points: [] }, source: { file: 'm.md' }, tags: [],
      related: { questions: [], deeper: [], broader: [] }, createdAt: 'T0', updatedAt: 'T0',
    }])
    const attempt = await store.createAttempt({ questionId: 'q1', answer: 'x', kind: 'study' })
    await store.gradeAttempt(attempt.id, { covered: [], missed: ['a'] })
    const meta = (await store.load()).meta
    meta.settings.leavePromptRate = 1
    meta.settings.quizCooldownMinutes = 0
    await store.saveMeta(meta)
    assert.equal(await store.sampleQuiz(), null)
  })
})
test('setStageStatus 只改目标阶段', async () => {
  await withStore(async store => {
    const { meta } = await store.load()
    meta.plan = [{ id: 'p_1', title: '一', status: 'todo' }, { id: 'p_2', title: '二', status: 'todo' }]
    await store.saveMeta(meta)
    const result = await store.setStageStatus('p_2', 'done')
    assert.equal(result.plan.find(stage => stage.id === 'p_2').status, 'done')
    assert.equal(result.plan.find(stage => stage.id === 'p_1').status, 'todo')
    await assert.rejects(() => store.setStageStatus('p_9', 'done'), /unknown stage/)
    await assert.rejects(() => store.setStageStatus('p_1', 'nope'), /unknown status/)
  })
})
test('saveReport 保留最近 20 份并删掉更旧的文件', async () => {
  await withStore(async store => {
    const { readdir } = await import('node:fs/promises')
    for (let i = 0; i < 21; i += 1) {
      await store.saveReport(`# 报告 ${i}`, `2026-11-16T00:00:${String(i).padStart(2, '0')}.000Z`)
    }
    const files = await readdir(store.paths.reportsDir)
    assert.equal(files.filter(name => name.startsWith('audit-')).length, 20)
    const latest = await store.latestReport()
    assert.ok(latest.markdown.includes('报告 20'))
  })
})

test('latestReport 在报告文件被删后返回 null 而不是抛错', async () => {
  await withStore(async store => {
    await store.saveReport('# 报告', '2026-11-16T00:00:00.000Z')
    const { rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const index = JSON.parse(await (await import('node:fs/promises')).readFile(join(store.paths.reportsDir, 'index.json'), 'utf8'))
    await rm(join(store.paths.reportsDir, index[0].file), { force: true })
    assert.equal(await store.latestReport(), null)
  })
})
test('没有 id 的旧计划：按钮不会写到第一个阶段', async () => {
  await withStore(async store => {
    const { meta } = await store.load()
    meta.plan = [{ title: '一' }, { title: '二' }, { title: '三' }]
    await store.saveMeta(meta)
    const result = await store.setStageStatus('p_2', 'done')
    assert.equal(result.plan[1].status, 'done')
    assert.equal(result.plan[0].status, 'todo')
    assert.equal(result.plan[2].status, 'todo')
    await assert.rejects(() => store.setStageStatus(undefined, 'done'), /unknown stage/)
    await assert.rejects(() => store.setStageStatus('', 'done'), /unknown stage/)
  })
})
test('同一秒内多次写报告不会共用一个文件，索引全部可解析', async () => {
  await withStore(async store => {
    const { readFile, access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    for (let i = 0; i < 21; i += 1) {
      await store.saveReport(`# 报告 ${i}`, '2026-11-16T00:00:00.000Z')
    }
    const index = JSON.parse(await readFile(join(store.paths.reportsDir, 'index.json'), 'utf8'))
    assert.equal(index.length, 20)
    assert.equal(new Set(index.map(entry => entry.file)).size, 20)
    for (const entry of index) {
      await access(join(store.paths.reportsDir, entry.file))
    }
    assert.ok(index[index.length - 1].file.startsWith('audit-20261116-000000'))
  })
})