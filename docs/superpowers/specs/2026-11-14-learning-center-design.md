# 学习中心插件 · 设计

- 日期：2026-11-14
- 状态：待批准
- 形态：DeepSeek Harness（DSH）插件束（bundle），含 Host 半与 Client 半

## 一、一句话

在 DSH 里加一个独占中间栏的「学习中心」：把现有的问答题库导入成一个可按知识点过题的学习材料，AI 负责拆知识点、评估题库、判分和答疑，面板负责导航、进度和所有确定性的事。

## 二、意图与为什么

使用者是一个人，正在学**一门课 / 考一个证**，材料是**现成的问答题库**（PDF/MD/TXT，可能不完整，可能配示意图片）。目的不是刷题应试，而是**把知识学会**——所以刷题量、正确率不是目标，理解、要点覆盖、薄弱点暴露才是。

现有做法的痛点（由使用者提出）：题库散、质量参差、不知道哪里该补、没人抽查、术语和延伸问题要自己另开对话问。学习中心要把"读题→自检→答疑→抽查→记录"这一整圈收进一个页面。

## 三、用户与场景

- 单用户，单机，本地数据；不做账号、不做云同步。
- 一个工作区可以有多个学习目标，但同一时间只激活一个；界面只服务激活中的那个。
- 题库是**问答题（开放题）**，不是选择题；答案由使用者口述或打字，AI 按要点覆盖判分。
- 题目可能配图，但图片是**示意/补充**性质，不是解题必需；因此不做图片提取，只记页码锚点，点开右侧文档定位。

## 四、目标 / 非目标 / 反目标

### 目标
1. 把一份问答题库导入成结构化题库：题干、参考答案、要点、知识点归属、tag、来源页码。
2. 导入时**不允许把没解析干净的题放进练习**：缺答案、被截断、重复、答案与题干不匹配、跑出考纲的，全部进「待核对」，标注原因。
3. 从目标和题库两侧生成**知识点骨架**，题库按骨架归类，骨架带"该掌握到什么程度"的权重。
4. 给出**阶段计划**：每阶段学哪些知识点、该读材料的哪几节、要补的前置知识和新视角、一个可交付的实践项目、自查标准。
5. **过题界面**：一题一屏，题干里术语可点出释义；可先自答再看参考答案与要点；每题给关联问题、往深走、往宽走的方向（都是可点的问题）。
6. **离开题目时抽查**：随机抽一道已读题要求回答，可跳过；答完 AI 给反馈并记录。
7. 收藏与**错题本**（问答题语境下＝薄弱点本：要点漏得多、说法错的题）。
8. **题库体检报告**：覆盖缺口、重复、可疑过时、答案存疑，以及"下一步建议做什么"。

### 非目标（v1 明确不做）
- 不做间隔重复算法（SRS 调度）；复习顺序只用简单启发式。
- 不做多目标并行管理界面（可以有多个目标的数据，但界面只显示激活的那个）。
- 不做图片抽取、不做 PDF 版面还原。
- 插件自身不解析 PDF/MD/TXT——解析是 agent 的活。
- 不做移动端布局，不做多语言以外的主题定制。
- 不做题目自动生成补缺（缺口只出建议，出题要使用者明确要求）。

### 反目标（做成了也算失败）
- AI 未经确认就改题库。
- 每次点术语、翻页都开一轮对话、产生聊天噪音。
- 把 AI 生成的题混进原题库统计，导致"我掌握了 80%"这种数不成立。
- 面板里再写一套 Markdown 渲染器去兼容复杂语法（只支持最小子集，超出部分按纯文本显示）。
- 面板自己读会话日志、自己扫文件来算统计（统计一律由 Host 从结构化数据算）。

## 五、约束与既有事实

已在本机 DSH（0.2.2-rc.3，Desktop profile）核对：

