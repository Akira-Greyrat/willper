# 问题串（关联 / 往深 / 往宽）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每道题旁边能显示三组可点内容：题库里的关联题（点了换卡）、往深与往宽的问题（点了发进当前会话）；老题没有这些时给一个"让 AI 补"的入口。

**Architecture:** 关联数据在导入时由 AI 写进草稿，Host 按"归一化题干 → 题号"在整批写库之后解析，解析不到只丢那一条并记原因；面板只读解析后的结果。深/广是自由文本，点了走 v1 已有的 `prompt` 路由。

**Tech Stack:** Node 22 ESM、`node --test`、React（宿主模块表）、无构建步骤。

**Spec:** `docs/superpowers/specs/2026-11-14-learning-center-v2a-related-design.md`

## Global Constraints

- 工作区：`D:\Struggle\Workspace\willper`，包目录 `learning-center/`，分支 `learning-center-v1`（v2 继续在这个分支上做，PR 未合并）。
- 测试命令：`& $NODE --test "test/*.test.js"`，`$NODE` = `C:\Users\15318\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`。
- Host 代码不 import 任何 `@deepseek-ai/*`；Client 半仍是单文件 `client.js`。
- 约束值：每组最多 3 条；`deeper`/`broader` 每条最多 120 字；`related.questions` 里存的是**题干原文**，写入库后必须换成题号。
- 任何一条不过都只丢那一条，不让整题失败；原因写进 `commitInbox` 的 `reasons`。
- 提交前缀沿用 `feat:` / `fix:` / `test:`。

## Review Focus

1. **同批新题互相引用**：解析必须发生在整批题目写库之后，否则解析不到同批的题（它们的 id 此刻才存在）。
2. **题干撞车**：两道题归一化题干相同时按库里第一个匹配，并记 `related_ambiguous:<题干前 20 字>`，不静默取任意一个。
3. **超长/超量**：6 条 `deeper` 只留 3 条，200 字的截到 120，不报错也不让整题失败。
4. **老数据三组全空**：面板显示"补漏"按钮而不是空白或崩溃。
5. **关联目标消失**：点的关联题后来被驳回/变孤儿，`question` 返回 null 时卡片不能变白，要给一句提示。

---

### Task 1: 关联网的归一化与解析

**Files:**
- Create: `learning-center/src/related.js`
- Test: `test/related.test.js`

**Interfaces:**
- Produces:
  - `RELATED_LIMITS = { perList: 3, textLength: 120 }`
  - `normalizeRelated(raw): { questions: string[], deeper: string[], broader: string[] }` —— 只收字符串，trim、去空、去重，每组截到 3 条，`deeper`/`broader` 每条截到 120 字。
  - `resolveRelatedIds(questions, stems): { ids: string[], missing: string[], ambiguous: string[] }` —— `questions` 是题库数组（元素有 `id`、`stem`），`stems` 是题干数组；按 `normalizeStem` 建表，重复题干记 ambiguous。

- [ ] **Step 1: 写失败测试**

```js
import { normalizeRelated, resolveRelatedIds } from '../learning-center/src/related.js'

test('normalizeRelated 截量截长并去重', () => {
  const raw = { questions: ['甲', '甲', ' ', '乙'], deeper: Array.from({ length: 6 }, (_, i) => `问题${i}`), broader: ['长'.repeat(200)] }
  const out = normalizeRelated(raw)
  assert.deepEqual(out.questions, ['甲', '乙'])
  assert.equal(out.deeper.length, 3)
  assert.equal(out.broader[0].length, 120)
})

test('normalizeRelated 容忍缺失与坏类型', () => {
  assert.deepEqual(normalizeRelated(undefined), { questions: [], deeper: [], broader: [] })
  assert.deepEqual(normalizeRelated({ deeper: 'x' }).deeper, [])
})

test('resolveRelatedIds 把题干换成题号，找不到的进 missing', () => {
  const bank = [{ id: 'q1', stem: '什么是闭包？' }, { id: 'q2', stem: '什么是作用域？' }]
  const out = resolveRelatedIds(bank, ['什么是 闭包？', '没这题'])
  assert.deepEqual(out.ids, ['q1'])
  assert.deepEqual(out.missing, ['没这题'])
  assert.deepEqual(out.ambiguous, [])
})

test('resolveRelatedIds 遇到撞车的题干记 ambiguous 并取第一个', () => {
  const bank = [{ id: 'q1', stem: '什么是闭包？' }, { id: 'q9', stem: '什么是闭包?' }]
  const out = resolveRelatedIds(bank, ['什么是闭包'])
  assert.deepEqual(out.ids, ['q1'])
  assert.equal(out.ambiguous.length, 1)
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/related.test.js`
Expected: FAIL，`Cannot find module .../src/related.js`。

