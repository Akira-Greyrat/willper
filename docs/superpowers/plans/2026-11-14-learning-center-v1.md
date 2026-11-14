# 学习中心插件 v1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可安装的 DSH 插件：能把问答题库导入成结构化题库、在中间栏按知识点过题、点术语看释义、标出没解析干净的题并让人处理。

**Architecture:** 一个 bundle（Host 半 + Client 半）。Host 半是纯 Node ESM：数据落在 `<会话工作目录>/learning/` 的 JSON/JSONL 文件里，写入只经过 `store` 与 `ingest` 的校验；向 agent 暴露 4 个工具，向面板暴露一个 `POST /api/learning` 路由，向会话暴露 `/learn` 命令。Client 半是单文件 `client.js`，用一个主面板 + 一个侧栏图标，数据全部来自该路由，不读会话日志、不调模型。

**Tech Stack:** Node.js 22（内置 `node --test`）、纯 ESM、React 18（由宿主模块表提供）、无构建步骤、无第三方运行时依赖。

**Spec:** `docs/superpowers/specs/2026-11-14-learning-center-design.md`

## Global Constraints

- 插件包名 `@local/learning-center`，Host 行 id `learning-center`，面板 slot key `learning`。
- 数据目录名固定 `learning`，位于会话工作目录下：`<cwd>/learning/`。
- 工作区根：`D:\Struggle\Workspace\willper`。包目录 `learning-center/`。所有命令默认在此包目录内执行。
- 测试运行器（固定绝对路径，不要用 PATH 里的 node）：
  `C:\Users\15318\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`
  运行方式：`& $NODE --test test/`
- **Host 运行时代码不得 `import` 任何 `@deepseek-ai/*` 包**（bundle 目录解析不到它们）。只允许 Node 内置模块。
- Client 半是**单文件** `client.js`：模块加载器只给 `require`，没有打包器，所以全部界面代码放这一个文件里。
- 所有可见文案走 `ctx.locale`，`locale/zh.json` 与 `locale/en.json` 两份必须同时更新，键集合一致。
- 只用 `--dsw-alias-*` 主题 token，不写死颜色（图标 SVG 除外）。
- 写入一律"临时文件 + 原子改名"；所有路径必须校验在 `learning/` 之内。
- 不声明 `Config` schema（v1 用 `src/config.js` 里的默认值，loader 传进来的 `config` 只覆盖同名字段）。
- 每个任务结束都要 commit，提交信息用 `feat:` / `test:` 前缀。
- 界面文案语言：中文为主，英文只作对照。

## Review Focus

这些是规范没说、但真实题库一定会遇到、猜错就出事的输入。每一条都在对应任务的测试里钉住。

1. **题干含换行、引号、CRLF**：JSONL 必须一行一题且能原样读回——题库里 90% 的题干是多行的。（Task 4）
2. **锚文本跨行或空白不一致**：PDF 抽出来的文本空格、换行和题库里的锚点常常对不上，直接 `includes` 会把整库判成"锚点缺失"。（Task 5）
3. **同一批草稿里互相重复**：多个入库文件写同一道题时，去重要把同批也算进去，不能只跟已入库的比。（Task 6）
4. **路径穿越**：题库文件、材料名由 agent 提供，`../` 不能把读写带出 `learning/`。（Task 4）
5. **空库 / 空树 / 没有工作区**：第一次打开面板时什么都没有，不能白屏，要给空状态与引导。（Task 12）

---

### Task 1: 实机验证三个接口形状

**Files:**
- Create: `docs/notes/api-shapes.md`
- Create: `probe/`（临时探测插件，验证完删除）
- Create: `probe/package.json`, `probe/cordis.patch.yml`, `probe/index.js`

