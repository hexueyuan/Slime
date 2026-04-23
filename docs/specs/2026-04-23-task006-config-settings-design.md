# TASK-006 设计文档：ConfigPresenter + 设置 UI

## 概述

实现 ConfigPresenter 的 JSON 持久化存储，并在侧边栏添加设置 Dialog，支持配置 AI Provider（apiKey/model/baseUrl）。AgentPresenter 改为从 ConfigPresenter 读取配置，环境变量作为 fallback。

## 范围

| 模块 | 说明 |
|------|------|
| ConfigPresenter | 实现 get/set，JSON 文件持久化 |
| 设置 Dialog | 侧边栏底部按钮 → Dialog 弹窗 → LLM Provider 表单 |
| AgentPresenter | 从 ConfigPresenter 读取 AI 配置 |

## 技术选型

| 模块 | 方案 |
|------|------|
| 持久化 | JsonStore（复用现有工具类） |
| 配置文件路径 | `paths.configFile`（`~/.slime/config/slime.config.json`） |
| Dialog UI | shadcn/vue Dialog 组件 |
| 表单 | 原生 input + shadcn Select |

## 数据模型

配置文件结构（flat key-value JSON）：

```json
{
  "ai.provider": "anthropic",
  "ai.apiKey": "sk-xxx",
  "ai.model": "claude-sonnet-4-20250514",
  "ai.baseUrl": ""
}
```

### 配置 Key 约定

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `ai.provider` | `"openai" \| "anthropic"` | `"anthropic"` | AI 服务商 |
| `ai.apiKey` | string | `""` | API 密钥 |
| `ai.model` | string | `"claude-sonnet-4-20250514"` | 模型名 |
| `ai.baseUrl` | string | `""` | 可选，OpenAI 兼容 endpoint |

### 读取优先级

ConfigPresenter 配置文件 > process.env 环境变量

## ConfigPresenter 实现

改造现有 stub，使用 JsonStore 持久化到 `paths.configFile`：

```typescript
export class ConfigPresenter implements IConfigPresenter {
  private store: JsonStore<Record<string, unknown>>

  constructor() {
    // 使用 configFile 相对路径
    this.store = new JsonStore<Record<string, unknown>>('../config/slime.config.json', {})
  }

  async get(key: string): Promise<unknown> {
    const data = await this.store.read()
    return data[key] ?? null
  }

  async set(key: string, value: unknown): Promise<boolean> {
    const data = await this.store.read()
    data[key] = value
    await this.store.write(data)
    eventBus.sendToRenderer(CONFIG_EVENTS.CHANGED, key, value)
    return true
  }
}
```

注意：当前 JsonStore 硬编码使用 `paths.dataDir`，ConfigPresenter 需要存储到 `paths.configDir`。有两种处理方式：
1. 给 JsonStore 加 baseDir 参数
2. ConfigPresenter 直接读写文件，不用 JsonStore

选择方案 1，给 JsonStore 构造函数加可选的 baseDir 参数。

## AgentPresenter 改造

注入 ConfigPresenter，`getConfig()` 改为优先从配置文件读取：

```typescript
constructor(
  private sessionPresenter: SessionPresenter,
  private configPresenter: ConfigPresenter,
) {}

private async getConfig() {
  return {
    provider: (await this.configPresenter.get('ai.provider') as string) || process.env.SLIME_AI_PROVIDER || 'anthropic',
    apiKey: (await this.configPresenter.get('ai.apiKey') as string) || process.env.SLIME_AI_API_KEY || '',
    model: (await this.configPresenter.get('ai.model') as string) || process.env.SLIME_AI_MODEL || 'claude-sonnet-4-20250514',
    baseUrl: (await this.configPresenter.get('ai.baseUrl') as string) || process.env.SLIME_AI_BASE_URL || undefined,
  }
}
```

## 设置 UI

### 入口

AppSidebar 底部新增设置按钮（省略号图标），点击打开 SettingsDialog。

### 组件树

```
AppSidebar.vue（改造）
├── SettingsDialog.vue（新建）
│   └── ProviderSettings.vue（新建）
```

### SettingsDialog.vue

使用 shadcn/vue 的 Dialog 组件：

- 固定尺寸：宽 600px，高 400px
- 左右分栏：
  - 左侧导航 `w-48`：v0.1 只有 "LLM Provider" 一项（高亮态）
  - 右侧内容区：渲染 ProviderSettings

### ProviderSettings.vue

表单字段：

1. **Provider**：Select 下拉，选项 OpenAI / Anthropic
2. **API Key**：密码输入框 + 显示/隐藏切换按钮
3. **Model**：文本输入框，placeholder 显示默认值
4. **Base URL**：文本输入框，可选（仅 OpenAI 时有意义）

底部：保存按钮。保存时调用 configPresenter.set 写入配置。

### 视觉样式

延续 dark mode 风格：
- Dialog 背景：`bg-card`
- 左侧导航：`bg-sidebar`
- 输入框：`bg-muted border border-border`
- 保存按钮：`bg-primary text-primary-foreground`

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 改造 | `src/main/utils/jsonStore.ts` — 加 baseDir 参数 |
| 改造 | `src/main/presenter/configPresenter.ts` — 实现 get/set |
| 改造 | `src/main/presenter/agentPresenter.ts` — 注入 ConfigPresenter |
| 改造 | `src/main/presenter/index.ts` — 传递 ConfigPresenter |
| 新建 | `src/renderer/src/components/settings/SettingsDialog.vue` |
| 新建 | `src/renderer/src/components/settings/ProviderSettings.vue` |
| 改造 | `src/renderer/src/components/AppSidebar.vue` — 底部设置按钮 |

## 验收标准

1. 设置按钮在侧边栏底部可见，点击弹出 Dialog
2. Provider 表单可配置 Provider/API Key/Model/Base URL 并保存
3. 保存后配置持久化到 JSON 文件
4. AgentPresenter 使用 ConfigPresenter 配置调用 AI API
5. 无配置文件时 fallback 到环境变量
6. 配置文件中的 API Key 不纳入版本控制（路径在用户数据目录）

## 不做的事情

- 不做多 Provider 列表管理
- 不做 API Key 验证
- 不做模型列表动态获取
- 不做独立设置窗口
- 不做设置变更实时广播（保存后下次对话生效即可）
