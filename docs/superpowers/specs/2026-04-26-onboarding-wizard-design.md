# TASK-024: 首次启动引导页设计文档

## 概述

实现首次启动引导向导，引导用户配置 AI Provider（API Key、Model）和用户标识（evolution.user），并验证 API 连通性。采用条件渲染方式集成到现有 EvolutionCenter 的渲染链中。

## 触发条件

`configPresenter.get("app.onboarded")` 为 falsy 时显示引导页。完成后写入 `app.onboarded: true`。

EvolutionCenter 条件渲染链扩展为：

```
loading (null) → onboarding (未完成) → WorkspaceSetup (true) → main layout (false)
```

## 向导步骤

| # | 步骤名 | 组件 | 收集内容 | 逻辑 |
|---|--------|------|---------|------|
| 1 | 欢迎 | WelcomeStep | 无 | 介绍 Slime，"开始孵化"按钮 |
| 2 | AI 配置 | ProviderStep | provider, apiKey, model, baseUrl | 表单输入，复用 ProviderSettings 字段逻辑 |
| 3 | 验证 | VerifyStep | 无（自动） | 调用 verifyApiKey IPC 验证连通性 |
| 4 | 用户标识 | IdentityStep | evolution.user | 输入用户名，实时预览版本号格式 |
| 5 | 完成 | CompleteStep | 无 | 配置摘要确认，"进入 Slime"按钮 |

## 视觉风格

生物有机体风格，延续 EvolutionStatusBar 的细胞膜美学：

- 深色渐变背景：`linear-gradient(135deg, #1a1025, #0d0d1a, #0a0a12)`
- 紫色发光核心（欢迎页）：径向渐变 + box-shadow + pulse 动画
- 进度指示：5 个圆点节点，active=紫色发光，done=绿色，pending=紫色空心
- 主按钮：紫色渐变 `linear-gradient(135deg, #7c3aed, #a855f7)` 圆角 20px
- 次要按钮：透明底 + 紫色描边
- 表单输入：紫色微透明底 + 紫色描边，focus 时描边加深
- 成功状态：绿色发光（验证通过）

## 组件结构

```
src/renderer/src/components/onboarding/
├── OnboardingWizard.vue      — 容器，管理步骤导航 + 状态
├── WelcomeStep.vue           — 欢迎页（细胞核动画 + 产品介绍）
├── ProviderStep.vue          — AI 配置表单
├── VerifyStep.vue            — API 连通性验证（自动执行 + 结果展示）
├── IdentityStep.vue          — 用户标识输入 + 版本号预览
└── CompleteStep.vue          — 配置摘要 + 进入按钮
```

### OnboardingWizard.vue

容器组件，管理：

- `currentStep: ref<number>` — 当前步骤索引（0-4）
- `config: reactive<OnboardingConfig>` — 收集的配置数据
- `next()` / `prev()` — 步骤导航
- `complete()` — 保存所有配置 + 设置 `app.onboarded: true` + emit `done`

```typescript
interface OnboardingConfig {
  provider: 'anthropic' | 'openai'
  apiKey: string
  model: string
  baseUrl: string
  userName: string
}
```

### EvolutionCenter.vue 集成

```typescript
// 新增状态
const needsOnboarding = ref<boolean | null>(null)

onMounted(async () => {
  const onboarded = await configPresenter.get('app.onboarded')
  needsOnboarding.value = !onboarded
  if (!needsOnboarding.value) {
    // 继续现有的 workspace 检查
    ...
  }
})
```

模板条件渲染：

```html
<template>
  <!-- loading -->
  <div v-if="needsOnboarding === null">加载中...</div>
  <!-- onboarding -->
  <OnboardingWizard v-else-if="needsOnboarding" @done="onOnboardingDone" />
  <!-- workspace setup -->
  <WorkspaceSetup v-else-if="needsWorkspaceInit" ... />
  <!-- main layout -->
  <div v-else>...</div>
</template>
```

## 新增 IPC

### agentPresenter.verifyApiKey

```typescript
// AgentPresenter 新增方法
async verifyApiKey(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string
): Promise<{ success: boolean; error?: string; modelName?: string }> {
  // 构造临时 AI client，发送一次简短请求验证连通性
  // 成功返回 { success: true, modelName: "claude-sonnet-4-20250514" }
  // 失败返回 { success: false, error: "Invalid API key" }
}
```

实现方式：用提供的凭证创建临时 AI client，发送一条极短的 `messages: [{ role: "user", content: "hi" }]`（maxTokens: 1），检查响应是否正常。不使用 stream，同步等待即可。

## 数据流

```
用户填写表单
  → OnboardingWizard 收集到 config
  → "验证连接" 按钮触发
  → ipcRenderer.invoke("presenter:call", "agent", "verifyApiKey", provider, apiKey, model, baseUrl)
  → AgentPresenter.verifyApiKey() 发起 API 调用
  → 返回结果给 VerifyStep 展示
  → 用户确认 → 填写用户标识
  → "进入 Slime" 按钮
  → configPresenter.set("ai.provider", ...)
  → configPresenter.set("ai.apiKey", ...)
  → configPresenter.set("ai.model", ...)
  → configPresenter.set("ai.baseUrl", ...)
  → configPresenter.set("evolution.user", ...)
  → configPresenter.set("app.onboarded", true)
  → emit("done")
  → EvolutionCenter 切换到 WorkspaceSetup 或主布局
```

## 错误处理

| 场景 | 处理 |
|------|------|
| API Key 为空 | 按钮 disabled，提示"请输入 API Key" |
| 用户标识为空 | 按钮 disabled，提示"请输入用户标识" |
| API 验证失败 | VerifyStep 显示错误信息 + "返回修改"按钮，不阻断流程 |
| API 验证超时 | 显示超时错误，允许重试或跳过 |
| 用户标识含特殊字符 | 前端校验，只允许 `[a-zA-Z0-9_-]`，实时反馈 |

## 验证步骤失败态

验证失败时 VerifyStep 展示：

- 红色 × 图标
- 错误信息（如 "Invalid API key"、"Network error"）
- 两个按钮："← 返回修改" + "跳过验证"
- 跳过验证会在 CompleteStep 显示警告

## 测试策略

- 单元测试：OnboardingWizard 步骤导航逻辑
- 单元测试：VerifyStep 成功/失败/加载态渲染
- 单元测试：IdentityStep 输入校验
- 集成测试：AgentPresenter.verifyApiKey（mock API 调用）
- 集成测试：EvolutionCenter 条件渲染链（onboarded=false → 显示 wizard）

## 不在范围内

- 暗色/亮色模式切换（当前强制暗色）
- 多语言支持
- 引导页动画过渡（保持简单的 CSS transition）
- API Key 加密存储（当前 ConfigPresenter 明文存储，后续优化）