**Interfaces:**
- Produces: `docs/notes/api-shapes.md`，后续任务照它写代码。必须记录四项：
  1. `ctx.tools.register(definition)` 接受的对象形状（`name`/`description`/`parameters`/`output`/`execute(args, exec)`），以及 `exec.agent` 是否可用。
  2. `ctx.commands.register({ definitionId, name, description, input, handler })` 的 `definitionId` 怎么构造（是否必须是包名），`invocation` 上有哪些字段（`agent`/`rawInput`/`attachments`）。
  3. **命令 handler 如何让 agent 真的回答**：`invocation.agent.followup(...)` 需要什么消息对象；能否用 `agent.inject(...)`；插件能否 `import('@deepseek-ai/dsh-llm')`。写清失败时的退化方案。
  4. `ctx.webServer.register({ kind:'exact', path, handler(req,res) })` 能否收 POST，面板 `fetch('/api/learning', {method:'POST'})` 是否同源可达。
  5. 面板能否用 `ctx.slots.register` 同时占住 `sidebar.panellist`（id `learning`）和 `main`（key `learning`）。

- [ ] **Step 1: 建探测插件**

`probe/package.json`：`name` 为 `@local/learning-probe`，`dsh.bundle.patch` 指 `./cordis.patch.yml`，`dsh.client` 指 `./client.js`（`platform: "web"`，`immediately: true`）。

- [ ] **Step 2: 写最小的 Host 半**

`probe/index.js` 导出 `apply(ctx)`：注册一个工具 `probe_echo`（参数 `text`，execute 返回 `{ echo: text, hasAgent: Boolean(exec.agent) }`）；注册命令 `probe`；注册 `POST /api/probe` 路由返回 `{ ok: true }`。

- [ ] **Step 3: 写最小的 Client 半**

`probe/client.js`：`window.__ModuleLoader__.load({ id: '@local/learning-probe', factory(require) { ... } })`，注册 `sidebar.panellist`（id `learning`，渲染一个方块）与 `main`（key `learning`，渲染一个按钮，点了 `fetch('/api/probe', {method:'POST'})` 并把结果显示出来）。

- [ ] **Step 4: 安装并观察**

用 `plugin_manager install_bundle` 装 `probe/` 的绝对路径。在页面上点开侧栏图标，点按钮。

Expected: 中间栏出现页面，按钮显示 `{"ok":true}`。命令 `/probe hi` 有回显。

- [ ] **Step 5: 记录形状，删掉探测目录**

把四项发现写进 `docs/notes/api-shapes.md`，每项附一段能跑的最小代码。删除 `probe/`（保留 notes）。

- [ ] **Step 6: Commit**

```bash
git add docs/notes/api-shapes.md
git commit -m "docs: 记录 DSH 工具/命令/路由的实测形状"
```

---

### Task 2: 包骨架与显示元数据

**Files:**
- Create: `learning-center/package.json`
- Create: `learning-center/cordis.patch.yml`
- Create: `learning-center/index.js`
- Create: `learning-center/locale/zh.json`
- Create: `learning-center/locale/en.json`
- Create: `learning-center/icon.svg`
- Create: `learning-center/docs/DETAIL.md`

**Interfaces:**
- Produces: `learning-center/index.js` 导出 `export function apply(ctx, config) {}`；`export const name = 'learning-center'`；`export const inject = ['tools', 'commands', 'webServer', 'workingDirectory']`。

- [ ] **Step 1: 写 package.json**

`name` `@local/learning-center`，`version` `0.1.0`，`private`，`type: "module"`，`exports` 含 `.`→`./index.js`、`./client`→`./client.js`、`./locale/*.json`、`./icon`→`./icon.svg`；`files` 列出 `index.js`、`client.js`、`src`、`cordis.patch.yml`、`locale/*.json`、`docs`、`icon.svg`；`dsh.bundle.patch` 指 `./cordis.patch.yml`；`dsh.client` 为 `{ platform: "web", immediately: true }`。

- [ ] **Step 2: 写 patch 与空实现**

`cordis.patch.yml`：`- insert: [{ id: learning-center, name: '@local/learning-center' }]`。
`index.js`：导出 `name`、`inject`、空的 `apply`。

- [ ] **Step 3: 写 locale 与详情页**

`locale/zh.json` 与 `locale/en.json` 各含 `meta.title`（学习中心 / Learning center）、`meta.description`、`meta.detail: "docs/DETAIL.md"`，以及最小的 `panel.title`。
`docs/DETAIL.md` 用中文写：这个插件做什么、数据放在哪（`<工作目录>/learning/`）、哪些操作会请 AI 做、图片只记页码。

