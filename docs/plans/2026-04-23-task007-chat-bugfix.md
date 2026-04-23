# TASK-007 聊天功能 Bug 修复

**Goal:** 修复聊天功能端到端不通的问题，使 AI 对话正常工作。

**Status:** 已完成

**Commit:** `15ab9f1 fix: resolve chat bugs - error display, duplicate messages, baseURL passthrough`

---

## 问题清单

### Bug 1: stream error 静默吞没（P0）

- **现象**: 用户发消息后无 AI 回复，无任何错误提示
- **根因**: `messageIpc.ts` 的 `STREAM_EVENTS.ERROR` 处理器丢弃了 error 参数，只调 `clearStreamingState()`
- **修复**: chat store 新增 `streamError` ref，messageIpc 存储错误信息，ChatInput 组件在输入框上方显示错误横幅
- **涉及文件**: `stores/chat.ts`, `stores/messageIpc.ts`, `components/chat/ChatInput.vue`, `components/chat/ChatPanel.vue`

### Bug 2: buildMessages 消息重复（P1）

- **现象**: 用户消息发给 AI 两次
- **根因**: `AgentPresenter.chat()` 先 `saveMessage` 存入 JSON，然后 `buildMessages` 读取 JSON（已含该消息）后又 `push` 了一次
- **修复**: `buildMessages` 移除 `content` 参数，只从 JSON 读取已保存的消息
- **涉及文件**: `presenter/agentPresenter.ts`

### Bug 3: Anthropic baseURL 未透传（P1）

- **现象**: 设置了代理 baseUrl 但 Anthropic provider 忽略它，请求发到错误地址
- **根因**: `createAnthropic()` 调用时没传 `baseURL` 参数
- **修复**: 传递 `baseURL: config.baseUrl` 给 `createAnthropic()`
- **涉及文件**: `presenter/agentPresenter.ts`

### Bug 4: macOS activate 窗口 eventBus 断链（P2）

- **现象**: 关闭窗口后重新激活 app，AI 回复的流式事件发不到渲染进程
- **根因**: `app.on("activate")` 创建新窗口但没调 `eventBus.setWindow()`
- **修复**: activate 回调中 `eventBus.setWindow(win)`
- **涉及文件**: `index.ts`

### Bug 5: ChatInput isComposing 未绑定（P3）

- **现象**: 中文输入法下按 Enter 会误触发提交
- **根因**: `isComposing` ref 定义了但 textarea 没绑定 `compositionstart`/`compositionend` 事件
- **修复**: 添加 `@compositionstart` 和 `@compositionend` 事件绑定
- **涉及文件**: `components/chat/ChatInput.vue`
