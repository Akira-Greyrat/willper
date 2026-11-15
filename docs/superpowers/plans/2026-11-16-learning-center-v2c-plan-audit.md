# 阶段计划页与题库体检实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面板多两个页签：计划页按顺序显示 AI 写好的阶段、能切每个阶段的状态；体检页显示 AI 最近一次出的题库体检报告，并能再次触发。

**Architecture:** 阶段 id 与状态默认值由 Host 在 `learning_plan set_plan` 写入时规整，面板只按 id 改状态。体检分两步：`learning_audit brief` 返回 Host 算好的有上限摘要与写作要求，`write` 把 markdown 落到 `reports/` 并维护一份最多 20 条的索引。

**Tech Stack:** Node 22 ESM、`node --test`、React（宿主模块表）、无构建步骤。

**Spec:** `docs/superpowers/specs/2026-11-16-learning-center-v2c-plan-audit-design.md`

## Global Constraints

- 工作区 `D:\Struggle\Workspace\willper`，包目录 `learning-center/`，分支 `learning-center-v1`。
- 测试命令：`& $NODE --test "test/*.test.js"`，`$NODE` = `C:\Users\15318\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`。
- Host 代码不 import 任何 `@deepseek-ai/*`；Client 半仍是单文件 `client.js`。
- 阶段状态枚举：`todo` / `doing` / `done`，默认 `todo`；阶段 id 形如 `p_1`。
- 报告文件名 `audit-<yyyyMMdd-HHmmss>.md`；索引最多 20 条，超了删最旧的**文件与索引项**。
- 体检摘要上限：知识点最多 20 个、待核对最多 40 条、其余各类最多 20 条，超出写"还有 N 条，见 learning/questions.jsonl"。
- 新增工具后工具总数从 5 变 6：要同步 `scripts/check-package.mjs`、`test/tools.test.js`、`test/apply.test.js` 三处。
- 提交前缀沿用 `feat:` / `fix:` / `test:` / `docs:`。

## Review Focus

1. **AI 写的计划没有 id**：`set_plan` 必须补 id、去重、补默认状态，否则状态按钮对真实计划永久失效。
2. **形状不一致**：`reading` / `project` 既可能是对象也可能是字符串，面板两种都要渲染出来，不能显示空白。
3. **重写计划**：AI 重写后 id 变化时，旧进度不串到别的阶段上（宁可回到未开始，也不能错位）。
4. **索引与文件不同步**：删旧报告时先删文件再删索引项，任何一步失败都不能让索引指向不存在的文件。
5. **体检摘要不是全量**：超过上限时必须明确写"还有 N 条"，否则模型会以为题库只有这些。

---

### Task 1: 计划文档规整（id、状态、去重）

**Files:**
- Create: `learning-center/src/plan.js`
- Test: `test/plan.test.js`

**Interfaces:**
- Produces: `PLAN_STATUSES = ['todo', 'doing', 'done']`；`normalizePlan(input): object[]` —— 数组元素是对象才保留；缺 `id` 补 `p_<序号>`（序号从 1 起、按最终顺序）；重复 id 重新编号；`status` 不在枚举里落回 `todo`；其它字段原样保留。

- [ ] **Step 1: 写失败测试**

