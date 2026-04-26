# Capability-Based Model Selection Design

## 概述

替换现有 Slot 系统，引入能力标签（Capability Tags）+ 动态选择引擎，实现：

- 模型按能力标签分类（reasoning, chat, vision, image_gen）
- 组件按所需能力声明需求，选择引擎自动匹配最优模型
- 功能组件根据可用能力自动解锁/锁定

## 设计决策

| 决策点    | 结论                                    |
| --------- | --------------------------------------- |
| 消费模式  | 组件直接按能力消费，不做自动调度        |
| 架构方案  | 能力标签 + 动态选择引擎（非预定义分组） |
| 需求语法  | 平铺 = 独立模式，嵌套 = 统一模式        |
| 能力来源  | 手动配置，后续扩展自动探测              |
| Slot 系统 | 完整替代移除                            |
| 质量分级  | 不分级，纯标签 + priority 排序          |

## §1 数据模型

### 新增 models 表

```sql
CREATE TABLE models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id),
  model_name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["reasoning","vision"]
  priority INTEGER NOT NULL DEFAULT 0,      -- 越大越优先
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, model_name)
);
```

### 初始能力标签集

| 标签        | 含义          | 示例模型                       |
| ----------- | ------------- | ------------------------------ |
| `reasoning` | 推理/思考链   | Claude Sonnet, DeepSeek R1, o1 |
| `chat`      | 文本生成/对话 | GPT-4o-mini, Haiku             |
| `vision`    | 图像理解      | Claude Sonnet, GPT-4o, Qwen-VL |
| `image_gen` | 图片生成      | DALL-E, Midjourney             |

标签集可扩展，仅需在 capabilities JSON 数组中添加新字符串。

### 类型定义

```typescript
type Capability = "reasoning" | "chat" | "vision" | "image_gen";

interface Model {
  id: number;
  channelId: number;
  modelName: string;
  capabilities: Capability[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 移除内容

- groups\_ 表的 `slot_category` / `slot_tier` / `slot_level` 字段
- `ModelSlot` / `ModelCategory` / `TextModelTier` / `ReasoningLevel` 类型
- `resolveSlot()` / `getGroupsWithSlot()` 方法
- `SlotMappingStep` 引导页步骤
- GatewaySettings 中 Slot 映射 UI

## §2 选择引擎 (CapabilitySelector)

### 位置

`src/main/gateway/selector.ts` — 纯逻辑模块，依赖 DB + CircuitBreaker。

### API

```typescript
type CapabilityRequirement = (Capability | Capability[])[];

interface ModelMatch {
  modelId: number;
  modelName: string;
  channelId: number;
  groupName: string; // 对应的 Group name，用于 Gateway 路由
  capabilities: Capability[];
}

interface SelectResult {
  matched: Record<string, ModelMatch>; // key = 能力名或 "a+b"
  missing: string[]; // 未满足的能力/组合
}

function select(requirements: CapabilityRequirement): SelectResult;
```

### 需求语法

```typescript
// 独立模式 — 各能力分别找最优模型（可以是不同模型）
select(["reasoning", "vision"]);
// → { matched: { reasoning: ..., vision: ... }, missing: [] }

// 统一模式 — 必须同一模型满足全部
select([["reasoning", "vision"]]);
// → { matched: { "reasoning+vision": ... }, missing: [] }
// 或 { matched: {}, missing: ["reasoning+vision"] }

// 混合 — 统一子组 + 独立项
select([["reasoning", "vision"], "image_gen"]);
// → matched 中有 "reasoning+vision" 和 "image_gen" 两个 key
```

### 匹配流程

1. 加载所有 `enabled=1` 的 models
2. 过滤 channel 健康状态（CircuitBreaker 非 open）
3. 对每个需求项：
   - 独立能力 `"reasoning"`: 过滤 capabilities ⊇ {reasoning}，按 priority DESC，取第一个
   - 统一子组 `["reasoning", "vision"]`: 过滤 capabilities 同时包含两者，按 priority DESC，取第一个；无匹配则记入 missing
4. 返回 `{ matched, missing }`

### 便捷方法

```typescript
// 检查某能力是否可用（用于功能解锁）
hasCapability(cap: Capability): boolean

