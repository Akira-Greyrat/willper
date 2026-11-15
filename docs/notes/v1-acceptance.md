# 学习中心 v1 · 端到端验收记录

日期：2026-11-14
环境：DSH Desktop 0.2.2-rc.3，工作目录 `D:\Struggle\Workspace\willper`
插件：`@local/learning-center` 0.1.0（已安装，`application: applied`）

## 已实测（宿主侧、真实插件、真实文件）

| 项 | 做法 | 结果 |
| --- | --- | --- |
| 工具注册 | 装插件后直接调用 `learning_status` | ✅ 返回题库统计与下一步 |
| 命令注册 | 插件激活无诊断 | ✅ `/learn` 注册成功（行为由单测覆盖） |
| 路由 | `POST http://127.0.0.1:9862/api/learning` `{op:"meta"}` | ✅ 200 + 目标/树/计划/设置 |
| 写目标 | `learning_plan set_target` | ✅ 写入 `learning/meta.json` |
| 写知识点 | `learning_plan upsert_tree` 四个节点 | ✅ 幂等合并，nodeCount=4 |
| 导入 | 6 条草稿（含 2 个故意坏例）→ `learning_import commit` | ✅ 新增 3 条可练、2 条待核对、1 条丢弃 |
| 标注原因 | 检查 `questions.jsonl` | ✅ `missing_answer`、`image_hint_missing` 各一条，进待核对 |
| 术语 | `inbox/terms.jsonl` 两条 | ✅ 入库，`terms.json` 可读 |
| 重复导入 | 同一批草稿再 commit 一次 | ✅ `合并 5`，题号与首次完全一致，总数仍 5 |
| 锚定校验 | `source.anchor` 必须出现在 `materials/demo-bank.txt` | ✅ 未提供文本时会整批标 `anchor_unverified`（单测覆盖） |
| 路径安全 | `assertInside` | ✅ 拒绝 `../` 与同名前缀兄弟目录（单测覆盖） |

实测发现的偏差：首次导入报告写「新增 5」，其中 2 条其实是待核对，计数重复。已在 `src/ingest.js` 修正为「新增只计可练的题」，并有测试钉住；该修正要等宿主重启后才在已装插件里生效。

## 独立评审后的修复（2026-11-14）

整支改动交给一个独立 reviewer 审过（base 6fa56b1 → head a60c014），Critical/Important 全部修完，每条修复都是先写失败测试再改：

| 问题 | 修复 |
| --- | --- |
| 按"本批是否提交"判孤儿，分批导入会让前一批整批掉出练习 | 改为按材料内容判定：材料抽出的文本里找不到该题的锚点才标孤儿；分批导入互不影响 |
| `updateQuestion` 不做任何校验，一次坏 patch 能把题库写坏 | 走 `validatePatch`：题干长度、答案/要点、状态枚举、知识点存在性全部校验；坏 patch 抛错且库不变；改题干会重算指纹并记住旧指纹 |
| 面板默认取第一个会话，多会话时读写错库 | 会话列表 + 面板顶部选择器；切换后重载 |
| 注册没挂 `ctx.effect`，卸载不释放 | 每个注册一个 `ctx.effect`，共 6 个 |
| 路由把"没有工作目录"报成 `bad json` | 解析 store 的错误单独上报真实原因 |
| 任何来源的 POST 都能改数据 | 要求 `content-type: application/json`，并拒绝跨源 `Origin` |
| 去重只看"同文件同题干"，跨文件重复会存两遍 | 归一化题干指纹（含标点、全角）跨文件去重，重复项进待核对并带 `duplicate_of` |
| AI 通过工具加的题被记成 `provenance: user`、直接可练 | 一律 `ai-drafted` + 待核对，等人工接受 |
| 只有"下一题"，读完一屏就死路，且提示文案是错的 | 加"上一题"与"复习已读"，"都读过了"与"没有题"分开 |
| 待核对页的"改"用 `window.prompt`，Electron 里大概率无效 | 改成行内 textarea 编辑 |

测试从 99 个增加到 114 个，全绿。

## 面板可用性评审后的修复

又做了一轮界面评审（同一个独立 reviewer），修掉六处会直接影响使用的问题：

- 主按钮在主题里**看不见字**（主色与正文同色）→ 改为描边 + 主色文字；选中节点与页签也改成描边/下划线，不再依赖和背景同色的 `bg-layer-2`。
- 首屏把"加载中"显示成"先选中一个会话"，且错误被吞 → 区分加载/空/错误三种状态；header 加「刷新」；toast 8 秒自动消失。
- **复习模式下「下一题」原地打转** → 面板自己持有队列游标，翻到最后才重取。
- 空状态与计数说谎（题库非空却说"题库还是空的"、把"剩余未读"说成"可练"）→ 按数据选文案，题卡显示 已读/总数，待核对空态单独一句，并补上"用 `/learn import` 导入"的提示。
- 待核对页的「改」进入编辑后按钮还写着"接受/驳回"（实际语义是保存/取消），且留空会静默丢弃 → 编辑态改标"保存/取消"，空题干留在原地提示；flag 译成中文。
- 收藏行点击没有错误处理 → 补上。

## 重启后的实机验证（2026-11-14 21:55，端口 9755）

宿主已重启，加载的是新一代模块。以下都是对运行中的宿主直接做的：

