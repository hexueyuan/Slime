# 渠道 Tab Master-Detail 布局重构

## 概述

将渠道 Tab 从纵向堆叠布局改为左右分栏 master-detail 布局。左侧窄栏显示渠道列表，右侧显示选中渠道的模型管理面板。

## 改动范围

仅 `src/renderer/src/components/gateway/ChannelTab.vue`（~567 行）。纯 UI 布局重构，Store/IPC 数据流不变。

## 布局结构

```
┌─ 渠道（标题）──────────────────── + 新增渠道 ─┐
├──────────────┬─────────────────────────────────┤
│  渠道列表     │  渠道详情头                       │
│  (240px)     │  名称 · 状态 · URL               │
│              │  [测试] [编辑] [删除]              │
│  [百度Oneapi]│─────────────────────────────────│
│   anthropic  │  模型管理                    [+] │
│   15 模型    │                                  │
│              │  Claude Opus 4.6  ●              │
│  OpenAI      │  [reasoning][chat][vision][img]  │
│   openai     │                                  │
│   8 模型     │  Claude Sonnet 4.6  ●            │
│              │  [reasoning][chat][vision][img]  │
│  Gemini Pro  │                                  │
│   gemini     │  Claude Haiku 4.5  ●             │
│   4 模型     │  [reasoning][chat][vision][img]  │
│              │                                  │
└──────────────┴─────────────────────────────────┘
```

左右两侧各自独立滚动。默认选中第一个渠道。

## 左侧渠道列表

- 固定宽度 240px，`border-right` 分隔
- 每个渠道卡片：渠道名 + 启用状态圆点 + 类型 + 模型数量
- 选中状态：`bg-violet-500/10 ring-1 ring-violet-500/30`
- 禁用渠道：`opacity-50`
- 点击切换选中，加载对应模型列表

## 右侧模型管理

### 渠道详情头

选中渠道的名称、启用状态、类型、baseUrl，右侧操作按钮（测试/编辑/删除）。底部 `border-bottom` 与模型列表分隔。

### 模型管理标题行

- 文本从"模型能力管理"改为"模型管理"
- 右侧显示 "+" 小按钮（24x24, border, 灰色）
- 点击 "+" 在模型列表底部展开内联输入框（模型名输入 + 确认/取消按钮）
- 移除原底部的固定输入框

### 能力标签配色

每种能力使用不同颜色，启用态为彩色半透明背景+同色文字+同色边框，未启用态为灰色边框+暗灰文字：

| 能力 | 颜色 | 启用背景 |
|------|------|----------|
| reasoning | 紫色 `#a78bfa` | `rgba(167,139,250,0.2)` |
| chat | 蓝色 `#60a5fa` | `rgba(96,165,250,0.2)` |
| vision | 绿色 `#34d399` | `rgba(52,211,153,0.2)` |
| image_gen | 琥珀色 `#fbbf24` | `rgba(251,191,36,0.2)` |

Tailwind 等价类：
- reasoning 启用: `bg-violet-400/20 text-violet-400 border-violet-400/30`
- chat 启用: `bg-blue-400/20 text-blue-400 border-blue-400/30`
- vision 启用: `bg-emerald-400/20 text-emerald-400 border-emerald-400/30`
- image_gen 启用: `bg-amber-400/20 text-amber-400 border-amber-400/30`
- 未启用: `border-border text-muted-foreground/50`

## 不变的部分

- "新增渠道"按钮位置（顶部右侧）
- 渠道创建/编辑弹窗（Teleport to body）
- useGatewayStore 数据流和 IPC 调用
- 空状态处理（无渠道时居中提示）
