# Gateway 日志请求/响应详情

为 LLM Gateway 日志增加完整的请求/响应 body 存储与展示。

## 现状

`relay_logs` 表仅存储元数据（路由、tokens、费用、耗时、状态），不记录任何 request/response body。用户无法查看具体请求内容和 LLM 返回内容，难以排查问题。

## 设计

### 数据层

**DB**：`relay_logs` 表新增两个 TEXT 字段：

```sql
ALTER TABLE relay_logs ADD COLUMN request_body TEXT;
ALTER TABLE relay_logs ADD COLUMN response_body TEXT;
```

- 存储 `JSON.stringify(InternalRequest)` / `JSON.stringify(InternalResponse)`
- 可为 null（旧日志、采集失败）
- 随 7 天日志聚合清理，无额外生命周期管理

**类型**：`RelayLog` 接口新增 `requestBody?: string` / `responseBody?: string`。

**DAO**：

- `getRecentLogs()` SELECT 显式列举字段，排除 body
- 新增 `getLogDetail(db, id): RelayLog | undefined` 按 ID 查完整日志（含 body）
- `insertLogs()` 写入新字段

### 采集层

**StatsCallback** 扩展 `requestBody?: string` / `responseBody?: string`。

**非流式 `relay()`**：

- 请求：函数入口持有 InternalRequest，直接序列化
- 响应：成功时持有 InternalResponse，序列化传入 callback；失败时 undefined

**流式 `relayStream()`**：

- 请求：同上
- 响应：wrappedStream 中额外累积文本 content（从 chunk delta 拼接），流结束后构造简化 InternalResponse 序列化
- 流失败时 undefined

**过滤**：序列化前过滤 messages 中的图片/音频二进制数据，替换为 `"[image data omitted]"` / `"[audio data omitted]"` 占位符。文本完整保留。

**GatewayPresenter**：onStats 回调透传 body 给 statsCollector.record()。

### UI 层

**LogTab 改造**：

- 点击日志行打开右侧 Sheet 抽屉（shadcn/vue `Sheet`, `side="right"`, 宽 ~50vw）
- 移除现有 toggleExpand 内嵌面板

**抽屉布局**：

- 顶部：元数据摘要（模型、渠道、tokens、费用、耗时、状态）
- 错误区：仅 error 时显示红色错误块
- 内容区：请求/响应 tab 切换
- JSON 展示：`<pre>` + `JSON.stringify(parsed, null, 2)` 格式化，不引入额外依赖
- 按需加载：打开抽屉时调 `getLogDetail(id)`，loading spinner
- body 为 null 时显示"无内容"

**IPC**：GatewayPresenter 暴露 `getLogDetail(id: number): RelayLog | undefined`。

## 参考

借鉴 octopus 项目的实现：同表存储、InternalRequest/Response 统一格式、图片/音频过滤、流式 chunk 聚合。与 octopus 差异点：列表查询排除 body 按需加载（octopus 列表直接返回全量）。

## 改动文件清单

| 文件                                                 | 变更                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `src/main/db/database.ts`                            | DDL 新增 request_body / response_body 列                         |
| `src/main/db/models/logDao.ts`                       | getRecentLogs 排除 body、新增 getLogDetail、insertLogs 写入 body |
| `src/shared/types/gateway.d.ts`                      | RelayLog 新增 requestBody / responseBody                         |
| `src/shared/types/presenters/gateway.presenter.d.ts` | 新增 getLogDetail 方法                                           |
| `src/main/gateway/relay.ts`                          | StatsCallback 扩展、relay/relayStream 采集 body、过滤逻辑        |
| `src/main/gateway/stats.ts`                          | StatsCollector.record 接收 body 字段                             |
| `src/main/presenter/gatewayPresenter.ts`             | onStats 透传 body、暴露 getLogDetail                             |
| `src/renderer/src/components/gateway/LogTab.vue`     | 移除 expand、新增 Sheet 抽屉 + 详情加载                          |
