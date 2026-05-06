# Agent & Skill 管理面板设计

## 概述

统一的 Agent 和 Skill 管理视图，取代现有分散的 AgentEditDialog 模态框。内置 Agent 在 dev 模式可编辑（写回源码），prod 模式只读；用户 Agent 始终可编辑（写入数据库）。同时提供全局 Skill 的安装、卸载和按 Agent 分配管理。

## 设计决策

| 决策                 | 选择                                           | 理由                           |
| -------------------- | ---------------------------------------------- | ------------------------------ |
| 视图入口             | AppSidebar 常驻按钮                            | 用户 Agent 管理在 prod 也需要  |
| 布局                 | 主内容区新视图，Tab 切换                       | 轻量，复用已有导航模式         |
| 内置 Agent 存储      | `src/main/agents/<id>/config.json` + `soul.md` | JSON 易编辑，MD 提示词分离     |
| 用户 Agent 存储      | 数据库（现有机制）                             | 不改动                         |
| 源码写入方式         | 直接 fs 写 JSON/MD 文件                        | 无需 AST，结构简单             |
| Skill 存储           | `src/main/skills/<name>/`                      | 纳入源码 git 管理              |
| Skill 安装来源       | 本地目录 / zip 压缩包                          | 无远程市场                     |
| Skill 分配语义       | 白名单 `enabledSkills[]`                       | 替代原 `disabledSkills` 黑名单 |
| CLI 命令管理         | 白名单 `allowedCliCommands[]`                  | 显式控制                       |
| 移除 AgentEditDialog | 是                                             | 统一入口，干净分离             |

## 权限矩阵

| 操作 | 内置 Agent (prod) | 内置 Agent (dev) | 用户 Agent  |
| ---- | ----------------- | ---------------- | ----------- |
| 查看 | ✅                | ✅               | ✅          |
| 编辑 | ❌ 只读           | ✅ 写回源码      | ✅ 写入 DB  |
| 创建 | ❌                | ✅ 新建内置      | ✅ 新建用户 |
| 删除 | ❌                | ✅ 删除源码      | ✅ 删除 DB  |

## Agent 定义文件重构

### 目录结构

```
src/main/agents/
├── hal-ai/
│   ├── config.json      # 配置（名称、头像、工具、CLI命令等）
│   └── soul.md          # 系统提示词
├── moss-ai/
│   ├── config.json
│   └── soul.md
└── index.ts             # 扫描子目录，构建 BuiltinAgentDef[]
```

### config.json Schema

```json
{
  "name": "哈尔",
  "description": "AI 助手，擅长推理和代码",
  "avatar": { "kind": "lucide", "icon": "bot" },
  "themeColor": "#8b5cf6",
  "capabilityRequirements": ["reasoning"],
  "disabledTools": ["evolution_start", "evolution_plan", "evolution_complete"],
  "allowedCliCommands": ["help", "logs", "task"],
  "enabledSkills": ["web-search", "code-review"],
  "mcpTools": [],
  "temperature": null,
  "contextLength": null,
  "maxTokens": null,
  "subagentEnabled": true,
  "enableThinking": true
}
```

### index.ts 改造

- 移除手写的 `BUILTIN_AGENTS` 数组
- 改为 `readdirSync` 扫描子目录
- 每个子目录读取 `config.json`（JSON.parse）+ `soul.md`（readFileSync）
- 组装为 `BuiltinAgentDef[]` 导出
- 目录名即 agentId

## 视图布局

### AppSidebar

新增按钮（图标：`Users` 或 `Bot`），位于 schedule 和 settings 之间。始终可见。

### AgentPanel 结构

```
AgentPanel
├── 顶部 Tab Bar: [Agents] [Skills]
│
├── Tab: Agents
│   ├── 左列 (250px): Agent 列表
│   │   ├── 分组标题: "内置" / "自定义"
│   │   ├── Agent 卡片（头像 + 名称 + ID 灰字）
│   │   └── "+ 新建 Agent" 按钮
│   └── 右列: 编辑表单
│       ├── Agent ID（只读）
│       ├── 名称（text input）
│       ├── 描述（textarea）
│       ├── 头像选择器（lucide/monogram/image 三模式）
│       ├── 主题颜色（预设色块 + 自定义）
│       ├── Soul 编辑器（大文本域，支持 Markdown）
│       ├── 能力需求（checkbox: reasoning/vision/image_gen/tool_call）
│       ├── 工具管理（所有工具 checkbox 列表，勾选=启用，不勾选=禁用）
│       ├── CLI 命令白名单（所有注册命令 checkbox 列表）
│       ├── Skill 白名单（所有全局 Skill checkbox 列表）
│       ├── MCP 工具（复用 MCPToolChecklist）
│       ├── 参数区（temperature / contextLength / maxTokens）
│       ├── 开关（subagentEnabled / enableThinking）
│       └── 底部操作栏: [保存] [重置]（内置 prod 下全部 disabled）
│
└── Tab: Skills
    ├── 工具栏: [安装 Skill] 按钮
    ├── Skill 列表
    │   ├── 名称
    │   ├── 描述（来自 manifest.json）
    │   ├── 版本
    │   └── 操作: [卸载]
    └── Skill 详情 / Agent 分配
        └── 选中 Skill 后显示: 哪些 Agent 启用了此 Skill（checkbox 列表）
```

