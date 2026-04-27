# 渠道 Tab Master-Detail 布局重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ChannelTab.vue 从纵向堆叠布局改为左右分栏 master-detail 布局，并更新能力标签配色。

**Architecture:** 纯 template/style 重构，script 逻辑几乎不变。外层改为 flex 水平布局，左侧固定宽度渠道列表面板，右侧弹性宽度模型管理面板。添加模型的交互从底部固定输入框改为 "+" 按钮触发的内联展开输入。

**Tech Stack:** Vue 3, TailwindCSS, Iconify

**Spec:** `docs/superpowers/specs/2026-04-27-channel-tab-master-detail-design.md`

---

### Task 1: 重构外层布局为左右分栏

**Files:**

- Modify: `src/renderer/src/components/gateway/ChannelTab.vue:258-270`

将渠道列表和模型管理面板从纵向堆叠改为水平 flex 分栏。

- [ ] **Step 1: 修改外层容器和头部**

将 template 第 259 行起的结构改为：

```html
<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="shrink-0 border-b border-border px-4 py-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium">渠道</h3>
      <button
        class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
        @click="openCreate"
      >
        + 新增渠道
      </button>
    </div>
  </div>

  <!-- Master-Detail body -->
  <div class="flex min-h-0 flex-1">
    <!-- Left: channel list panel (content from Task 2) -->
    <!-- Right: model management panel (content from Task 3) -->
  </div>
</div>
```

外层改为 `flex h-full flex-col`，头部 `shrink-0` 固定，body `flex min-h-0 flex-1` 水平分栏占满剩余空间。

- [ ] **Step 2: 验证 typecheck 通过**

Run: `cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue
git commit -m "refactor(gateway): channel tab outer layout to flex column"
```

---

### Task 2: 左侧渠道列表面板

**Files:**

- Modify: `src/renderer/src/components/gateway/ChannelTab.vue:272-331`

将渠道列表包裹在左侧固定宽度面板中，简化卡片内容（移除操作按钮，只显示名称+类型+模型数量）。

- [ ] **Step 1: 新增自动选中第一个渠道的逻辑**

在 `<script setup>` 中（`selectChannel` 函数之后，约 227 行），添加 watch 自动选中第一个渠道：

```typescript
import { ref, computed, watch } from "vue";
// ... existing code ...

// Auto-select first channel
watch(
  () => store.channels,
  (channels) => {
    if (channels.length && !selectedChannelId.value) {
      selectChannel(channels[0]);
    }
  },
  { immediate: true },
);
```

注意：import 行需要把 `watch` 加到现有的 `import { ref, computed } from 'vue'` 中。

- [ ] **Step 2: 替换渠道列表 template 为左侧面板**

将 `<!-- Master-Detail body -->` 中的左侧区域写为：

```html
<!-- Left: channel list -->
<div class="w-60 shrink-0 overflow-y-auto border-r border-border p-2">
  <template v-if="store.channels.length">
    <div
      v-for="ch in store.channels"
      :key="ch.id"
      class="mb-1 cursor-pointer rounded-lg p-2.5 transition-colors"
      :class="[
        selectedChannelId === ch.id
          ? 'bg-violet-500/10 ring-1 ring-violet-500/30'
          : 'hover:bg-muted/50',
        !ch.enabled && 'opacity-50',
      ]"
      @click="selectChannel(ch)"
    >
      <div class="flex items-center gap-1.5">
        <span class="truncate text-[13px] font-medium">{{ ch.name }}</span>
        <span
          :class="[
            'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
            ch.enabled ? 'bg-green-500' : 'bg-neutral-500',
          ]"
        />
      </div>
      <div class="mt-1 text-[11px] text-muted-foreground">
        {{ ch.type }}
        <span class="ml-1">·</span>
        <span class="ml-1">{{ (store.models.get(ch.id) ?? []).length }} 模型</span>
      </div>
    </div>
  </template>
  <div v-else class="py-12 text-center text-xs text-muted-foreground">暂无渠道</div>
</div>
```

