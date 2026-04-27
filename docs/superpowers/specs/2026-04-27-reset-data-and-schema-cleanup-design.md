# Reset Data & Schema Cleanup Design

**Date**: 2026-04-27
**Branch**: brave
**Scope**: 两项并行工作——新增重置数据功能 + 清理数据库 schema 死字段

---

## 一、重置数据功能

### 目标
用户可在 Settings → 通用 中一键删除所有本地数据，恢复到全新状态，需手动重启应用。

### 删除范围
- `{userData}/.slime/gateway.db`（SQLite 数据库）
- `{userData}/.slime/config/slime.config.json`（用户配置）

### 主进程：AppPresenter

`src/main/presenter/appPresenter.ts`：新增方法

```ts
async resetAllData(): Promise<{ success: boolean; error?: string }>
```

- 用 `fs/promises.unlink` 删除两个文件
- 文件不存在（`ENOENT`）时静默跳过
- 失败返回 `{ success: false, error: message }`

`src/shared/types/presenters/app.presenter.d.ts`：同步添加接口声明。

IPC 路径：`presenter:call → appPresenter → resetAllData`（`appPresenter` 已在 DISPATCHABLE 集合中，无需额外注册）。

### 渲染进程：Settings UI

**SettingsDialog**（`src/renderer/src/components/settings/SettingsDialog.vue`）：
- 左导航新增「通用」tab
- `activeTab` 类型扩展为 `"profile" | "gateway" | "general"`

**新建 GeneralSettings.vue**（`src/renderer/src/components/settings/GeneralSettings.vue`）：

```
通用
└── 危险区域（红色标题 + 红色 border section）
    ├── 标题：重置数据
    ├── 描述：删除所有本地数据并恢复出厂设置，操作不可撤销
    ├── 按钮：「重置数据」（red variant）
    └── 交互流程：
        → 点击：AlertDialog 二次确认（"此操作不可撤销，确认删除所有数据？"）
        → 确认：调用 usePresenter("appPresenter").resetAllData()
        → 成功：按钮替换为「重置成功，请重启应用」（禁用，绿色文字）
        → 失败：按钮下方显示红色错误信息
```

---

## 二、Schema 清理

### 原则
- 删除完全未使用或无实际业务逻辑的字段
- `channels.base_urls`（数组）简化为 `base_url`（单值），因为所有调用方始终只取 `[0]`
- 同步删除对应 migration ALTER TABLE 块（database.ts）
- 兼容代码删除后，持有旧版 DB 的用户需用"重置数据"功能重新初始化

### 字段变更清单

#### channels 表
| 操作 | 字段 | 原因 |
|---|---|---|
| 删除 | `proxy` | OutboundConfig 传递但 httpRequest 不消费，代理从未生效 |
| 删除 | `priority` | 仅影响 listChannels UI 排序，路由不用；与 group_items.priority 语义重复 |
| 删除 | `weight` | balancer 用 group_items.weight，channel 层 weight 从未被路由读取 |
| 改名+简化 | `base_urls TEXT`（JSON数组）→ `base_url TEXT`（单值） | 所有调用方只取 `[0]`，数组是过度设计 |

#### api_keys 表
| 操作 | 字段 | 原因 |
|---|---|---|
| 删除 | `max_cost` | 只存储，relay 链路无费用限额校验逻辑 |

#### models 表
| 操作 | 字段 | 原因 |
|---|---|---|
| 删除 | `priority` | 仅影响 listModels UI 排序，selector/balancer 不用 |

#### agent_session_configs 表
| 操作 | 字段 | 原因 |
|---|---|---|
| 删除 | `thinking_budget` | UI 可设置、DB 存储，但 agentChatPresenter.streamText 从未读取该值 |

#### agent_messages 表
| 操作 | 字段 | 原因 |
|---|---|---|
| 删除 | `is_context_edge` | 字段存在但 presenter/contextBuilder 无任何读取业务逻辑 |
| 删除 | `metadata` | 只初始化为 `{}`，无任何业务代码读取内容 |

#### agent_usage_stats 表
| 操作 | 原因 |
|---|---|
| 删除整张表 | `createUsageStats` 从未被任何 Presenter 调用，零写入，整体死代码 |

### 迁移代码清理

删除 `database.ts` `createDb()` 中全部 8 个 try-catch ALTER TABLE 块（L221~L289）。

删除 `agentDao.ts` `ensureBuiltin()` 中两条条件 UPDATE：
- hal-ai capabilityRequirements `"chat"` → `"reasoning"` 迁移
- hal-ai disabledTools 补填迁移

### 受影响的代码路径

**channels.base_urls → base_url**：
- `src/main/db/models/channelDao.ts`：类型 `baseUrls: string[]` → `baseUrl: string`，INSERT/UPDATE 参数，SELECT 反序列化（去掉 JSON.parse）
- `src/main/gateway/relay.ts`：`channel.baseUrls[0]` → `channel.baseUrl`（2处）
- `src/main/presenter/gatewayPresenter.ts`：`baseUrls[0]` → `baseUrl`
- `src/main/gateway/outbound/`：各 adapter 中 `config.baseUrl` 调用方式不变（已经是单值）
- `src/shared/types/gateway.d.ts`（或同等类型文件）：`baseUrls: string[]` → `baseUrl: string`
- 渲染进程表单组件（onboarding AddChannelStep、ApiKeyTab 等）：`baseUrls[0]` 读写改为 `baseUrl`

**channels.proxy 删除**：
- `channelDao.ts`：Channel 类型、INSERT/SELECT
- `src/main/gateway/outbound/types.ts`：`OutboundConfig.proxy` 删除
- `src/main/gateway/relay.ts`：传递 proxy 的代码
- 渲染进程表单（如有 proxy 输入项）

**agent_usage_stats 表删除**：
- `src/main/db/models/agentUsageStatsDao.ts`：整个文件删除
- `src/main/db/index.ts`：删除 re-export
- `src/shared/types/agent.d.ts`：删除 `UsageStats` 类型
- `src/main/db/models/agentSessionDao.ts`：删除手动级联清理语句（L101、L116 的 `DELETE FROM agent_usage_stats`）

**其余字段删除**：各对应 DAO、shared types、presenter、UI 组件中同步清理。

---

## 三、不改动的内容

- `channel_keys`：字段全部保留，逻辑完整
- `groups_.is_builtin`：保留，用于防删除保护
- `group_items.priority` / `weight`：保留，balancer 核心逻辑
- `api_keys.expires_at` / `allowed_models` / `is_internal`：保留，auth 逻辑完整
- `relay_logs` 所有字段：保留，日志展示和统计完整
- `stats_hourly/daily` 所有字段（含 success_count/fail_count/avg_latency_ms）：保留
- `agent_sessions` 所有字段：保留
- `agent_session_configs`（除 thinking_budget）：保留
- `agent_messages.status`：保留，context 构建过滤条件

---

## 四、测试要求

- 重置功能：文件存在时删除成功、文件不存在时不报错、IPC 失败时 UI 显示错误
- Schema 变更后：`pnpm run typecheck` 通过，`pnpm test` 通过
- `channels.base_url` 迁移：确保 onboarding 流程和渠道 CRUD 正常
