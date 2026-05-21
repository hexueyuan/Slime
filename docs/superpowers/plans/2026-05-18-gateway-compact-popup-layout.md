# Gateway Compact Popup Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Gateway into a compact adaptive dashboard with lightweight tab pages and popup-based model, group, and API key management.

**Architecture:** Keep Presenter, Pinia store, and database contracts unchanged. Add focused Gateway card and dialog components, then refactor the tab containers to compose those components and move heavy management lists into dialogs. Finally compact the top dashboard and make LogTab use a single responsive scroll area.

**Tech Stack:** Vue 3 Composition API, TypeScript, Pinia, Tailwind CSS v4 semantic tokens, Iconify lucide icons, Vitest + Vue Test Utils.

---

## File Structure

### Create

- `src/renderer/src/components/gateway/GatewayChannelCard.vue`  
  Store-free channel summary card. Emits `test`, `edit`, `delete`, and `manage-models`.
- `src/renderer/src/components/gateway/GatewayModelCard.vue`  
  Store-free model management card. Emits `toggle-capability`, `toggle-enabled`, and `delete`.
- `src/renderer/src/components/gateway/GatewayGroupCard.vue`  
  Store-free group summary card. Emits `edit` and `delete`.
- `src/renderer/src/components/gateway/GatewayApiKeyCard.vue`  
  Store-free API key card. Emits `copy`, `toggle-enabled`, and `delete`.
- `src/renderer/src/components/gateway/GatewayManagerDialog.vue`  
  Small reusable dialog shell for Gateway management popups. Emits `close`.
- `src/renderer/src/components/gateway/ModelManagerDialog.vue`  
  Container dialog for one channel's model management. Owns refresh, add, capability toggle, enable toggle, and delete actions.
- `src/renderer/src/components/gateway/GroupManagerDialog.vue`  
  Container dialog for group cards and existing `GroupEditDialog`.
- `src/renderer/src/components/gateway/ApiKeyManagerDialog.vue`  
  Container dialog for API key cards, creation, one-time revealed key display, copy, enable toggle, and delete.
- `test/renderer/components/GatewayChannelCard.test.ts`
- `test/renderer/components/GatewayModelCard.test.ts`
- `test/renderer/components/GatewayGroupCard.test.ts`
- `test/renderer/components/GatewayApiKeyCard.test.ts`
- `test/renderer/components/GatewayManagerDialog.test.ts`
- `test/renderer/components/ModelManagerDialog.test.ts`
- `test/renderer/components/GroupManagerDialog.test.ts`
- `test/renderer/components/ApiKeyManagerDialog.test.ts`

### Modify

- `src/renderer/src/views/GatewayPanel.vue`  
  Compact the top overview, make chart/ranking layout adaptive, and give the tab workspace the remaining height.
- `src/renderer/src/components/slime/SlimeMetricCard.vue`  
  Make metric card density compact enough for the Gateway top row without hard-coding page height.
- `src/renderer/src/components/slime/SlimeRealtimeChart.vue`  
  Add optional compact height support through a prop/CSS variable while preserving the current metric switching behavior.
- `src/renderer/src/components/slime/SlimeRankBoard.vue`  
  Add optional `limit` and `compact` props while keeping existing sorting behavior.
- `src/renderer/src/components/gateway/ChannelTab.vue`  
  Replace master-detail model list with channel card grid and model manager dialog.
- `src/renderer/src/components/gateway/GroupTab.vue`  
  Replace full list page with summary panel and group manager dialog.
- `src/renderer/src/components/gateway/ApiKeyTab.vue`  
  Replace full list page with summary panel and API key manager dialog.
- `src/renderer/src/components/gateway/LogTab.vue`  
  Replace fixed-width row layout with responsive grid and one main scroll area.
- `test/renderer/components/ChannelTab.performance.test.ts`  
  Keep first-paint model loading contract valid under the dialog flow.
- `test/renderer/components/GroupTab.test.ts`  
  Update expectations for summary + management dialog behavior.
- `test/renderer/components/LogTab.performance.test.ts`  
  Keep pagination and refresh behavior valid after layout changes.
- `test/renderer/components/SlimeRealtimeChart.test.ts`
- `test/renderer/components/SlimeRankBoard.test.ts`

## Task 1: GatewayChannelCard

**Files:**

- Create: `src/renderer/src/components/gateway/GatewayChannelCard.vue`
- Test: `test/renderer/components/GatewayChannelCard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/GatewayChannelCard.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayChannelCard from "@/components/gateway/GatewayChannelCard.vue";
import type { Channel } from "@shared/types/gateway";

const channel: Channel = {
  id: 1,
  name: "百度OneApi",
  type: "anthropic",
  baseUrl: "https://example.com",
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

describe("GatewayChannelCard", () => {
  it("renders channel summary and emits management actions", async () => {
    const wrapper = mount(GatewayChannelCard, {
      props: {
        channel,
        modelCount: 13,
        stabilitySummary: "100.0%",
        testResult: { loading: false, success: true },
      },
    });

    expect(wrapper.text()).toContain("百度OneApi");
    expect(wrapper.text()).toContain("anthropic");
    expect(wrapper.text()).toContain("13");
    expect(wrapper.text()).toContain("100.0%");
    expect(wrapper.text()).toContain("连接成功");

    await wrapper.get('[data-testid="channel-test"]').trigger("click");
    await wrapper.get('[data-testid="channel-edit"]').trigger("click");
    await wrapper.get('[data-testid="channel-delete"]').trigger("click");
    await wrapper.get('[data-testid="channel-manage-models"]').trigger("click");

    expect(wrapper.emitted("test")).toEqual([[channel]]);
    expect(wrapper.emitted("edit")).toEqual([[channel]]);
    expect(wrapper.emitted("delete")).toEqual([[channel]]);
    expect(wrapper.emitted("manage-models")).toEqual([[channel]]);
  });

  it("keeps disabled channels low emphasis but actions still explicit", () => {
    const wrapper = mount(GatewayChannelCard, {
      props: {
        channel: { ...channel, enabled: false },
        modelCount: 0,
        stabilitySummary: "-",
      },
    });

    expect(wrapper.get('[data-testid="channel-status"]').text()).toContain("停用");
    expect(wrapper.get('[data-testid="channel-card"]').classes()).toContain("opacity-70");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayChannelCard.test.ts
```

Expected: fails because `GatewayChannelCard.vue` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/renderer/src/components/gateway/GatewayChannelCard.vue`:

```vue
<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { Channel } from "@shared/types/gateway";

type TestResult = {
  loading: boolean;
  success?: boolean;
  error?: string;
};

const props = defineProps<{
  channel: Channel;
  modelCount: number;
  stabilitySummary?: string;
  testResult?: TestResult;
}>();

const emit = defineEmits<{
  test: [channel: Channel];
  edit: [channel: Channel];
  delete: [channel: Channel];
  "manage-models": [channel: Channel];
}>();
</script>

