# EvoLab 状态指示器设计

## 概述

为 EvoLab 对话界面增加 AI 处理状态的实时显示，让用户清楚知道 Agent 当前在做什么。

## 状态类型

4 种状态，从 `chatStore.streamingBlocks` 的最后一个 block type 推断：

| 条件 | Phase | 文案 | 颜色 |
|------|-------|------|------|
| blocks 为空 | `preparing` | 正在准备... | `hsl(220 14% 60%)` 灰色 |
| 最后 block 是 `reasoning_content` | `thinking` | 正在思考... | `hsl(265 90% 66%)` 紫色 |
| 最后 block 是 `tool_call` | `toolCalling` | 正在调用工具... | `hsl(25 95% 60%)` 橙色 |
| 其他（content 等） | `generating` | 正在生成... | `hsl(145 65% 50%)` 绿色 |

只在 `chatStore.isStreaming === true` 时显示。

## 视觉样式

彩色 Spinner + 文字：
- 10px 圆形 spinner，`border: 2px solid`，`border-top-color` 为阶段颜色，其余边框为颜色的 20% 透明度
- 右侧文字使用同色，`text-xs`
- spinner 动画：`0.8s linear infinite rotate`

## 显示位置

两处同时显示：

1. **SessionBar 顶栏** — 会话标题 + 下拉箭头之后
2. **MessageList 底部** — 消息列表最后一条消息之后，`pl-3 pt-2`

## 数据流

```
chatStore.streamingBlocks (已有)
    ↓
useGeneratingPhase() composable (新建)
    → isGenerating: computed<boolean>
    → generatingPhase: computed<GeneratingPhase | null>
    → generatingPhaseText: computed<string>
    → phaseColor: computed<string>
    ↓
SessionBar.vue / MessageList.vue (修改，各自调用 composable)
    ↓ props: text, color
GeneratingIndicator.vue (新建)
```

## 文件变更

### 新增文件

1. `src/renderer/src/composables/useGeneratingPhase.ts`
   - 导出 `GeneratingPhase` 类型
   - 导出 `useGeneratingPhase()` composable
   - 内含 `phaseConfig` 映射表（text + color）

2. `src/renderer/src/components/chat/GeneratingIndicator.vue`
   - Props: `text: string`, `color: string`
   - 模板：flex 容器，spinner span + text span
   - scoped style：spinner keyframe 动画

### 修改文件

3. `src/renderer/src/components/chat/SessionBar.vue`
   - import useGeneratingPhase + GeneratingIndicator
   - 在标题右侧添加 `<GeneratingIndicator v-if="isGenerating && generatingPhaseText" />`

4. `src/renderer/src/components/chat/MessageList.vue`
   - import useGeneratingPhase + GeneratingIndicator
   - 在消息循环之后添加 `<GeneratingIndicator v-if="isGenerating && generatingPhaseText" class="pl-3 pt-2" />`

### 不改动

- chatStore / messageStore — 已有 `isStreaming` 和 `streamingBlocks`
- 主进程 — 不涉及
- 类型定义 — 不涉及
