# Avatar Image Upload + Profile Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户头像支持图片上传（与 Agent 头像对齐），消息气泡中头像可点击弹出资料弹窗。

**Architecture:** ProfileSettings 新增 image Tab，复用 `agentConfig.pickAvatar()`。资料弹窗用 Teleport to body + 模块级单例 composable，弹窗注册在 App.vue 顶层，任何组件调用 `useProfileModal().open()` 即可触发。

**Tech Stack:** Vue 3 Composition API, Pinia, TailwindCSS, @iconify/vue, Teleport

---

## File Map

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/renderer/src/components/chat/AgentAvatar.vue` | 修改 | 新增 `xl` 尺寸（96×96px） |
| `src/renderer/src/composables/useProfileModal.ts` | 新建 | 全局弹窗状态（模块级单例） |
| `src/renderer/src/components/chat/ProfileModal.vue` | 新建 | 资料弹窗组件，Teleport to body |
| `src/renderer/src/App.vue` | 修改 | 注册 `<ProfileModal />` |
| `src/renderer/src/components/chat/ChatMessageUser.vue` | 修改 | 头像加 `@click` |
| `src/renderer/src/components/chat/ChatMessageAssistant.vue` | 修改 | 头像加 `@click` |
| `src/renderer/src/components/settings/ProfileSettings.vue` | 修改 | 新增 image Tab |

---

## Task 1: AgentAvatar 新增 xl 尺寸

**Files:**
- Modify: `src/renderer/src/components/chat/AgentAvatar.vue`

- [ ] **Step 1: 修改 sizeMap，新增 xl 规格**

当前 `sizeMap` 在第 14-18 行，把 `size` prop 类型和 sizeMap 都加上 `xl`：

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import type { AgentAvatar } from "@shared/types/agent";

const props = defineProps<{
  avatar?: AgentAvatar | null;
  size?: "sm" | "md" | "lg" | "xl";
}>();

const agentConfig = usePresenter("agentConfigPresenter");

const sizeMap = {
  sm: { box: "h-6 w-6", icon: "h-3.5 w-3.5", text: "text-[10px]" },
  md: { box: "h-8 w-8", icon: "h-4 w-4", text: "text-xs" },
  lg: { box: "h-12 w-12", icon: "h-6 w-6", text: "text-sm" },
  xl: { box: "h-24 w-24", icon: "h-12 w-12", text: "text-2xl" },
};

const s = sizeMap[props.size ?? "md"];

const imageUrl = ref<string | null>(null);

watch(
  () => props.avatar,
  async (avatar) => {
    if (avatar?.kind === "image") {
      imageUrl.value = (await agentConfig.getAvatarUrl(avatar.path)) as string;
    } else {
      imageUrl.value = null;
    }
  },
  { immediate: true },
);
</script>
```

（template 不变）

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/AgentAvatar.vue
git commit -m "feat(avatar): add xl size to AgentAvatar"
```

---

## Task 2: useProfileModal composable

**Files:**
- Create: `src/renderer/src/composables/useProfileModal.ts`

- [ ] **Step 1: 新建 composable**

```typescript
// src/renderer/src/composables/useProfileModal.ts
import { ref } from "vue";

export type ProfileData = { type: "agent"; agentId: string } | { type: "user" };

const visible = ref(false);
const profile = ref<ProfileData | null>(null);

export function useProfileModal() {
  function open(data: ProfileData) {
    profile.value = data;
    visible.value = true;
  }

  function close() {
    visible.value = false;
    profile.value = null;
  }

  return { visible, profile, open, close };
}
```

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/composables/useProfileModal.ts
git commit -m "feat(chat): add useProfileModal composable"
```

---

## Task 3: ProfileModal 组件

**Files:**
- Create: `src/renderer/src/components/chat/ProfileModal.vue`

ProfileModal 从 store 取数据，自行查询 agent/user profile，无需调用方传入。

- [ ] **Step 1: 新建组件**

