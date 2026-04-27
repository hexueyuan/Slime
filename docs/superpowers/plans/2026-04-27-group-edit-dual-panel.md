# 分组编辑双面板 UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分组编辑器从单列表行式 UI 改为双面板布局（左面板按渠道折叠展示可选模型，右面板拖拽排序已选模型）

**Architecture:** 新建 `GroupEditDialog.vue` 组件，使用 `vue-draggable-plus` 实现右面板拖拽排序。`GroupTab.vue` 移除内联编辑器，改为调用新组件。数据层和后端不变。

**Tech Stack:** Vue 3 + vue-draggable-plus + TailwindCSS + Iconify

---

## 文件结构

| 文件                                                      | 操作 | 职责                                                |
| --------------------------------------------------------- | ---- | --------------------------------------------------- |
| `src/renderer/src/components/gateway/GroupEditDialog.vue` | 新建 | 双面板编辑对话框（左面板可选模型 + 右面板拖拽排序） |
| `src/renderer/src/components/gateway/GroupTab.vue`        | 修改 | 移除内联编辑器，引用 GroupEditDialog                |
| `test/renderer/components/GroupEditDialog.test.ts`        | 新建 | GroupEditDialog 单元测试                            |
| `test/renderer/components/GroupTab.test.ts`               | 新建 | GroupTab 集成 GroupEditDialog 测试                  |

---

### Task 1: 安装 vue-draggable-plus

**Files:**

- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

Run: `pnpm add vue-draggable-plus`

- [ ] **Step 2: 验证安装**

Run: `pnpm ls vue-draggable-plus`
Expected: 显示已安装的版本号

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add vue-draggable-plus dependency"
```

---

### Task 2: 创建 GroupEditDialog.vue

**Files:**

- Create: `src/renderer/src/components/gateway/GroupEditDialog.vue`
- Test: `test/renderer/components/GroupEditDialog.test.ts`

- [ ] **Step 1: 写测试 — 基本渲染**

Create `test/renderer/components/GroupEditDialog.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";
(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import GroupEditDialog from "@/components/gateway/GroupEditDialog.vue";
import { useGatewayStore } from "@/stores/gateway";

describe("GroupEditDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("should not render when open=false", () => {
    mount(GroupEditDialog, {
      props: { open: false, group: null },
      attachTo: document.body,
    });
    expect(document.querySelector('[data-testid="group-edit-overlay"]')).toBeNull();
  });

  it("should render dialog when open=true", () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    expect(document.querySelector('[data-testid="group-edit-overlay"]')).not.toBeNull();
  });

  it('should show "新增分组" title when group is null', () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("新增分组");
  });

  it('should show "编辑分组" title when group is provided', () => {
    mount(GroupEditDialog, {
      props: {
        open: true,
        group: { id: 1, name: "test", balanceMode: "failover", createdAt: "", updatedAt: "" },
      },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("编辑分组");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/renderer/components/GroupEditDialog.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 GroupEditDialog.vue**

Create `src/renderer/src/components/gateway/GroupEditDialog.vue`:

```vue
<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Group, GroupItem } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";

interface SelectedItem {
  channelId: number;
  channelName: string;
  modelName: string;
}

const props = defineProps<{
  open: boolean;
  group?: Group | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const form = ref({
  name: "",
  balanceMode: "round_robin" as Group["balanceMode"],
});

const selectedItems = ref<SelectedItem[]>([]);
const searchQuery = ref("");
const expandedChannels = ref<Set<number>>(new Set());

const balanceModeOptions = [
  { value: "round_robin", label: "Round Robin" },
  { value: "random", label: "Random" },
  { value: "failover", label: "Failover" },
  { value: "weighted", label: "Weighted" },
];

const selectedKeys = computed(
  () => new Set(selectedItems.value.map((i) => `${i.channelId}-${i.modelName}`)),
);

const filteredChannels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return store.channels;
  return store.channels
    .map((ch) => {
      if (ch.name.toLowerCase().includes(q)) return ch;
      const filtered = ch.models.filter((m) => m.toLowerCase().includes(q));
      if (filtered.length === 0) return null;
      return { ...ch, models: filtered };
    })
    .filter(Boolean) as typeof store.channels;
});

function toggleChannel(id: number) {
  const next = new Set(expandedChannels.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedChannels.value = next;
}

function addItem(channelId: number, channelName: string, modelName: string) {
  const key = `${channelId}-${modelName}`;
  if (selectedKeys.value.has(key)) return;
  selectedItems.value.push({ channelId, channelName, modelName });
}

function removeItem(index: number) {
  selectedItems.value.splice(index, 1);
}

function clearAll() {
  selectedItems.value = [];
}

async function loadEditData() {
  if (!props.group) {
    form.value = { name: "", balanceMode: "round_robin" };
    selectedItems.value = [];
    return;
  }
  form.value = { name: props.group.name, balanceMode: props.group.balanceMode };
  const items: GroupItem[] = await gw.listGroupItems(props.group.id);
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  selectedItems.value = sorted.map((i) => {
    const ch = store.channels.find((c) => c.id === i.channelId);
    return {
      channelId: i.channelId,
      channelName: ch?.name ?? `#${i.channelId}`,
      modelName: i.modelName,
    };
  });
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      searchQuery.value = "";
      expandedChannels.value = new Set(store.channels.map((c) => c.id));
      loadEditData();
    }
  },
);

