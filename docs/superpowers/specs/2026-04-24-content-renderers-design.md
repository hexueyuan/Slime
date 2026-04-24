# TASK-007: 功能区内容渲染器设计

## 概述

在 FunctionPanel 右侧面板新增"预览"Tab，实现 4 种内容渲染器（Quiz、Markdown、Progress、HTML Preview），并新增 `open` 工具让 Agent 能主动打开文件到预览区。

## 架构

```
主进程                                  渲染进程
┌──────────────────┐                  ┌──────────────────┐
│ ContentPresenter │──EventBus──→    │ contentStore      │
│  setContent()    │  content:       │  content ref      │
│  clearContent()  │  updated        │                   │
│  submitAnswer()  │←──IPC────────  │ FunctionPanel     │
│  openFile()      │                 │  ├─ 流程 Tab       │
│                  │                 │  ├─ 工具 Tab       │
│ ToolPresenter    │                 │  └─ 预览 Tab (NEW) │
│  +open tool def  │                 │     └─ Dispatcher  │
└──────────────────┘                 │        ├─ Quiz     │
                                      │        ├─ Markdown │
                                      │        ├─ Progress │
                                      │        └─ Preview  │
                                      └──────────────────┘
```

## 类型定义

文件：`src/shared/types/content.d.ts`

```typescript
export type FunctionContentType = 'quiz' | 'preview' | 'markdown' | 'progress'

export interface QuizContent {
  type: 'quiz'
  questions: QuizQuestion[]
}

export interface QuizQuestion {
  id: string
  text: string
  options: QuizOption[]
  allowCustom: boolean
  multiple?: boolean
}

export interface QuizOption {
  value: string
  label: string
  recommended?: boolean
}

export interface PreviewContent {
  type: 'preview'
  html: string
  title?: string
  confirmLabel?: string
  adjustLabel?: string
}

export interface MarkdownContent {
  type: 'markdown'
  content: string
  title?: string
}

export interface ProgressContent {
  type: 'progress'
  percentage: number
  label: string
  stage: string
  cancellable?: boolean
}

export type FunctionContent = QuizContent | PreviewContent | MarkdownContent | ProgressContent
```

## 事件定义

`src/shared/events.ts` 新增：

```typescript
export const CONTENT_EVENTS = {
  UPDATED: 'content:updated',
  CLEARED: 'content:cleared',
} as const
```

## 主进程：ContentPresenter

文件：`src/main/presenter/contentPresenter.ts`

```typescript
interface IContentPresenter {
  setContent(sessionId: string, content: FunctionContent): void
  getContent(sessionId: string): FunctionContent | null
  clearContent(sessionId: string): void
  submitQuizAnswer(sessionId: string, answers: Record<string, string | string[]>): void
  confirmPreview(sessionId: string): void
  adjustPreview(sessionId: string): void
  cancelProgress(sessionId: string): void
  openFile(sessionId: string, filePath: string): Promise<void>
}
```

- 内存 Map `<sessionId, FunctionContent>` 存储当前内容
- `setContent()` 存储 + `eventBus.sendToRenderer(CONTENT_EVENTS.UPDATED, sessionId, content)`
- `clearContent()` 删除 + `eventBus.sendToRenderer(CONTENT_EVENTS.CLEARED, sessionId)`
- `openFile()` 读取文件 → 根据扩展名推断类型 → 调用 `setContent()`
  - `.md` → MarkdownContent
  - `.html` / `.htm` → PreviewContent
  - 其他文本文件 → MarkdownContent（内容包在 code block 中）
- Quiz/Preview/Progress 的回调方法通过 EventBus 内部事件通知（供未来进化引擎消费）

## open 工具

在 ToolPresenter 中新增第 10 个工具定义：

```typescript
{
  name: 'open',
  description: '在预览面板中打开文件。支持 .md（Markdown渲染）和 .html（HTML预览）等文件类型。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（相对于项目根目录）' }
    },
    required: ['path']
  }
}
```

Handler：调用 `contentPresenter.openFile(sessionId, path)`。

## 渲染进程：contentStore

文件：`src/renderer/src/stores/content.ts`

```typescript
// Pinia store
const content = ref<FunctionContent | null>(null)

function setupContentIpc() {
  onContentUpdated((_sessionId, data) => { content.value = data })
  onContentCleared(() => { content.value = null })
  return cleanup
}
```

## FunctionPanel 改造

`activeTab` 类型扩展为 `"workflow" | "tools" | "preview"`。