```vue
<!-- src/renderer/src/components/chat/ProfileModal.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentChatStore } from "@/stores/agentChat";
import { useProfileModal } from "@/composables/useProfileModal";
import AgentAvatarComp from "./AgentAvatar.vue";

const { visible, profile, close } = useProfileModal();
const agentStore = useAgentStore();
const chatStore = useAgentChatStore();

const agent = computed(() => {
  if (profile.value?.type === "agent") {
    return agentStore.agents.find((a) => a.id === profile.value!.agentId) ?? null;
  }
  return null;
});

const userProfile = computed(() => chatStore.userProfile);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="close"
    >
      <div class="relative w-[280px] rounded-xl bg-background p-6 shadow-xl border border-border">
        <!-- 关闭按钮 -->
        <button
          class="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="close"
        >
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>

        <!-- Agent 资料 -->
        <template v-if="profile?.type === 'agent' && agent">
          <div class="flex flex-col items-center gap-3">
            <AgentAvatarComp :avatar="agent.avatar ?? null" size="xl" />
            <div class="text-center">
              <div class="text-base font-semibold text-foreground">{{ agent.name }}</div>
              <div
                v-if="agent.description"
                class="mt-1.5 text-sm text-muted-foreground leading-relaxed"
              >
                {{ agent.description }}
              </div>
            </div>
          </div>
        </template>

        <!-- 用户资料 -->
        <template v-else-if="profile?.type === 'user'">
          <div class="flex flex-col items-center gap-3">
            <AgentAvatarComp
              :avatar="userProfile?.avatar ?? { kind: 'monogram', text: 'U', backgroundColor: '#3b82f6' }"
              size="xl"
            />
            <div class="text-base font-semibold text-foreground">
              {{ userProfile?.name ?? "未设置名称" }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ProfileModal.vue
git commit -m "feat(chat): add ProfileModal component"
```

---

## Task 4: 在 App.vue 注册 ProfileModal

**Files:**
- Modify: `src/renderer/src/App.vue`

- [ ] **Step 1: 引入并注册 ProfileModal**

在 `<script setup>` 的 import 区追加：

```typescript
import ProfileModal from "./components/chat/ProfileModal.vue";
```

在 `<template>` 的根 `<div>` 最后（`</div>` 闭合前）追加：

```html
<ProfileModal />
```

完整改动后 template 尾部如下：

```html
    <!-- Main layout -->
    <div v-else class="flex h-full flex-col bg-sidebar">
      <div class="h-9 shrink-0" style="-webkit-app-region: drag" />
      <div class="flex min-h-0 flex-1">
        <AppSidebar v-model:active-view="activeView" />
        <div
          class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
        >
          <ChatroomPanel v-if="activeView === 'chatroom'" />
          <GatewayPanel v-else-if="activeView === 'gateway'" />
          <EvolabPanel v-else-if="activeView === 'evolab'" />
        </div>
      </div>
    </div>
    <ProfileModal />
  </div>
</template>
```

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.vue
git commit -m "feat(chat): register ProfileModal in App.vue"
```

---

## Task 5: ChatMessageUser 头像点击

**Files:**
- Modify: `src/renderer/src/components/chat/ChatMessageUser.vue`

- [ ] **Step 1: 引入 useProfileModal，头像加 click + cursor-pointer**

在 `<script setup>` 追加 import：

```typescript
import { useProfileModal } from "@/composables/useProfileModal";
const { open: openProfile } = useProfileModal();
```

template 中找到头像行（当前第 62 行）：

```html
    <!-- Avatar -->
    <AgentAvatarComp :avatar="userAvatar" size="lg" />
```

改为：

```html
    <!-- Avatar -->
    <AgentAvatarComp
      :avatar="userAvatar"
      size="lg"
      class="cursor-pointer"
      @click="openProfile({ type: 'user' })"
    />
```

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageUser.vue
git commit -m "feat(chat): open profile modal on user avatar click"
```

---

## Task 6: ChatMessageAssistant 头像点击

**Files:**
- Modify: `src/renderer/src/components/chat/ChatMessageAssistant.vue`

- [ ] **Step 1: 引入 useProfileModal，头像加 click + cursor-pointer**

在 `<script setup>` 追加 import：

```typescript
import { useProfileModal } from "@/composables/useProfileModal";
const { open: openProfile } = useProfileModal();
```

template 中找到头像行（当前第 120 行）：

```html
    <!-- Avatar -->
    <AgentAvatarComp :avatar="agentAvatar" size="lg" />
```

改为：

