# TASK-005 设计文档：聊天面板完整实现

## 概述

填充 ChatPanel 占位组件为完整聊天功能，接近 deepchat 的完整体验。包含消息输入/展示、流式响应、高级内容块、会话管理、文件附件、artifact 预览。

拆分为 4 个子任务递进实施：

| 子任务   | 范围                                                                        |
| -------- | --------------------------------------------------------------------------- |
| **005a** | 数据层 + 基础对话（类型定义、Store、AgentPresenter、JSON 持久化、流式 IPC） |
| **005b** | 聊天 UI 核心（消息列表、用户/助手气泡、Markdown 渲染、流式打字机、输入框）  |
| **005c** | 高级内容块（reasoning、tool_call、error、image block、消息工具栏）          |
| **005d** | 会话管理 + 高级功能（会话 CRUD、文件附件、artifact 预览、TipTap 升级）      |

## 技术选型

| 模块          | 方案                                   |
| ------------- | -------------------------------------- |
| AI SDK        | Vercel AI SDK（与 deepchat 一致）      |
| Markdown 渲染 | markstream-vue（增量流式渲染）         |
| 输入框        | 先 textarea，005d 升级为 TipTap        |
| 数据持久化    | JSON 文件（最简实现，后续升级 SQLite） |

## 视觉设计

复刻 deepchat 暗色主题样式，消息布局参考 ChatGPT（无头像无名字）。

### 颜色变量（暗色主题）

| 变量             | 值                            |
| ---------------- | ----------------------------- |
| background       | `hsl(0 0% 5%)` ≈ #0d0d0d      |
| foreground       | `hsl(0 0% 93.4%)`             |
| muted            | `hsla(0, 0%, 100%, 0.03)`     |
| muted-foreground | `rgba(255,255,255,0.5)`       |
| border           | `hsla(0, 0%, 100%, 0.05)`     |
| card             | `hsl(0 0% 20%)`               |
| primary          | `hsl(210 100% 43%)` ≈ #006DD8 |
| code-bg          | `hsl(0 0% 12%)`               |
| code-border      | `hsl(0 0% 20%)`               |

### 用户消息

- 右对齐，左侧留 44px 空白
- 气泡样式：`bg: muted`, `border: 1px solid border`, `border-radius: 8px`, `padding: 8px 12px`
- 字号 14px，行高 1.714

### 助手消息

- 左对齐，无背景色，左 padding 16px，右 padding 44px
- `prose-sm prose-invert` 排版（@tailwindcss/typography）
- 各 block 之间 gap 6px

### 代码块

- 容器：`bg: hsl(0 0% 12%)`, `border: hsl(0 0% 20%)`, `border-radius: 8px`
- 头部：语言标签 + 复制按钮
- 内容：JetBrains Mono / Fira Code 字体，14px，行高 1.5
- Shiki 语法高亮

### 消息间距

- 消息间 `space-y-1` (4px) + 每条消息自身 `pt-5` (20px) = 视觉约 24px

### 输入框

- 底部 sticky 定位，z-index 10
- 磨砂玻璃效果：`bg: card/30 (hsla(0,0%,20%,0.3))`, `backdrop-filter: blur(16px)`
- 边框：`1px solid border`, `border-radius: 12px`
- 上方渐变遮罩过渡
- 内部分两层：上方编辑区（min-height 60px），下方工具栏
- 左侧附件按钮（+ 号，28px，ghost 样式）
- 右侧发送按钮（28px 圆形，primary 蓝色，流式中切为红色停止按钮）

## 005a：数据层 + 基础对话

### 消息类型定义

新建 `src/shared/types/chat.d.ts`：

```typescript
// 助手消息内容块
type BlockType = "content" | "reasoning_content" | "tool_call" | "error" | "image";
type BlockStatus = "success" | "loading" | "error" | "cancel";

interface AssistantMessageBlock {
  type: BlockType;
  id?: string;
  content?: string;
  status: BlockStatus;
  timestamp: number;
  tool_call?: { name: string; params: string; response?: string };
  image_data?: { data: string; mimeType: string };
  reasoning_time?: { start: number; end: number };
}

// 用户消息内容
interface UserMessageContent {
  text: string;
  files: MessageFile[];
}

interface MessageFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

// 消息记录
interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string; // JSON 序列化
  status: "sent" | "pending" | "error";
  createdAt: number;
  updatedAt: number;
}

// 会话
interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
```

