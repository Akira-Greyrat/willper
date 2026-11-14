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

测试从 99 个增加到 113 个，全绿。

## 未实测（需要重启宿主）

- **面板界面**：Client 半已写好并通过语法检查，但安装时的模块代是占位版；替换已链接的 bundle 不会销毁旧注册（见 `docs/notes/api-shapes.md` §6），所以必须重启 DSH 才会加载新面板。
- 重启后要人工过一遍：侧栏图标 → 空状态 → 填目标 → 「让 AI 拆知识点」→ 学习页点术语 → 题库页接受/驳回 → 收藏页。

## 遗留

- 面板的会话选择依赖新加的 `sessions` op，同样要重启后才存在。
- 图片只记页码，未做右侧文档页定位（按设计排在 v3）。