- [ ] **Step 4: 画图标**

`icon.svg`：原创、方形、`viewBox="0 0 64 64"`、单色线性图形（一本翻开的书 + 一个对勾），使用 `currentColor` 之外的自有颜色，文件 < 8 KiB。

- [ ] **Step 5: 语法检查**

Run: `& $NODE --check learning-center/index.js`
Expected: 无输出，退出码 0。

- [ ] **Step 6: Commit**

```bash
git add learning-center
git commit -m "feat: learning-center 包骨架与显示元数据"
```

---

### Task 3: 路径与文件读写

**Files:**
- Create: `package.json`（仓库根，只为让 `node --test` 把 `.js` 当 ESM）
- Create: `learning-center/src/paths.js`
- Create: `learning-center/src/io.js`
- Create: `learning-center/src/config.js`
- Test: `test/paths.test.js`
- Test: `test/io.test.js`
- Create: `test/helpers.js`

**Interfaces:**
- Produces:
  - `resolveStore(baseDir: string, storeDir = 'learning'): StorePaths`，其中 `StorePaths = { root, meta, questions, terms, attempts, progress, inboxDir, importedDir, materialsDir, reportsDir }`，全部是绝对路径。
  - `assertInside(root: string, target: string): string` —— 不在 root 内就 `throw new Error('path escapes store: ' + target)`。
  - `readJson(file, fallback)`、`writeJson(file, value)`、`readJsonl(file)`、`writeJsonl(file, rows)`、`ensureDir(dir)`、`moveInto(from, toDir)`（均为 async）。
  - `DEFAULTS = { storeDir: 'learning', leavePromptRate: 0.15, quizCooldownMinutes: 10, autoAcceptDrafts: false, maxDraftBytes: 8 * 1024 * 1024 }`。

- [ ] **Step 1: 建仓库根 `package.json` 与测试夹具**

根 `package.json`：`{ "name": "willper-workspace", "private": true, "type": "module" }`，只为让 `node --test` 把 `.js` 当 ESM。

- [ ] **Step 2: 写测试 `test/paths.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { resolveStore, assertInside } from '../learning-center/src/paths.js'

test('resolveStore 把全部路径放在 learning 下', () => {
  const p = resolveStore('D:/work')
  assert.equal(p.questions, join(p.root, 'questions.jsonl'))
  assert.ok(p.inboxDir.startsWith(p.root))
})

test('assertInside 拒绝穿越', () => {
  assert.throws(() => assertInside('D:/work/learning', 'D:/work/learning/../secret.txt'), /path escapes/)
  assert.equal(assertInside('D:/work/learning', 'D:/work/learning/materials/a.txt'), join('D:/work/learning', 'materials/a.txt'))
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/paths.test.js`
Expected: FAIL，`Cannot find module .../src/paths.js`。

- [ ] **Step 3: 实现 `src/paths.js`**

