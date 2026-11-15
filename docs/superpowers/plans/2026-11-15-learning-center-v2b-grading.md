# 判分闭环与错题本实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 题目卡上能作答并立刻由会话里的 AI 按要点批改，卡片显示命中/漏点/说错与（低分时的）优化答案；离开题目时按概率抽查并在弹卡上作答；错题本按漏点次数排序并支持移出；参考答案多一块可选的"补充答案"。

**Architecture:** 面板只写数据（`attempt start` 落一行 `grade: null`），再发一行短消息让 agent 调 `learning_grade`：`open` 取题与答案、`submit` 交判分结果。Host 校验结构、算分、写回同一行并更新 `progress`；面板每 2 秒轮询到判完为止。抽查的抽样、概率与冷却都在 Host 侧算，面板只负责弹卡。

**Tech Stack:** Node 22 ESM、`node --test`、React（宿主模块表）、无构建步骤。

**Spec:** `docs/superpowers/specs/2026-11-15-learning-center-v2b-grading-design.md`

## Global Constraints

- 工作区 `D:\Struggle\Workspace\willper`，包目录 `learning-center/`，分支 `learning-center-v1`。
- 测试命令：`& $NODE --test "test/*.test.js"`，`$NODE` = `C:\Users\15318\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`。
- Host 代码不 import 任何 `@deepseek-ai/*`；Client 半仍是单文件 `client.js`。
- 数值：`score = covered/(covered+missed)`，保留两位小数；命中率 `< 0.6` 时要求 `suggestion`；`supplement` 上限 2000 字；轮询 2 秒、上限 90 秒。
- `covered`/`missed`/`wrong` 允许转述，不要求与 `reference.points` 逐字一致；但必须是非空字符串数组，且 `covered`+`missed` 至少一条。
- 判分幂等：同一条 attempt 重判覆盖旧 `grade`，`progress.misses` 按差值调整。
- 提交前缀沿用 `feat:` / `fix:` / `test:` / `docs:`。

## Review Focus

1. **判分迟到**：提交后立刻切走或刷新，判完的结果回到这题时仍要能看到（`lastAttempt`）。
2. **重判**：同一条 attempt 判两次，`misses` 不能重复累加。
3. **没有要点的题**：提交按钮禁用，不得产生空判分。
4. **抽查冷却**：跳过也要进冷却（`settings.lastQuizAt` 在弹卡时写），否则切一次题弹一次。
5. **补充答案超长 / 不存在**：超 2000 字截断不报错；空时显示补写按钮而不是空白块。

---

### Task 1: 参考答案的补充答案字段

**Files:**
- Modify: `learning-center/src/model.js`
- Modify: `learning-center/src/ingest.js`
- Test: `test/model.test.js`, `test/ingest.test.js`

**Interfaces:**
- Produces: `SUPPLEMENT_LIMIT = 2000`；`validateDraft` 的 `reference.supplement` 保留并截断；`validatePatch` 的 `reference` 分支合并 `supplement`（非字符串抛 `invalid supplement`）。

- [ ] **Step 1: 写失败测试**

```js
test('reference.supplement 保留并截断到 2000 字', () => {
  const r = validateDraft({ ...base(), reference: { answer: 'a', points: [], supplement: '长'.repeat(2100) } }, ctx())
  assert.equal(r.q.reference.supplement.length, 2000)
})

test('validatePatch 合并 supplement 不清掉 answer', () => {
  const next = validatePatch({ reference: { answer: 'a', points: ['p'], supplement: '' } }, { reference: { supplement: '面试里我会这样讲' } }, { nodeIds: new Set(['n_1']) })
  assert.equal(next.reference.supplement, '面试里我会这样讲')
  assert.equal(next.reference.answer, 'a')
})

test('待核对草稿也保留 supplement', async () => {
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [draft({ reference: { answer: 'a', points: [], supplement: '陷阱在这' } })])
    await commitInbox(paths, options())
    const [row] = await readJsonl(paths.questions)
    assert.equal(row.reference.supplement, '陷阱在这')
  })
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/model.test.js`
Expected: FAIL，`supplement` 为 `undefined`。

- [ ] **Step 3: 实现**