| 项 | 做法 | 结果 |
| --- | --- | --- |
| 新 op 生效 | `POST /api/learning {op:"sessions"}` | ✅ 200，返回 2 个会话（旧一代这里是 400） |
| 侧栏图标 | Client Slot `sidebar.panellist` | ✅ `learning` occupant，`active: true` |
| 主面板 | Client Slot `main` | ✅ `learning` occupant，`active: true` |
| 工具 | 直接调用 `learning_status` | ✅ 5 题 / 3 可练 / 2 待核对 |
| 面板数据 | `meta`/`tree`/`terms`/`queue`/`checklist`/`favorites` 六个 op | ✅ 全部 200，内容与磁盘上的 `learning/` 一致 |
| 术语 | `question` op 返回 `termHits` | ✅ 「闭包」命中 `start:3,end:5`，释义可取 |
| 收藏往返 | `favorite on` → `favorites` → `favorite off` | ✅ 列表先有后空，数据已还原 |
| 复习模式 | `queue {revisit:true}` | ✅ 返回全部 3 题 |

## v2b · 判分闭环与错题本验收（2026-11-15）

真机直接打路由与工具，全部通过：

- `attempt start`（UTF-8 中文正文）→ `a_447c0feb`；`attempt get` 取回同一条，`grade: null`。
- `learning_grade open` 的返回文本含题干、参考答案、三个要点与学习者答案（第一版只渲染了题号，验收当场发现并修掉，加了渲染断言）。
- `learning_grade submit`（转述的 covered/missed + feedback + suggestion）→ 得分 0.33；`attempt get` 看到完整 grade；`weak` 返回该题 `misses: 1, lastScore: 0.33`；`question` 的 `lastAttempt` 指回这次作答。
- `quiz`：把 `leavePromptRate` 置 1、冷却置 0 后抽中错题并返回卡片，同时把 `lastQuizAt` 写进 `meta.settings`；随后把设置还原为 0.15 / 10。
- `learning_question update` 写 `reference.supplement`（134 字）→ `question` 原样返出，`points` 未被冲掉。
- 顺带修掉一个真实场景的坑：手改 `meta.json`（记事本默认写 BOM）会让所有 op 变成 400 `Unexpected token` —— `readJson` / `readJsonl` 现在先剥 BOM，有测试钉住。

待人工确认（UI）：答题框提交后的「批改中」与结果块、低分优化答案、抽查弹卡就地作答、错题本页与移出。

## v2a · 问题串验收（2026-11-15）

- 135 个测试全绿（v2a 新增：related 5 个、ingest 3 个、store 1 个、views 2 个、tools 1 个、client 2 个），包检查通过。
- 真机：在 `learning/` 里放入两条带 `related` 的草稿并调用 `learning_import commit` → `新增 1、合并 1`。检查 `questions.jsonl`：可解析的题干换成了题号 `q_94e7275b`，指不到的题干被丢弃，`deeper`/`broader` 原样入库。
- 路由：`POST /api/learning {op:"question", id:"q_70dd6b2b"}` 返回 `relatedQuestions: [{ id: "q_94e7275b", stem: "什么是闭包？它解决了什么问题？" }]`，`deeper` 为「闭包捕获的是变量还是值？」。
- 待人工确认：卡片上三组 chip 的显示与点击、空关联网题目的「让 AI 补这题的关联网」入口。
- 独立评审（range 654ff79..6d5ccb1）后修掉四条：重导同一材料不再清空已存关联网、只改 related 一栏不会清掉另外两栏、改题时丢弃的关联题干会随结果回传、点「刷新」不再把当前卡片换成队列第一题（只重取当前题）。测试 139 个全绿。

## 面板人工确认（2026-11-14 22:20 起，23:0x 收尾）

- 用户按 Ctrl+R 后，中间栏出现面板（此前白屏的两层原因：未 `inject` 就读 `ctx.layout`；宿主持有的旧客户端包导致 404）。
- 术语释义按反馈改为贴着术语的浮动小窗（视口内夹取、靠底翻上、点外部/Esc/滚动收起、被解释的词用品红强调），`popoverStyle` 与 `isOutsidePopover` 有单测。
- 侧栏图标按反馈改为 16 单位栅格 + 1.5 线宽（宿主向插件请求 16px、折叠 18px），与「插件」「自动化任务」同规格。
- 面板版式对齐宿主管理页：页标题 20px/500/28、正文 13px、题干 14px。
- **用户确认「正常了」**。逐项交互中，术语浮窗与图标/字号已明确确认；下一题/上一题、题库页「接受」后的列表与计数刷新，我这边只在接口层验证过（见上表），未收到逐项回复。

## 只剩「看一眼」的部分

渲染有没有白屏、按钮文字是否清楚、选中态是否可见，这些需要对页面看一眼（我这边没有浏览器控制，只能验证到数据与注册层）。清单见 `docs/notes/after-restart.md`。

## 未实测（需要重启宿主）

- **面板界面**：Client 半已写好并通过语法检查，但安装时的模块代是占位版；替换已链接的 bundle 不会销毁旧注册（见 `docs/notes/api-shapes.md` §6），所以必须重启 DSH 才会加载新面板。
- 重启后要人工过一遍：侧栏图标 → 空状态 → 填目标 → 「让 AI 拆知识点」→ 学习页点术语 → 题库页接受/驳回 → 收藏页。

## 遗留

- 面板的会话选择依赖新加的 `sessions` op，同样要重启后才存在。
- 图片只记页码，未做右侧文档页定位（按设计排在 v3）。