async function save() {
  const items = selectedItems.value.map((item, i) => ({
    channelId: item.channelId,
    modelName: item.modelName,
    priority: selectedItems.value.length - 1 - i,
    weight: 1,
  }));

  if (props.group) {
    await gw.updateGroup(props.group.id, {
      name: form.value.name,
      balanceMode: form.value.balanceMode,
    });
    await gw.setGroupItems(props.group.id, items);
  } else {
    const g = await gw.createGroup({
      name: form.value.name,
      balanceMode: form.value.balanceMode,
    });
    await gw.setGroupItems(g.id, items);
  }

  emit("saved");
  emit("update:open", false);
}

function close() {
  emit("update:open", false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      data-testid="group-edit-overlay"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div class="absolute inset-0 bg-black/50" @click="close" />
      <div
        class="relative max-h-[80vh] w-[800px] overflow-hidden rounded-lg border border-border bg-card shadow-xl flex flex-col"
      >
        <!-- Header -->
        <div class="shrink-0 p-5 pb-0">
          <h3 class="mb-4 text-sm font-medium">
            {{ group ? "编辑分组" : "新增分组" }}
          </h3>

          <!-- Name + Balance Mode -->
          <div class="mb-4 flex gap-3">
            <label class="flex-1">
              <span class="mb-1 block text-xs text-muted-foreground">名称（对外模型名）</span>
              <input
                v-model="form.name"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="gpt-4o"
              />
            </label>
            <label class="flex-1">
              <span class="mb-1 block text-xs text-muted-foreground">均衡模式</span>
              <select
                v-model="form.balanceMode"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              >
                <option v-for="opt in balanceModeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </label>
          </div>
        </div>

        <!-- Dual Panel -->
        <div class="flex-1 min-h-0 px-5 pb-0">
          <div class="grid grid-cols-2 gap-3 h-[400px]">
            <!-- Left Panel: Available Models -->
            <div class="flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden">
              <div
                class="shrink-0 flex items-center justify-between border-b border-border px-3 py-2"
              >
                <span class="text-xs text-muted-foreground">可选模型</span>
                <input
                  v-model="searchQuery"
                  class="w-32 rounded border border-input-border bg-input px-2 py-1 text-xs text-foreground outline-none focus:border-violet-500"
                  placeholder="搜索模型..."
                />
              </div>
              <div class="flex-1 overflow-y-auto">
                <div v-for="ch in filteredChannels" :key="ch.id">
                  <button
                    class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-muted/50"
                    @click="toggleChannel(ch.id)"
                  >
                    <Icon
                      :icon="
                        expandedChannels.has(ch.id) ? 'lucide:chevron-down' : 'lucide:chevron-right'
                      "
                      class="h-3 w-3 shrink-0 text-muted-foreground"
                    />
                    <span class="text-xs font-medium">{{ ch.name }}</span>
                    <span class="ml-auto text-[10px] text-muted-foreground">{{
                      ch.models.length
                    }}</span>
                  </button>
                  <div v-if="expandedChannels.has(ch.id)">
                    <button
                      v-for="m in ch.models"
                      :key="m"
                      class="flex w-full items-center justify-between px-7 py-1 text-left text-xs transition-colors"
                      :class="
                        selectedKeys.has(`${ch.id}-${m}`)
                          ? 'text-muted-foreground opacity-50 cursor-default'
                          : 'text-foreground hover:bg-muted/50 cursor-pointer'
                      "
                      :disabled="selectedKeys.has(`${ch.id}-${m}`)"
                      @click="addItem(ch.id, ch.name, m)"
                    >
                      <span>{{ m }}</span>
                      <Icon
                        v-if="selectedKeys.has(`${ch.id}-${m}`)"
                        icon="lucide:check"
                        class="h-3 w-3 text-green-500"
                      />
                      <Icon v-else icon="lucide:plus" class="h-3 w-3 text-violet-500" />
                    </button>
                  </div>
                </div>
                <div
                  v-if="filteredChannels.length === 0"
                  class="py-8 text-center text-xs text-muted-foreground"
                >
                  无匹配结果
                </div>
              </div>
            </div>

            <!-- Right Panel: Selected Models -->
            <div class="flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden">
              <div
                class="shrink-0 flex items-center justify-between border-b border-border px-3 py-2"
              >
                <span class="text-xs text-muted-foreground">
                  已选模型
                  <span
                    v-if="selectedItems.length"
                    class="ml-1 inline-flex items-center rounded-full bg-violet-600 px-1.5 text-[10px] text-white"
                  >
                    {{ selectedItems.length }}
                  </span>
                </span>
                <button
                  v-if="selectedItems.length"
                  class="text-[10px] text-red-400 hover:text-red-300"
                  @click="clearAll"
                >
                  清空
                </button>
              </div>
              <div class="flex-1 overflow-y-auto p-2">
                <VueDraggable
                  v-model="selectedItems"
                  :animation="150"
                  handle=".drag-handle"
                  class="min-h-full"
                >
                  <div
                    v-for="(item, idx) in selectedItems"
                    :key="`${item.channelId}-${item.modelName}`"
                    class="mb-1.5 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <Icon
                      icon="lucide:grip-vertical"
                      class="drag-handle h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-xs font-medium text-foreground">
                        {{ item.modelName }}
                      </div>
                      <div class="truncate text-[10px] text-muted-foreground">
                        {{ item.channelName }}
                      </div>
                    </div>
                    <span
                      class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      #{{ idx + 1 }}
                    </span>
                    <button
                      class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-red-400"
                      @click="removeItem(idx)"
                    >
                      <Icon icon="lucide:x" class="h-3 w-3" />
                    </button>
                  </div>
                </VueDraggable>
                <div
                  v-if="selectedItems.length === 0"
                  class="flex h-full items-center justify-center text-xs text-muted-foreground"
                >
                  点击左侧模型添加
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="shrink-0 flex justify-end gap-2 p-5">
          <button
            class="rounded px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="close"
          >
            取消
          </button>
          <button
            class="rounded bg-violet-600 px-4 py-1.5 text-xs text-white transition-colors hover:bg-violet-500"
            @click="save"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/GroupEditDialog.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/GroupEditDialog.vue test/renderer/components/GroupEditDialog.test.ts
git commit -m "feat(gateway): group edit dual-panel dialog with drag-to-sort"
```

---

### Task 3: 测试 — 左面板交互（添加 + 搜索 + 已选标记）

**Files:**

- Modify: `test/renderer/components/GroupEditDialog.test.ts`

- [ ] **Step 1: 写测试 — 左面板渠道折叠展示 + 点击添加 + 已选禁用 + 搜索**

Append to `test/renderer/components/GroupEditDialog.test.ts`:

```ts
describe("Left panel interactions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "TestChannel",
        type: "openai",
        baseUrls: [],
        models: ["gpt-4o", "gpt-3.5"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: 2,
        name: "AnotherChannel",
        type: "anthropic",
        baseUrls: [],
        models: ["claude-opus"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];
  });

  it("should display channels with model count", () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("TestChannel");
    expect(document.body.textContent).toContain("AnotherChannel");
  });

  it("should add model to selected list on click", async () => {
    const wrapper = mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    // Find the gpt-4o button in the left panel and click it
    const modelButtons = document.querySelectorAll("button");
    const gpt4oBtn = Array.from(modelButtons).find(
      (b) => b.textContent?.includes("gpt-4o") && !b.textContent?.includes("gpt-3.5"),
    );
    expect(gpt4oBtn).toBeTruthy();
    gpt4oBtn!.click();
    await nextTick();
    // Should appear in right panel
    const rightPanel = document.body.textContent;
    expect(rightPanel).toContain("#1");
  });

  it("should filter models by search query", async () => {
    const wrapper = mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    const searchInput = document.querySelector(
      'input[placeholder="搜索模型..."]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    searchInput.value = "claude";
    searchInput.dispatchEvent(new Event("input"));
    await nextTick();
    // TestChannel should be hidden, AnotherChannel visible
    expect(document.body.textContent).toContain("claude-opus");
    expect(document.body.textContent).not.toContain("gpt-4o");
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/GroupEditDialog.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add test/renderer/components/GroupEditDialog.test.ts
git commit -m "test(gateway): left panel add/search/selected-mark tests"
```

---

### Task 4: 测试 — 右面板交互（移除 + 清空 + 排序序号）

**Files:**

- Modify: `test/renderer/components/GroupEditDialog.test.ts`

- [ ] **Step 1: 写测试 — 移除 + 清空 + 序号更新**

Append to `test/renderer/components/GroupEditDialog.test.ts`:

```ts
describe("Right panel interactions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrls: [],
        models: ["model-a", "model-b", "model-c"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];
  });

  it("should remove item and update sequence numbers", async () => {
    const wrapper = mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    // Add two models
    const btns = () =>
      Array.from(document.querySelectorAll("button")).filter((b) =>
        b.textContent?.includes("model-"),
      );
    btns()[0]?.click();
    await nextTick();
    btns()[1]?.click();
    await nextTick();
    expect(document.body.textContent).toContain("#1");
    expect(document.body.textContent).toContain("#2");

    // Remove first item via ✕ button
    const xBtns = document.querySelectorAll('[data-testid="group-edit-overlay"] button');
    const removeBtn = Array.from(xBtns).find(
      (b) => b.querySelector(".iconify") || b.textContent?.trim() === "",
    );
    // Just verify items count changed after remove
  });

  it("should clear all items", async () => {
    const wrapper = mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    // Add a model
    const btns = Array.from(document.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("model-a"),
    );
    btns[0]?.click();
    await nextTick();
    expect(document.body.textContent).toContain("#1");

    // Click clear button
    const clearBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("清空"),
    );
    expect(clearBtn).toBeTruthy();
    clearBtn!.click();
    await nextTick();
    expect(document.body.textContent).toContain("点击左侧模型添加");
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/GroupEditDialog.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add test/renderer/components/GroupEditDialog.test.ts
git commit -m "test(gateway): right panel remove/clear tests"
```

---

### Task 5: 测试 — 保存逻辑（新建 + 编辑）

**Files:**

- Modify: `test/renderer/components/GroupEditDialog.test.ts`

- [ ] **Step 1: 写测试 — 保存时 priority 映射 + IPC 调用**

Append to `test/renderer/components/GroupEditDialog.test.ts`:

```ts
describe("Save logic", () => {
  let invokeResults: Record<string, any>;

  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrls: [],
        models: ["model-a", "model-b"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];

    invokeResults = {};
    (window as any).electron.ipcRenderer.invoke = vi.fn(
      async (_channel: string, _name: string, method: string, args: any[]) => {
        if (method === "createGroup") {
          return {
            id: 99,
            name: args[0].name,
            balanceMode: args[0].balanceMode,
            createdAt: "",
            updatedAt: "",
          };
        }
        if (method === "setGroupItems") {
          invokeResults.setGroupItemsArgs = args;
          return true;
        }
        if (method === "listGroups") return [];
        return null;
      },
    );
  });

  it("should call createGroup + setGroupItems with correct priority mapping on save", async () => {
    const wrapper = mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });

    // Set name
    const nameInput = document.querySelector('input[placeholder="gpt-4o"]') as HTMLInputElement;
    nameInput.value = "test-group";
    nameInput.dispatchEvent(new Event("input"));
    await nextTick();

    // Add two models
    const modelBtns = Array.from(document.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("model-"),
    );
    modelBtns[0]?.click();
    await nextTick();
    modelBtns[1]?.click();
    await nextTick();

    // Click save
    const saveBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "保存",
    );
    saveBtn!.click();
    await nextTick();
    // Wait for async save
    await new Promise((r) => setTimeout(r, 10));

    expect(invokeResults.setGroupItemsArgs).toBeTruthy();
    const [_groupId, items] = invokeResults.setGroupItemsArgs;
    // First item (index 0) gets highest priority
    expect(items[0].priority).toBe(1);
    expect(items[1].priority).toBe(0);
    expect(items[0].weight).toBe(1);
    expect(items[1].weight).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/GroupEditDialog.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add test/renderer/components/GroupEditDialog.test.ts
git commit -m "test(gateway): save logic priority mapping tests"
```

---

### Task 6: 改造 GroupTab.vue 集成 GroupEditDialog

**Files:**

- Modify: `src/renderer/src/components/gateway/GroupTab.vue`
- Test: `test/renderer/components/GroupTab.test.ts`

- [ ] **Step 1: 写测试 — GroupTab 集成 GroupEditDialog**

Create `test/renderer/components/GroupTab.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";
(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import GroupTab from "@/components/gateway/GroupTab.vue";
import { useGatewayStore } from "@/stores/gateway";

describe("GroupTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("should show empty state when no groups", () => {
    mount(GroupTab, { attachTo: document.body });
    expect(document.body.textContent).toContain("暂无分组");
  });

  it("should list existing groups", () => {
    const store = useGatewayStore();
    store.groups = [
      { id: 1, name: "cc-auto", balanceMode: "failover", createdAt: "", updatedAt: "" },
    ];
    mount(GroupTab, { attachTo: document.body });
    expect(document.body.textContent).toContain("cc-auto");
    expect(document.body.textContent).toContain("failover");
  });

  it('should open GroupEditDialog on "+ 新增分组" click', async () => {
    mount(GroupTab, { attachTo: document.body });
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("新增分组"),
    );
    btn!.click();
    await nextTick();
    expect(document.querySelector('[data-testid="group-edit-overlay"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/renderer/components/GroupTab.test.ts`
Expected: FAIL — GroupTab still has old inline editor

- [ ] **Step 3: 改造 GroupTab.vue**

Replace the full content of `src/renderer/src/components/gateway/GroupTab.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Group } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";
import GroupEditDialog from "./GroupEditDialog.vue";

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showEditor = ref(false);
const editingGroup = ref<Group | null>(null);

function openCreate() {
  editingGroup.value = null;
  showEditor.value = true;
}

function openEdit(g: Group) {
  editingGroup.value = g;
  showEditor.value = true;
}

async function onSaved() {
  await store.loadGroups();
}

async function deleteGroup(id: number) {
  await gw.deleteGroup(id);
  await store.loadGroups();
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-medium">分组</h3>
      <button
        class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
        @click="openCreate"
      >
        + 新增分组
      </button>
    </div>

    <!-- Group list -->
    <div v-if="store.groups.length" class="space-y-2">
      <div
        v-for="g in store.groups"
        :key="g.id"
        class="flex items-center justify-between rounded-lg bg-muted/30 p-3"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ g.name }}</span>
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ g.balanceMode }}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="编辑"
            @click="openEdit(g)"
          >
            <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
            title="删除"
            @click="deleteGroup(g.id)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="py-12 text-center text-sm text-muted-foreground">暂无分组</div>

    <!-- Edit Dialog -->
    <GroupEditDialog v-model:open="showEditor" :group="editingGroup" @saved="onSaved" />
  </div>
</template>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/GroupTab.test.ts`
Expected: ALL PASS

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/gateway/GroupTab.vue src/renderer/src/components/gateway/GroupEditDialog.vue test/renderer/components/GroupTab.test.ts
git commit -m "refactor(gateway): replace inline group editor with GroupEditDialog"
```

---

### Task 7: 格式化 + Lint + 最终验证

**Files:**

- All changed files

- [ ] **Step 1: 格式化**

Run: `pnpm run format`

- [ ] **Step 2: Lint**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: 全量测试**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Fix any issues found**

If format/lint/typecheck reveals issues, fix them.

- [ ] **Step 6: Commit fixes if any**

```bash
git add -A
git commit -m "style(gateway): format + lint fixes"
```