用 `node:path` 的 `resolve`/`join`/`isAbsolute`，`resolveStore` 内部 `resolve(baseDir, storeDir)`；`assertInside` 先 `resolve` 两边，再判断 `target === root || target.startsWith(root + sep)`，否则抛错。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/paths.test.js`
Expected: 2 passed。

- [ ] **Step 5: 写测试 `test/io.test.js`**

测试"题干含换行、引号、CRLF 能原样读回"（Review Focus #1），以及原子写不留临时文件：

```js
const rows = [{ id: 'q_1', stem: '第一行\r\n含"引号"和 \\ 反斜杠\n第二行' }]
await writeJsonl(file, rows)
assert.deepEqual(await readJsonl(file), rows)
assert.equal((await readdir(dir)).filter(n => n.endsWith('.tmp')).length, 0)
```

- [ ] **Step 6: 运行，确认失败**

Run: `& $NODE --test test/io.test.js`
Expected: FAIL，`Cannot find module .../src/io.js`。

- [ ] **Step 7: 实现 `src/io.js`**

`writeJsonl` 逐行 `JSON.stringify` 后 join `'\n'`；`writeJson` 用 `JSON.stringify(value, null, 2)`。两者都写 `<file>.tmp` 再 `rename`。`readJson` 在文件不存在时返回 `fallback`。`moveInto` 用 `rename`，目标重名时加 `-1`、`-2` 后缀。

- [ ] **Step 8: 写 `src/config.js` 与 `test/helpers.js`**

`config.js` 导出 `DEFAULTS` 与 `readConfig(raw)`（逐字段取 `raw?.x ?? DEFAULTS.x`）。
`test/helpers.js` 导出 `withTempStore(fn)`：`mkdtemp` 一个目录，跑 `fn(paths)`，结束后递归删除。

- [ ] **Step 9: 运行全部测试并提交**

Run: `& $NODE --test test/`
Expected: 全部通过。

```bash
git add learning-center/src test
git commit -m "feat: 学习库路径、原子读写与配置默认值"
```

---

### Task 4: 归一化、指纹与单题校验

**Files:**
- Create: `learning-center/src/model.js`
- Test: `test/model.test.js`

**Interfaces:**
- Produces:
  - `normalizeStem(s: string): string` —— 去 CRLF、按行 trim、行间单 `\n`、压缩连续空白、去首尾。
  - `normalizePath(p: string): string` —— 全用 `/`，去前导 `./`。
  - `questionKey(file: string, stem: string): string` —— `sha1(normalizePath(file) + '\n' + normalizeStem(stem))` 的十六进制。
  - `mintId(seed: string): string` —— `'q_' + sha1(seed).slice(0, 8)`。
  - `validateDraft(raw, { nodeIds: Set<string>, materialText: string | null }): { ok: true, q } | { ok: false, flags: string[], status: 'needs-review' | 'rejected' }`。

- [ ] **Step 1: 写测试**

覆盖：正常题通过并带上 `status: 'ok'`；缺 `reference.answer` 与 `points` → `missing_answer` 且 `status: 'needs-review'`；`nodeId` 不在 `nodeIds` → `node_unknown`；`stem` 短于 8 字 → `truncated`；`anchor` 不在 `materialText` 里 → `anchor_missing`；`materialText === null` → `anchor_unverified`；题干里出现"见下图"但 `source.hasImage !== true` → `image_hint_missing`。

```js
const ok = validateDraft({ stem: '什么是闭包？', reference: { answer: '……', points: ['a'] }, nodeId: 'n_1', source: { file: 'm.pdf', page: 3, anchor: '什么是闭包' } }, { nodeIds: new Set(['n_1']), materialText: '……什么是闭包？……' })
assert.equal(ok.ok, true)
assert.equal(ok.q.status, 'ok')
```

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/model.test.js`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/model.js`**

`validateDraft` 只做单题判断，不查重复（重复属于 Task 5 的批量）。返回的 `q` 含 `id`（`mintId(questionKey(file, stem))`）、`stem`、`reference`（补 `points: []`、`provenance: 'source'`）、`source`、`tags: []`、`related: { questions: [], deeper: [], broader: [] }`、`status`、`flags`、时间戳。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/model.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/model.js test/model.test.js
git commit -m "feat: 题目归一化、指纹与单题校验"
```

---

### Task 5: 锚点匹配的空白容忍

**Files:**
- Modify: `learning-center/src/model.js`
- Test: `test/model.test.js`

**Interfaces:**
- Produces: `findAnchor(anchor: string, materialText: string): boolean` —— 两边都做"压缩全部空白为一个空格、去首尾"后做 `includes`，锚点为空时返回 `false`。

- [ ] **Step 1: 加失败测试**（Review Focus #2）

```js
test('锚点跨行、空白不一致也能命中', () => {
  const text = '第一段  结束。\n\n第二段：闭包 是指  函数与其词法环境的组合。'
  assert.equal(findAnchor('第二段：闭包 是指 函数与其词法环境的组合。', text), true)
  assert.equal(findAnchor('完全不存在的句子', text), false)
  assert.equal(findAnchor('', text), false)
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/model.test.js`
Expected: FAIL，`findAnchor is not a function`。