新增第三个 Tab 按钮"预览"。当 contentStore.content 更新时，自动切换到预览 Tab（通过 watch）。

预览 Tab 内部渲染 `<ContentDispatcher :content="content" />`。

## ContentDispatcher

文件：`src/renderer/src/components/function/ContentDispatcher.vue`

根据 `content.type` 分发到对应渲染器组件：
- `quiz` → QuizRenderer
- `markdown` → MarkdownRenderer
- `progress` → ProgressRenderer
- `preview` → PreviewRenderer

content 为 null 时显示空状态占位。

## 4 个渲染器组件

### QuizRenderer

- Props: `content: QuizContent`
- 状态: reactive answers Map，customInputs Map
- 支持单选（radio）和复选（checkbox）
- 支持自定义输入（allowCustom）
- 确认按钮：所有题目都有答案后才可点击
- 提交通过 `usePresenter('content').submitQuizAnswer(sessionId, answers)`

### MarkdownRenderer

- Props: `content: MarkdownContent`
- 复用项目现有的 markdown-it 实例渲染
- v-html 输出渲染结果
- 可选 title 显示

### ProgressRenderer

- Props: `content: ProgressContent`
- 百分比进度条 + CSS transition 动画
- 显示 stage 名称和当前标签
- cancellable 时显示取消按钮

### PreviewRenderer

- Props: `content: PreviewContent`
- `<iframe sandbox="allow-scripts" :srcdoc="html">` 渲染
- 不加 `allow-same-origin`，确保沙箱隔离
- 确认/调整两个操作按钮
- 可选 title 显示

## 文件变更清单

### 新增文件

| 文件 | 职责 |
|---|---|
| `src/shared/types/content.d.ts` | 4 种内容类型定义 |
| `src/main/presenter/contentPresenter.ts` | 内容管理 Presenter |
| `src/renderer/src/stores/content.ts` | 内容状态 Store |
| `src/renderer/src/components/function/ContentDispatcher.vue` | 类型分发器 |
| `src/renderer/src/components/function/renderers/QuizRenderer.vue` | 选择题渲染器 |
| `src/renderer/src/components/function/renderers/MarkdownRenderer.vue` | Markdown 渲染器 |
| `src/renderer/src/components/function/renderers/ProgressRenderer.vue` | 进度条渲染器 |
| `src/renderer/src/components/function/renderers/PreviewRenderer.vue` | HTML 预览渲染器 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `src/shared/events.ts` | 新增 CONTENT_EVENTS |
| `src/shared/types/presenters/index.ts` | 导出 IContentPresenter 接口 |
| `src/main/presenter/index.ts` | 注册 ContentPresenter |
| `src/main/presenter/toolPresenter.ts` | 新增 open 工具定义 + handler |
| `src/renderer/src/components/function/FunctionPanel.vue` | 三 Tab 切换 + 预览 Tab |

### 测试文件

| 文件 | 覆盖范围 |
|---|---|
| `test/main/contentPresenter.test.ts` | setContent/clearContent/openFile |
| `test/renderer/stores/content.test.ts` | IPC 监听 + 状态管理 |
| `test/renderer/components/function/ContentDispatcher.test.ts` | 类型分发正确性 |
| `test/renderer/components/function/renderers/QuizRenderer.test.ts` | 选择/提交逻辑 |
| `test/renderer/components/function/renderers/MarkdownRenderer.test.ts` | Markdown 渲染 |
| `test/renderer/components/function/renderers/ProgressRenderer.test.ts` | 进度显示 + 取消 |
| `test/renderer/components/function/renderers/PreviewRenderer.test.ts` | iframe 渲染 |

## 验收标准

- [ ] Quiz：单选/复选正确，自定义输入可用，确认按钮校验
- [ ] Markdown：代码块、表格、列表正确渲染（复用 markdown-it）
- [ ] Progress：百分比动画流畅，取消按钮可用
- [ ] HTML Preview：iframe sandbox 安全渲染（无 allow-same-origin）
- [ ] open 工具：Agent 调用后自动在预览 Tab 打开文件
- [ ] 预览 Tab：content 更新时自动切换，空状态有占位提示
- [ ] 所有渲染器事件正确传递到主进程

## 不做（scope 外）

- ResultRenderer（等进化引擎实现后补充）
- 文件语法高亮（code block 暂不做高亮）
- 图片/PDF 等二进制文件预览
- 多内容堆叠/历史切换