### 编辑表单行为

- **内置 Agent + dev 模式**：所有字段可编辑，保存写 `config.json` + `soul.md`
- **内置 Agent + prod 模式**：所有字段只读（input disabled，textarea readonly）
- **用户 Agent**：所有字段可编辑，保存调 `AgentConfigPresenter.updateAgent()`

## IPC 接口

### DevPresenter（新增，dev-only 方法）

```typescript
class DevPresenter {
  // 所有方法内部首行: if (app.isPackaged) throw new Error('dev only')

  // === 内置 Agent 源码操作 ===
  listBuiltinAgentDefs(): { id: string; config: object; soul: string }[];
  getBuiltinAgentDef(agentId: string): { config: object; soul: string };
  saveBuiltinAgentDef(agentId: string, config: object, soul: string): void;
  createBuiltinAgent(agentId: string): void; // 创建目录 + 空模板
  deleteBuiltinAgent(agentId: string): void; // 删除目录

  // === Skill 源码操作 ===
  listGlobalSkills(): SkillManifest[];
  installSkill(sourcePath: string): { success: boolean; error?: string };
  uninstallSkill(skillName: string): void;
  getSkillManifest(skillName: string): SkillManifest;

  // === 查询辅助 ===
  listAvailableTools(): string[]; // 所有工具名
  listAvailableCliCommands(): string[]; // 所有 CLI 命令名
}
```

### AgentConfigPresenter（复用，用户 Agent）

现有方法不变：`listAgents`, `createAgent`, `updateAgent`, `deleteAgent`。

### SkillManifest 类型

```typescript
interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
}
```

## Skill 系统

### 目录结构

```
src/main/skills/
├── web-search/
│   ├── manifest.json    # { name, description, version?, author? }
│   └── index.md         # Skill 内容
└── code-review/
    ├── manifest.json
    └── index.md
```

### 安装流程

1. 用户点击「安装 Skill」→ 系统文件选择对话框（目录或 .zip）
2. 验证：目录/zip 内必须有 `manifest.json`，`manifest.name` 必须存在
3. 名称冲突 → 提示是否覆盖
4. 复制到 `src/main/skills/<manifest.name>/`
5. zip 解压用 `yauzl`（仅支持 .zip 格式）

### Agent 分配

- `config.json` 的 `enabledSkills: string[]` 白名单
- 空数组 = 不使用任何 Skill
- UI 提供"全选/全不选"快捷操作
- 迁移：现有 `disabledSkills` → 转换为 `enabledSkills`（全集 - 黑名单 = 白名单）

## 移除内容

- 删除 `src/renderer/src/components/chat/AgentEditDialog.vue`
- 删除 ChatroomPanel / NewThread 中的编辑入口
- 删除 `src/main/agents/hal.ts` 和 `src/main/agents/moss.ts`（内容迁移到 JSON+MD）
- 废弃 `AgentConfig.disabledSkills` 字段（用 `enabledSkills` 替代）

## 错误处理

- **写入失败**：返回错误信息，UI toast 提示
- **JSON 校验**：保存前 JSON.parse 验证格式
- **Skill 安装验证**：无 manifest.json / 无 name 字段 → 拒绝
- **删除保护**：内置 Agent 有活跃会话时警告（不阻止）
- **Dev 守护**：DevPresenter 方法 + UI 条件渲染双重保护

## 影响范围

- `src/main/agents/` — 重构为目录结构
- `src/main/agents/index.ts` — 改为动态扫描
- `src/main/presenter/devPresenter.ts` — 新增
- `src/main/presenter/index.ts` — 注册 DevPresenter
- `src/renderer/src/views/AgentPanel.vue` — 新增
- `src/renderer/src/components/AppSidebar.vue` — 加按钮
- `src/renderer/src/App.vue` — 注册新视图
- `src/renderer/src/stores/` — 可能新增 `useDevStore`
- `src/renderer/src/components/chat/AgentEditDialog.vue` — 删除
- `src/shared/types/agent.d.ts` — `enabledSkills` 替代 `disabledSkills`
- `src/main/skills/` — 新建目录