```js
import { normalizePlan } from '../learning-center/src/plan.js'

test('缺 id 的阶段按顺序补齐，状态默认 todo', () => {
  const out = normalizePlan([{ title: '一' }, { title: '二' }])
  assert.deepEqual(out.map(stage => stage.id), ['p_1', 'p_2'])
  assert.deepEqual(out.map(stage => stage.status), ['todo', 'todo'])
})

test('保留已有的合法 id 与状态', () => {
  const out = normalizePlan([{ id: 'p_9', title: '一', status: 'doing' }])
  assert.equal(out[0].id, 'p_9')
  assert.equal(out[0].status, 'doing')
})

test('重复 id 重新编号，坏状态落回 todo', () => {
  const out = normalizePlan([{ id: 'p_1', status: 'nope' }, { id: 'p_1' }])
  assert.deepEqual(out.map(stage => stage.id), ['p_1', 'p_2'])
  assert.equal(out[0].status, 'todo')
})

test('非数组与非对象元素被丢掉', () => {
  assert.deepEqual(normalizePlan(null), [])
  assert.deepEqual(normalizePlan(['x', { title: '一' }]).length, 1)
})

test('AI 重写计划换了 id 时，旧进度不会串到别的阶段', () => {
  // 原来 p_1 已完成；新计划只给了一个未编号的阶段
  const out = normalizePlan([{ title: '换了一个阶段' }])
  assert.deepEqual(out.map(stage => stage.id), ['p_1'])
  assert.equal(out[0].status, 'todo')
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/plan.test.js`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/plan.js`**

纯函数；不改传入数组，返回新数组。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/plan.test.js`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/plan.js test/plan.test.js
git commit -m "feat: 阶段计划文档规整"
```

---

### Task 2: `set_plan` 走规整，工具说明写清形状

**Files:**
- Modify: `learning-center/src/tools.js`
- Test: `test/tools.test.js`

**Interfaces:**
- Consumes: Task 1 的 `normalizePlan`。
- Produces: `learning_plan set_plan` 写入规整后的数组；工具 `description`/`plan` 参数说明里给出阶段形状与枚举。

- [ ] **Step 1: 加失败测试**

```js
test('set_plan 写入时补齐阶段 id 与默认状态', async () => {
  await wire(async ({ tools, store }) => {
    const result = await call(tools.learning_plan, { action: 'set_plan', plan: [{ title: '一' }, { title: '二' }] })
    assert.equal(result.stageCount, 2)
    const plan = (await store.load()).meta.plan
    assert.deepEqual(plan.map(stage => stage.id), ['p_1', 'p_2'])
    assert.deepEqual(plan.map(stage => stage.status), ['todo', 'todo'])
  })
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/tools.test.js`
Expected: FAIL，`plan` 里没有 `id`。

- [ ] **Step 3: 实现**

`set_plan` 分支改成 `meta.plan = normalizePlan(args.plan)`；`learning_plan` 的 description 与 `plan` 参数说明补一句形状：`{ id?, title, nodeIds?, reading?: [{file, section?, pages?}], prereqs?, perspectives?, project?: {title, deliverable?}, checkpoints?, status? }`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/tools.js test/tools.test.js
git commit -m "feat: 写计划时规整阶段形状"
```

---

### Task 3: 阶段状态与计划视图

**Files:**
- Modify: `learning-center/src/store.js`
- Modify: `learning-center/src/views.js`（追加 `planView`）
- Test: `test/store.test.js`, `test/views.test.js`

**Interfaces:**
- Produces:
  - `store.setStageStatus(stageId, status)` → `{ plan }`；未知阶段抛 `unknown stage: <id>`；非法状态抛 `unknown status: <s>`。
  - `planView(meta)` → `{ stages: [{ id, title, status, nodeTitles, reading, prereqs, perspectives, project, checkpoints }] }`；`nodeTitles` 由 `meta.tree` 解析；`reading` / `project` 原样透出（渲染兼容交给面板）。

- [ ] **Step 1: 写失败测试**

```js
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

test('planView 把知识点 id 换成标题', () => {
  const view = planView({ tree: [{ id: 'n_1', title: '基础' }], plan: [{ id: 'p_1', title: '一', nodeIds: ['n_1', 'gone'], reading: '第 3 节', project: '写个计数器' }] })
  assert.deepEqual(view.stages[0].nodeTitles, ['基础'])
  assert.equal(view.stages[0].reading, '第 3 节')
  assert.equal(view.stages[0].status, 'todo')
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/store.test.js`
Expected: FAIL，`setStageStatus` 不存在。

- [ ] **Step 3: 实现**

`setStageStatus` 读 meta、找 index、校验、写回；`planView` 纯函数，缺字段给空值（`[]` / `''` / `null`）。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/store.js learning-center/src/views.js test/store.test.js test/views.test.js
git commit -m "feat: 阶段状态写入与计划视图"
```

---

### Task 4: 体检摘要与报告落盘

**Files:**
- Create: `learning-center/src/audit.js`
- Modify: `learning-center/src/store.js`
- Test: `test/audit.test.js`, `test/store.test.js`

**Interfaces:**
- Produces:
  - `auditDigest({ meta, questions, materials }): { nodes: [{id,title,count}], needsReview: [{id,flags}], duplicates: string[], orphans: string[], missingAnswer: string[], overflow: { nodes: number, needsReview: number, others: number } }` —— 纯函数；上限见 Global Constraints；按 id 排序保证稳定。
  - `store.saveReport(markdown, at?)` → `{ at, file }`：写 `reports/audit-<yyyyMMdd-HHmmss>.md`，维护 `reports/index.json`（按 `at` 升序），超过 20 条时**先删文件再删索引项**。
  - `store.latestReport()` → `{ at, markdown } | null`（索引缺失或文件被删时返回 null）。

- [ ] **Step 1: 写失败测试**

```js
test('auditDigest 覆盖整个题库并封顶', () => {
  const questions = [
    { id: 'q1', nodeId: 'n_1', status: 'ok', flags: [] },
    { id: 'q2', nodeId: 'n_1', status: 'needs-review', flags: ['missing_answer'] },
    { id: 'q3', nodeId: 'n_2', status: 'needs-review', flags: ['orphaned'] },
    { id: 'q4', nodeId: 'n_1', status: 'ok', flags: ['duplicate_of:q1'] },
  ]
  const digest = auditDigest({ meta: { tree: [{ id: 'n_1', title: '基础' }] }, questions, materials: ['materials/a.md'] })
  assert.equal(digest.nodes.find(node => node.id === 'n_1').count, 3)
  assert.deepEqual(digest.needsReview.map(item => item.id), ['q2'])
  assert.deepEqual(digest.duplicates, ['q4'])
  assert.deepEqual(digest.orphans, ['q3'])
  assert.deepEqual(digest.missingAnswer, ['q2'])
})

test('超过上限时报告剩余条数，不假装题库只有这些', () => {
  const questions = Array.from({ length: 30 }, (_, index) => ({ id: `q${index}`, nodeId: 'n_1', status: 'ok', flags: ['duplicate_of:q0'] }))
  const digest = auditDigest({ meta: { tree: [{ id: 'n_1', title: '基础' }] }, questions, materials: [] })
  assert.equal(digest.duplicates.length, 20)
  assert.equal(digest.overflow.others, 10)
})

test('saveReport 保留最近 20 份并删掉更旧的文件', async () => {
  await withStore(async store => {
    for (let i = 0; i < 21; i += 1) {
      await store.saveReport(`# 报告 ${i}`, `2026-11-16T00:00:${String(i).padStart(2, '0')}.000Z`)
    }
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(store.paths.reportsDir)
    assert.equal(files.filter(name => name.startsWith('audit-')).length, 20)
    const latest = await store.latestReport()
    assert.ok(latest.markdown.includes('报告 20'))
  })
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/audit.test.js`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`auditDigest` 不读文件；`saveReport` 用 `readJson(index, [])`，按需 `ensureDir(reportsDir)`；删旧时先 `rm(file)` 再写索引。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/audit.js learning-center/src/store.js test/audit.test.js test/store.test.js
git commit -m "feat: 体检摘要与报告落盘"
```

---

### Task 5: 体检工具与两个路由 op

**Files:**
- Modify: `learning-center/src/tools.js`
- Modify: `learning-center/src/route.js`
- Test: `test/tools.test.js`, `test/route.test.js`

**Interfaces:**
- Consumes: Task 3 的 `setStageStatus`、Task 4 的 `auditDigest` / `saveReport` / `latestReport`、`planView`。
- Produces:
  - 工具 `learning_audit` `{ action: 'brief' }` → `{ instructions, digest, files: { questions: 'learning/questions.jsonl', reports: 'learning/reports/' } }`；`{ action: 'write', markdown }` → `{ at, file }`（markdown 为空串时抛 `empty report`）。
  - 路由 op `setStageStatus` `{ stageId, status }` → `{ ok, plan }`；`report` `{}` → `{ at, markdown } | null`。
  - 工具总数变为 6，同步三处计数断言。

- [ ] **Step 1: 写失败测试**

```js
test('learning_audit brief 给出摘要与文件路径', async () => {
  const r = await call(tools.learning_audit, { action: 'brief' })
  assert.ok(r.instructions.includes('下一步三件事'))
  assert.ok(Array.isArray(r.digest.nodes))
  assert.ok(r.files.questions.endsWith('questions.jsonl'))
})

test('learning_audit write 落盘，report op 取回', async () => {
  await wire(async ({ tools, store }) => {
    const written = await call(tools.learning_audit, { action: 'write', markdown: '# 体检\n覆盖缺口 2 个' })
    assert.ok(written.file.startsWith('audit-'))
    assert.equal((await store.latestReport()).markdown.includes('覆盖缺口'), true)
  })
})

test('setStageStatus 改状态，未知阶段 400', async () => {
  await withApi(async ({ handler, store }) => {
    const { meta } = await store.load()
    meta.plan = [{ id: 'p_1', title: '一', status: 'todo' }, { id: 'p_2', title: '二', status: 'todo' }]
    await store.saveMeta(meta)
    const ok = await callApi(handler, { op: 'setStageStatus', sessionId: 's1', params: { stageId: 'p_2', status: 'done' } })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.plan.find(stage => stage.id === 'p_2').status, 'done')
    const bad = await callApi(handler, { op: 'setStageStatus', sessionId: 's1', params: { stageId: 'p_9', status: 'done' } })
    assert.equal(bad.status, 400)
  })
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/tools.test.js`
Expected: FAIL，`learning_audit` 不存在。

- [ ] **Step 3: 实现**

`learning_audit brief` 读 `store.load()` 与材料目录，`auditDigest` 算摘要；`write` 调 `saveReport`。路由加两个 case。三处工具计数改成 6。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"` 和 `& $NODE scripts/check-package.mjs`
Expected: 全绿；包检查通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/tools.js learning-center/src/route.js test/tools.test.js test/route.test.js scripts/check-package.mjs test/apply.test.js
git commit -m "feat: 体检工具与计划/报告路由"
```

---

### Task 6: 计划页与体检页

**Files:**
- Modify: `learning-center/client.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: 路由 `setStageStatus`、`report`，`meta`/`tree` 已有。
- Produces:
  - `PlanList({ stages, t, onStatus, onAsk })` —— 每阶段显示标题、三个状态按钮（当前高亮）、知识点、该读、要补、实践项目、自查清单；空数组时渲染 `planEmpty` 与「让 AI 写阶段计划」按钮。
  - `ReportPane({ report, t, onAsk })` —— 有报告显示时间与正文（`pre-wrap`），没有时显示 `reportEmpty` 与按钮。

- [ ] **Step 1: 写失败测试**

```js
test('计划页显示阶段与状态按钮，空时为引导', async () => {
  const { module } = await loadClient()
  const List = module.__test.PlanList
  const asked = []
  const tree = List({ stages: [{ id: 'p_1', title: '第一阶段', status: 'doing', nodeTitles: ['基础'], checkpoints: ['能讲清'], project: { title: '写个计数器', deliverable: '一个脚本' } }], t: key => key, onStatus() {}, onAsk: text => asked.push(text) })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('第一阶段'))
  assert.ok(text.includes('基础'))
  assert.ok(text.includes('写个计数器'))
  const empty = List({ stages: [], t: key => key, onStatus() {}, onAsk: () => {} })
  assert.ok(JSON.stringify(empty).includes('planEmpty'))
})

test('体检页无报告时给按钮，有报告时显示正文', async () => {
  const { module } = await loadClient()
  const Pane = module.__test.ReportPane
  const empty = Pane({ report: null, t: key => key, onAsk() {} })
  assert.ok(JSON.stringify(empty).includes('reportEmpty'))
  const filled = Pane({ report: { at: '2026-11-16T00:00:00.000Z', markdown: '覆盖缺口 2 个' }, t: key => key, onAsk() {} })
  assert.ok(JSON.stringify(filled).includes('覆盖缺口 2 个'))
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/client.test.js`
Expected: FAIL，`PlanList` 不存在。

- [ ] **Step 3: 实现**

页签加 `plan` 与 `report`；切到这两个页签时分别拉 `meta`（计划已随 meta 返回）与 `report`；状态按钮调 `setStageStatus` 后重拉 meta；两个 CTA 用 `ask` 发指令（计划：要求按形状写 `p_1..`/状态 todo；体检：要求 `learning_audit brief` → 写报告 → `write`）。`reading` 与 `project` 的字符串/对象两种形状都要渲染。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test "test/*.test.js"` 和 `& $NODE scripts/check-package.mjs`
Expected: 全绿；包检查通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/client.js test/client.test.js
git commit -m "feat: 计划页与体检页"
```

---

### Task 7: 装进宿主验收

**Files:**
- Modify: `docs/notes/v1-acceptance.md`（追加 v2c 一节）

- [ ] **Step 1: 重载插件行**

`plugin_manager` `set_plugin` → `include:learning-center` 关、再开；页面 Ctrl+R。

- [ ] **Step 2: 走一遍**

用真实数据：让 AI 用 `learning_plan set_plan` 写一份两阶段计划（不带 id）→ 打开计划页应看到 `p_1/p_2` 与状态按钮；切状态后刷新仍在。点体检按钮 → 等 AI 写完 → 体检页出现报告与时间；再点一次 → 有两份、显示最新。

- [ ] **Step 3: 记录并提交**

把结果写进 `docs/notes/v1-acceptance.md`，未达标的列为遗留。

```bash
git add docs/notes/v1-acceptance.md
git commit -m "docs: v2c 验收记录"
```
