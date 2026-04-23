# TASK-006 ConfigPresenter + 设置 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 ConfigPresenter JSON 持久化，添加侧边栏设置 Dialog，支持配置 AI Provider/API Key/Model/Base URL，AgentPresenter 从 ConfigPresenter 读取配置。

**Architecture:** JsonStore 加 baseDir 参数支持 configDir 路径。ConfigPresenter 用 JsonStore 读写 `slime.config.json`。设置 UI 用 reka-ui Dialog 原语 + TailwindCSS，AppSidebar 底部加设置按钮。ProviderSettings 表单通过 useConfigStore 调 IPC 写入配置。

**Tech Stack:** Vue 3 Composition API, reka-ui (Dialog primitive), TailwindCSS v4, Pinia, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/main/utils/jsonStore.ts` | 加可选 baseDir 参数 |
| Modify | `test/main/jsonStore.test.ts` | 加 baseDir 测试 |
| Modify | `src/main/presenter/configPresenter.ts` | 实现 get/set，JsonStore 持久化 |
| Create | `test/main/configPresenter.test.ts` | ConfigPresenter 单元测试 |
| Modify | `src/main/presenter/agentPresenter.ts` | 注入 ConfigPresenter，改造 getConfig |
| Modify | `src/main/presenter/index.ts` | 传递 configPresenter 给 AgentPresenter |
| Create | `src/renderer/src/components/settings/SettingsDialog.vue` | Dialog 壳 + 左右分栏 |
| Create | `src/renderer/src/components/settings/ProviderSettings.vue` | AI Provider 配置表单 |
| Modify | `src/renderer/src/components/AppSidebar.vue` | 底部设置按钮 + 引入 SettingsDialog |
| Create | `test/renderer/components/ProviderSettings.test.ts` | 表单组件测试 |

---

### Task 1: JsonStore 加 baseDir 参数

**Files:**

- Modify: `src/main/utils/jsonStore.ts`
- Modify: `test/main/jsonStore.test.ts`

- [ ] **Step 1: 写测试**

在 `test/main/jsonStore.test.ts` 末尾（最后一个 `it` 块之后，`describe` 闭合之前）添加：

```typescript
  it("should use custom baseDir when provided", async () => {
    const customDir = join(tmpdir(), `slime-test-custom-${Date.now()}`);
    mkdirSync(customDir, { recursive: true });
    try {
      const store = new JsonStore<{ key: string }>("custom.json", { key: "" }, customDir);
      await store.write({ key: "custom" });
      const data = await store.read();
      expect(data).toEqual({ key: "custom" });
    } finally {
      rmSync(customDir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project main test/main/jsonStore.test.ts`
Expected: FAIL — JsonStore 构造函数不接受第三个参数（不影响行为但需确认新测试逻辑正确）

- [ ] **Step 3: 实现 baseDir 参数**

修改 `src/main/utils/jsonStore.ts`，将构造函数改为：

```typescript
export class JsonStore<T> {
  private filePath: string;

  constructor(
    relativePath: string,
    private defaultValue: T,
    baseDir?: string,
  ) {
    this.filePath = join(baseDir || paths.dataDir, relativePath);
  }
```

仅改动构造函数签名和第 14 行的 `this.filePath` 赋值。其余不变。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project main test/main/jsonStore.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/utils/jsonStore.ts test/main/jsonStore.test.ts
git commit -m "feat: add optional baseDir param to JsonStore"
```

---

### Task 2: ConfigPresenter 实现

**Files:**

- Modify: `src/main/presenter/configPresenter.ts`
- Create: `test/main/configPresenter.test.ts`

- [ ] **Step 1: 写测试**

创建 `test/main/configPresenter.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `slime-config-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir, configDir: testDir },
}));

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

const { ConfigPresenter } = await import("@/presenter/configPresenter");

describe("ConfigPresenter", () => {
  let presenter: InstanceType<typeof ConfigPresenter>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    presenter = new ConfigPresenter();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should return null for unset key", async () => {
    const value = await presenter.get("ai.provider");
    expect(value).toBeNull();
  });

  it("should set and get a value", async () => {
    const result = await presenter.set("ai.provider", "anthropic");
    expect(result).toBe(true);
    const value = await presenter.get("ai.provider");
    expect(value).toBe("anthropic");
  });

  it("should persist multiple keys", async () => {
    await presenter.set("ai.provider", "openai");
    await presenter.set("ai.apiKey", "sk-test");
    expect(await presenter.get("ai.provider")).toBe("openai");
    expect(await presenter.get("ai.apiKey")).toBe("sk-test");
  });

  it("should broadcast config change event", async () => {
    const { eventBus } = await import("@/eventbus");
    await presenter.set("ai.model", "gpt-4o");
    expect(eventBus.sendToRenderer).toHaveBeenCalledWith("config:changed", "ai.model", "gpt-4o");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project main test/main/configPresenter.test.ts`
Expected: FAIL — `get` returns null, `set` returns false

- [ ] **Step 3: 实现 ConfigPresenter**

替换 `src/main/presenter/configPresenter.ts` 全部内容：

```typescript
import type { IConfigPresenter } from "@shared/types/presenters";
import { JsonStore, logger, paths } from "@/utils";
import { eventBus } from "@/eventbus";
import { CONFIG_EVENTS } from "@shared/events";

export class ConfigPresenter implements IConfigPresenter {
  private store = new JsonStore<Record<string, unknown>>(
    "slime.config.json",
    {},
    paths.configDir,
  );

  async get(key: string): Promise<unknown> {
    const data = await this.store.read();
    return data[key] ?? null;
  }

  async set(key: string, value: unknown): Promise<boolean> {
    const data = await this.store.read();
    data[key] = value;
    await this.store.write(data);
    eventBus.sendToRenderer(CONFIG_EVENTS.CHANGED, key, value);
    logger.debug("Config set", { key });
    return true;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project main test/main/configPresenter.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/configPresenter.ts test/main/configPresenter.test.ts
git commit -m "feat: implement ConfigPresenter with JSON persistence"
```

---

### Task 3: AgentPresenter 注入 ConfigPresenter

**Files:**

- Modify: `src/main/presenter/agentPresenter.ts`
- Modify: `src/main/presenter/index.ts`

- [ ] **Step 1: 修改 AgentPresenter 构造函数和 getConfig**

在 `src/main/presenter/agentPresenter.ts` 中：

将第 13 行的 import 改为：

```typescript
import type { SessionPresenter } from "./sessionPresenter";
import type { ConfigPresenter } from "./configPresenter";
```

将第 18 行构造函数改为：

```typescript
  constructor(
    private sessionPresenter: SessionPresenter,
    private configPresenter: ConfigPresenter,
  ) {}
```

将第 20-26 行 `getConfig` 方法替换为：

```typescript
  private async getConfig(): Promise<{
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
  }> {
    return {
      provider:
        ((await this.configPresenter.get("ai.provider")) as string) ||
        process.env.SLIME_AI_PROVIDER ||
        "anthropic",
      apiKey:
        ((await this.configPresenter.get("ai.apiKey")) as string) ||
        process.env.SLIME_AI_API_KEY ||
        "",
      model:
        ((await this.configPresenter.get("ai.model")) as string) ||
        process.env.SLIME_AI_MODEL ||
        "claude-sonnet-4-20250514",
      baseUrl:
        ((await this.configPresenter.get("ai.baseUrl")) as string) ||
        process.env.SLIME_AI_BASE_URL ||
        undefined,
    };
  }
```

将第 28-38 行 `createModel` 方法中的 `baseURL: process.env.SLIME_AI_BASE_URL || undefined` 改为 `baseURL: config.baseUrl`（因为 baseUrl 已在 getConfig 中解析）。完整的 createModel：

```typescript
  private createModel(config: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
  }) {
    if (config.provider === "anthropic") {
      const provider = createAnthropic({ apiKey: config.apiKey });
      return provider(config.model);
    }
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    return provider(config.model);
  }
```

- [ ] **Step 2: 修改 Presenter index 传递 configPresenter**

在 `src/main/presenter/index.ts` 第 27 行，将：

```typescript
    this.agentPresenter = new AgentPresenter(this.sessionPresenter);
```

改为：

```typescript
    this.agentPresenter = new AgentPresenter(this.sessionPresenter, this.configPresenter);
```

- [ ] **Step 3: 运行现有测试确认不破坏**

Run: `pnpm test -- --project main`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/agentPresenter.ts src/main/presenter/index.ts
git commit -m "feat: inject ConfigPresenter into AgentPresenter"
```

---

### Task 4: ProviderSettings 表单组件

**Files:**

- Create: `src/renderer/src/components/settings/ProviderSettings.vue`
- Create: `test/renderer/components/ProviderSettings.test.ts`

- [ ] **Step 1: 写测试**

创建 `test/renderer/components/ProviderSettings.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);

;(globalThis as any).window = {
  electron: { ipcRenderer: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), removeAllListeners: vi.fn() } },
};

import ProviderSettings from "@/components/settings/ProviderSettings.vue";

describe("ProviderSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  it("should render provider select", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="provider-select"]').exists()).toBe(true);
  });

  it("should render api key input", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="api-key-input"]').exists()).toBe(true);
  });

  it("should render model input", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="model-input"]').exists()).toBe(true);
  });

  it("should render base url input", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="base-url-input"]').exists()).toBe(true);
  });

  it("should render save button", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(true);
  });

  it("should toggle api key visibility", async () => {
    const wrapper = mount(ProviderSettings);
    const input = wrapper.find('[data-testid="api-key-input"]');
    expect(input.attributes("type")).toBe("password");
    await wrapper.find('[data-testid="toggle-key-visibility"]').trigger("click");
    expect(wrapper.find('[data-testid="api-key-input"]').attributes("type")).toBe("text");
  });

  it("should call configPresenter.set on save", async () => {
    mockInvoke.mockResolvedValue(true);
    const wrapper = mount(ProviderSettings);

    await wrapper.find('[data-testid="api-key-input"]').setValue("sk-test-key");
    await wrapper.find('[data-testid="model-input"]').setValue("gpt-4o");
    await wrapper.find('[data-testid="save-btn"]').trigger("click");

    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "configPresenter", "set", "ai.apiKey", "sk-test-key");
    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "configPresenter", "set", "ai.model", "gpt-4o");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/ProviderSettings.test.ts`
Expected: FAIL — 组件不存在

- [ ] **Step 3: 创建目录并实现组件**

```bash
mkdir -p src/renderer/src/components/settings
```

创建 `src/renderer/src/components/settings/ProviderSettings.vue`：

```vue
<template>
  <div class="space-y-5">
    <h3 class="text-sm font-medium text-foreground">LLM Provider</h3>

    <!-- Provider -->
    <div class="space-y-1.5">
      <label class="text-xs text-muted-foreground">Provider</label>
      <select
        v-model="form.provider"
        data-testid="provider-select"
        class="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      >
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
      </select>
    </div>

    <!-- API Key -->
    <div class="space-y-1.5">
      <label class="text-xs text-muted-foreground">API Key</label>
      <div class="relative">
        <input
          v-model="form.apiKey"
          data-testid="api-key-input"
          :type="showKey ? 'text' : 'password'"
          class="w-full rounded-md border border-border bg-muted px-3 py-2 pr-10 text-sm text-foreground outline-none focus:border-primary"
          placeholder="sk-..."
        />
        <button
          data-testid="toggle-key-visibility"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          type="button"
          @click="showKey = !showKey"
        >
          <svg
            v-if="showKey"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg
            v-else
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
            />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Model -->
    <div class="space-y-1.5">
      <label class="text-xs text-muted-foreground">Model</label>
      <input
        v-model="form.model"
        data-testid="model-input"
        type="text"
        class="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        :placeholder="form.provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'"
      />
    </div>

    <!-- Base URL -->
    <div class="space-y-1.5">
      <label class="text-xs text-muted-foreground">Base URL <span class="text-muted-foreground/50">(可选)</span></label>
      <input
        v-model="form.baseUrl"
        data-testid="base-url-input"
        type="text"
        class="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        placeholder="https://api.openai.com/v1"
      />
    </div>

    <!-- Save -->
    <div class="flex items-center gap-3 pt-2">
      <button
        data-testid="save-btn"
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        @click="onSave"
      >
        保存
      </button>
      <span v-if="saveStatus" class="text-xs text-green-500">{{ saveStatus }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useConfigStore } from "@/stores/config";

const configStore = useConfigStore();
const showKey = ref(false);
const saveStatus = ref("");

const form = reactive({
  provider: "anthropic",
  apiKey: "",
  model: "",
  baseUrl: "",
});

onMounted(async () => {
  form.provider = ((await configStore.get("ai.provider")) as string) || "anthropic";
  form.apiKey = ((await configStore.get("ai.apiKey")) as string) || "";
  form.model = ((await configStore.get("ai.model")) as string) || "";
  form.baseUrl = ((await configStore.get("ai.baseUrl")) as string) || "";
});

async function onSave() {
  await configStore.set("ai.provider", form.provider);
  await configStore.set("ai.apiKey", form.apiKey);
  await configStore.set("ai.model", form.model);
  await configStore.set("ai.baseUrl", form.baseUrl);
  saveStatus.value = "已保存";
  setTimeout(() => {
    saveStatus.value = "";
  }, 2000);
}
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/ProviderSettings.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/settings/ProviderSettings.vue test/renderer/components/ProviderSettings.test.ts
git commit -m "feat: add ProviderSettings form component"
```

---

### Task 5: SettingsDialog 组件

**Files:**

- Create: `src/renderer/src/components/settings/SettingsDialog.vue`

- [ ] **Step 1: 实现 SettingsDialog**

创建 `src/renderer/src/components/settings/SettingsDialog.vue`：

```vue
<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/50" @click="$emit('update:open', false)" />
      <!-- Dialog -->
      <div class="relative flex h-[400px] w-[600px] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <!-- Left nav -->
        <div class="flex w-48 shrink-0 flex-col border-r border-border bg-sidebar p-4">
          <div class="text-xs font-medium uppercase text-muted-foreground mb-3">设置</div>
          <button
            class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            LLM Provider
          </button>
        </div>
        <!-- Right content -->
        <div class="flex-1 overflow-y-auto p-6">
          <ProviderSettings />
        </div>
        <!-- Close button -->
        <button
          class="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          @click="$emit('update:open', false)"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import ProviderSettings from "./ProviderSettings.vue";

defineProps<{
  open: boolean;
}>();

defineEmits<{
  "update:open": [value: boolean];
}>();
</script>
```

- [ ] **Step 2: 运行全量 renderer 测试确认不破坏**

Run: `pnpm test -- --project renderer`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/settings/SettingsDialog.vue
git commit -m "feat: add SettingsDialog with left nav and provider form"
```

---

### Task 6: AppSidebar 添加设置按钮

**Files:**

- Modify: `src/renderer/src/components/AppSidebar.vue`
- Modify: `test/renderer/components/AppSidebar.test.ts`

- [ ] **Step 1: 更新 AppSidebar 测试**

在 `test/renderer/components/AppSidebar.test.ts` 的 describe 内末尾添加：

```typescript
  it("should render settings button", () => {
    const wrapper = mount(AppSidebar);
    expect(wrapper.find('[data-testid="sidebar-settings"]').exists()).toBe(true);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/AppSidebar.test.ts`
Expected: 新增测试 FAIL

- [ ] **Step 3: 改造 AppSidebar.vue**

替换 `src/renderer/src/components/AppSidebar.vue` 全部内容：

```vue
<template>
  <div
    data-testid="app-sidebar"
    class="flex w-[45px] shrink-0 flex-col items-center justify-between bg-sidebar pt-2 pb-3"
  >
    <!-- Top: nav buttons -->
    <div class="flex flex-col items-center">
      <button
        data-testid="sidebar-evolution"
        class="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground"
        title="进化中心"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          <path d="m5.6 5.6 2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8" />
        </svg>
      </button>
    </div>

    <!-- Bottom: settings button -->
    <button
      data-testid="sidebar-settings"
      class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="设置"
      @click="settingsOpen = true"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="19" cy="12" r="1.5" />
      </svg>
    </button>

    <SettingsDialog v-model:open="settingsOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import SettingsDialog from "./settings/SettingsDialog.vue";

const settingsOpen = ref(false);
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/AppSidebar.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AppSidebar.vue test/renderer/components/AppSidebar.test.ts
git commit -m "feat: add settings button to AppSidebar"
```

---

### Task 7: 全量测试 + 格式化 + Lint + Typecheck

**Files:** 无新文件

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试 PASS

- [ ] **Step 2: 格式化**

Run: `pnpm run format`

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: 无错误

- [ ] **Step 4: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: 修复任何问题**

如果上述步骤有失败，修复后重新运行直到全部通过。

- [ ] **Step 6: Commit（如有格式化改动）**

```bash
git add -A
git commit -m "chore: format and lint pass for task-006"
```
