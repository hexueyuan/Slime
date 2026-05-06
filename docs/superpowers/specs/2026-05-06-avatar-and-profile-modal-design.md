# 用户头像图片上传 + 资料弹窗设计

日期：2026-05-06

## 需求概述

1. **用户头像图片上传**：ProfileSettings 支持 image 模式，与 AgentEditDialog 对齐（lucide / monogram / image 三种类型）。
2. **点击头像弹出资料弹窗**：消息气泡中的头像可点击，单击直接弹出资料弹窗。
   - Agent 头像弹窗：居中大头像 + Agent 名字 + Agent 描述
   - 用户头像弹窗：居中大头像 + 用户名字

---

## 功能一：用户头像图片上传

### 改动范围

仅修改 `src/renderer/src/components/settings/ProfileSettings.vue` 一个文件，无需改动主进程。

### 实现方式

- 新增 `avatarType` 的第三个值 `"image"`，Tab 切换为图标 / 文字 / 图片三选一。
- 图片模式：显示「选择图片…」按钮，点击调用 `agentConfig.pickAvatar()`（复用 AgentConfigPresenter 现有方法），返回相对路径存入 `userProfile.avatar`。
- 图片预览：复用 `AgentAvatar` 组件（已支持 image 模式），无需改动。
- 存储：路径写入 `{ kind: "image", path: "avatars/{uuid}.{ext}" }`，通过 `chatStore.saveUserProfile()` 持久化（已支持，无需改动）。

### 不改动的文件

- `AgentConfigPresenter.ts`：`pickAvatar()` / `getAvatarUrl()` 直接复用
- `AgentAvatar.vue`：已支持 image 模式
- `chatStore.ts`：`saveUserProfile()` 已支持任意 AgentAvatar 类型

---

## 功能二：点击头像弹出资料弹窗

### 架构

采用 **Teleport to body + useProfileModal composable** 方案：
- 弹窗全局只有一个 DOM 实例，不受父组件层叠上下文影响。
- 调用方只传 `ProfileData`，弹窗内部从 store 取数据。

### 新增文件

#### `src/renderer/src/composables/useProfileModal.ts`

```ts
type ProfileData =
  | { type: 'agent'; agentId: string }
  | { type: 'user' }

// 暴露 open(profile) / close() / visible / profile
```

全局单例 ref（模块级），任何组件调用 `useProfileModal().open(profile)` 即可触发。

#### `src/renderer/src/components/chat/ProfileModal.vue`

- `<Teleport to="body">` 包裹弹窗
- 遮罩点击关闭
- 根据 `profile.type` 分支渲染：
  - `agent`：从 `agentStore` 取 agent，展示大头像（xl）+ 名字 + 描述
  - `user`：从 `chatStore.userProfile` 取数据，展示大头像（xl）+ 用户名
- 右上角关闭按钮

### 修改文件

| 文件 | 改动 |
|---|---|
| `App.vue` | 注册 `<ProfileModal />` 一次 |
| `ChatMessageUser.vue` | 头像 div 加 `@click`，调 `useProfileModal().open({ type: 'user' })` |
| `ChatMessageAssistant.vue` | 头像 div 加 `@click`，调 `useProfileModal().open({ type: 'agent', agentId })` |
| `AgentAvatar.vue` | 新增 `xl` 尺寸规格：96×96px，图标 48×48px，文字 `text-2xl` |

### 弹窗视觉规格

- 大头像：`AgentAvatar size="xl"`（96×96px）
- 弹窗宽度：280px，居中，圆角 12px
- 遮罩：`bg-black/50`，点击关闭
- 关闭按钮：右上角，lucide:x

---

## 文件改动汇总

| 文件 | 类型 | 说明 |
|---|---|---|
| `components/settings/ProfileSettings.vue` | 修改 | 新增 image Tab |
| `composables/useProfileModal.ts` | 新建 | 全局弹窗状态 |
| `components/chat/ProfileModal.vue` | 新建 | 资料弹窗组件 |
| `App.vue` | 修改 | 注册 ProfileModal |
| `components/chat/ChatMessageUser.vue` | 修改 | 头像加 click |
| `components/chat/ChatMessageAssistant.vue` | 修改 | 头像加 click |
| `components/chat/AgentAvatar.vue` | 修改 | 新增 xl 尺寸 |