```html
    <!-- Avatar -->
    <AgentAvatarComp
      :avatar="agentAvatar"
      size="lg"
      class="cursor-pointer"
      @click="agentId && openProfile({ type: 'agent', agentId })"
    />
```

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageAssistant.vue
git commit -m "feat(chat): open profile modal on agent avatar click"
```

---

## Task 7: ProfileSettings 新增 image Tab

**Files:**
- Modify: `src/renderer/src/components/settings/ProfileSettings.vue`

- [ ] **Step 1: 更新 script setup**

将第 11 行的 `avatarType` 类型和相关状态扩展：

```typescript
const avatarType = ref<"icon" | "monogram" | "image">("monogram");
const avatarImagePath = ref("");
```

在 `onMounted` 中的 avatar 初始化块加上 image 分支（在 `else if (profile.avatar?.kind === "monogram")` 之后追加）：

```typescript
    } else if (profile.avatar?.kind === "image") {
      avatarType.value = "image";
      avatarImagePath.value = profile.avatar.path;
    }
```

更新 `currentAvatar` computed（加 image 分支）：

```typescript
const currentAvatar = computed<AgentAvatarType>(() => {
  if (avatarType.value === "icon") {
    return { kind: "lucide", icon: avatarIcon.value, color: avatarColor.value };
  }
  if (avatarType.value === "image") {
    return { kind: "image", path: avatarImagePath.value };
  }
  return { kind: "monogram", text: avatarText.value || "U", backgroundColor: avatarBgColor.value };
});
```

新增 `pickImage` 函数（在 `onSave` 前加）：

```typescript
const agentConfig = usePresenter("agentConfigPresenter");

async function pickImage() {
  const path = (await agentConfig.pickAvatar()) as string | null;
  if (path) {
    avatarImagePath.value = path;
  }
}
```

同时在 import 行加上 `usePresenter`：

```typescript
import { usePresenter } from "@/composables/usePresenter";
```

- [ ] **Step 2: 更新 template — 新增「图片」Tab 按钮**

在「文字」按钮（`@click="avatarType = 'monogram'"`）后追加：

```html
        <button
          :class="[
            'rounded px-2 py-1 text-xs',
            avatarType === 'image'
              ? 'bg-violet-500/20 text-violet-400'
              : 'text-muted-foreground hover:bg-muted',
          ]"
          @click="avatarType = 'image'"
        >
          图片
        </button>
```

- [ ] **Step 3: 更新 template — 新增图片模式 UI**

将现有 `v-else`（monogram 模式，第 143 行）改为 `v-else-if="avatarType === 'monogram'"`，并在其后新增图片模式区块：

```html
      <!-- Monogram mode -->
      <div v-else-if="avatarType === 'monogram'" class="flex items-center gap-3">
        <!-- 原有内容不变 -->
      </div>

      <!-- Image mode -->
      <div v-else-if="avatarType === 'image'" class="flex items-center gap-3">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground overflow-hidden"
        >
          <span v-if="!avatarImagePath">无</span>
          <AgentAvatar v-else :avatar="{ kind: 'image', path: avatarImagePath }" size="lg" />
        </div>
        <div class="flex flex-col gap-1">
          <button
            class="rounded-md bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500"
            @click="pickImage"
          >
            选择图片…
          </button>
          <span class="text-xs text-muted-foreground">支持 PNG / JPG / GIF / WebP / SVG</span>
        </div>
      </div>
```

- [ ] **Step 4: 运行 typecheck + lint**

```bash
pnpm run typecheck && pnpm run lint
```

Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/settings/ProfileSettings.vue
git commit -m "feat(settings): add image avatar type to ProfileSettings"
```

---

## Task 8: format + 最终验证

- [ ] **Step 1: 运行 format**

```bash
pnpm run format
```

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 3: 检查 format 后有无 diff，若有则提交**

```bash
git diff --stat
```

若有改动：

```bash
git add -A
git commit -m "style: format"
```

- [ ] **Step 4: 手动验证核对清单**

1. ProfileSettings → 头像 Tab 可切换图标/文字/图片，点「选择图片…」弹出文件选择，保存后头像正确显示
2. 消息气泡中点击用户头像 → 弹出用户资料弹窗（大头像 + 用户名）
3. 消息气泡中点击 Agent 头像 → 弹出 Agent 资料弹窗（大头像 + Agent 名 + 描述）
4. 点弹窗遮罩或右上角 ✕ → 弹窗关闭
5. AgentAvatar xl 尺寸在弹窗内正常显示（96×96px 圆形）