- [ ] **Step 3: 实现并接入 `validateDraft`**

`const squash = s => s.replace(/\s+/gu, ' ').trim()`；`findAnchor` 用 `squash(materialText).includes(squash(anchor))`。把 `validateDraft` 里的锚点判断换成 `findAnchor`。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/model.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/model.js test/model.test.js
git commit -m "fix: 锚点匹配容忍换行与空白差异"
```

---

### Task 6: 入库对账

**Files:**
- Create: `learning-center/src/ingest.js`
- Test: `test/ingest.test.js`

**Interfaces:**
- Consumes: `resolveStore`、`readJsonl`/`writeJsonl`、`questionKey`、`validateDraft`、`mintId`。
- Produces:
  - `commitInbox(paths, { nodeIds, materialTextByFile, maxDraftBytes }): Promise<{ added, merged, needsReview, rejected, orphaned, reasons: {file, key, flags}[] }>`
  - 读取 `inbox/questions.jsonl` 与 `inbox/terms.jsonl`，处理后把文件移进 `imported/`。
  - 已入库题的 `source.file` 在本批材料里全部消失时，标 `orphaned`（不删）。

- [ ] **Step 1: 写测试**

覆盖：新题进 `added`；同 key 再导入进 `merged` 且 **id 不变、历史 status 保留**；本批内两行同 key 只收一条并给 `duplicate_of` 原因（Review Focus #3）；缺答案进 `needsReview` 而不入库；术语文件里出现题库没有的术语 → 该项进 `reasons` 并丢弃；材料已删除的旧题变 `orphaned`。

```js
const first = await commitInbox(paths, { nodeIds: new Set(['n_1']), materialTextByFile: {} })
assert.equal(first.added, 2)
// 改答案再导一次
const second = await commitInbox(paths, { nodeIds: new Set(['n_1']), materialTextByFile: {} })
assert.equal(second.merged, 2)
const rows = await readJsonl(paths.questions)
assert.equal(rows.length, 2)
assert.equal(rows[0].id, 'q_...')  // 与第一次相同
```

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/ingest.test.js`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/ingest.js`**

流程：读 inbox → 逐行 `JSON.parse`（解析失败的行记 `rejected` 并记录行号，不中断整批）→ `validateDraft` → 批内去重 → 与库内按 `questionKey` 对账 → 生成新库并一次 `writeJsonl` → 把 inbox 文件 `moveInto(importedDir)`。库里每题保留 `key` 与 `updatedAt`。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/ingest.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/ingest.js test/ingest.test.js
git commit -m "feat: 入库对账（新增/合并/待核对/孤儿）"
```

---

### Task 7: 视图投影

**Files:**
- Create: `learning-center/src/views.js`
- Test: `test/views.test.js`

**Interfaces:**
- Produces（全部是纯函数，输入为已读出的数据）：
  - `treeView(meta, questions, progress): { nodes: { id, title, parentId, weight, order, total, ok, needsReview, seen }[] }`
  - `queueView(meta, questions, progress, { nodeId, offset, limit }): { items: {id, stem, firstLine}[], total, offset }` —— 只含 `status === 'ok'` 且未被 `orphaned` 的题，跳过 `progress[id].seen` 为真的（除非 `revisit: true`）。
  - `questionView(questions, terms, id): { id, stem, termHits: { start, end, termId, text }[], reference, source, tags, related, favorite } | null`
  - `checklistView(questions): { items: { id, stem, flags, source, reason }[] }`
  - `favoritesView(questions, progress): { items: { id, stem, nodeId }[] }`

- [ ] **Step 1: 写测试**

覆盖：树计数只算 `ok`；`queueView` 跳过已读、按 `nodeId` 过滤、`limit` 生效；`questionView` 对每个术语给出**所有**出现位置且不重叠（长术语优先）；空库返回空数组而不是 `undefined`（Review Focus #5 的一半）。

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/views.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/views.js`**

术语命中：把术语按长度降序，用 `String.prototype.indexOf` 循环找，命中后把区间标记为已占，跳过重叠。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/views.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/views.js test/views.test.js
git commit -m "feat: 学习页、题库页、收藏页的视图投影"
```