`model.js` 里 `validateDraft` 的 `reference` 构造加 `supplement: typeof reference.supplement === 'string' ? reference.supplement.trim().slice(0, SUPPLEMENT_LIMIT) : ''`；`validatePatch` 的 `reference` 分支在合并后同样处理 `supplement`（存在且非字符串时抛 `invalid supplement`）。`ingest.js` 的 `stashRejectedDraft` 也带上 `supplement`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/model.js learning-center/src/ingest.js test/model.test.js test/ingest.test.js
git commit -m "feat: 参考答案增加补充答案字段"
```

---

### Task 2: 判分结果的校验与算分

**Files:**
- Create: `learning-center/src/grading.js`
- Test: `test/grading.test.js`

**Interfaces:**
- Produces:
  - `GRADE_LIMITS = { suggestionBelow: 0.6, textLength: 2000 }`
  - `normalizeGrading(raw): { covered, missed, wrong, feedback, suggestion, score }` —— 三个数组只留非空字符串、去重、每条截到 2000 字；`covered`+`missed` 都空时抛 `empty grading`；`score = round2(covered/(covered+missed))`（都为 0 时 `score = null`，但那种情况已抛错）。
  - `needsSuggestion(score): boolean` —— `score !== null && score < GRADE_LIMITS.suggestionBelow`。

- [ ] **Step 1: 写失败测试**

```js
test('normalizeGrading 算分并规整数组', () => {
  const out = normalizeGrading({ covered: ['函数', '函数'], missed: ['私有化'], wrong: [], feedback: '  ', suggestion: '' })
  assert.equal(out.score, 0.5)
  assert.deepEqual(out.covered, ['函数'])
  assert.equal(out.feedback, '')
})

test('covered 与 missed 都空时拒绝', () => {
  assert.throws(() => normalizeGrading({ covered: [], missed: [] }), /empty grading/)
})