### IPC 事件扩展

扩展 `src/shared/events.ts`：

```typescript
export const STREAM_EVENTS = {
  RESPONSE: "stream:response",
  END: "stream:end",
  ERROR: "stream:error",
} as const;

export const SESSION_EVENTS = {
  LIST_UPDATED: "session:list-updated",
  ACTIVATED: "session:activated",
} as const;
```

### Store 改造

**改造 `src/renderer/src/stores/chat.ts`** 为 MessageStore：

- state: `messageIds: string[]`, `messageCache: Map<id, ChatMessageRecord>`, `isStreaming`, `streamingBlocks: AssistantMessageBlock[]`, `currentStreamMessageId`
- actions: `loadMessages(sessionId)`, `sendMessage(text, files?)`, `addOptimisticUserMessage()`, `setStreamingBlocks(blocks)`, `clearStreamingState()`, `applyStreamingBlocksToMessage()`

**新建 `src/renderer/src/stores/session.ts`**：

- state: `sessions: ChatSession[]`, `activeSessionId`
- actions: `fetchSessions()`, `createSession()`, `selectSession(id)`, `deleteSession(id)`

### AgentPresenter 改造

改造 `src/main/presenter/agentPresenter.ts`，对接 Vercel AI SDK：

- `chat(sessionId, content)` → 构建消息历史 → `streamText()` → EventBus 推送流式 blocks
- 流式处理：累积 text/reasoning/tool_call 事件为 `AssistantMessageBlock[]`
- 定时（~50ms）通过 `STREAM_EVENTS.RESPONSE` 推送 blocks 到渲染进程
- 流结束发 `STREAM_EVENTS.END`，出错发 `STREAM_EVENTS.ERROR`

### JSON 持久化

- 路径：`~/.slime/data/sessions.json` + `~/.slime/data/messages/<sessionId>.json`
- 最简实现：启动时读取，变更时写入
- 后续直接替换为 SQLite，不做复杂抽象

### API Key 管理

- AI 模型 API key 通过 ConfigPresenter 管理（get/set）
- AgentPresenter 初始化时从 ConfigPresenter 读取 key
- v0.1 支持配置 provider（openai/anthropic）和对应 key

### Presenter 接口更新

更新 `src/shared/types/presenters/agent.presenter.d.ts`：

```typescript
export interface IAgentPresenter {
  chat(sessionId: string, content: UserMessageContent): Promise<void>;
  stopGeneration(sessionId: string): Promise<void>;
}
```

新建 `src/shared/types/presenters/session.presenter.d.ts`：

```typescript
export interface ISessionPresenter {
  getSessions(): Promise<ChatSession[]>;
  createSession(title?: string): Promise<ChatSession>;
  deleteSession(id: string): Promise<boolean>;
  getMessages(sessionId: string): Promise<ChatMessageRecord[]>;
}
```

## 005b：聊天 UI 核心

### 组件树

```
ChatPanel.vue (改造)
├── MessageList.vue (新建)
│   ├── MessageItemUser.vue (新建)
│   └── MessageItemAssistant.vue (新建)
│       └── MessageBlockContent.vue (新建, markstream-vue)
└── ChatInput.vue (新建)
    └── textarea + 发送/停止按钮 + 附件按钮(占位)
```

### ChatPanel.vue

改造现有占位组件为聊天容器：

- flex column 布局，height 100%
- 上方 MessageList（flex:1, overflow-y:auto）
- 下方 ChatInput（sticky bottom）

### MessageList.vue

- 接收 `messages: ChatMessageRecord[]` + `streamingBlocks: AssistantMessageBlock[]`
- 根据 `role` 分发到 MessageItemUser / MessageItemAssistant
- 最后一条流式消息实时渲染 streamingBlocks

滚动行为：

- 新消息到达：用户在底部（距底 < 50px）时自动滚底
- 用户向上浏览：不抢滚动
- 发送消息：强制滚底

### MessageItemUser.vue

- `flex flex-row-reverse pt-5 pl-11 gap-2`
- 气泡：`bg-muted border border-border rounded-lg p-2 text-sm`
- 解析 `content` JSON 为 UserMessageContent，展示 text