// 列出所有当前可用的能力
availableCapabilities(): Capability[]

// 获取某能力下的所有可用模型
modelsWithCapability(cap: Capability): ModelMatch[]
```

### 集成方式

- 通过 `GatewayPresenter` 暴露给渲染进程（IPC）
- AgentPresenter 内部直接 import 使用（主进程内调用，无需 IPC）

## §3 功能解锁与组件门控

### 组件能力声明

```typescript
interface ComponentMeta {
  id: string
  name: string
  description: string
  requiredCapabilities: CapabilityRequirement  // 同 select() 参数格式
}

// 示例
{ id: "writing-assist", name: "写作助手", requiredCapabilities: ["chat"] }
{ id: "code-assist", name: "代码助手", requiredCapabilities: ["reasoning"] }
{ id: "auto-research", name: "Auto Research", requiredCapabilities: [["reasoning", "vision"]] }
```

### 解锁检查

`ComponentMeta.requiredCapabilities` → `selector.select(requirements)` → `missing.length === 0` 则可用。

### 锁定态 UI

- 可用组件：正常卡片 + 绿色"可用"标签 + 能力标签展示
- 锁定组件：卡片半透明(opacity) + 红色"锁定"标签 + 逐项标注已满足(✓)/缺失(✗)的能力 + 提示文案

### 渲染进程 composable

```typescript
// src/renderer/src/composables/useCapability.ts
const { available, missing } = useCapabilityCheck(["reasoning", "vision"]);
// available: Ref<boolean>
// missing: Ref<string[]>
// 内部通过 IPC 调 GatewayPresenter.select()
// 监听 gateway 变更事件自动刷新
```

## §4 Onboarding 引导页改造

### 流程变更

| 步骤 | 旧（Slot）       | 新（Capability）         |
| ---- | ---------------- | ------------------------ |
| ①    | Welcome          | Welcome（不变）          |
| ②    | AddChannel       | AddChannel（不变）       |
| ③    | SlotMappingStep  | **CapabilityTagStep**    |
| ④    | IdentityComplete | IdentityComplete（不变） |

### CapabilityTagStep 交互

为每个选中的模型展示 4 个能力标签（toggle 按钮），高亮 = 已选，暗灰 = 未选。用户点击标签切换。

### 最低要求校验

至少一个模型标注了 `reasoning` 能力才能进入下一步。
提示文案：「Slime 的基础功能需要推理能力，请确保至少标注一个模型为 reasoning。」

### complete() 持久化变更

```
1. createChannel(…)
2. addChannelKey(channelId, apiKey)
3. 对每个 selectedModel:
   a. createGroup(name=modelName, …)        // 仍为 Gateway 路由创建 Group
   b. setGroupItems(groupId, [{channelId, modelName}])
   c. createModel(channelId, modelName, capabilities, priority)  // 新增
   // 移除: updateGroup(groupId, { slot: ... })
4. 保存 evolution.user, app.onboarded
```

## §5 AgentPresenter 迁移 + Gateway 设置页

### AgentPresenter 改造

```typescript
// 旧
const slotModel = this.gatewayPresenter.resolveSlot({
  category: "text",
  tier: "reasoning",
  level: "auto",
});

// 新
const result = selector.select(["reasoning"]);
const model = result.matched.reasoning;
// model.groupName 用于 createModel()，后续流程不变
```

### Gateway 设置页

- **保留**：端口、熔断阈值、日志保留天数
- **移除**：Slot 映射 UI（5 个下拉框）

### GatewayPanel

模型能力管理放在 GatewayPanel 的渠道 Tab 中。渠道详情展示该渠道下的模型列表，每个模型可 toggle 能力标签、编辑优先级、切换启用/禁用。模型是渠道的子资源，不新增独立 Tab。
