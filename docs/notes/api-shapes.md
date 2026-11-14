# DSH 接口形状实测（0.2.2-rc.3 / Desktop）

本文件不是文档转述，是在这台机器上装了一个探测插件后观察到的结果。后续任务照此实现。

## 1. Agent 工具

```js
ctx.tools.register({
  name: 'probe_echo',
  description: '……',
  parameters: {                       // 参数是「每属性 required: true」的 DSL，不是标准 JSON Schema
    text: { type: 'string', required: true, description: '……' },
  },
  output: {                           // 输出必须是标准 JSON Schema：required 放在对象层
    schema: {
      type: 'object', additionalProperties: false,
      required: ['echo'],
      properties: { echo: { type: 'string' } },
    },
    render: (args, value) => [{ type: 'text', text: `echo=${value.echo}` }],
  },
  execute(args, exec) { return { echo: args.text, hasAgent: Boolean(exec.agent) } },
})
```

实测结论：
- 缺 `output` 直接拒绝激活：`tool "x" must declare output { schema, render, presentationMeta? }`。
- `output.schema.properties.<k>.required = true` 报 `unsupported JSON schema`；`required` 必须在对象层给数组。
- `exec.agent` 存在，字段：`id, session, inbox, model, systemPrompt, ctx, scope, followup, inject, …`。

## 2. 命令

```js
ctx.commands.register({
  definitionId: 'learning-probe',      // 普通字符串即可，不需要 CommandDefinitionId 品牌构造
  name: 'probe',
  description: '……',
  input: { hint: '[text]', attachments: false },
  handler: invocation => ({ kind: 'success', text: '…' }),
})
```

`invocation` 上有 `agent`、`rawInput`、`attachments`。

## 3. 让 agent 说话（关键）

bundle **不能** `import('@deepseek-ai/dsh-llm')`（`Cannot find package`）。手搓消息体可以：

```js
agent.followup({
  role: 'user',
  content: [{ type: 'text', text: '……' }],
  source: { kind: 'user' },
})
```

实测返回 `followup accepted`，插件激活全程无报错。

取 agent：`ctx.get('agents').list()`（数组），元素有 `session.id`、`followup`、`inject`。按会话取用 `ctx.get('agents').get(sessionId)`。

## 4. HTTP 路由

```js
ctx.webServer.register({ kind: 'exact', path: '/api/x', handler: async (req, res) => { … } })
```

- `handler(req, res)` 是原生 `node:http`，**自己写状态码和响应**；POST 可收（`for await (const chunk of req)`）。
- 实测 `POST http://127.0.0.1:9862/api/probe-3` 返回 200 + JSON。
- 只注册 GET/HEAD 且要用 Fetch 风格时可以用 `{ kind, path, resource }`，POST 必须用 `handler`。

## 5. 面板

- `sidebar.panellist`（list，id）+ `main`（keyed，同一 key）配对生效：实测两者都出现 `learning` 且 `active: true`。
- `main` 的 key 若与已存在者相同会**替换**占用者。
- slot 标准 props 含：`useSessions`、`useSessionStatus`、`useSessionRetainInfo`、`useWorkspaces`、`usePanelInfo`、`useRemoteAccess`、`useContextMenu`。
- Client inspect 可正常读取（早前一次超时是偶发）。

## 6. 迭代时的坑（重要）

替换一个**已链接**的 bundle 不会销毁旧模块注册的东西：

- 重新 `remove_bundle` + `install_bundle` 同一路径后，旧的路由/工具仍在；
- 新代码若注册同名路由，激活直接失败：`webserver: duplicate exact route "/api/probe"`；
- 换一个从未用过的路径即可让新一版激活。

因此：正式插件第一次装上之后，再改代码要**重启 DSH**（或换路由路径）才会加载新的一代模块。开发期用唯一路径，交付前定成 `/api/learning` 并重启一次。