### MessageItemAssistant.vue

- `flex flex-col pt-5 pl-4 pr-11 gap-1.5 w-full`
- 遍历 blocks（解析 content JSON 为 AssistantMessageBlock[]）
- 005b 仅实现 `type === 'content'` → MessageBlockContent

### MessageBlockContent.vue

- 使用 markstream-vue 的 `NodeRenderer` 渲染 Markdown
- `prose prose-sm dark:prose-invert w-full max-w-none`
- 流式内容 debounce 32ms 更新

### ChatInput.vue

- 外层容器：sticky bottom, 磨砂玻璃样式
- textarea：min-height 60px, max-height 240px, auto-resize
- Enter 发送，Shift+Enter 换行，IME 兼容（isComposing 判断）
- 左侧 + 按钮（005b 占位，005d 实现附件功能）
- 右侧发送按钮（isStreaming 时切为停止按钮）
- emit: `submit(text, files)`, `stop()`

## 005c：高级内容块

### 新增组件

```
MessageItemAssistant.vue
├── MessageBlockContent.vue     (005b 已实现)
├── MessageBlockReasoning.vue   (新建)
├── MessageBlockToolCall.vue    (新建)
├── MessageBlockError.vue       (新建)
├── MessageBlockImage.vue       (新建)
└── MessageToolbar.vue          (新建)
```

### MessageBlockReasoning.vue

- 折叠态：一行 "已深度思考（用时 X 秒）"，chevron-down 图标
- 展开态：内部 prose 渲染思考内容，12px 字号，`text-white/50`
- 思考中：脉冲动画 "正在思考..."，`animate-pulse`
- v-model 控制折叠状态

### MessageBlockToolCall.vue

- 工具名称 badge + 执行状态图标（spinner/check/x）
- 可折叠查看参数（JSON 格式化）和返回结果
- loading 态有旋转动画

### MessageBlockError.vue

- 红色左边框 + 浅红背景卡片
- 显示错误信息文本
- 可选重试按钮

### MessageBlockImage.vue

- 图片预览（max-width 300px）
- base64 data URI 或远程 URL
- 点击放大查看

### MessageToolbar.vue

- 默认 `opacity-0 group-hover:opacity-100 transition-opacity`
- 按钮：复制（复制全部文本内容）、重试（重新生成该消息）
- ghost 按钮，16px，hover 变 primary 色

## 005d：会话管理 + 高级功能

### 会话管理 UI

ChatPanel 顶部新增会话栏：

- 当前会话标题 + chevron-down，点击展开会话下拉列表
- 新建会话按钮（+ 号）
- 下拉列表：历史会话（标题 + 相对时间），当前会话高亮
- 右键菜单：删除会话

数据流：SessionStore ↔ SessionPresenter (IPC) ↔ JSON 文件

### 文件附件

- ChatInput 的 + 按钮触发系统文件选择对话框
- 选中文件后以胶囊标签展示在输入框上方（deepchat ChatAttachmentItem 样式）
- 标签：文件图标 + 文件名 + x 删除按钮
- 样式：`rounded-full border bg-background/70 px-2.5 py-1 text-xs shadow-sm`
- 发送时将文件信息附加到 UserMessageContent.files

### Artifact 预览

当 AI 响应包含 artifact block 时：

- 左侧对话区显示 artifact 引用卡片（标题 + 类型 + "点击预览"）
- artifact 从助手消息的 content block 中解析（不新增 BlockType，与 deepchat 一致）
- 右侧 FunctionPanel 渲染 artifact 内容
- 支持的 artifact 类型：代码（语法高亮）、HTML（iframe 沙箱渲染）、Markdown（prose 渲染）

FunctionPanel 改造：

- 默认显示占位（或进化功能入口）
- 有 artifact 时切换为 artifact 预览模式
- 顶部 tab 切换多个 artifact

### TipTap 编辑器升级

替换 textarea 为 TipTap：

- 扩展：Document, Paragraph, Text, History, HardBreak, Placeholder
- Enter 发送，Shift+Enter 换行
- 支持粘贴图片（自动添加到附件）
- IME 兼容

## 文件变更清单

### 005a 新建/改造

