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

## 未实测（需要重启宿主）

- **面板界面**：Client 半已写好并通过语法检查，但安装时的模块代是占位版；替换已链接的 bundle 不会销毁旧注册（见 `docs/notes/api-shapes.md` §6），所以必须重启 DSH 才会加载新面板。
- 重启后要人工过一遍：侧栏图标 → 空状态 → 填目标 → 「让 AI 拆知识点」→ 学习页点术语 → 题库页接受/驳回 → 收藏页。

## 遗留

- 面板的会话选择依赖新加的 `sessions` op，同样要重启后才存在。
- 图片只记页码，未做右侧文档页定位（按设计排在 v3）。
