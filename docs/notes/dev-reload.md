# 开发期怎么让改动生效

结论：**不用重启整个应用**。改完代码后做一次「插件行重启」，然后刷新页面即可。

## 为什么

宿主把插件的客户端包在插件加载时一次性读进内存，之后一直用那份字节；页面刷新会按新的文件时间戳算出一个新 rev 去取包，内存里没有对应资源 → `GET /plugins/... 404`，模块不加载，面板变空白。

插件行重启会重新跑一次装配（reconciliation），那时会重新 `readFileSync` 拿最新字节，rev 与内容就对齐了。

## 怎么做

1. 用 `cordis_inspect_query` `Config.listConfigs`（`name: "@local/learning-center"`）拿到 entry id（`include:learning-center`）。
2. `plugin_manager` `set_plugin` `enabled: false`，再 `enabled: true`。
3. 浏览器里 **Ctrl+R** 刷新页面。

## 注意

- Host 半（工具、命令、路由）在重启插件行时立刻生效，刷新页面本身不影响它们。
- 如果插件行重启报 `duplicate exact route`，说明某个注册没被释放——这正是 `ctx.effect` 要保证的事；出现过一次就说明有注册漏挂。
- 只有更换依赖、改 patch、或插件行重启失败时，才需要退出整个应用。