---

### Task 8: 存储门面

**Files:**
- Create: `learning-center/src/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: Task 3–7 的全部模块。
- Produces: `createStore(baseDir, config)` 返回：
  - `load(): Promise<{ meta, questions, terms, progress, attempts }>`（不存在时给空默认：`meta = { version: 1, target: null, tree: [], plan: [], settings }`）
  - `saveMeta(meta)`、`setFavorite(id, on)`、`markSeen(id)`、`updateQuestion(id, patch)`、`setStatus(id, status)`、`recordAttempt(attempt)`、`upsertTerms(entries)`
  - `commitInbox()`（转调 Task 6）
  - `nodeIds(): Promise<Set<string>>`

- [ ] **Step 1: 写测试**

覆盖：空目录 `load()` 返回 `target: null` 不抛错；`saveMeta` 后能读回；`setFavorite` 只改 `progress.json`；`updateQuestion` 保留 `id`/`key`/`createdAt`，未知 id 抛 `new Error('unknown question: ' + id)`。

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/store.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/store.js`**

每次写操作都"读最新 → 改 → 原子写"，不做进程内缓存（v1 数据量小，简单优先）。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/store.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/store.js test/store.test.js
git commit -m "feat: 学习库存储门面"
```

---

### Task 9: 四个 agent 工具

**Files:**
- Create: `learning-center/src/tools.js`
- Test: `test/tools.test.js`

**Interfaces:**
- Consumes: `createStore`、`views`。
- Produces: `registerTools(ctx, storeFor)`，其中 `storeFor(agent) => Promise<Store>`；`toolDefinitions(storeFor)` 返回数组（供测试直接调用 `execute`）。
  - `learning_status({})` → `{ target, counts: { total, ok, needsReview, orphaned, duplicates, missingAnswer }, nodes: [{id,title,total,ok}], weak: [{questionId, stem, misses}], nextActions: string[] }`
  - `learning_plan({ action, target?, nodes?, plan? })` → `'get'` 返回当前；`'set_target'` 写目标；`'upsert_tree'` 合并节点（按 `id` 覆盖，新增追加）；`'set_plan'` 整体替换；返回 `{ ok: true, target, nodeCount, stageCount }`
  - `learning_import({ action })` → `'brief'` 返回入库说明与 schema（含"三件套"文件路径、分片建议、必填字段）；`'commit'` 转调 `store.commitInbox()` 并返回计数；`'list'` 返回 `inbox/` 下的待处理文件
  - `learning_question({ action, id?, patch?, question?, reason? })` → `'update'` / `'accept'`（`needs-review` → `ok`）/ `'reject'`（→ `rejected`）/ `'add'`

- [ ] **Step 1: 写测试**

对每个工具直接调 `execute(args, { agent: fakeAgent })`，断言返回结构；`learning_plan` 的 `upsert_tree` 传入已存在 id 的节点时是覆盖不是重复；`learning_import` 的 `brief` 文本里含 `inbox/questions.jsonl`、`inbox/terms.jsonl`、`materials/`。

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/tools.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/tools.js`**

工具定义对象按 `docs/notes/api-shapes.md` 的形状写；每个工具的 `description` 说明它做什么、返回什么，不写实现细节。`brief` 的说明文本是给模型的操作手册，包含：每题必填字段清单、`anchor` 必须是原文逐字摘录、一次建议 30–60 题、术语写进 `terms.jsonl`。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/tools.test.js`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add learning-center/src/tools.js test/tools.test.js
git commit -m "feat: learning_status/plan/import/question 四个工具"
```

---

### Task 10: 路由与命令

**Files:**
- Create: `learning-center/src/route.js`
- Create: `learning-center/src/command.js`
- Create: `learning-center/src/session.js`
- Test: `test/route.test.js`
- Test: `test/command.test.js`