test('needsSuggestion 在低于 0.6 时为真', () => {
  assert.equal(needsSuggestion(0.5), true)
  assert.equal(needsSuggestion(0.6), false)
  assert.equal(needsSuggestion(null), false)
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/grading.test.js`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/grading.js`**

纯函数，不读文件、不依赖 cordis；`round2 = Math.round(x * 100) / 100`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/grading.test.js`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/grading.js test/grading.test.js
git commit -m "feat: 判分结果校验与算分"
```

---

### Task 3: 作答记录的创建、判分与幂等

**Files:**
- Modify: `learning-center/src/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: Task 2 的 `normalizeGrading`。
- Produces（`createStore` 新增方法）：
  - `createAttempt({ questionId, answer, kind })` → `{ id, questionId, at, kind, answer, grade: null }`（id 形如 `a_1a2b3c4d`，由 `sha1(questionId + at + answer)` 取前 8 位）
  - `getAttempt(id)` → 行或 `null`
  - `gradeAttempt(id, rawGrading)` → `{ attempt, score, misses }`；写回同一行，`progress` 的 `misses` 按差值调整，`lastScore` 取新分
  - `latestAttempt(questionId)` → 最近一行或 `null`
  - `setDismissed(questionId, on)` / `loadSettings()` / `saveSettings(patch)`（`saveSettings` 只合并传入的键）
- 删除未被调用的 `recordAttempt`。

- [ ] **Step 1: 写失败测试**

```js
test('createAttempt 写一行 grade:null，gradeAttempt 写回并升 misses', async () => {
  await withStore(async store => {
    const attempt = await store.createAttempt({ questionId: 'q1', answer: '我的答案', kind: 'study' })
    assert.match(attempt.id, /^a_[0-9a-f]{8}$/)
    assert.equal((await store.getAttempt(attempt.id)).grade, null)

    const graded = await store.gradeAttempt(attempt.id, { covered: ['a'], missed: ['b'], feedback: '再补 b' })
    assert.equal(graded.score, 0.5)
    assert.deepEqual(graded.attempt.grade.covered, ['a'])
    const progress = await readJson(store.paths.progress, {})
    assert.equal(progress.q1.misses, 1)
  })
})

test('重判不重复累加 misses', async () => {
  await withStore(async store => {
    const attempt = await store.createAttempt({ questionId: 'q1', answer: 'x', kind: 'study' })
    await store.gradeAttempt(attempt.id, { covered: ['a'], missed: ['b'] })
    await store.gradeAttempt(attempt.id, { covered: ['a', 'b'], missed: [] })
    const progress = await readJson(store.paths.progress, {})
    assert.equal(progress.q1.misses, 0)
    assert.equal(progress.q1.lastScore, 1)
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
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/store.test.js`
Expected: FAIL，`store.createAttempt is not a function`。

- [ ] **Step 3: 实现**

`gradeAttempt` 先 `normalizeGrading(rawGrading)`，再按旧 `grade.score` 与新的做差值；`misses = max(0, old + (old<1? -1:0) + (new<1? +1:0))`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/store.js test/store.test.js
git commit -m "feat: 作答记录创建、判分写回与幂等"
```

---

### Task 4: 题卡的最近一次判分与错题本视图

**Files:**
- Modify: `learning-center/src/views.js`
- Test: `test/views.test.js`

**Interfaces:**
- Produces:
  - `questionView(questions, terms, id, progress = {}, attempts = [])` —— 返回值多 `lastAttempt: { id, at, kind, grade } | null`（同题最近一行）。
  - `weakView(questions, progress)` → `{ items: [{ id, stem, nodeId, misses, lastScore, lastAttemptAt, dismissed }] }` —— 只含 `misses > 0 && !dismissed`，按 `misses` 降序、再按 `lastAttemptAt` 降序。

- [ ] **Step 1: 写失败测试**

```js
test('题卡带最近一次作答，错题本按漏点排序', () => {
  const questions = [q('q1'), q('q2')]
  const progress = { q1: { misses: 2, lastScore: 0.5 }, q2: { misses: 3, lastScore: 0.4 }, q3: { misses: 1 } }
  const card = questionView(questions, [], 'q1', progress, [
    { id: 'a1', questionId: 'q1', at: 'T1', kind: 'study', grade: { score: 1 } },
    { id: 'a2', questionId: 'q1', at: 'T2', kind: 'quiz', grade: { score: 0.5 } },
  ])
  assert.equal(card.lastAttempt.id, 'a2')
  const weak = weakView(questions, progress)
  assert.deepEqual(weak.items.map(item => item.id), ['q2', 'q1'])
})

test('移出的错题不出现在错题本', () => {
  const weak = weakView([q('q1')], { q1: { misses: 2, dismissed: true } })
  assert.deepEqual(weak.items, [])
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/views.test.js`
Expected: FAIL，`lastAttempt` 为 undefined、`weakView` 未定义。

- [ ] **Step 3: 实现**

`weakView` 不看 `status`：答过的待核对题也进错题本（人已经在学它了）。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/views.test.js`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/views.js test/views.test.js
git commit -m "feat: 题卡最近判分与错题本视图"
```

---

### Task 5: 路由新增作答、错题本、抽查与设置

**Files:**
- Modify: `learning-center/src/route.js`
- Modify: `learning-center/src/store.js`（`sampleQuiz`）
- Test: `test/route.test.js`

**Interfaces:**
- Consumes: Task 3 的 store 方法、Task 4 的 `weakView`。
- Produces（新 op）：
  - `attempt` `{ action: 'start', questionId, answer, kind }` → `{ attemptId }`；`answer` 为空串时 400 `empty answer`
  - `attempt` `{ action: 'get', attemptId }` → `{ attempt }`（不存在 404）
  - `weak` `{}` → `{ items }`
  - `setDismissed` `{ questionId, on }` → `{ ok }`
  - `quiz` `{}` → `{ question: card | null }`——按 `settings.leavePromptRate` 概率、`quizCooldownMinutes` 冷却决定是否抽；抽中时**先写** `settings.lastQuizAt` 再返回卡片（卡片来自 `weakView` 前 10 条的随机一条）
- store 新增 `sampleQuiz(now = new Date().toISOString())`：内部读 settings、判概率与冷却、选一条、更新 `lastQuizAt`，返回 `{ id, stem } | null`。

- [ ] **Step 1: 写失败测试**

```js
test('attempt start 落盘、get 取回', async () => {
  await withApi(async ({ handler }) => {
    const start = await callApi(handler, { op: 'attempt', sessionId: 's1', params: { action: 'start', questionId: 'q1', answer: '我的答案', kind: 'study' } })
    assert.equal(start.status, 200)
    const got = await callApi(handler, { op: 'attempt', sessionId: 's1', params: { action: 'get', attemptId: start.body.attemptId } })
    assert.equal(got.body.attempt.answer, '我的答案')
    assert.equal(got.body.attempt.grade, null)
  })
})

test('空答案是 400', async () => {
  await withApi(async ({ handler }) => {
    const r = await callApi(handler, { op: 'attempt', sessionId: 's1', params: { action: 'start', questionId: 'q1', answer: '   ', kind: 'study' } })
    assert.equal(r.status, 400)
  })
})

test('quiz 在冷却内不抽，过期后抽中并写下 lastQuizAt', async () => {
  await withApi(async ({ handler, store }) => {
    const [row] = await readJsonl(store.paths.questions)
    // 先造一条已读且漏过点的题
    await store.setFavorite(row.id, false)
    await store.gradeAttempt((await store.createAttempt({ questionId: row.id, answer: 'x', kind: 'study' })).id, { covered: [], missed: ['a'] })
    const meta = (await store.load()).meta
    meta.settings.leavePromptRate = 1
    meta.settings.quizCooldownMinutes = 10
    meta.settings.lastQuizAt = new Date().toISOString()
    await store.saveMeta(meta)

    const cooled = await callApi(handler, { op: 'quiz', sessionId: 's1' })
    assert.equal(cooled.body.question, null)

    const meta2 = (await store.load()).meta
    meta2.settings.lastQuizAt = '2000-01-01T00:00:00.000Z'
    await store.saveMeta(meta2)

    const hit = await callApi(handler, { op: 'quiz', sessionId: 's1' })
    assert.equal(hit.body.question.id, row.id)
    assert.notEqual((await store.load()).meta.settings.lastQuizAt, '2000-01-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/route.test.js`
Expected: FAIL，`unknown op`。

- [ ] **Step 3: 实现**

`dispatch` 加五个 case；`quiz` 直接返回 `{ question: await store.sampleQuiz() }`。概率用 `Math.random() < rate`，只用来决定"抽不抽"，不参与选哪条。**同时改 `question` op**：把 `store.load()` 的 `attempts` 传给 `questionView(questions, terms, id, progress, attempts)`，否则题卡拿不到 `lastAttempt`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/route.js learning-center/src/store.js test/route.test.js
git commit -m "feat: 作答、错题本与抽查路由"
```

---

### Task 6: 判分工具与导入说明

**Files:**
- Modify: `learning-center/src/tools.js`
- Test: `test/tools.test.js`

**Interfaces:**
- Consumes: Task 3 的 `createStore` 方法、Task 2 的 `needsSuggestion`。
- Produces: 新工具 `learning_grade`：
  - `{ action: 'open', attemptId }` → `{ question: { id, stem, answer, points, supplement }, attempt: { id, kind, answer, at } }`
  - `{ action: 'submit', attemptId, covered?, missed?, wrong?, feedback?, suggestion? }` → `{ ok, score, misses, needsSuggestion }`
- `learning_import brief` 的说明里新增 `supplement` 要求。

- [ ] **Step 1: 写失败测试**

```js
test('learning_grade open 给题目与答案，submit 写回并算分', async () => {
  await wire(async ({ tools, store }) => {
    // 先放一行 q1（有 points ['a','b']）
    const attempt = await store.createAttempt({ questionId: 'q1', answer: '我答了 a', kind: 'study' })
    const open = await call(tools.learning_grade, { action: 'open', attemptId: attempt.id })
    assert.deepEqual(open.question.points, ['a', 'b'])
    assert.equal(open.attempt.answer, '我答了 a')
    const submit = await call(tools.learning_grade, { action: 'submit', attemptId: attempt.id, covered: ['a'], missed: ['b'] })
    assert.equal(submit.score, 0.5)
    assert.equal(submit.needsSuggestion, true)
  })
})

test('brief 要求写补充答案', async () => {
  const r = await call(tools.learning_import, { action: 'brief' })
  assert.ok(r.instructions.includes('supplement'))
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/tools.test.js`
Expected: FAIL，`learning_grade` 不存在。

- [ ] **Step 3: 实现**

工具输出 `schema` 用宽松对象；`submit` 的渲染行写 `命中 ${score}`。brief 里加一句：写标准答案时补一段 `supplement`（面试里你会怎么讲 / 这道题的陷阱），没有就留空。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/tools.js test/tools.test.js
git commit -m "feat: learning_grade 工具与补充答案导入说明"
```

---

### Task 7: 面板答题框、提交、轮询与结果

**Files:**
- Modify: `learning-center/client.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: 路由 `attempt`、`question` 的 `lastAttempt`。
- Produces:
  - `GradeBlock({ attempt, t })` —— 纯组件，按 `attempt.grade` 渲染命中/漏点/说错/反馈，`score < 0.6` 且有 `suggestion` 时多一块「优化版本的答案」。
  - `canSubmit(card)` —— 有 `reference.points` 且非空才为真（没有要点就没法按要点判分，按钮禁用）。

- [ ] **Step 1: 写失败测试**

```js
test('判分结果块：低分带优化答案，高分不带', async () => {
  const { module } = await loadClient()
  const Block = module.__test.GradeBlock
  const low = Block({ attempt: { grade: { covered: ['a'], missed: ['b'], wrong: ['x'], feedback: '再补 b', suggestion: '更好：……', score: 0.5 } }, t: key => key })
  const text = JSON.stringify(low)
  assert.ok(text.includes('再补 b'))
  assert.ok(text.includes('更好：……'))
  const high = Block({ attempt: { grade: { covered: ['a'], missed: [], wrong: [], feedback: '好', suggestion: '', score: 1 } }, t: key => key })
  assert.ok(!JSON.stringify(high).includes('更好：……'))
})

test('没有要点的题不能提交', async () => {
  const { module } = await loadClient()
  const canSubmit = module.__test.canSubmit
  assert.equal(canSubmit({ reference: { answer: 'a', points: [] } }), false)
  assert.equal(canSubmit({ reference: { answer: 'a', points: ['p'] } }), true)
  assert.equal(canSubmit({ reference: { answer: 'a' } }), false)
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/client.test.js`
Expected: FAIL，`GradeBlock` 不存在。

- [ ] **Step 3: 实现**

`Panel` 里加：答题框 `answer` 状态（按卡片重置）、`submitAnswer`（`attempt start` → `prompt` 一行 → 每 2 秒 `attempt get`，最多 45 次）、`grading` 状态（`'idle'|'waiting'|'done'|'timeout'`）、打开卡片时用 `lastAttempt` 预填结果；`reference.points` 为空时禁用提交并显示说明；参考答案区在标准答案下面加「补充答案」块与「让 AI 补这段补充答案」按钮（走 `prompt`）。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"` 和 `& $NODE scripts/check-package.mjs`
Expected: 全绿 + 包检查通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/client.js test/client.test.js
git commit -m "feat: 面板答题、提交判分与补充答案"
```

---

### Task 8: 抽查弹卡与错题本页

**Files:**
- Modify: `learning-center/client.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: 路由 `quiz`、`weak`、`setDismissed`。
- Produces: `QuizModal({ card, t, onSubmit, onSkip, onMute })` —— 弹卡内部自带答题框与「提交并批改」「跳过」「本轮不再提醒」；`WeakList({ items, t, onOpen, onDismiss })` —— 错题本行「再答一次 / 移出」。

- [ ] **Step 1: 写失败测试**

```js
test('抽查弹卡有答题框与三个动作', async () => {
  const { module } = await loadClient()
  const Modal = module.__test.QuizModal
  const calls = []
  const tree = Modal({ card: { id: 'q1', stem: '题干' }, t: key => key, onSubmit: text => calls.push(['submit', text]), onSkip: () => calls.push(['skip']), onMute: () => calls.push(['mute']) })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('题干'))
  const buttons = []
  const walk = node => { /* 同 v2a 的数组摊平遍历 */ }
  walk(tree)
  assert.equal(buttons.length, 3)
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/client.test.js`
Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现**

切题/切页签时先调 `quiz`；返回卡片就弹 `QuizModal`；提交走与 Task 7 相同的提交链路（`kind: 'quiz'`），判分结果显示在弹卡里；「跳过」直接关，「本轮不再提醒」把本次会话的 `revisitMuted` 置真。第四个页签「错题」渲染 `WeakList`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"` 和 `& $NODE scripts/check-package.mjs`
Expected: 全绿 + 包检查通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/client.js test/client.test.js
git commit -m "feat: 抽查弹卡与错题本页"
```

---

### Task 9: 装进宿主走一遍

**Files:**
- Modify: `docs/notes/v1-acceptance.md`（追加 v2b 一节）

- [ ] **Step 1: 重载插件行**

`plugin_manager` `set_plugin` → `include:learning-center` 关、再开；页面 Ctrl+R。

- [ ] **Step 2: 走一遍主线**

过一道有要点的题：写答案 → 提交 → 等「批改中」变结果；再答一次看 misses 累加；把 `leavePromptRate` 改成 1、`quizCooldownMinutes` 改成 0，切题看抽查弹卡并就地作答；进错题本移出一条；找一道没有 `supplement` 的题点补写。

- [ ] **Step 3: 记录并提交**

把结果写进 `docs/notes/v1-acceptance.md`，未达标的列为遗留。

```bash
git add docs/notes/v1-acceptance.md
git commit -m "docs: v2b 验收记录"
```
