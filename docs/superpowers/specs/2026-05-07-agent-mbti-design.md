# Agent MBTI 性格系统设计

## 概述

为 Agent 引入 MBTI 性格类型系统。每个 Agent 必须设置一种 MBTI 类型（16 种），MBTI 决定 Agent 的主题颜色和性格提示词。原有 `themeColor` 和 `agentSoul/soul.md` 概念被替换。

## 核心变更

1. Agent 新增 `mbti` 顶级必填字段，删除 `themeColor`
2. `agentSoul` → `additionalPrompt`，`soul.md` → `prompt.md`
3. systemPrompt = MBTI 性格提示词 + prompt.md 内容（拼接）
4. UI 中"性格设定"改名为"附加提示词"，新增 MBTI 16 宫格选择器

## 数据模型

### MBTI 常量 (`src/shared/constants/mbti.ts`)

```typescript
export type MBTIType =
  | 'INTJ' | 'INTP' | 'ENTJ' | 'ENTP'
  | 'INFJ' | 'INFP' | 'ENFJ' | 'ENFP'
  | 'ISTJ' | 'ISFJ' | 'ESTJ' | 'ESFJ'
  | 'ISTP' | 'ISFP' | 'ESTP' | 'ESFP'

export interface MBTIProfile {
  color: string         // CSS hex
  personality: string   // 性格提示词（中文）
}

export const MBTI_MAP: Record<MBTIType, MBTIProfile>
```

### 16 色映射（鲜明活泼风格）

| 组别 | MBTI | 颜色 | 色值 |
|------|------|------|------|
| 分析家 | INTJ | 靛蓝 | `#6366f1` |
| 分析家 | INTP | 紫蓝 | `#818cf8` |
| 分析家 | ENTJ | 深靛 | `#4f46e5` |
| 分析家 | ENTP | 淡紫 | `#a78bfa` |
| 外交家 | INFJ | 翠绿 | `#10b981` |
| 外交家 | INFP | 薄荷 | `#34d399` |
| 外交家 | ENFJ | 深绿 | `#059669` |
| 外交家 | ENFP | 琥珀 | `#f59e0b` |
| 守卫者 | ISTJ | 天蓝 | `#0ea5e9` |
| 守卫者 | ISFJ | 青色 | `#06b6d4` |
| 守卫者 | ESTJ | 钴蓝 | `#0284c7` |
| 守卫者 | ESFJ | 玫红 | `#ec4899` |
| 探险家 | ISTP | 石灰 | `#64748b` |
| 探险家 | ISFP | 粉红 | `#f472b6` |
| 探险家 | ESTP | 红色 | `#ef4444` |
| 探险家 | ESFP | 橙色 | `#f97316` |

### 性格提示词示例

每种 MBTI 对应一段 2-3 句中文性格描述，硬编码在常量文件中。示例：

- **INTJ**：你的性格类型是 INTJ（策略家）。你理性、独立、追求效率，擅长战略性思考和系统性规划。你偏好直接、简洁的沟通方式，注重逻辑推理，善于将复杂问题分解为可执行步骤。
- **ENFP**：你的性格类型是 ENFP（活动家）。你热情洋溢、充满创意、善于激励他人。你喜欢探索各种可能性，交流时自由奔放，善于发现事物之间的联系。
- **ISFJ**：你的性格类型是 ISFJ（守护者）。你细心、可靠、体贴入微，注重细节和他人感受。你擅长有条不紊地完成任务，沟通时温和耐心。

### Agent 类型变更

```typescript
export interface Agent {
  id: string
  name: string
  type: AgentType
  enabled: boolean
  protected: boolean
  description?: string
  avatar?: AgentAvatar | null
  mbti: MBTIType              // 新增，必填
  // themeColor 删除
  config?: AgentConfig | null
  createdAt: number
  updatedAt: number
}
```

### AgentConfig 变更

```typescript
export interface AgentConfig {
  capabilityRequirements?: string[]
  additionalPrompt?: string    // 替代 agentSoul，对应 prompt.md
  temperature?: number
  contextLength?: number
  maxTokens?: number
  enabledTools?: string[]
  subagentEnabled?: boolean
  mcpTools?: string[]
  enabledSkills?: string[]
  allowedCliCommands?: string[]
  enableThinking?: boolean
}
```