<template>
  <article
    data-testid="channel-card"
    :class="[
      'flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3',
      !channel.enabled && 'opacity-70',
    ]"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {{ channel.name }}
          </span>
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="
              channel.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-disabled)]'
            "
          />
        </div>
        <div class="mt-1 flex min-w-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span class="truncate">{{ channel.type }}</span>
          <span data-testid="channel-status">{{ channel.enabled ? "启用" : "停用" }}</span>
        </div>
      </div>
      <button
        data-testid="channel-manage-models"
        type="button"
        class="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-brand-hover)]"
        @click="emit('manage-models', channel)"
      >
        模型管理
      </button>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <div class="min-w-0 rounded-[var(--radius-sm)] bg-[var(--color-control-hover)] px-2 py-1.5">
        <div class="truncate text-[10px] text-[var(--color-text-muted)]">模型</div>
        <div class="truncate text-xs font-semibold text-[var(--color-text-primary)]">
          {{ modelCount }}
        </div>
      </div>
      <div class="min-w-0 rounded-[var(--radius-sm)] bg-[var(--color-control-hover)] px-2 py-1.5">
        <div class="truncate text-[10px] text-[var(--color-text-muted)]">稳定性</div>
        <div class="truncate text-xs font-semibold text-[var(--color-text-primary)]">
          {{ stabilitySummary ?? "-" }}
        </div>
      </div>
      <div class="min-w-0 rounded-[var(--radius-sm)] bg-[var(--color-control-hover)] px-2 py-1.5">
        <div class="truncate text-[10px] text-[var(--color-text-muted)]">测试</div>
        <div class="truncate text-xs font-semibold text-[var(--color-text-primary)]">
          <template v-if="testResult?.loading">测试中...</template>
          <template v-else-if="testResult?.success">连接成功</template>
          <template v-else-if="testResult?.success === false">连接失败</template>
          <template v-else>-</template>
        </div>
      </div>
    </div>

    <p
      v-if="testResult?.error"
      class="line-clamp-2 text-xs text-[var(--color-danger)]"
      :title="testResult.error"
    >
      {{ testResult.error }}
    </p>

    <div class="flex items-center justify-end gap-1">
      <button
        data-testid="channel-test"
        type="button"
        title="测试"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        @click="emit('test', channel)"
      >
        <Icon icon="lucide:activity" class="h-3.5 w-3.5" />
      </button>
      <button
        data-testid="channel-edit"
        type="button"
        title="编辑"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        @click="emit('edit', channel)"
      >
        <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
      </button>
      <button
        data-testid="channel-delete"
        type="button"
        title="删除"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]"
        @click="emit('delete', channel)"
      >
        <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </article>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayChannelCard.test.ts
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/GatewayChannelCard.vue test/renderer/components/GatewayChannelCard.test.ts
git commit -m "feat(gateway): add channel summary card"
```

## Task 2: GatewayModelCard

**Files:**

- Create: `src/renderer/src/components/gateway/GatewayModelCard.vue`
- Test: `test/renderer/components/GatewayModelCard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/GatewayModelCard.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayModelCard from "@/components/gateway/GatewayModelCard.vue";
import type { Model } from "@shared/types/gateway";