**Interfaces:**
- Consumes: `createStore`、`views`、`docs/notes/api-shapes.md` 里记录的命令形状。
- Produces:
  - `handleApi({ store, sessionId, resolveBaseDir }): (req, res) => Promise<void>` —— `POST /api/learning`，body `{ op, sessionId, params }`，返回 JSON；未知 `op` 返回 400 `{ error: 'unknown op' }`。
    ops：`meta`、`setTarget`、`tree`、`queue`、`question`、`checklist`、`favorites`、`favorite`、`seen`、`setStatus`、`updateQuestion`。
  - `registerCommand(ctx, { storeFor, promptAgent })` —— 命令 `learn`，子命令 `plan` / `import <file>` / `ask <question>`；`promptAgent(agent, text)` 由 `src/session.js` 提供。
  - `src/session.js`：`promptAgent(agent, text)` —— 按 Task 1 验证的结果把一段文本送进当前会话；首选 `agent.followup(...)`，退化时抛 `new Error('cannot prompt agent')` 由命令层转成用户可见提示。

- [ ] **Step 1: 写路由测试**

用一个假 `req`（`{ method:'POST', on('data'|'end'), headers }`）和假 `res`（收集 `writeHead`/`end`），断言：`tree` 返回 `{ nodes: [] }`；未知 op 400；body 不是 JSON 时 400 `{ error: 'bad json' }`；`updateQuestion` 改坏必填字段时 400 且库不变。

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/route.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/route.js`**

读 body 时限制 `maxDraftBytes`，超限返回 413。所有错误用 `{ error: message }` 且状态码 400/404/413，绝不 500 空响应。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/route.test.js`
Expected: 全部通过。

- [ ] **Step 5: 写命令测试并实现**

`test/command.test.js`：用假 `ctx.commands.register` 捕获定义，用假 `invocation`（`{ agent, rawInput }`）调 `handler`。断言 `plan` 调用了 `promptAgent` 且文本含 `learning_status`；`import` 缺文件名时返回 `{ kind:'error' }` 并给出用法；`ask` 空问题返回 error。

- [ ] **Step 6: 运行，确认通过**