- [ ] **Step 3: 实现 `src/related.js`**

`normalizeRelated` 用 `Array.isArray` 判型；题干走 `normalizeStem` 再比较，`missing` 保留原字符串用于原因输出。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/related.test.js`
Expected: 3 passed。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/related.js test/related.test.js
git commit -m "feat: 关联网归一化与题干解析"
```

---

### Task 2: 入库时解析关联

**Files:**
- Modify: `learning-center/src/ingest.js`
- Test: `test/ingest.test.js`

**Interfaces:**
- Consumes: Task 1 的 `normalizeRelated` / `resolveRelatedIds`。
- Produces: `commitInbox` 的题目行里 `related.questions` 是题号数组；解析失败的原因形如 `{ file, key, reason: 'related_unresolved:<前20字>' }`。

- [ ] **Step 1: 加失败测试**

```js
test('入库把关联题干换成题号，指不到的被丢弃并记原因', async () => {
  await withTempStore(async paths => {
    await writeJsonl(paths.inboxQuestions, [
      { ...draft(), related: { questions: ['什么是作用域？'], deeper: ['为什么闭包能记住外层变量？'] } },
      draft({ stem: '什么是作用域？', source: { file: 'materials/bank.md', page: 4, anchor: '什么是作用域' } }),
    ])
    const r = await commitInbox(paths, options())
    const rows = await readJsonl(paths.questions)
    const first = rows.find(x => x.stem.startsWith('什么是闭包'))
    const second = rows.find(x => x.stem === '什么是作用域？')
    assert.deepEqual(first.related.questions, [second.id])
    assert.deepEqual(first.related.deeper, ['为什么闭包能记住外层变量？'])
  })
})
```

再补一条：只写一个不存在的题干时 `related.questions` 为空、`r.reasons` 里有 `related_unresolved:`。

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/ingest.test.js`
Expected: FAIL，`related.questions` 里还是题干（`[ '什么是作用域？' ]`）。

- [ ] **Step 3: 实现**

`validateDraft` 产出的 `q.related` 改为 `normalizeRelated(raw.related)`（题干留在 `questions`）；`commitInbox` 在写库前，对 `bank` 里每一行做一次 `resolveRelatedIds([...bank.values()], row.related.questions)`，把结果换回去，`missing`/`ambiguous` 各记一条 reason。解析只处理元素不是 `q_` 开头的内容（已经是题号的跳过）。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/ingest.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/ingest.js test/ingest.test.js
git commit -m "feat: 入库解析关联题号"
```

---

### Task 3: 面板改题的写路径也过同一套规则