const model: Model = {
  id: 10,
  channelId: 1,
  modelName: "Claude Sonnet 4.6",
  type: "chat",
  capabilities: ["reasoning", "tool_call"],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

describe("GatewayModelCard", () => {
  it("renders model capabilities and emits management actions", async () => {
    const wrapper = mount(GatewayModelCard, { props: { model } });

    expect(wrapper.text()).toContain("Claude Sonnet 4.6");
    expect(wrapper.text()).toContain("reasoning");
    expect(wrapper.text()).toContain("tool_call");

    await wrapper.get('[data-testid="model-cap-vision"]').trigger("click");
    await wrapper.get('[data-testid="model-toggle-enabled"]').trigger("click");
    await wrapper.get('[data-testid="model-delete"]').trigger("click");

    expect(wrapper.emitted("toggle-capability")).toEqual([[model, "vision"]]);
    expect(wrapper.emitted("toggle-enabled")).toEqual([[model]]);
    expect(wrapper.emitted("delete")).toEqual([[model]]);
  });

  it("does not emit delete when disabled", async () => {
    const wrapper = mount(GatewayModelCard, {
      props: { model, disabled: true },
    });

    await wrapper.get('[data-testid="model-delete"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayModelCard.test.ts
```

Expected: fails because `GatewayModelCard.vue` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/renderer/src/components/gateway/GatewayModelCard.vue`:

```vue
<script setup lang="ts">
import { Icon } from "@iconify/vue";
import ModelIcon from "@/components/ModelIcon.vue";
import type { Capability, Model } from "@shared/types/gateway";

const ALL_CAPS: { key: Capability; label: string }[] = [
  { key: "reasoning", label: "reasoning" },
  { key: "vision", label: "vision" },
  { key: "image_gen", label: "image_gen" },
  { key: "tool_call", label: "tool_call" },
];

const props = withDefaults(
  defineProps<{
    model: Model;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  "toggle-capability": [model: Model, capability: Capability];
  "toggle-enabled": [model: Model];
  delete: [model: Model];
}>();

function emitDelete() {
  if (props.disabled) return;
  emit("delete", props.model);
}
</script>

<template>
  <article
    class="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <ModelIcon :model-name="model.modelName" :size="18" class="shrink-0" />
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {{ model.modelName }}
          </div>
          <div class="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span>{{ model.type }}</span>
            <span>{{ model.enabled ? "启用" : "停用" }}</span>
          </div>
        </div>
      </div>
      <button
        data-testid="model-toggle-enabled"
        type="button"
        :disabled="disabled"
        class="shrink-0 rounded-full transition-colors disabled:opacity-50"
        :title="model.enabled ? '禁用' : '启用'"
        @click="emit('toggle-enabled', model)"
      >
        <span
          :class="[
            'flex h-5 w-9 items-center rounded-full px-0.5 transition-colors',
            model.enabled ? 'bg-[var(--color-accent-brand)]' : 'bg-[var(--color-control-hover)]',
          ]"
        >
          <span
            :class="[
              'h-4 w-4 rounded-full bg-white transition-transform',
              model.enabled ? 'translate-x-4' : 'translate-x-0',
            ]"
          />
        </span>
      </button>
    </div>

    <div class="mt-3 flex flex-wrap gap-1.5">
      <button
        v-for="cap in ALL_CAPS"
        :key="cap.key"
        :data-testid="`model-cap-${cap.key}`"
        type="button"
        :disabled="disabled"
        :class="[
          'rounded-full border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
          model.capabilities.includes(cap.key)
            ? 'border-[color-mix(in_srgb,var(--color-accent-brand)_42%,transparent)] bg-[var(--color-accent-brand-soft)] text-[var(--color-text-primary)]'
            : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
        ]"
        @click="emit('toggle-capability', model, cap.key)"
      >
        {{ cap.label }}
      </button>
    </div>

    <div class="mt-3 flex justify-end">
      <button
        data-testid="model-delete"
        type="button"
        title="删除"
        :disabled="disabled"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] disabled:text-[var(--color-text-disabled)]"
        @click="emitDelete"
      >
        <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </article>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayModelCard.test.ts
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/GatewayModelCard.vue test/renderer/components/GatewayModelCard.test.ts
git commit -m "feat(gateway): add model management card"
```

## Task 3: GatewayGroupCard and GatewayApiKeyCard

**Files:**

- Create: `src/renderer/src/components/gateway/GatewayGroupCard.vue`
- Create: `src/renderer/src/components/gateway/GatewayApiKeyCard.vue`
- Test: `test/renderer/components/GatewayGroupCard.test.ts`
- Test: `test/renderer/components/GatewayApiKeyCard.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/renderer/components/GatewayGroupCard.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayGroupCard from "@/components/gateway/GatewayGroupCard.vue";
import type { Group } from "@shared/types/gateway";

const group: Group = {
  id: 1,
  name: "claude",
  balanceMode: "failover",
  isBuiltin: false,
  createdAt: "",
  updatedAt: "",
};

describe("GatewayGroupCard", () => {
  it("renders group summary and emits edit/delete", async () => {
    const wrapper = mount(GatewayGroupCard, {
      props: {
        group,
        itemCount: 3,
        channelSummary: "百度OneApi / OfoxAI",
      },
    });

    expect(wrapper.text()).toContain("claude");
    expect(wrapper.text()).toContain("failover");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.text()).toContain("百度OneApi / OfoxAI");

    await wrapper.get('[data-testid="group-edit"]').trigger("click");
    await wrapper.get('[data-testid="group-delete"]').trigger("click");

    expect(wrapper.emitted("edit")).toEqual([[group]]);
    expect(wrapper.emitted("delete")).toEqual([[group]]);
  });

  it("does not emit delete for builtin groups", async () => {
    const builtin = { ...group, isBuiltin: true };
    const wrapper = mount(GatewayGroupCard, {
      props: { group: builtin, itemCount: 1, channelSummary: "内置" },
    });

    expect(wrapper.find('[data-testid="group-delete"]').exists()).toBe(false);
  });
});
```

Create `test/renderer/components/GatewayApiKeyCard.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayApiKeyCard from "@/components/gateway/GatewayApiKeyCard.vue";
import type { GatewayApiKey } from "@shared/types/gateway";

const apiKey: GatewayApiKey = {
  id: 1,
  name: "web-client",
  key: "sk-1234567890abcdef",
  enabled: true,
  isInternal: false,
  createdAt: "",
};

describe("GatewayApiKeyCard", () => {
  it("renders masked key and emits actions", async () => {
    const wrapper = mount(GatewayApiKeyCard, { props: { apiKey } });

    expect(wrapper.text()).toContain("web-client");
    expect(wrapper.text()).toContain("sk-1...cdef");

    await wrapper.get('[data-testid="key-copy"]').trigger("click");
    await wrapper.get('[data-testid="key-toggle-enabled"]').trigger("click");
    await wrapper.get('[data-testid="key-delete"]').trigger("click");

    expect(wrapper.emitted("copy")).toEqual([[apiKey]]);
    expect(wrapper.emitted("toggle-enabled")).toEqual([[apiKey]]);
    expect(wrapper.emitted("delete")).toEqual([[apiKey]]);
  });

  it("shows revealed key when provided and hides delete for internal keys", () => {
    const wrapper = mount(GatewayApiKeyCard, {
      props: {
        apiKey: { ...apiKey, isInternal: true },
        revealedKey: "sk-new-secret",
      },
    });

    expect(wrapper.text()).toContain("sk-new-secret");
    expect(wrapper.find('[data-testid="key-delete"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayGroupCard.test.ts test/renderer/components/GatewayApiKeyCard.test.ts
```

Expected: fails because both components do not exist.

- [ ] **Step 3: Implement GatewayGroupCard**

Create `src/renderer/src/components/gateway/GatewayGroupCard.vue`:

```vue
<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { Group } from "@shared/types/gateway";

defineProps<{
  group: Group;
  itemCount: number;
  channelSummary: string;
}>();

const emit = defineEmits<{
  edit: [group: Group];
  delete: [group: Group];
}>();
</script>

<template>
  <article
    class="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {{ group.name }}
          </span>
          <span
            v-if="group.isBuiltin"
            class="shrink-0 rounded-full bg-[var(--color-accent-brand-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-primary)]"
          >
            内置
          </span>
        </div>
        <div class="mt-1 truncate text-xs text-[var(--color-text-muted)]">
          {{ group.balanceMode }}
        </div>
      </div>
      <div class="shrink-0 text-right">
        <div class="text-xs text-[var(--color-text-muted)]">成员</div>
        <div class="text-sm font-semibold text-[var(--color-text-primary)]">{{ itemCount }}</div>
      </div>
    </div>

    <p class="mt-3 line-clamp-2 text-xs text-[var(--color-text-muted)]" :title="channelSummary">
      {{ channelSummary || "暂无渠道" }}
    </p>

    <div class="mt-3 flex justify-end gap-1">
      <button
        data-testid="group-edit"
        type="button"
        title="编辑"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        @click="emit('edit', group)"
      >
        <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
      </button>
      <button
        v-if="!group.isBuiltin"
        data-testid="group-delete"
        type="button"
        title="删除"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]"
        @click="emit('delete', group)"
      >
        <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </article>
</template>
```

- [ ] **Step 4: Implement GatewayApiKeyCard**

Create `src/renderer/src/components/gateway/GatewayApiKeyCard.vue`:

```vue
<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { GatewayApiKey } from "@shared/types/gateway";

const props = defineProps<{
  apiKey: GatewayApiKey;
  revealedKey?: string | null;
  copied?: boolean;
}>();

const emit = defineEmits<{
  copy: [apiKey: GatewayApiKey];
  "toggle-enabled": [apiKey: GatewayApiKey];
  delete: [apiKey: GatewayApiKey];
}>();

function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : key;
}
</script>

<template>
  <article
    class="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {{ apiKey.name }}
          </span>
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="
              apiKey.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-disabled)]'
            "
          />
          <span
            v-if="apiKey.isInternal"
            class="shrink-0 rounded-full bg-[var(--color-accent-brand-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-primary)]"
          >
            内置
          </span>
        </div>
        <code class="mt-2 block truncate text-xs text-[var(--color-text-muted)]">
          {{ revealedKey || maskKey(apiKey.key) }}
        </code>
      </div>
      <span class="shrink-0 text-xs text-[var(--color-text-muted)]">
        {{ apiKey.enabled ? "启用" : "停用" }}
      </span>
    </div>

    <div class="mt-3 flex justify-end gap-1">
      <button
        data-testid="key-copy"
        type="button"
        :title="copied ? '已复制' : '复制 Key'"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        @click="emit('copy', apiKey)"
      >
        <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
      </button>
      <button
        data-testid="key-toggle-enabled"
        type="button"
        :title="apiKey.enabled ? '禁用' : '启用'"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        @click="emit('toggle-enabled', apiKey)"
      >
        <Icon
          :icon="apiKey.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'"
          class="h-3.5 w-3.5"
        />
      </button>
      <button
        v-if="!apiKey.isInternal"
        data-testid="key-delete"
        type="button"
        title="删除"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]"
        @click="emit('delete', apiKey)"
      >
        <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </article>
</template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayGroupCard.test.ts test/renderer/components/GatewayApiKeyCard.test.ts
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/gateway/GatewayGroupCard.vue src/renderer/src/components/gateway/GatewayApiKeyCard.vue test/renderer/components/GatewayGroupCard.test.ts test/renderer/components/GatewayApiKeyCard.test.ts
git commit -m "feat(gateway): add group and api key cards"
```

## Task 4: GatewayManagerDialog Shell

**Files:**

- Create: `src/renderer/src/components/gateway/GatewayManagerDialog.vue`
- Test: `test/renderer/components/GatewayManagerDialog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/GatewayManagerDialog.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayManagerDialog from "@/components/gateway/GatewayManagerDialog.vue";

describe("GatewayManagerDialog", () => {
  it("renders when open and emits close from overlay and close button", async () => {
    const wrapper = mount(GatewayManagerDialog, {
      props: { open: true, title: "模型管理" },
      slots: {
        default: "<div data-testid='dialog-body'>body</div>",
        actions: "<button data-testid='dialog-action'>action</button>",
      },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("模型管理");
    expect(wrapper.get('[data-testid="dialog-body"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="dialog-action"]').exists()).toBe(true);

    await wrapper.get('[data-testid="manager-close"]').trigger("click");
    await wrapper.get('[data-testid="manager-overlay"]').trigger("click");

    expect(wrapper.emitted("close")).toEqual([[], []]);
  });

  it("does not render content when closed", () => {
    const wrapper = mount(GatewayManagerDialog, {
      props: { open: false, title: "密钥管理" },
      slots: { default: "hidden" },
    });

    expect(wrapper.text()).not.toContain("hidden");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayManagerDialog.test.ts
```

Expected: fails because `GatewayManagerDialog.vue` does not exist.

- [ ] **Step 3: Implement the dialog shell**

Create `src/renderer/src/components/gateway/GatewayManagerDialog.vue`:

```vue
<script setup lang="ts">
import { Icon } from "@iconify/vue";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    subtitle?: string;
    widthClass?: string;
  }>(),
  {
    subtitle: "",
    widthClass: "w-[min(960px,calc(100vw-48px))]",
  },
);

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        data-testid="manager-overlay"
        class="absolute inset-0 bg-black/55"
        @click="emit('close')"
      />
      <section
        :class="[
          'relative flex max-h-[min(760px,82vh)] min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-app-elevated)] shadow-[var(--shadow-floating)]',
          widthClass,
        ]"
      >
        <header
          class="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-4 py-3"
        >
          <div class="min-w-0">
            <h3 class="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {{ title }}
            </h3>
            <p v-if="subtitle" class="mt-1 truncate text-xs text-[var(--color-text-muted)]">
              {{ subtitle }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <slot name="actions" />
            <button
              data-testid="manager-close"
              type="button"
              title="关闭"
              class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
              @click="emit('close')"
            >
              <Icon icon="lucide:x" class="h-4 w-4" />
            </button>
          </div>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayManagerDialog.test.ts
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/GatewayManagerDialog.vue test/renderer/components/GatewayManagerDialog.test.ts
git commit -m "feat(gateway): add management dialog shell"
```

## Task 5: ModelManagerDialog

**Files:**

- Create: `src/renderer/src/components/gateway/ModelManagerDialog.vue`
- Modify: `test/renderer/components/ModelManagerDialog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/ModelManagerDialog.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import ModelManagerDialog from "@/components/gateway/ModelManagerDialog.vue";
import { useGatewayStore } from "@/stores/gateway";
import type { Channel, Model } from "@shared/types/gateway";

const invoke = vi.fn(async () => null);

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@/components/ModelIcon.vue", () => ({
  __esModule: true,
  default: { template: "<span />", props: ["modelName", "size"] },
}));

const channel: Channel = {
  id: 1,
  name: "百度OneApi",
  type: "anthropic",
  baseUrl: "",
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

const model: Model = {
  id: 10,
  channelId: 1,
  modelName: "Claude Sonnet 4.6",
  type: "chat",
  capabilities: ["tool_call"],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

describe("ModelManagerDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invoke.mockClear();
    document.body.innerHTML = "";
  });

  it("renders models for a channel and routes card events to presenter calls", async () => {
    const store = useGatewayStore();
    store.models.set(channel.id, [model]);

    const wrapper = mount(ModelManagerDialog, {
      props: { open: true, channel },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("模型管理");
    expect(document.body.textContent).toContain("Claude Sonnet 4.6");

    await wrapper.get('[data-testid="model-cap-vision"]').trigger("click");
    await wrapper.get('[data-testid="model-toggle-enabled"]').trigger("click");

    const updateCalls = invoke.mock.calls.filter(
      (call) => call[0] === "presenter:call" && call[2] === "updateModel",
    );
    expect(updateCalls).toHaveLength(2);
  });

  it("emits close from the dialog shell", async () => {
    const wrapper = mount(ModelManagerDialog, {
      props: { open: true, channel },
      attachTo: document.body,
    });

    await wrapper.get('[data-testid="manager-close"]').trigger("click");

    expect(wrapper.emitted("close")).toEqual([[]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run test/renderer/components/ModelManagerDialog.test.ts
```

Expected: fails because `ModelManagerDialog.vue` does not exist.

- [ ] **Step 3: Implement the dialog container**

Create `src/renderer/src/components/gateway/ModelManagerDialog.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GatewayManagerDialog from "@/components/gateway/GatewayManagerDialog.vue";
import GatewayModelCard from "@/components/gateway/GatewayModelCard.vue";
import type { Capability, Channel, Model } from "@shared/types/gateway";

const props = defineProps<{
  open: boolean;
  channel: Channel | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();
const showAddModel = ref(false);
const newModelName = ref("");
const addModelError = ref("");
const refreshModelsError = ref("");
const refreshingModels = ref(false);

const channelModels = computed(() => {
  if (!props.channel) return [];
  return [...(store.models.get(props.channel.id) ?? [])].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled),
  );
});

watch(
  () => [props.open, props.channel?.id] as const,
  async ([open, channelId]) => {
    if (open && channelId) await store.loadModelsByChannel(channelId);
  },
  { immediate: true },
);

async function refreshModels() {
  if (!props.channel) return;
  refreshingModels.value = true;
  refreshModelsError.value = "";
  try {
    const fetched: string[] = await gw.fetchModels(props.channel.id);
    const existing = store.models.get(props.channel.id) ?? [];
    const existingNames = new Set(existing.map((model) => model.modelName));
    for (const name of fetched) {
      if (!existingNames.has(name)) {
        await gw.createModel({
          channelId: props.channel.id,
          modelName: name,
          type: "chat",
          capabilities: [],
          enabled: true,
        });
      }
    }
    await store.loadModelsByChannel(props.channel.id);
  } catch (error: any) {
    refreshModelsError.value = error?.message ?? String(error);
  } finally {
    refreshingModels.value = false;
  }
}

async function addModel() {
  if (!props.channel || !newModelName.value.trim()) return;
  addModelError.value = "";
  try {
    await gw.createModel({
      channelId: props.channel.id,
      modelName: newModelName.value.trim(),
      type: "chat",
      capabilities: [],
      enabled: true,
    });
    newModelName.value = "";
    showAddModel.value = false;
    await store.loadModelsByChannel(props.channel.id);
  } catch (error: any) {
    addModelError.value = error?.message ?? String(error);
  }
}

async function toggleModelCap(model: Model, cap: Capability) {
  const capabilities = model.capabilities.includes(cap)
    ? model.capabilities.filter((item) => item !== cap)
    : [...model.capabilities, cap];
  await gw.updateModel(model.id, { capabilities });
  if (props.channel) await store.loadModelsByChannel(props.channel.id);
}

async function toggleModelEnabled(model: Model) {
  await gw.updateModel(model.id, { enabled: !model.enabled });
  if (props.channel) await store.loadModelsByChannel(props.channel.id);
}

async function deleteModel(model: Model) {
  await gw.deleteModel(model.id);
  if (props.channel) await store.loadModelsByChannel(props.channel.id);
}
</script>

<template>
  <GatewayManagerDialog
    :open="open"
    title="模型管理"
    :subtitle="channel ? `${channel.name} · ${channel.type}` : ''"
    @close="emit('close')"
  >
    <template #actions>
      <button
        type="button"
        title="从供应商拉取模型列表"
        :disabled="!channel || refreshingModels"
        class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
        @click="refreshModels"
      >
        <Icon
          icon="lucide:refresh-cw"
          class="h-3.5 w-3.5"
          :class="refreshingModels && 'animate-spin'"
        />
      </button>
      <button
        type="button"
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-brand-hover)]"
        @click="showAddModel = !showAddModel"
      >
        + 添加模型
      </button>
    </template>

    <div
      v-if="showAddModel"
      class="mb-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
    >
      <div class="flex min-w-0 items-center gap-2">
        <input
          v-model="newModelName"
          class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-input)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-brand)]"
          placeholder="输入模型名称..."
          @keydown.enter.prevent="addModel"
        />
        <button
          type="button"
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-3 py-1.5 text-xs font-medium text-white"
          @click="addModel"
        >
          确认
        </button>
        <button
          type="button"
          class="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)]"
          @click="showAddModel = false"
        >
          取消
        </button>
      </div>
      <p v-if="addModelError" class="mt-2 text-xs text-[var(--color-danger)]">
        {{ addModelError }}
      </p>
    </div>

    <p v-if="refreshModelsError" class="mb-3 text-xs text-[var(--color-danger)]">
      {{ refreshModelsError }}
    </p>

    <div v-if="channelModels.length" class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      <GatewayModelCard
        v-for="model in channelModels"
        :key="model.id"
        :model="model"
        @toggle-capability="toggleModelCap"
        @toggle-enabled="toggleModelEnabled"
        @delete="deleteModel"
      />
    </div>
    <div v-else class="py-10 text-center text-sm text-[var(--color-text-muted)]">暂无模型</div>
  </GatewayManagerDialog>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run test/renderer/components/ModelManagerDialog.test.ts
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/ModelManagerDialog.vue test/renderer/components/ModelManagerDialog.test.ts
git commit -m "feat(gateway): add model manager dialog"
```

## Task 6: ChannelTab Card Grid

**Files:**

- Modify: `src/renderer/src/components/gateway/ChannelTab.vue`
- Modify: `test/renderer/components/ChannelTab.performance.test.ts`

- [ ] **Step 1: Update the failing test**

Modify `test/renderer/components/ChannelTab.performance.test.ts` to assert that the first render no longer expands model cards directly and opens the model manager on demand:

```ts
it("只在打开模型管理时展示模型管理弹窗", async () => {
  const store = useGatewayStore();
  store.channels = [
    {
      id: 1,
      name: "Ch1",
      type: "openai",
      baseUrl: "",
      enabled: true,
      createdAt: "",
      updatedAt: "",
    },
  ];
  store.models.set(1, [
    {
      id: 10,
      channelId: 1,
      modelName: "gpt-4o",
      type: "chat",
      capabilities: [],
      enabled: true,
      createdAt: "",
      updatedAt: "",
    },
  ]);

  const wrapper = mount(ChannelTab, { attachTo: document.body });
  await nextTick();
  await nextTick();

  expect(document.body.textContent).toContain("Ch1");
  expect(document.body.textContent).not.toContain("gpt-4o");

  await wrapper.get('[data-testid="channel-manage-models"]').trigger("click");
  await nextTick();

  expect(document.body.textContent).toContain("模型管理");
});
```

Keep the existing first-paint test in the same file.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run test/renderer/components/ChannelTab.performance.test.ts
```

Expected: the new test fails because ChannelTab still renders the inline model management area.

- [ ] **Step 3: Refactor ChannelTab script**

In `src/renderer/src/components/gateway/ChannelTab.vue`:

- Import `GatewayChannelCard` and `ModelManagerDialog`.
- Remove `ChannelRealtimeChart`, inline model list display state, and inline model-add UI from the template.
- Keep model CRUD functions only if used by `ModelManagerDialog`; after Task 5 those functions belong to the dialog and can be removed from ChannelTab.
- Add local dialog state:

```ts
import GatewayChannelCard from "@/components/gateway/GatewayChannelCard.vue";
import ModelManagerDialog from "@/components/gateway/ModelManagerDialog.vue";

const modelManagerChannel = ref<Channel | null>(null);

function openModelManager(channel: Channel) {
  selectedChannelId.value = channel.id;
  modelManagerChannel.value = channel;
  store.loadModelsByChannel(channel.id);
  minuteStabilityRefresh.request({ immediate: true });
}

function closeModelManager() {
  modelManagerChannel.value = null;
}

function channelModelCount(channelId: number): number {
  return (store.models.get(channelId) ?? []).length;
}

function channelStabilitySummary(channelId: number): string {
  const points = store.channelMinuteStability.get(channelId) ?? [];
  const success = points.reduce((sum, point) => sum + point.successCount, 0);
  const fail = points.reduce((sum, point) => sum + point.failCount, 0);
  const total = success + fail;
  if (total === 0) return "-";
  return `${((success / total) * 100).toFixed(1)}%`;
}
```

- Keep `testChannel`, `openCreate`, `openEdit`, `deleteChannel`, and channel editor form behavior unchanged.

- [ ] **Step 4: Refactor ChannelTab template**

Replace the master-detail body with:

```vue
<div class="flex h-full min-h-0 flex-col overflow-hidden">
  <div class="flex shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
    <h3 class="text-sm font-medium text-[var(--color-text-primary)]">渠道</h3>
    <button
      class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-brand-hover)]"
      @click="openCreate"
    >
      + 新增渠道
    </button>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto p-4">
    <div v-if="store.channels.length" class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      <GatewayChannelCard
        v-for="channel in store.channels"
        :key="channel.id"
        :channel="channel"
        :model-count="channelModelCount(channel.id)"
        :stability-summary="channelStabilitySummary(channel.id)"
        :test-result="testResults.get(channel.id)"
        @test="testChannel(channel.id)"
        @edit="openEdit"
        @delete="deleteChannel(channel.id)"
        @manage-models="openModelManager"
      />
    </div>
    <div v-else class="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
      暂无渠道
    </div>
  </div>

  <ModelManagerDialog
    :open="!!modelManagerChannel"
    :channel="modelManagerChannel"
    @close="closeModelManager"
  />

  <!-- keep existing channel editor Teleport unchanged -->
</div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm vitest run test/renderer/components/ChannelTab.performance.test.ts test/renderer/components/GatewayChannelCard.test.ts test/renderer/components/ModelManagerDialog.test.ts
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue test/renderer/components/ChannelTab.performance.test.ts
git commit -m "refactor(gateway): move channel model management to dialog"
```

## Task 7: GroupManagerDialog and GroupTab Summary

**Files:**

- Create: `src/renderer/src/components/gateway/GroupManagerDialog.vue`
- Modify: `src/renderer/src/components/gateway/GroupTab.vue`
- Modify: `test/renderer/components/GroupTab.test.ts`
- Test: `test/renderer/components/GroupManagerDialog.test.ts`

- [ ] **Step 1: Write failing dialog test**

Create `test/renderer/components/GroupManagerDialog.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import GroupManagerDialog from "@/components/gateway/GroupManagerDialog.vue";
import { useGatewayStore } from "@/stores/gateway";

(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@/components/gateway/GroupEditDialog.vue", () => ({
  __esModule: true,
  default: { template: "<div data-testid='group-edit-dialog' />", props: ["open", "group"] },
}));

describe("GroupManagerDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("renders group cards and opens edit dialog", async () => {
    const store = useGatewayStore();
    store.groups = [
      {
        id: 1,
        name: "claude",
        balanceMode: "failover",
        isBuiltin: false,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const wrapper = mount(GroupManagerDialog, {
      props: { open: true },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("分组管理");
    expect(document.body.textContent).toContain("claude");

    await wrapper.get('[data-testid="group-edit"]').trigger("click");

    expect(wrapper.find('[data-testid="group-edit-dialog"]').exists()).toBe(true);
  });
});
```

Modify `test/renderer/components/GroupTab.test.ts`:

```ts
it("shows group summary and opens manager dialog", async () => {
  const store = useGatewayStore();
  store.groups = [
    {
      id: 1,
      name: "cc-auto",
      balanceMode: "failover",
      isBuiltin: false,
      createdAt: "",
      updatedAt: "",
    },
  ];

  const wrapper = mount(GroupTab, { attachTo: document.body });

  expect(document.body.textContent).toContain("分组");
  expect(document.body.textContent).toContain("1");

  await wrapper.get('[data-testid="open-group-manager"]').trigger("click");

  expect(document.body.textContent).toContain("分组管理");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run test/renderer/components/GroupManagerDialog.test.ts test/renderer/components/GroupTab.test.ts
```

Expected: fails because `GroupManagerDialog.vue` does not exist and GroupTab still renders the old list directly.

- [ ] **Step 3: Implement GroupManagerDialog**

Create `src/renderer/src/components/gateway/GroupManagerDialog.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GatewayManagerDialog from "@/components/gateway/GatewayManagerDialog.vue";
import GatewayGroupCard from "@/components/gateway/GatewayGroupCard.vue";
import GroupEditDialog from "@/components/gateway/GroupEditDialog.vue";
import type { Group } from "@shared/types/gateway";

defineProps<{ open: boolean }>();

const emit = defineEmits<{
  close: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();
const showEditor = ref(false);
const editingGroup = ref<Group | null>(null);

const builtinCount = computed(() => store.groups.filter((group) => group.isBuiltin).length);

function openCreate() {
  editingGroup.value = null;
  showEditor.value = true;
}

function openEdit(group: Group) {
  editingGroup.value = group;
  showEditor.value = true;
}

async function deleteGroup(group: Group) {
  if (group.isBuiltin) return;
  await gw.deleteGroup(group.id);
  await store.loadGroups();
}

async function onSaved() {
  await store.loadGroups();
}
</script>

<template>
  <GatewayManagerDialog
    :open="open"
    title="分组管理"
    :subtitle="`${store.groups.length} 个分组 · ${builtinCount} 个内置`"
    @close="emit('close')"
  >
    <template #actions>
      <button
        type="button"
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-brand-hover)]"
        @click="openCreate"
      >
        + 新增分组
      </button>
    </template>

    <div v-if="store.groups.length" class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      <GatewayGroupCard
        v-for="group in store.groups"
        :key="group.id"
        :group="group"
        :item-count="0"
        channel-summary="打开编辑查看成员"
        @edit="openEdit"
        @delete="deleteGroup"
      />
    </div>
    <div v-else class="py-10 text-center text-sm text-[var(--color-text-muted)]">暂无分组</div>

    <GroupEditDialog v-model:open="showEditor" :group="editingGroup" @saved="onSaved" />
  </GatewayManagerDialog>
</template>
```

- [ ] **Step 4: Refactor GroupTab**

Replace `src/renderer/src/components/gateway/GroupTab.vue` template/script with a summary panel:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import GroupManagerDialog from "@/components/gateway/GroupManagerDialog.vue";

const store = useGatewayStore();
const managerOpen = ref(false);

const builtinCount = computed(() => store.groups.filter((group) => group.isBuiltin).length);
const customCount = computed(() => store.groups.length - builtinCount.value);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4">
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <section
        class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
      >
        <div class="text-xs text-[var(--color-text-muted)]">分组总数</div>
        <div class="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
          {{ store.groups.length }}
        </div>
      </section>
      <section
        class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
      >
        <div class="text-xs text-[var(--color-text-muted)]">内置</div>
        <div class="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
          {{ builtinCount }}
        </div>
      </section>
      <section
        class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
      >
        <div class="text-xs text-[var(--color-text-muted)]">自定义</div>
        <div class="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
          {{ customCount }}
        </div>
      </section>
    </div>

    <div
      class="mt-4 flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]"
    >
      <button
        data-testid="open-group-manager"
        type="button"
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-brand-hover)]"
        @click="managerOpen = true"
      >
        管理分组
      </button>
    </div>

    <GroupManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayGroupCard.test.ts test/renderer/components/GroupManagerDialog.test.ts test/renderer/components/GroupTab.test.ts
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/gateway/GroupManagerDialog.vue src/renderer/src/components/gateway/GroupTab.vue test/renderer/components/GroupManagerDialog.test.ts test/renderer/components/GroupTab.test.ts
git commit -m "refactor(gateway): move group management to dialog"
```

## Task 8: ApiKeyManagerDialog and ApiKeyTab Summary

**Files:**

- Create: `src/renderer/src/components/gateway/ApiKeyManagerDialog.vue`
- Modify: `src/renderer/src/components/gateway/ApiKeyTab.vue`
- Test: `test/renderer/components/ApiKeyManagerDialog.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/renderer/components/ApiKeyManagerDialog.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import ApiKeyManagerDialog from "@/components/gateway/ApiKeyManagerDialog.vue";
import { useGatewayStore } from "@/stores/gateway";

const invoke = vi.fn(async () => ({ key: "sk-new-secret" }));

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

Object.assign(navigator, {
  clipboard: { writeText: vi.fn(async () => undefined) },
});

describe("ApiKeyManagerDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invoke.mockClear();
    document.body.innerHTML = "";
  });

  it("renders key cards and creates a revealed key", async () => {
    const store = useGatewayStore();
    store.apiKeys = [
      {
        id: 1,
        name: "internal",
        key: "sk-internal-secret",
        enabled: true,
        isInternal: true,
        createdAt: "",
      },
    ];

    const wrapper = mount(ApiKeyManagerDialog, {
      props: { open: true },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("密钥管理");
    expect(document.body.textContent).toContain("internal");

    await wrapper.get('[data-testid="open-key-create"]').trigger("click");
    await wrapper.get('[data-testid="key-name-input"]').setValue("web-client");
    await wrapper.get('[data-testid="create-key-submit"]').trigger("click");

    expect(invoke.mock.calls.some((call) => call[2] === "createApiKey")).toBe(true);
    expect(document.body.textContent).toContain("sk-new-secret");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run test/renderer/components/ApiKeyManagerDialog.test.ts
```

Expected: fails because `ApiKeyManagerDialog.vue` does not exist.

- [ ] **Step 3: Implement ApiKeyManagerDialog**

Create `src/renderer/src/components/gateway/ApiKeyManagerDialog.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GatewayManagerDialog from "@/components/gateway/GatewayManagerDialog.vue";
import GatewayApiKeyCard from "@/components/gateway/GatewayApiKeyCard.vue";
import type { GatewayApiKey } from "@shared/types/gateway";

defineProps<{ open: boolean }>();

const emit = defineEmits<{
  close: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();
const showCreate = ref(false);
const form = ref({ name: "" });
const revealedKey = ref<string | null>(null);
const copiedKeyId = ref<number | null>(null);

const enabledCount = computed(() => store.apiKeys.filter((key) => key.enabled).length);

async function createKey() {
  if (!form.value.name.trim()) return;
  const created = await gw.createApiKey({ name: form.value.name.trim() });
  revealedKey.value = created.key;
  form.value = { name: "" };
  showCreate.value = false;
  await store.loadApiKeys();
}

async function copyKey(apiKey: GatewayApiKey) {
  const text =
    revealedKey.value && apiKey.key === revealedKey.value ? revealedKey.value : apiKey.key;
  await navigator.clipboard.writeText(text);
  copiedKeyId.value = apiKey.id;
  setTimeout(() => {
    if (copiedKeyId.value === apiKey.id) copiedKeyId.value = null;
  }, 1500);
}

async function toggleEnabled(apiKey: GatewayApiKey) {
  await gw.updateApiKey(apiKey.id, { enabled: !apiKey.enabled });
  await store.loadApiKeys();
}

async function deleteKey(apiKey: GatewayApiKey) {
  if (apiKey.isInternal) return;
  await gw.deleteApiKey(apiKey.id);
  await store.loadApiKeys();
}
</script>

<template>
  <GatewayManagerDialog
    :open="open"
    title="密钥管理"
    :subtitle="`${store.apiKeys.length} 个密钥 · ${enabledCount} 个启用`"
    @close="emit('close')"
  >
    <template #actions>
      <button
        data-testid="open-key-create"
        type="button"
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-brand-hover)]"
        @click="showCreate = !showCreate"
      >
        + 新增密钥
      </button>
    </template>

    <div
      v-if="showCreate"
      class="mb-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
    >
      <div class="flex gap-2">
        <input
          data-testid="key-name-input"
          v-model="form.name"
          class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-input)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-brand)]"
          placeholder="密钥名称"
          @keydown.enter.prevent="createKey"
        />
        <button
          data-testid="create-key-submit"
          type="button"
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-3 py-1.5 text-xs font-medium text-white"
          @click="createKey"
        >
          创建
        </button>
      </div>
    </div>

    <div
      v-if="revealedKey"
      class="mb-3 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-3"
    >
      <div class="text-xs text-[var(--color-text-muted)]">
        请复制并妥善保管，关闭后将无法再次查看。
      </div>
      <code class="mt-2 block break-all text-xs text-[var(--color-text-primary)]">{{
        revealedKey
      }}</code>
    </div>

    <div v-if="store.apiKeys.length" class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      <GatewayApiKeyCard
        v-for="apiKey in store.apiKeys"
        :key="apiKey.id"
        :api-key="apiKey"
        :revealed-key="apiKey.key === revealedKey ? revealedKey : null"
        :copied="copiedKeyId === apiKey.id"
        @copy="copyKey"
        @toggle-enabled="toggleEnabled"
        @delete="deleteKey"
      />
    </div>
    <div v-else class="py-10 text-center text-sm text-[var(--color-text-muted)]">暂无密钥</div>
  </GatewayManagerDialog>
</template>
```

- [ ] **Step 4: Refactor ApiKeyTab**

Replace `src/renderer/src/components/gateway/ApiKeyTab.vue` with a summary page:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import ApiKeyManagerDialog from "@/components/gateway/ApiKeyManagerDialog.vue";

const store = useGatewayStore();
const managerOpen = ref(false);
const enabledCount = computed(() => store.apiKeys.filter((key) => key.enabled).length);
const internalCount = computed(() => store.apiKeys.filter((key) => key.isInternal).length);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4">
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <section
        class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
      >
        <div class="text-xs text-[var(--color-text-muted)]">密钥总数</div>
        <div class="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
          {{ store.apiKeys.length }}
        </div>
      </section>
      <section
        class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
      >
        <div class="text-xs text-[var(--color-text-muted)]">启用</div>
        <div class="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
          {{ enabledCount }}
        </div>
      </section>
      <section
        class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
      >
        <div class="text-xs text-[var(--color-text-muted)]">内置</div>
        <div class="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
          {{ internalCount }}
        </div>
      </section>
    </div>

    <div
      class="mt-4 flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]"
    >
      <button
        data-testid="open-key-manager"
        type="button"
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-brand-hover)]"
        @click="managerOpen = true"
      >
        管理密钥
      </button>
    </div>

    <ApiKeyManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm vitest run test/renderer/components/GatewayApiKeyCard.test.ts test/renderer/components/ApiKeyManagerDialog.test.ts
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/gateway/ApiKeyManagerDialog.vue src/renderer/src/components/gateway/ApiKeyTab.vue test/renderer/components/ApiKeyManagerDialog.test.ts
git commit -m "refactor(gateway): move api key management to dialog"
```

## Task 9: Compact GatewayPanel Top Overview

**Files:**

- Modify: `src/renderer/src/views/GatewayPanel.vue`
- Modify: `src/renderer/src/components/slime/SlimeMetricCard.vue`
- Modify: `src/renderer/src/components/slime/SlimeRealtimeChart.vue`
- Modify: `src/renderer/src/components/slime/SlimeRankBoard.vue`
- Modify: `test/renderer/components/SlimeRealtimeChart.test.ts`
- Modify: `test/renderer/components/SlimeRankBoard.test.ts`

- [ ] **Step 1: Add failing tests for compact shared components**

In `test/renderer/components/SlimeRankBoard.test.ts`, add:

```ts
it("limits ranked rows when limit is provided", () => {
  const wrapper = mount(SlimeRankBoard, {
    props: {
      title: "模型排名",
      limit: 2,
      items: [
        { id: "a", label: "A", value: "3" },
        { id: "b", label: "B", value: "2" },
        { id: "c", label: "C", value: "1" },
      ],
    },
  });

  expect(wrapper.find('[data-testid="rank-item-0"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="rank-item-1"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="rank-item-2"]').exists()).toBe(false);
});
```

In `test/renderer/components/SlimeRealtimeChart.test.ts`, add:

```ts
it("marks compact charts with compact layout metadata", () => {
  const wrapper = mount(SlimeRealtimeChart, {
    props: {
      title: "趋势",
      compact: true,
      metrics: [{ id: "requests", label: "请求", value: "10", points: [1, 2, 3] }],
    },
  });

  expect(wrapper.get('[data-testid="slime-realtime-chart"]').attributes("data-density")).toBe(
    "compact",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeRankBoard.test.ts test/renderer/components/SlimeRealtimeChart.test.ts
```

Expected: fails because `limit` and `compact` are not implemented.

- [ ] **Step 3: Update SlimeRankBoard**

In `src/renderer/src/components/slime/SlimeRankBoard.vue`:

- Add props:

```ts
compact?: boolean;
limit?: number;
```

- Defaults:

```ts
compact: false,
limit: 5,
```

- Replace `.slice(0, 5)` with:

```ts
.slice(0, props.limit)
```

- Make the root padding compact-aware:

```vue
<section
  :class="[
    'min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]',
    compact ? 'p-3' : 'p-4',
  ]"
>
```

- [ ] **Step 4: Update SlimeRealtimeChart**

In `src/renderer/src/components/slime/SlimeRealtimeChart.vue`:

- Add prop:

```ts
compact?: boolean;
```

- Default it to `false`.
- Add `data-testid` and density metadata on the root:

```vue
<section
  data-testid="slime-realtime-chart"
  :data-density="compact ? 'compact' : 'regular'"
  class="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]"
>
```

- Change chart window height class to:

```vue
:class="[ 'relative mx-3 mb-3 min-w-0 overflow-hidden rounded-[var(--radius-md)]', compact ?
'h-[clamp(112px,16vh,148px)]' : 'h-[148px]', ]"
```

- Keep metric switching and label behavior unchanged.

- [ ] **Step 5: Compact SlimeMetricCard**

In `src/renderer/src/components/slime/SlimeMetricCard.vue`, reduce vertical footprint without adding a prop:

```vue
<article
  class="w-full min-w-0 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--metric-color)_24%,var(--color-border-subtle))] bg-[color-mix(in_srgb,var(--metric-color)_10%,var(--color-control))] px-3 py-2"
  :style="{ '--metric-color': color }"
>
  <div class="truncate text-[11px] font-medium text-[var(--color-text-muted)]">{{ label }}</div>
  <div class="mt-1 truncate text-lg font-semibold leading-tight" :style="{ color }">{{ value }}</div>
  <div v-if="meta" class="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{{ meta }}</div>
</article>
```

- [ ] **Step 6: Update GatewayPanel layout**

In `src/renderer/src/views/GatewayPanel.vue`, make the structure:

```vue
<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-app-canvas)]">
    <PageHeader title="Gateway" subtitle="路由、密钥、日志与运行指标">
      <template #actions>
        <SlimeTabs v-model="store.statsRange" :tabs="rangeOptions" />
      </template>
    </PageHeader>

    <div class="shrink-0 px-5 py-3">
      <div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
        <SlimeMetricCard
          v-for="card in metricCards"
          :key="card.label"
          :label="card.label"
          :value="card.value"
          :meta="card.meta"
          :tone="card.tone"
        />
      </div>

      <div
        class="mt-2 grid min-w-0 grid-cols-1 gap-2 2xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]"
      >
        <SlimeRealtimeChart
          v-if="metricsLoaded"
          compact
          title="趋势"
          :subtitle="trendGranularity === 'hourly' ? '按小时统计' : '按天统计'"
          :metrics="trendMetrics"
        />
        <div
          v-else
          class="h-[clamp(112px,16vh,148px)] rounded-[var(--radius-lg)] bg-[var(--color-control-hover)]"
        />
        <div class="grid min-w-0 gap-2 md:grid-cols-2 2xl:grid-cols-2">
          <SlimeRankBoard
            compact
            title="供应商排名"
            :items="channelRankItems"
            :metrics="rankMetrics"
            :limit="3"
          />
          <SlimeRankBoard
            compact
            title="模型排名"
            :items="modelRankItems"
            :metrics="rankMetrics"
            :limit="3"
          />
        </div>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col border-t border-[var(--color-border-subtle)]">
      <div class="flex shrink-0 border-b border-[var(--color-border-subtle)] px-5 py-3">
        <SlimeTabs v-model="store.activeTab" :tabs="tabs" />
      </div>
      <div class="min-h-0 flex-1 overflow-hidden">
        <ChannelTab v-if="store.activeTab === 'channels'" />
        <GroupTab v-else-if="store.activeTab === 'groups'" />
        <ApiKeyTab v-else-if="store.activeTab === 'apikeys'" />
        <LogTab v-else-if="store.activeTab === 'logs'" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeRankBoard.test.ts test/renderer/components/SlimeRealtimeChart.test.ts
```

Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/views/GatewayPanel.vue src/renderer/src/components/slime/SlimeMetricCard.vue src/renderer/src/components/slime/SlimeRealtimeChart.vue src/renderer/src/components/slime/SlimeRankBoard.vue test/renderer/components/SlimeRealtimeChart.test.ts test/renderer/components/SlimeRankBoard.test.ts
git commit -m "refactor(gateway): compact adaptive dashboard overview"
```

## Task 10: LogTab Responsive Grid

**Files:**

- Modify: `src/renderer/src/components/gateway/LogTab.vue`
- Modify: `test/renderer/components/LogTab.performance.test.ts`

- [ ] **Step 1: Add failing test for responsive row contract**

In `test/renderer/components/LogTab.performance.test.ts`, add:

```ts
it("renders logs in responsive grid rows without fixed width table columns", async () => {
  const wrapper = mount(LogTab, { attachTo: document.body });
  await nextTick();
  await nextTick();

  const rows = wrapper.findAll('[data-testid="log-row"]');
  if (rows.length > 0) {
    expect(rows[0].attributes("data-layout")).toBe("responsive-grid");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run test/renderer/components/LogTab.performance.test.ts
```

Expected: fails because rows do not expose `data-layout="responsive-grid"`.

- [ ] **Step 3: Refactor the row layout**

In `src/renderer/src/components/gateway/LogTab.vue`:

- Change root to avoid nested page scrolling:

```vue
<div class="flex h-full min-h-0 flex-col overflow-hidden p-4">
```

- Change the list wrapper to:

```vue
<div v-if="logs.length" class="min-h-0 flex-1 overflow-y-auto">
  <div class="space-y-1">
    <!-- log rows from the next code block live here -->
  </div>
</div>
```

- Replace fixed width row classes with responsive grid:

```vue
<div
  v-for="log in logs"
  :key="log.id"
  data-testid="log-row"
  data-layout="responsive-grid"
  class="cursor-pointer rounded-[var(--radius-md)] bg-[var(--color-control)] transition-colors hover:bg-[var(--color-control-hover)]"
  @click="openDetail(log)"
>
  <div
    class="grid min-w-0 grid-cols-[minmax(96px,0.9fr)_minmax(160px,1.3fr)_minmax(96px,0.8fr)_minmax(80px,0.7fr)_minmax(112px,0.8fr)_minmax(72px,0.6fr)_minmax(72px,0.6fr)_minmax(72px,0.6fr)_auto] items-center gap-2 px-3 py-2 text-xs"
  >
    <span class="min-w-0 truncate text-[var(--color-text-muted)]">
      {{ formatTime(log.createdAt) }}
    </span>
    <span class="flex min-w-0 items-center gap-1.5 font-medium">
      <ModelIcon :model-name="log.modelName" :size="16" class="shrink-0" />
      <span class="min-w-0 truncate" :title="log.modelName">{{ log.modelName }}</span>
    </span>
    <span class="min-w-0 truncate text-[var(--color-text-muted)]">
      {{ log.channelName ?? "-" }}
    </span>
    <span class="min-w-0 truncate text-[var(--color-text-muted)]">
      {{ log.apiKeyName ?? "-" }}
    </span>
    <span class="min-w-0 truncate text-[var(--color-text-muted)]">
      {{ log.inputTokens }} / {{ log.outputTokens }}
    </span>
    <span class="min-w-0 truncate text-[var(--color-text-muted)]">
      {{ log.ttftMs != null ? formatDuration(log.ttftMs) : "-" }}
    </span>
    <span class="min-w-0 truncate text-[var(--color-text-muted)]">
      {{ formatCost(log.cost) }}
    </span>
    <span class="min-w-0 truncate text-[var(--color-text-muted)]">
      {{ formatDuration(log.durationMs) }}
    </span>
    <span
      :class="[
        'shrink-0 rounded px-1.5 py-0.5 text-xs',
        log.status === 'success'
          ? 'bg-[color-mix(in_srgb,var(--color-success)_18%,transparent)] text-[var(--color-success)]'
          : 'bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)] text-[var(--color-danger)]',
      ]"
    >
      {{ log.status }}
    </span>
  </div>
</div>
```

- Each cell must use `min-w-0 truncate`; status badge remains shrinkable.
- Keep load-more and drawer behavior unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run test/renderer/components/LogTab.performance.test.ts
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/LogTab.vue test/renderer/components/LogTab.performance.test.ts
git commit -m "refactor(gateway): make log tab responsive"
```

## Task 11: Final Verification

**Files:**

- Verify all modified files.

- [ ] **Step 1: Run formatter**

Run:

```bash
pnpm run format
```

Expected: exits `0`.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm run lint
```

Expected: exits `0`.

- [ ] **Step 3: Run web typecheck**

Run:

```bash
pnpm run typecheck:web
```

Expected: exits `0`.

- [ ] **Step 4: Run targeted renderer tests**

Run:

```bash
pnpm vitest run \
  test/renderer/components/GatewayChannelCard.test.ts \
  test/renderer/components/GatewayModelCard.test.ts \
  test/renderer/components/GatewayGroupCard.test.ts \
  test/renderer/components/GatewayApiKeyCard.test.ts \
  test/renderer/components/GatewayManagerDialog.test.ts \
  test/renderer/components/ModelManagerDialog.test.ts \
  test/renderer/components/GroupManagerDialog.test.ts \
  test/renderer/components/ApiKeyManagerDialog.test.ts \
  test/renderer/components/ChannelTab.performance.test.ts \
  test/renderer/components/GroupTab.test.ts \
  test/renderer/components/LogTab.performance.test.ts \
  test/renderer/components/SlimeRankBoard.test.ts \
  test/renderer/components/SlimeRealtimeChart.test.ts
```

Expected: exits `0`.

- [ ] **Step 5: Run relevant E2E or app visual check**

If an E2E suite for Gateway exists after current workspace changes, run:

```bash
pnpm run test:e2e
```

Expected: exits `0`.

If there is no focused Gateway E2E coverage, start the app:

```bash
pnpm run dev
```

Then inspect Gateway in the browser/app at desktop width:

- Top metrics, chart, and rankings do not overlap.
- Channel tab shows channel cards and no inline full model list.
- Model manager dialog opens and scrolls internally.
- Group manager dialog opens and shows group cards.
- API key manager dialog opens and preserves one-time key display.
- Log tab has no horizontal scrollbar and detail drawer JSON scrolls internally.

- [ ] **Step 6: Commit verification fixes**

If verification required fixes in the Gateway files touched by this plan:

```bash
git add \
  src/renderer/src/views/GatewayPanel.vue \
  src/renderer/src/components/slime/SlimeMetricCard.vue \
  src/renderer/src/components/slime/SlimeRealtimeChart.vue \
  src/renderer/src/components/slime/SlimeRankBoard.vue \
  src/renderer/src/components/gateway \
  test/renderer/components
git commit -m "fix(gateway): polish compact layout verification"
```

If no fixes were required, do not create an empty commit.