宽度 `w-60`（240px），`shrink-0` 不压缩，独立 `overflow-y-auto` 滚动。卡片只展示名称+状态+类型+模型数量。禁用渠道 `opacity-50`。

- [ ] **Step 3: 验证 typecheck**

Run: `cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue
git commit -m "refactor(gateway): left channel list panel with auto-select"
```

---

### Task 3: 右侧模型管理面板 + 渠道详情头

**Files:**

- Modify: `src/renderer/src/components/gateway/ChannelTab.vue:334-414`

右侧面板包含渠道详情头（名称/URL/操作按钮）和模型列表。

- [ ] **Step 1: 新增 selectedChannel computed**

在 `<script setup>` 中添加（`channelModels` computed 附近）：

```typescript
const selectedChannel = computed(
  () => store.channels.find((ch) => ch.id === selectedChannelId.value) ?? null,
);
```

- [ ] **Step 2: 写右侧面板 template**

在 `<!-- Master-Detail body -->` 的 flex 容器内，左侧面板之后添加：

```html
<!-- Right: model management -->
<div v-if="selectedChannel" class="min-w-0 flex-1 overflow-y-auto p-4">
  <!-- Channel detail header -->
  <div class="mb-4 flex items-center justify-between border-b border-border pb-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-semibold">{{ selectedChannel.name }}</span>
        <span
          :class="[
            'inline-block h-1.5 w-1.5 rounded-full',
            selectedChannel.enabled ? 'bg-green-500' : 'bg-neutral-500',
          ]"
        />
      </div>
      <div class="mt-1 truncate text-xs text-muted-foreground">
        {{ selectedChannel.type }}
        <span v-if="selectedChannel.baseUrls.length" class="ml-1">
          · {{ selectedChannel.baseUrls[0] }}
        </span>
      </div>
      <!-- Test result -->
      <div v-if="testResults.get(selectedChannel.id)" class="mt-1 text-xs">
        <span v-if="testResults.get(selectedChannel.id)!.loading" class="text-muted-foreground"
          >测试中...</span
        >
        <span v-else-if="testResults.get(selectedChannel.id)!.success" class="text-green-500"
          >连接成功</span
        >
        <span v-else class="text-red-400">{{ testResults.get(selectedChannel.id)!.error }}</span>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <button
        class="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        @click="testChannel(selectedChannel.id)"
      >
        测试
      </button>
      <button
        class="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        @click="openEdit(selectedChannel)"
      >
        编辑
      </button>
      <button
        class="rounded border border-border px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
        @click="deleteChannel(selectedChannel.id)"
      >
        删除
      </button>
    </div>
  </div>

  <!-- Model management (content from Task 4) -->
</div>

<!-- Empty state when no channel selected and no channels exist -->
<div
  v-else-if="!store.channels.length"
  class="flex min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground"
>
  暂无渠道
</div>
```

- [ ] **Step 3: 移除旧的 channel list 和 model panel 区域**

删除原来 `<!-- Channel list -->` 到 `<!-- Empty -->` 之间的旧 template 代码（原第 272-414 行），因为已被 Task 2 和 Task 3 的新代码替代。确保 `<!-- Editor overlay -->` 的 Teleport 保留。

- [ ] **Step 4: 验证 typecheck**

Run: `cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue
git commit -m "refactor(gateway): right panel with channel detail header"
```

---

### Task 4: 模型列表 + 能力标签配色 + "+" 添加交互

**Files:**

- Modify: `src/renderer/src/components/gateway/ChannelTab.vue`

实现模型列表区域，包含新的能力标签配色和 "+" 按钮触发的内联输入。

- [ ] **Step 1: 添加能力颜色映射和 showAddModel 状态**

在 `<script setup>` 中，`ALL_CAPS` 定义附近添加：