- 插件 = bundle：`package.json` 声明 `dsh.bundle.patch`，patch 插入一行 Host 插件；`dsh.client` + `./client` 导出浏览器半。
- 客户端半是 `window.__ModuleLoader__.load({ id, factory(require) })`，`apply(ctx)` 里通过 `ctx.slots.inject(...)` 注册 UI；只允许 `require('react')` 一类基线模块，不引用 Harness 内部 Client 包。
- 主面板：`main` 是 keyed slot（"Central panel selected by sidebar entry id"，已占用 key：`conversation`），`sidebar.panellist` 是 list slot（已占用 id：`plugins`、`schedules`）。**同一个 id 注册一处，侧栏出图标，中间出整页**——学习中心走这条路。
- 右侧文档页（`rightbar` / `sidebar.right.pane.tab` / `sidebar.right.tab.document`）已存在，PDF 在右侧可预览，所以"点页码 → 看原文"有现成落点。
- Host 侧可用：`ctx.tools.register`（agent 工具）、`ctx.fs`（工作区文件读写）、`ctx.webServer.register`（HTTP 路由）、`ctx.commands.register`（人类命令）、`ctx.systemPrompt.section`（提示词段落）、`ctx.storage`（结构化存储，v1 不用）。
- 客户端可用服务：`ctx.slots`、`ctx.locale`、`ctx.theme`、`ctx.layout`（`selectPanel`）、`ctx.sessions`、`ctx.workspaces`、`ctx.uiWorkspace`、`ctx.timer`。
- **未验证的关键点**：客户端半怎么调 Host 半。Builtin 里的 `host.call` 标称"Package-private JSON RPC"，但它按动态 Package 描述；bundle 是否有同样的桥，需要在动手第一天用二十行代码验证（见"风险"）。

## 六、方案

### 备选一：纯文件，插件很薄
题库就是工作区里的 Markdown/JSON，插件只做渲染与导航，agent 用读写文件能力直接改。
- 好处：最快出活，人可手改，可 diff。
- 代价：没有护栏。少一个字段、知识点串行、层级错一级，页面就少一片、统计就错，而且隐蔽。几百道题后无法靠肉眼发现。**不选**：这与"避免给用户错误的题目"直接冲突。

### 备选二：文件落盘，插件管结构（选定）
题库仍存在工作区的 `learning/` 目录里（可备份、可迁移、能进 git），但只能通过插件写入：agent 把整理好的内容交给工具，插件校验、去重、挂知识点、标异常后才落盘；面板通过插件读，统计和抽查都在结构化数据上算。
- 好处：结构不漂；可查询、可统计；人工修正也要过校验；每一条改动在磁盘上可 diff。
- 代价：要写一套存储、校验、索引；首版慢。

### 备选三：不落盘，题库活在会话里
从会话日志投影出来。最贴合 DSH 的"日志是唯一真相"，代码最少；但换会话就看不到题库、进度不能跨月累积、不能手改单题。**不选**。

### 选定理由
这是跨越数周的学习，进度、错题、抽查记录必须长期累积并可查询；题目一定会被反复修正；使用者要能备份、搬走、看见每一次改动。备选一太脆，备选三留不住东西。

## 七、设计

### 7.1 一条总规则

**面板只写结构化数据，从不总结、从不判分。** 任何需要 AI 的地方（拆知识点、评估题库、判分、回答追问），面板都发一条 `/learn …` 命令给当前会话，agent 用工具读写，面板刷新后展示结果。

这条规则同时解决了三件事：不需要插件自己调模型；不会有一堆后台小模型调用；AI 做的每件事都留在会话里可追溯。

### 7.2 磁盘布局

所有数据在**当前工作区**下：

```
learning/
  meta.json                 # 目标、知识点树、阶段计划、设置
  questions.jsonl           # 题库，一行一题（入库后才存在）
  terms.json                # 术语表（题干里的术语→释义）
  attempts.jsonl            # 答题记录，只追加
  progress.json             # 已读、收藏、标记、薄弱计数（可重建，但落盘省算）
  inbox/                    # AI 写的草稿，待入库
    <timestamp>-<name>.jsonl
  reports/
    audit-<timestamp>.json  # 体检报告
  materials/                # 使用者放入的原始 PDF/MD/TXT（可选，也可指向别处）
```

写入一律"临时文件 + 原子改名"，并保留 `meta.json` 的 `version` 字段用于将来迁移。

### 7.3 数据模型

`meta.json`：

```json
{
  "version": 1,
  "target": {
    "title": "某某认证",
    "statement": "六周内把……弄懂，能独立解释……",
    "level": "beginner",
    "startedAt": "2026-11-14T00:00:00Z"
  },
  "tree": [
    { "id": "n_1", "parentId": null, "title": "基础概念", "weight": "must", "summary": "……", "order": 10 }
  ],
  "plan": [
    {
      "id": "p_1", "title": "第一阶段：打好地基",
      "nodeIds": ["n_1"],
      "reading": [{ "file": "materials/book.pdf", "section": "第 1 章", "pages": [1, 24] }],
      "prereqs": ["线性代数里的向量空间"],
      "perspectives": ["从工程实现角度再看一遍"],
      "project": { "title": "用最小代码复现……", "deliverable": "一个可运行的脚本 + 一页说明" },
      "checkpoints": ["能不看材料讲清楚……"],
      "status": "todo"
    }
  ],
  "settings": {
    "leavePromptRate": 0.15,
    "quizCooldownMinutes": 10,
    "autoAcceptDrafts": false,
    "gradingMode": "ai"
  }
}
```

