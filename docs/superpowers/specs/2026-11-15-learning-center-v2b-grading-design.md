# 学习中心 v2b · 判分闭环与错题本 · 设计

- 日期：2026-11-15
- 状态：待批准
- 范围：答题、判分、离开题目抽查、错题本。不做阶段计划页与体检报告（那是 v2c）。
- 依据：`2026-11-14-learning-center-design.md` §八 v2 剩余项；判分时机由使用者定为「每次答完立刻判」

## 一、要什么

在题目卡上能写下自己的答案，提交后**立刻**由会话里的 AI 按参考答案的要点批改，卡片上当场显示：

- 命中了哪些要点、漏了哪些、哪里说错了；
- 一句简洁的纠错反馈。

同一套记录支撑两件事：
- **离开题目时抽查**：切题/切页时按设置的概率抽一道**已读**题让你再答一次，可跳过、可"这轮不再提醒"；
- **错题本**：答过且没拿满要点的题，按漏点次数排序，可手动移出。

## 二、非目标

- 不打百分制分数。问答题的"87 分"是假精确；只记要点覆盖与漏点，错题本按漏点次数排。
- 不做间隔重复调度（SRS）：抽查顺序只用"漏得多 + 读得早"的简单启发式。
- 不做语音作答。
- 判分不在后台偷偷跑：每次都是当前会话里的一条可见消息。

## 三、约束与既定事实

- 面板不能调模型（v1 的边界）：判分只能发一条消息进当前会话，由 agent 调工具写回。
- 会话是可见的，所以**每次提交都会多一轮对话**。这是使用者选"立刻判"接受的代价；界面必须让这一轮尽量短。
- `attempts.jsonl`、`progress.misses/lastScore`、`meta.settings.leavePromptRate/quizCooldownMinutes` 在 v1 已存在，本批不动结构。

## 四、三个备选与选定

**判分结果怎么来**

- 备选一：让 agent 回一段自然语言，插件解析出要点。**不选**：解析中文长文的格式必然脆弱。
- 备选二：工具用结构化参数收判分结果（`covered` / `missed` / `wrong` / `feedback`），插件只存不猜。**选它**：模型负责判断，代码负责结构与存储。
- 备选三：让模型直接给 JSON 字符串再解析。**不选**：同备选一的问题，还要处理 JSON 里混 markdown 的情况。

**分数怎么算**

不向模型要分数。`score = covered.length / (covered.length + missed.length)`，由插件算；没有要点时按 `null` 处理，不进错题本。

**面板怎么知道判分完成**

- 备选一：只给「刷新」按钮，人工拉。**不选**：立刻判的意义就没了。
- 备选二：提交后轮询 `attempt` op，最多 90 秒。**选它**：无需服务端推送，v1 已有轮询先例。
- 备选三：SSE。**不选**：为一条短反馈引入长连接不划算。

## 五、数据

`attempts.jsonl` 一行一次作答：

```json
{
  "id": "a_7f3c2a",
  "questionId": "q_94e7275b",
  "at": "2026-11-15T19:40:00.000Z",
  "kind": "study",
  "answer": "使用者写的答案",
  "grade": {
    "covered": ["函数 + 词法环境"],
    "missed": ["用于私有化/状态保持"],
    "wrong": ["「闭包就是立即执行函数」"],
    "feedback": "……",
    "score": 0.5,
    "grader": "ai",
    "at": "2026-11-15T19:40:12.000Z"
  }
}
```

`kind` 取 `study`（过题时答）或 `quiz`（抽查时答）。`grade` 一开始是 `null`，判完写回同一行。

`progress.json` 每题多两个可选字段：`dismissed`（从错题本移出，只是标记）、`lastKind`。

**冷却时钟**：`meta.settings.lastQuizAt`（ISO 时间）。**在弹卡的那一刻写**，不是答完才写——跳过的抽查也要冷却，否则下次切题立刻又弹。这给 `meta.settings` 新增一个字段，是本批唯一的结构变化。

## 六、工具与路由

新增一个 agent 工具，**两个动作**（评审指出：模型必须先拿到题与答案才能判，而消息里只许带一行）：

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `learning_grade` `open` | `{ action: 'open', attemptId }` | `{ question: { id, stem, answer, points }, attempt: { id, kind, answer, at } }` |
| `learning_grade` `submit` | `{ action: 'submit', attemptId, covered: string[], missed: string[], wrong: string[], feedback }` | `{ ok, score, misses }` |

`submit` 的校验（不过就整条拒绝、不写库）：

- `covered` / `missed` 的元素必须**逐字**是 `reference.points` 里的条目；
- 两者并集必须等于全部要点、交集为空——漏写的要点按"漏"算，不允许悄悄少判；
- `wrong` 与 `feedback` 是自由文本，可以为空。

`score = covered / (covered + missed)`；`covered + missed` 为空时 `score = null`，不进错题本。