```typescript
const CAP_COLORS: Record<Capability, { active: string; inactive: string }> = {
  reasoning: {
    active: "bg-violet-400/20 text-violet-400 border-violet-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
  chat: {
    active: "bg-blue-400/20 text-blue-400 border-blue-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
  vision: {
    active: "bg-emerald-400/20 text-emerald-400 border-emerald-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
  image_gen: {
    active: "bg-amber-400/20 text-amber-400 border-amber-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
};

const showAddModel = ref(false);
```

- [ ] **Step 2: 写模型管理标题行 + 模型列表 + 内联添加**

在右侧面板的 `<!-- Model management -->` 位置填入：

```html
<!-- Model management title -->
<div class="mb-3 flex items-center justify-between">
  <span class="text-[13px] text-muted-foreground">模型管理</span>
  <button
    class="flex h-6 w-6 items-center justify-center rounded border border-border text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    title="添加模型"
    @click="showAddModel = !showAddModel"
  >
    +
  </button>
</div>

<!-- Model list -->
<div v-if="channelModels.length" class="space-y-2">
  <div
    v-for="model in channelModels"
    :key="model.id"
    class="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2"
  >
    <div class="flex items-center gap-2">
      <span class="text-[13px]">{{ model.modelName }}</span>
      <span
        :class="[
          'inline-block h-1.5 w-1.5 rounded-full',
          model.enabled ? 'bg-green-500' : 'bg-neutral-500',
        ]"
      />
    </div>
    <div class="flex items-center gap-1">
      <button
        v-for="cap in ALL_CAPS"
        :key="cap.key"
        class="rounded border px-2 py-0.5 text-[10px] transition-colors"
        :class="
          model.capabilities.includes(cap.key)
            ? CAP_COLORS[cap.key].active
            : CAP_COLORS[cap.key].inactive
        "
        @click.stop="toggleModelCap(model, cap.key)"
      >
        {{ cap.label }}
      </button>
      <button
        class="ml-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        :title="model.enabled ? '禁用' : '启用'"
        @click.stop="toggleModelEnabled(model)"
      >
        <Icon :icon="model.enabled ? 'lucide:eye' : 'lucide:eye-off'" class="h-3.5 w-3.5" />
      </button>
      <button
        class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-red-400"
        title="删除"
        @click.stop="removeModelFromChannel(model.id)"
      >
        <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</div>
<div v-else class="py-8 text-center text-xs text-muted-foreground">暂无模型</div>

<!-- Inline add model (toggled by + button) -->
<div v-if="showAddModel" class="mt-3 flex items-center gap-2">
  <input
    v-model="newCapModelName"
    class="min-w-0 flex-1 rounded border border-input-border bg-input px-2.5 py-1 text-xs text-foreground outline-none focus:border-violet-500"
    placeholder="输入模型名称..."
    @keydown.enter.prevent="
      if (newCapModelName.trim() && selectedChannelId) {
        addModelToChannel(selectedChannelId, newCapModelName.trim())
        newCapModelName = ''
      }
    "
  />
  <button
    class="rounded bg-violet-600 px-2.5 py-1 text-xs text-white transition-colors hover:bg-violet-500"
    @click="
      if (newCapModelName.trim() && selectedChannelId) {
        addModelToChannel(selectedChannelId, newCapModelName.trim())
        newCapModelName = ''
      }
    "
  >
    确认
  </button>
  <button
    class="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
    @click="showAddModel = false; newCapModelName = ''"
  >
    取消
  </button>
</div>
```

- [ ] **Step 3: 验证 typecheck + lint**

Run: `cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck && pnpm run lint`
Expected: 无错误

- [ ] **Step 4: 格式化**

Run: `cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run format`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue
git commit -m "refactor(gateway): model list with colored cap tags and inline add"
```

---

### Task 5: 收尾验证

**Files:**

- 无新增修改，仅验证

- [ ] **Step 1: 运行完整 typecheck + lint + format check**

Run: `cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: 全部通过

- [ ] **Step 2: 运行测试**

Run: `cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm test`
Expected: 所有现有测试通过（此改动不涉及逻辑变更，不应有测试失败）