`questions.jsonl` 一行一题：

```json
{
  "id": "q_01J8",
  "nodeId": "n_1.2",
  "stem": "……（题干原文）",
  "reference": {
    "answer": "……",
    "points": ["要点一", "要点二", "要点三"],
    "provenance": "source",
    "confidence": 0.82
  },
  "source": {
    "file": "materials/bank.pdf",
    "page": 23,
    "anchor": "题干开头那 20 个字",
    "hasImage": true
  },
  "tags": ["循环", "递归"],
  "related": { "questions": ["q_01J9"], "deeper": ["为什么……？"], "broader": ["……和……是什么关系？"] },
  "status": "ok",
  "flags": [],
  "createdAt": "…",
  "updatedAt": "…"
}
```

- `status`：`ok` | `needs-review` | `rejected`。只有 `ok` 进练习与抽查。
- `flags` 取值：`missing_answer`、`truncated`、`duplicate_of:<id>`、`off_syllabus`、`answer_mismatch`、`outdated_suspect`、`anchor_missing`。
- `reference.provenance`：`source`（原题库）| `ai-drafted`（AI 补写，需人审）| `user`。**统计只算 `source` 与 `user`**，`ai-drafted` 另列。

`attempts.jsonl` 一行一次作答：

```json
{
  "id": "a_…", "questionId": "q_01J8", "at": "2026-11-14T09:00:00Z",
  "kind": "quiz|study",
  "answer": "使用者写的答案",
  "grade": { "score": 0.6, "covered": ["要点一"], "missed": ["要点二"], "wrong": ["……"], "feedback": "……", "grader": "ai" }
}
```

### 7.4 Host 半：一个服务，两个入口

Host 侧只有一个实现类 `LearningStore`（不是 Cordis Service，就是插件内部模块）：

```
createTarget(input) / readMeta() / writePlan(plan) / upsertNodes(nodes)
ingestCommit(fileRef|inlineDraft) -> { accepted, needsReview, rejected, reasons[] }
updateQuestion(id, patch) / acceptDraft(id) / rejectDraft(id, reason)
recordAttempt(attempt) / gradeAttempt(attemptId, grade)
queryView(kind, params) -> 面板要的各种投影（树带覆盖计数、题目一页、报告、错题本）
auditSubmit(findings) -> 写 reports/audit-*.json 并回写题目 flags
```

两个入口共用它：

1. **Agent 工具**（`ctx.tools.register`）——AI 用。
2. **面板 HTTP 路由**（`ctx.webServer.register`，`POST /api/learning`，单一端点、`{op, params}`）——面板用。

工具与路由都在同一个 `apply` 里注册，用 `ctx.effect` 管生命周期。

### 7.5 Agent 工具

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `learning_status` | `{}` | 目标摘要、题库统计（ok / 待核对 / 重复 / 缺答案）、知识树覆盖、薄弱点前 5、建议下一步。只读。 |
| `learning_plan` | `{ action: "get"\|"set_target"\|"upsert_tree"\|"set_plan", … }` | 建/改目标、增量写知识点树、写阶段计划。 |
| `learning_import` | `{ action: "brief"\|"commit"\|"list" }` | `brief` 返回入库 schema、材料清单、分片建议；`commit` 校验 `inbox/` 全部草稿，返回 accept / needs-review / reject 计数与逐条原因。 |
| `learning_question` | `{ action: "update"\|"accept"\|"reject"\|"add", question? , id?, patch?, reason? }` | 单题修正、接受/驳回 AI 草稿、手工加题。 |
| `learning_audit` | `{ action: "brief"\|"submit", findings? }` | 体检：`brief` 给核对清单与判定标准；`submit` 写报告、回写 `flags`。 |
| `learning_grade` | `{ attemptId }` | 读这次作答与参考答案，按要点判分，写回 `attempts.jsonl`。 |