| 操作 | 文件                                                             |
| ---- | ---------------------------------------------------------------- |
| 新建 | `src/shared/types/chat.d.ts` — 消息/会话/Block 类型              |
| 新建 | `src/shared/types/presenters/session.presenter.d.ts`             |
| 改造 | `src/shared/events.ts` — 添加 STREAM_EVENTS, SESSION_EVENTS      |
| 改造 | `src/shared/types/presenters/index.d.ts` — 添加 sessionPresenter |
| 改造 | `src/shared/types/presenters/agent.presenter.d.ts` — 新接口      |
| 改造 | `src/renderer/src/stores/chat.ts` → MessageStore                 |
| 新建 | `src/renderer/src/stores/session.ts` — SessionStore              |
| 改造 | `src/main/presenter/agentPresenter.ts` — 对接 Vercel AI SDK      |
| 新建 | `src/main/presenter/sessionPresenter.ts` — 会话管理              |
| 改造 | `src/main/presenter/index.ts` — 注册 sessionPresenter            |

### 005b 新建/改造

| 操作 | 文件                                                           |
| ---- | -------------------------------------------------------------- |
| 改造 | `src/renderer/src/components/chat/ChatPanel.vue`               |
| 新建 | `src/renderer/src/components/chat/MessageList.vue`             |
| 新建 | `src/renderer/src/components/message/MessageItemUser.vue`      |
| 新建 | `src/renderer/src/components/message/MessageItemAssistant.vue` |
| 新建 | `src/renderer/src/components/message/MessageBlockContent.vue`  |
| 新建 | `src/renderer/src/components/chat/ChatInput.vue`               |

### 005c 新建

| 操作 | 文件                                                            |
| ---- | --------------------------------------------------------------- |
| 新建 | `src/renderer/src/components/message/MessageBlockReasoning.vue` |
| 新建 | `src/renderer/src/components/message/MessageBlockToolCall.vue`  |
| 新建 | `src/renderer/src/components/message/MessageBlockError.vue`     |
| 新建 | `src/renderer/src/components/message/MessageBlockImage.vue`     |
| 新建 | `src/renderer/src/components/message/MessageToolbar.vue`        |

### 005d 新建/改造

| 操作 | 文件                                                           |
| ---- | -------------------------------------------------------------- |
| 新建 | `src/renderer/src/components/chat/SessionBar.vue`              |
| 新建 | `src/renderer/src/components/chat/ChatAttachmentItem.vue`      |
| 新建 | `src/renderer/src/components/artifact/ArtifactPreview.vue`     |
| 改造 | `src/renderer/src/components/function/FunctionPanel.vue`       |
| 改造 | `src/renderer/src/components/chat/ChatInput.vue` — TipTap 升级 |

### 依赖新增

```
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic  # Vercel AI SDK
pnpm add markstream-vue                         # Markdown 流式渲染
pnpm add @tailwindcss/typography                # prose 排版
pnpm add @tiptap/vue-3 @tiptap/starter-kit     # 005d TipTap
```

## 验收标准

### 005a

1. 消息类型定义完整，TypeScript 编译通过
2. SessionPresenter 支持 CRUD 操作，数据持久化到 JSON
3. AgentPresenter 对接 Vercel AI SDK，可流式生成回复
4. STREAM_EVENTS 事件正确推送到渲染进程
5. Store 能正确处理流式 blocks 更新

### 005b

1. 消息输入框可输入文本，Enter 发送，Shift+Enter 换行
2. 用户消息显示为右对齐气泡
3. 助手消息左对齐，Markdown 正确渲染（标题、列表、代码块、行内代码）
4. 流式响应有打字机效果
5. 发送中显示停止按钮，可中断生成
6. 新消息自动滚底，向上浏览时不抢滚动

### 005c

1. 思维链 block 可折叠/展开，显示思考耗时
2. 工具调用 block 显示工具名称和执行状态
3. 错误 block 红色样式展示
4. 图片 block 正确渲染
5. 消息工具栏 hover 显示，复制/重试功能可用

### 005d

1. 会话栏显示当前会话，支持新建/切换/删除
2. 文件附件可选择、预览标签、移除、随消息发送
3. Artifact 在右侧 FunctionPanel 中正确预览
4. TipTap 编辑器替换 textarea，Enter/Shift+Enter 行为正确