**Files:**
- Modify: `learning-center/src/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: Task 1 的两个函数。
- Produces: `updateQuestion(id, { related })` 之后库里 `related.questions` 是题号；坏值（非对象）抛 `invalid related`。

- [ ] **Step 1: 加失败测试**

```js
test('updateQuestion 写 related 时同样解析题干', async () => {
  // 两道题入库后，把 q1 的 related.questions 设为 ['什么是作用域？']
  const next = await store.updateQuestion('q_1', { related: { questions: ['什么是作用域？'], deeper: ['为什么？'] } })
  assert.deepEqual(next.related.questions, [secondId])
  assert.deepEqual(next.related.deeper, ['为什么？'])
  await assert.rejects(() => store.updateQuestion('q_1', { related: null }), /invalid related/)
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/store.test.js`
Expected: FAIL，`next.related.questions` 仍是题干。

- [ ] **Step 3: 实现**

`validatePatch` 的 `related` 分支先 `normalizeRelated(value)`；`updateQuestion` 在写库前用当前 bank 解析一次（与 Task 2 同一函数）。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/store.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/store.js test/store.test.js
git commit -m "feat: 改题时解析关联题干"
```

---

### Task 4: 题卡视图给出可点的关联题

**Files:**
- Modify: `learning-center/src/views.js`
- Test: `test/views.test.js`

**Interfaces:**
- Produces: `questionView` 的返回值多一个 `relatedQuestions: { id: string, stem: string }[]`（只含库里还在的题），`related.deeper/broader` 原样透出。

- [ ] **Step 1: 加失败测试**

```js
test('题卡给关联题带上题干，目标不存在的丢掉', () => {
  const card = questionView([q('q1', { related: { questions: ['q2', 'gone'], deeper: ['为什么？'], broader: [] } }), q('q2')], [], 'q1')
  assert.deepEqual(card.relatedQuestions, [{ id: 'q2', stem: '题目 q2 的题干' }])
  assert.deepEqual(card.related.deeper, ['为什么？'])
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/views.test.js`
Expected: FAIL，`relatedQuestions` 是 undefined。

- [ ] **Step 3: 实现**

`questionView` 里按 `related.questions` 查 `questions`，命中才产出 `{id, stem}`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/views.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/views.js test/views.test.js
git commit -m "feat: 题卡视图输出关联题"
```

---

### Task 5: 导入说明让 AI 顺手填关联网

**Files:**
- Modify: `learning-center/src/tools.js`
- Test: `test/tools.test.js`

**Interfaces:**
- Produces: `learning_import brief` 的 `instructions` 里含 `related` 与"写另一道题的题干"的说明。

- [ ] **Step 1: 加失败测试**

```js
test('brief 说明里要求 AI 填关联网', async () => {
  const r = await call(tools.learning_import, { action: 'brief' })
  assert.ok(r.instructions.includes('related'))
  assert.ok(r.instructions.includes('题干'))
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/tools.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现**

在 brief 的说明数组里加两条：`related.questions` 写题库里另一道题的题干原文（不是题号）；`deeper`/`broader` 各 1-3 条，只写确信相关的，宁少勿多。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/tools.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/tools.js test/tools.test.js
git commit -m "feat: 导入说明要求填写关联网"
```

---

### Task 6: 面板显示三组 chip 与补漏入口

**Files:**
- Modify: `learning-center/client.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: `question` op 返回的 `relatedQuestions` / `related`。
- Produces: `RelatedChips({ card, t, onOpenQuestion, onAsk, onFill })` —— 三组各一行 chip；关联点击调 `onOpenQuestion(id)`；深/广点击调 `onAsk(text)`；三组全空时渲染一个「让 AI 补这题的关联网」按钮调 `onFill()`。

- [ ] **Step 1: 加失败测试**

```js
test('题卡的关联网：有关联时出 chip，全空时出补漏按钮', async () => {
  const { module } = await loadClient()
  const Chips = module.__test.RelatedChips
  const asked = []
  const tree = Chips({ card: { related: { questions: ['q2'], deeper: ['为什么？'], broader: [] }, relatedQuestions: [{ id: 'q2', stem: '另一题' }] }, t: k => k, onOpenQuestion() {}, onAsk: text => asked.push(text), onFill() {} })
  assert.ok(JSON.stringify(tree).includes('另一题'))
  assert.ok(JSON.stringify(tree).includes('为什么？'))
  const empty = Chips({ card: { related: { questions: [], deeper: [], broader: [] }, relatedQuestions: [] }, t: k => k, onOpenQuestion() {}, onAsk() {}, onFill() {} })
  assert.ok(JSON.stringify(empty).includes('relatedFill'))
})
```

- [ ] **Step 2: 跑，确认失败**

Run: `& $NODE --test test/client.test.js`
Expected: FAIL，`RelatedChips` 不存在。

- [ ] **Step 3: 实现**

chip 用 `.lc-btn` 样式；关联 chip 文本是对方题干的前 24 字；深/广 chip 文本是问题本身。点击关联 → `openQuestion(id)`（先用 `question` op 取，拿到 null 时 `setError('这道关联题已不在了')`）；点击深/广 → 复用 `ask(text)`；补漏 → `ask('用 learning_question update 给这道题补 related… 题号 <id>')`。

- [ ] **Step 4: 跑，确认通过**

Run: `& $NODE --test test/client.test.js`
Expected: 全部通过。

- [ ] **Step 5: 全量测试 + 包检查**

Run: `& $NODE --test "test/*.test.js"` 和 `& $NODE scripts/check-package.mjs`
Expected: 全绿；包检查通过。

- [ ] **Step 6: Commit**

```bash
git add learning-center/client.js test/client.test.js
git commit -m "feat: 题卡显示关联网 chip 与补漏入口"
```

---

### Task 7: 装进宿主走一遍

**Files:**
- Modify: `docs/notes/v1-acceptance.md`（追加 v2a 一节）

- [ ] **Step 1: 重载插件行**

`plugin_manager` `set_plugin` → `include:learning-center` 关、再开；页面 Ctrl+R。

- [ ] **Step 2: 用真实题库验一遍**

导入一份带 `related` 的草稿（含一个指不到的题干）→ 面板看 chip → 点关联换卡 → 点往深发进会话 → 找一道空 related 的题点补漏。

- [ ] **Step 3: 记录并提交**

把结果写进 `docs/notes/v1-acceptance.md`，未达标的列为遗留。

```bash
git add docs/notes/v1-acceptance.md
git commit -m "docs: v2a 关联网验收记录"
```