**重判是幂等的**：同一条 attempt 再提交一次判分，覆盖旧 `grade`，`progress.misses` 按差值调整（旧的不满分 −1、新的不满分 +1），不重复累加。

路由新增四个 op：

| op | 参数 | 返回 |
| --- | --- | --- |
| `attempt` | `{ action: 'start', questionId, answer, kind }` | `{ attemptId }`——写一行 `grade: null` |
| `attempt` | `{ action: 'get', attemptId }` | `{ attempt }` |
| `weak` | `{}` | `{ items: [{ id, stem, nodeId, misses, lastScore, lastAttemptAt, dismissed }] }` |
| `setDismissed` | `{ questionId, on }` | `{ ok }` |

题卡视图（`question` op 的返回值）多一个 `lastAttempt: { id, at, kind, grade } | null`——最近一次作答。这样**判分迟到**（判完你已经翻页或刷新过）也能在回到这题时看到，不必重判。

## 七、界面与流程

**过题时答题**

```
┌ 题干……                                     ┐
│ ┌ 写下你的答案（可先空着看参考答案）────────┐ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│ [提交并批改]  [看参考答案]  [★] [上一题] [下一题] │
│ ─────────────────────────────────────────── │
│ 批改中…（第 3 秒，最多 90 秒）                 │
│ 命中 ①②   漏了 ③   说错一处：……              │
└──────────────────────────────────────────┘
```

- 点「提交并批改」：先把答案落盘（`attempt start`），再发一条**短消息**进会话：`批改答题 a_7f3c2a：先 learning_grade open 取题与答案，再 submit 写回覆盖/漏点/说错`。会话里只留这一行与 agent 的简短回复，详细的覆盖结果在面板上。
- 面板每 2 秒拉一次 `attempt get`，拿到 `grade` 就停；90 秒仍未判完就停轮询并显示「AI 还没批完，点重试会再发一次批改请求」。**重试是重发消息**，不是重取——模型没调工具时重取没有意义；`submit` 幂等，所以重发不会把 misses 记两遍。
- 判完显示：命中/漏掉/说错的要点 + 反馈；同一张卡可以"再答一次"（生成新 attempt）。
- 打开一张以前答过的题时，卡片直接显示 `lastAttempt.grade`（判分迟到也补得回来）。
- 没有要点的题（`reference.points` 为空）：提交按钮禁用，提示"这题没有要点，无法按要点批改"。

**离开题目时抽查**

- 触发：切到另一题、切页签、或点「下一题」，且 `meta.settings.leavePromptRate` 命中、距上次抽查超过 `quizCooldownMinutes`。
- 选题：`weak` 里没被 dismissed、已读、按 misses 降序取前 10，随机一个。
- 交互：弹一张卡「先答一道再走」→ 答 → 提交并批改（同上轮询）；或「跳过」「本轮不再提醒」。
- 抽查作答 `kind: 'quiz'`，`misses` 照常累加。

**错题本页**

- 列表来自 `weak`（misses > 0 且未 dismissed），显示题干、漏点次数、最近一次覆盖。
- 每行「再答一次」（跳到学习页该题并聚焦答题框）与「移出」（`setDismissed`）。
- 空态：「还没有错题，先去过几道题」。

## 八、验收标准

1. 无要点题：提交按钮禁用并有说明。
2. 有要点题：提交后先出现「批改中」，AI 判完 90 秒内出现命中/漏点/说错与反馈；面板显示与 `attempts.jsonl` 里的 `grade` 一致。
3. 同一题再答一次会新增一行 attempt，`progress.misses` 跟着累加。
4. 抽查：把 `leavePromptRate` 临时设为 1、冷却 0，切题必弹；答完同样自动判；点跳过不产生 attempt，但 `settings.lastQuizAt` 已更新（跳过后进入冷却）。
5. 错题本：答过没满分的题出现在列表里，按 misses 降序；移出后不再出现，但 `attempts.jsonl` 里的记录还在。
6. 判分迟到：提交后立刻切到别的题，等 AI 判完再切回，卡片上应显示这次的判分结果。
7. 重试：对同一条 attempt 再发一次批改请求并 `submit`，`progress.misses` 不重复累加。
8. `node --test` 全绿，`scripts/check-package.mjs` 通过。

## 九、风险

- **聊天噪音**：每题一轮。缓解：发进会话的消息只有一行、指示 agent 简短回复；详细结果在面板。
- **判分依赖 agent 自觉调工具**：如果模型不调 `learning_grade`，面板会一直"批改中"到超时。缓解：消息里写明工具名与参数；超时提示可重试；不改库。
- **轮询开销**：每 2 秒一次 `attempt get`，最多 45 次；单机文件读，可接受。

## 十、留给 builder 的决定

- 答题框高度、是否支持 Enter 提交（默认 Ctrl+Enter）。
- 抽查弹卡的样式与文案细节。
- 轮询间隔与超时（建议 2s / 90s）。
- 「再答一次」是否清空原答案（建议保留，方便改）。