### DB 迁移

```sql
ALTER TABLE agents ADD COLUMN mbti TEXT NOT NULL DEFAULT 'INTJ';
```

- `theme_color` 列保留不删（SQLite 限制），代码不再读写

## SystemPrompt 构建

### 变更前

```
systemPrompt = agentSoul || soul.md
finalPrompt = systemPrompt + skillListXML
```

### 变更后

```
mbtiPrompt = MBTI_MAP[agent.mbti].personality
additionalPrompt = prompt.md 或 config.additionalPrompt
systemPrompt = mbtiPrompt + "\n\n" + additionalPrompt
finalPrompt = systemPrompt + skillListXML
```

### 修改文件

- `src/main/presenter/agentChat/agentChatPresenter.ts`：删除 agentSoul 优先级链，改为 MBTI + prompt.md 拼接
- `src/main/presenter/agentChat/contextBuilder.ts`：无变化（仍接收 agentSystemPrompt 参数）

## UI 变更

### AgentEditForm

**删除**：
- 主题颜色选择器（PRESET_COLORS + 颜色格子）
- "性格设定 (Soul)" 标签文本

**新增**：
- MBTI 选择器：4×4 网格，按组分区（分析家/外交家/守卫者/探险家），每格显示 MBTI 四字母 + 对应颜色圆点，选中态带边框高亮
- "附加提示词" 标签：保留原文本编辑器，placeholder 改为"追加到 MBTI 性格提示词之后"

### 颜色获取

所有原来读 `agent.themeColor` 的地方改为工具函数：

```typescript
import { MBTI_MAP } from '@shared/constants/mbti'

export function getMBTIColor(mbti: MBTIType): string {
  return MBTI_MAP[mbti].color
}
```

涉及组件：`AgentAvatar.vue`、`SessionList`、ChatInput 等使用 `--agent-color` 的位置。

## 文件重命名

| 原文件 | 新文件 |
|--------|--------|
| `src/main/agents/hal-ai/soul.md` | `src/main/agents/hal-ai/prompt.md` |
| `src/main/agents/moss-ai/soul.md` | `src/main/agents/moss-ai/prompt.md` |
| AgentConfigPresenter.`readSoulMd` | `readPromptMd` |
| AgentConfigPresenter.`writeSoulMd` | `writePromptMd` |
| DevPresenter 相关方法 | 对应重命名 |

兼容：`readPromptMd` 先尝试 `prompt.md`，不存在则 fallback 读 `soul.md`。

## 内置 Agent 配置更新

### hal-ai/config.json

```json
{
  "name": "哈尔",
  "mbti": "INTJ",
  ...
}
```

### moss-ai/config.json

```json
{
  "name": "莫斯",
  "mbti": "ISFJ",
  ...
}
```

## 迁移策略

1. DB：ALTER TABLE 新增 `mbti` 列，默认 `'INTJ'`
2. 自定义 Agent：`config_json` 中 `agentSoul` 字段值迁移到 `additionalPrompt`
3. 内置 Agent：`BUILTIN_AGENTS` 数组的 `mbti` 从 config.json 读取
4. `ensureBuiltin` 同步 mbti 到 DB 记录
5. `readPromptMd` 向后兼容 soul.md

## 影响范围

- `src/shared/types/agent.d.ts` — 类型定义
- `src/shared/constants/mbti.ts` — 新建
- `src/main/db/models/agentDao.ts` — 迁移 + CRUD
- `src/main/agents/index.ts` — BUILTIN_AGENTS 加载
- `src/main/agents/*/config.json` — 新增 mbti
- `src/main/agents/*/soul.md → prompt.md` — 重命名
- `src/main/presenter/agentChat/agentChatPresenter.ts` — systemPrompt 构建
- `src/main/presenter/agentConfigPresenter.ts` — 方法重命名
- `src/main/presenter/devPresenter.ts` — 方法重命名
- `src/renderer/src/components/agents/AgentEditForm.vue` — UI 改版
- `src/renderer/src/components/chat/AgentAvatar.vue` — 颜色获取
- 其他引用 themeColor 的渲染组件