设计取舍：
- **不逐题调工具**。导入是 `brief`（拿 schema）→ agent 用 `write` 把草稿写进 `learning/inbox/*.jsonl` → `commit` 一次校验入库。几百道题也只多一次工具调用。
- `learning_grade` 只用 `attemptId`，不传答案正文：面板先把答案落盘，再发 `/learn grade <attemptId>`，避免长文本进命令行、也避免重复传输。

### 7.6 校验与防错（本项目的核心价值）

`ingestCommit` 对每条草稿依次检查：

1. **结构**：字段齐全、类型正确、`stem` 非空、`reference.answer` 与 `points` 至少有一个。
2. **来源锚定**：`source.file` 必须存在，`source.anchor` 必须能在该材料的可抽取文本里找到（PDF 抽不出文本时降级为"必须给页码"，并置 `anchor_missing` 提示）。**这条挡的是 AI 编题。**
3. **重复**：题干归一化（去空白、标点、全半角）后取指纹，与库内及本批互查；重复的进 `needs-review` 并标 `duplicate_of`。
4. **知识点存在**：`nodeId` 必须在树里；不在的进 `needs-review`，不静默丢弃。
5. **明显异常**：题干短于阈值、以问号结尾但没有答案、题干里出现"见下图"却没有 `hasImage` 等，逐条给 flag。

任何一项不过 → 进「待核对」，**不删**，页面上一栏待处理。这就是"未能清晰解析的题目要标注出来，避免给用户错误的题目"的落点。

### 7.7 面板（Client 半）

一个主面板 + 一个侧栏图标，id 用 `learning`。

```
┌ 学习中心 ────────────────────────────────────────────────┐
│ [学习] [题库] [体检] [错题] [收藏]                        │
├───────────────────┬──────────────────────────────────────┤
│ 目标：某某认证      │  n_1.2 循环                          │
│ 阶段 2 / 5         │  ┌────────────────────────────────┐  │
│                    │  │ 第 3 / 42 题        [待核对 6]  │  │
│ ● n_1 基础   12/14 │  │                                │  │
│ ◐ n_2 循环    3/9  │  │ 题干……（术语带下划线，点开释义）│  │
│  ○ n_2.1 循环结构  │  │                                │  │
│  ◐ n_2.2 递归       │  │ ┌ 先写你的答案 ───────────────┐ │  │
│ ○ n_3 函数    0/7  │  │ │                            │ │  │
│                    │  │ └────────────────────────────┘ │  │
│ ── 阶段计划 ──      │  │ [看参考答案]  [标记收藏]        │  │
│ ☑ 第一阶段          │  │ 参考答案 · 要点 ①②③ · [图 p23] │  │
│ ☐ 第二阶段          │  └────────────────────────────────┘  │
│  实践项目：……       │  关联问题 ｜ 往深走 ｜ 往宽走        │
├───────────────────┴──────────────────────────────────────┤
│ 已读 18 / 210 · 本阶段 6 / 24            [抽查] [设置]     │
└──────────────────────────────────────────────────────────┘
```

- **学习页**：左知识点树（带覆盖计数与进度点），中题目卡，右侧不占用（右侧留给文档页看原文）。
- **题库页**：按知识点列题，可筛选 `ok` / `待核对`；待核对卡显示 flag 原因与"接受 / 改 / 驳回"。
- **体检页**：最新报告——覆盖缺口（零题知识点）、重复、可疑过时、缺答案、建议下一步。
- **错题页**：按知识点聚合的薄弱题，按最近漏要点的次数排序。
- **收藏页**：手动收藏。
- **术语释义**：题干里的术语是行内按钮，点开一个浮层，显示释义、例句、"在这个知识点里的位置"。**释义在入库时已生成，点击不调模型。**
- **关联 / 往深 / 往宽**：三组可点的问题串。点一下发 `/learn ask <问题>` 到当前会话，agent 在聊天里回答。
- **离开题目触发抽查**：切换题目或切页时，若满足冷却（≥ `quizCooldownMinutes`）且距上次抽查已过过 N 题，按 `leavePromptRate` 抽一道已读且分数低的题；弹一张卡，可答、可跳过、可"不再提醒"。
- **答题与判分**：答完先给"自评要点清单"（本地、零成本）；`[让 AI 批改]` 才发 `/learn grade <attemptId>`，agent 判分回写，面板刷新显示要点覆盖与错处。默认 `gradingMode: "ai"` 时送交 AI 的按钮更显眼。