Run: `& $NODE --test test/command.test.js`
Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add learning-center/src/route.js learning-center/src/command.js learning-center/src/session.js test/route.test.js test/command.test.js
git commit -m "feat: 面板路由与 /learn 命令"
```

---

### Task 11: Host 装配

**Files:**
- Modify: `learning-center/index.js`
- Test: `test/apply.test.js`

**Interfaces:**
- Consumes: 全部 `src/*`。
- Produces: `apply(ctx, config)` 实际注册：`ctx.tools` 三个以上工具、`ctx.commands` 的 `learn`、`ctx.webServer` 的 `POST /api/learning`；全部返回 disposer 并用 `ctx.effect` 管生命周期；`storeFor(agent)` 用 `ctx.workingDirectory.get(agent.session)` 解析出会话目录。

- [ ] **Step 1: 写测试**

用假 `ctx`（记录 `tools.register`/`commands.register`/`webServer.register` 的调用）跑 `apply`，断言三类注册都发生、`inject` 列出的服务被用到；`workingDirectory` 缺失时 `apply` 不抛错而是让工具返回明确错误（"当前会话没有工作目录"）。

- [ ] **Step 2: 运行，确认失败**

Run: `& $NODE --test test/apply.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `apply`**

`inject` 里只放硬依赖；`workingDirectory` 用 `ctx.get('workingDirectory')` 取，取不到就降级。

- [ ] **Step 4: 运行，确认通过**

Run: `& $NODE --test test/apply.test.js`
Expected: 全部通过。

- [ ] **Step 5: 装进宿主，确认 Host 侧活着**

Run: `plugin_manager` `install_bundle`，`target` = `D:\Struggle\Workspace\willper\learning-center`。
Expected: `application: applied`，无 `failed`。

- [ ] **Step 6: Commit**

```bash
git add learning-center/index.js test/apply.test.js
git commit -m "feat: Host 装配（工具/命令/路由）"
```

---

### Task 12: 面板（学习页 + 题库页 + 空状态）

**Files:**
- Create: `learning-center/client.js`
- Modify: `learning-center/locale/zh.json`、`locale/en.json`

**Interfaces:**
- Consumes: `POST /api/learning`（Task 10 的 ops）、`ctx.locale.bind(ns)`、`ctx.slots.inject`、`ctx.layout.selectPanel`。
- Produces: 单文件 Client 模块，注册 `sidebar.panellist`（id `learning`，32px 图标）与 `main`（key `learning`，整页面板）。

- [ ] **Step 1: 写骨架与数据层**

`window.__ModuleLoader__.load({ id: '@local/learning-center', factory(require) { ... } })`；内部 `api(op, params)` 用 `fetch('/api/learning', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ op, params, sessionId }) })`，失败时抛出可展示的错误字符串。`sessionId` 从 slot 标准 props 的 `useSessionStatus()` 取；拿不到时按 `null` 发请求，并显示「先选一个会话」的空状态。

- [ ] **Step 2: 写空状态**

没有 `meta.target` 时显示引导：标题、「填目标」表单（标题 / 一句话目标 / 当前水平三档），提交调 `api('setTarget', { title, statement, level })`，成功后重新拉 `meta` 并渲染画布。

- [ ] **Step 3: 写学习页**

左树（`api('tree')`）、右题卡（`api('question', {id})`）：题干按 `termHits` 切成文本与按钮；点术语弹浮层显示 `definition`；「看参考答案」展开 `reference.answer` 与要点列表；底部「下一题」调 `api('seen', {id})` 再拉 `api('queue')`。

- [ ] **Step 4: 写题库页与收藏页**

题库页：`api('checklist')` 列表；每项显示 `flags` 的中文名与来源；三个按钮分别调 `api('setStatus', { id, status })`。
收藏页：`api('favorites')` 列表，点条目跳到学习页的那道题；题卡上的星标调 `api('favorite', { id, on })`，写完重拉当前页。

- [ ] **Step 5: 接上「请 AI 拆知识点」**

面板顶部按钮：`ctx.remote.commands.execute(agent, '/learn plan', [], signal)`（形状照 `docs/notes/api-shapes.md`；失败时把 `/learn plan` 复制到剪贴板并提示粘贴）。发送后顶部出现「已发送 · 去看」，点它 `ctx.layout.selectPanel('conversation')`。

- [ ] **Step 6: 语法检查**

Run: `& $NODE --check learning-center/client.js`
Expected: 退出码 0。

- [ ] **Step 7: 实机验收**

重启页面，点侧栏图标，依次确认：空状态出现；填目标后能看到画布；`/learn plan` 后树出现；题库页能改状态。
Expected: 每步都不白屏，且数据真的落在 `<工作目录>/learning/` 下（用 `git status` 或资源管理器确认文件生成）。

- [ ] **Step 8: 跑全量测试并提交**

Run: `& $NODE --test test/`
Expected: 全部通过。

```bash
git add learning-center/client.js learning-center/locale
git commit -m "feat: 学习中心面板（学习页/题库页/空状态）"
```

---

### Task 13: 端到端走一遍

**Files:**
- Create: `docs/notes/v1-acceptance.md`

**Interfaces:**
- Consumes: 已安装的插件。
- Produces: 验收记录，写清每条实际发生了什么。

- [ ] **Step 1: 准备一份 30 题的 Markdown 题库**

放到某个测试工作目录的 `materials/bank.md`，其中 2 题故意不写答案、1 题重复、1 题写"见下图"但不配图。

- [ ] **Step 2: 走完整流程**

在会话里让 agent 按 `learning_import brief` 的说明导入，然后 `/learn plan`，再打开面板过题。

Expected：题库 30 题里 26 题可练，2 题 `missing_answer`、1 题 `duplicate_of`、1 题 `image_hint_missing` 出现在待核对；第二次导入同一文件时全部 `merged`，id 不变。

- [ ] **Step 3: 记录并提交**

把每条的实际结果（含截图路径或文字描述）写进 `docs/notes/v1-acceptance.md`，未达标的列为遗留问题。

```bash
git add docs/notes/v1-acceptance.md
git commit -m "docs: v1 端到端验收记录"
```