**每屏只拉一页数据**：面板按当前页调 `POST /api/learning` 的对应 `op`（`tree`、`question`、`audit`、`weak`、`favorites`），轮询刷新（面板可见时 2s，隐藏时停）；用户动作后立即拉取。

### 7.8 面板 → 会话的命令

插件注册人类命令 `learn`（`ctx.commands.register`），面板用 `ctx.remote.commands.execute` 触发：

- `/learn plan` —— 读状态，向 agent 要一份知识点树与阶段计划。
- `/learn import <file>` —— 请 agent 解析材料并写草稿。
- `/learn audit` —— 请 agent 做体检。
- `/learn grade <attemptId>` —— 判这次作答。
- `/learn ask <问题>` —— 就当前题目追问。

命令处理器做两件事：把一段结构化说明注入本次 agent 回合（`agent.inject` / `followup`），并在会话里留一行命令记录。**AI 的回答照常进聊天流**，面板只负责展示结构化结果。

若 `ctx.remote.commands.execute` 在实际环境里不可用，退化方案：面板把要发的话写进剪贴板并提示"粘贴到输入框回车"。这条退化路径在首日验证里确定。

### 7.9 界面用料与本地化

- 只用 `--dsw-alias-*` 主题 token；不写死颜色（图形除外）。
- 间距、字号、行高照抄宿主同类的管理列表页（插件管理页是参照物）。
- 所有可见文案走 `ctx.locale`，提供 `zh` 与 `en` 两份字典，插件标题/描述/详情页同样两份。
- 图标为原创 SVG。

### 7.10 配置

`Config`（用户可在 `cordis.patch.yml` 改）：

```ts
{
  storeDir?: string          // 默认 "learning"
  leavePromptRate?: number   // 0..1，默认 0.15
  quizCooldownMinutes?: number // 默认 10
  autoAcceptDrafts?: boolean // 默认 false
  maxDraftBytes?: number     // 单次入库草稿上限，默认 8 MiB
}
```

## 八、分期

**v1（可用的最小闭环）**
入库（brief → 草稿 → commit 校验 → 待核对）＋ 知识点树 ＋ 过题页（题干、术语释义、参考答案、上一题/下一题、已读标记）＋ 收藏。此时能真正开始学。

**v2**
阶段计划页、抽查与 AI 判分、错题本、关联/深/广问题串。

**v3**
体检报告、题库页的批量核对操作、材料清单与多文件导入、设置页。

每一期都以"装进宿主、在这种真实页面里用一遍"为验收，不做预览页。

## 九、风险与未验证项

1. **面板↔Host 的桥**（最高风险）：`host.call` 是否对 bundle 可用未验证。首日先做一个 20 行的最小插件（一个路由、一个按钮、一次调用）确认；不可用则走 `POST /api/learning` 路由，再不可用退到命令 + 剪贴板。
2. **PDF 文本抽取质量**：交给 agent，取决于其读取能力；锚定校验会在抽不出文本时降级为页码，此时"防编题"变弱，需要人工核对。
3. **成本与时延**：一次导入几百道题是长回合。分片（每次 30–60 题）、可中断、可续传；`commit` 失败不丢草稿。
4. **聊天噪音**：所有 AI 动作只通过命令触发，不由面板自动发起；抽查默认本地自评，AI 批改是显式动作。
5. **统计口径**：`ai-drafted` 的答案必须与源题库分列，否则掌握度失真。

## 十、验收标准

1. 新建一个目标 → 面板出现知识点树与阶段计划。
2. 导入一份 30 题的 Markdown 题库 → 入库成功；其中故意缺答案的 2 题进「待核对」并写明 `missing_answer`。
3. 过题时点术语出释义（不发请求给模型）；点「往深走」里的一条，聊天里出现对应问题并得到回答。
4. 离开题目时触发抽查，答完点「让 AI 批改」，面板显示要点覆盖与错处，记录进错题本。
5. 体检页显示零题知识点与重复题，并给出下一步建议。
6. `learning/` 下每个文件都能被人读懂、能 diff；手工改坏一处后 `commit`/`update` 报错而非静默接受。
7. 宿主重启后数据仍在，面板能读回。

## 十一、留给 builder 的决定

- 最小 Markdown 渲染子集（粗体、行内代码、有序/无序列表、段落）具体边界。
- 树与题目的排序细节、分页大小。
- 轮询间隔、缓存与失效策略。
- 命令参数的具体语法与转义。
- 图标与详情页文案。
- 是否把 `progress.json` 做成纯派生缓存（v1 建议先落盘，简单）。
