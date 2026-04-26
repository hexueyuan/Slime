# TASK-024: Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 5-step first-launch onboarding wizard that collects AI Provider config and user identity before entering the main app.

**Architecture:** Condition-rendered `OnboardingWizard` component inserted into `EvolutionCenter.vue`'s render chain before `WorkspaceSetup`. Uses existing `configPresenter` for storage, new `agentPresenter.verifyApiKey()` IPC for API validation. Bio-organic visual style matching `EvolutionStatusBar`.

**Tech Stack:** Vue 3 Composition API, TailwindCSS, Vercel AI SDK (`generateText`), Vitest + Vue Test Utils

---

### Task 1: Add `verifyApiKey` to AgentPresenter (backend)

**Files:**
- Modify: `src/shared/types/presenters/agent.presenter.d.ts`
- Modify: `src/main/presenter/agentPresenter.ts`
- Test: `test/main/agentPresenter.test.ts`

- [ ] **Step 1: Add `verifyApiKey` to the IAgentPresenter interface**

```typescript
// src/shared/types/presenters/agent.presenter.d.ts
import type { UserMessageContent } from "../chat";

export interface IAgentPresenter {
  chat(sessionId: string, content: UserMessageContent): Promise<void>;
  stopGeneration(sessionId: string): Promise<void>;
  answerQuestion(sessionId: string, toolCallId: string, answer: string): Promise<void>;
  verifyApiKey(
    provider: string,
    apiKey: string,
    model: string,
    baseUrl?: string,
  ): Promise<{ success: boolean; error?: string; modelName?: string }>;
}
```

- [ ] **Step 2: Write the failing test for `verifyApiKey`**

Add to `test/main/agentPresenter.test.ts` (after existing tests, inside the `describe("AgentPresenter", ...)` block):

```typescript
describe("verifyApiKey", () => {
  it("should return success when API call succeeds", async () => {
    mockGenerateText.mockResolvedValue({ text: "hi" });
    const result = await agent.verifyApiKey("anthropic", "sk-test", "claude-sonnet-4-20250514");
    expect(result).toEqual({
      success: true,
      modelName: "claude-sonnet-4-20250514",
    });
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 1,
      }),
    );
  });

  it("should return error when API call fails", async () => {
    mockGenerateText.mockRejectedValue(new Error("Invalid API key"));
    const result = await agent.verifyApiKey("openai", "bad-key", "gpt-4o");
    expect(result).toEqual({
      success: false,
      error: "Invalid API key",
    });
  });
});
```

Also add the `mockGenerateText` declaration near the top of the file where `mockStreamText` is defined:

```typescript
const mockGenerateText = vi.fn();
```

And update the `vi.mock("ai", ...)` block:

```typescript
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));
```

And add `mockGenerateText.mockClear()` to the `beforeEach` block alongside `mockSendToRenderer.mockClear()`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- test/main/agentPresenter.test.ts`

Expected: FAIL — `agent.verifyApiKey is not a function`

- [ ] **Step 4: Implement `verifyApiKey` in AgentPresenter**

Add `generateText` to the top-level import in `src/main/presenter/agentPresenter.ts`:

```typescript
import { streamText, generateText } from "ai";
```

Add the method after `answerQuestion`:

```typescript
async verifyApiKey(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
): Promise<{ success: boolean; error?: string; modelName?: string }> {
  try {
    const aiModel = this.createModel({ provider, apiKey, model, baseUrl });
    await generateText({
      model: aiModel,
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 1,
    });
    return { success: true, modelName: model };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn("API key verification failed", { provider, error });
    return { success: false, error };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- test/main/agentPresenter.test.ts`

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/presenters/agent.presenter.d.ts src/main/presenter/agentPresenter.ts test/main/agentPresenter.test.ts
git commit -m "feat(agent): add verifyApiKey for onboarding API validation"
```

---

### Task 2: OnboardingWizard container + WelcomeStep

**Files:**
- Create: `src/renderer/src/components/onboarding/OnboardingWizard.vue`
- Create: `src/renderer/src/components/onboarding/WelcomeStep.vue`
- Test: `test/renderer/components/OnboardingWizard.test.ts`

- [ ] **Step 1: Write the failing test for OnboardingWizard step navigation**

Create `test/renderer/components/OnboardingWizard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn(async () => null);

;(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import OnboardingWizard from "@/components/onboarding/OnboardingWizard.vue";

describe("OnboardingWizard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  it("renders WelcomeStep as the first step", () => {
    const wrapper = mount(OnboardingWizard);
    expect(wrapper.text()).toContain("Slime");
    expect(wrapper.find('[data-testid="welcome-step"]').exists()).toBe(true);
  });

  it("navigates to ProviderStep when clicking next on WelcomeStep", async () => {
    const wrapper = mount(OnboardingWizard);
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="provider-step"]').exists()).toBe(true);
  });

  it("emits done event on completion", async () => {
    const wrapper = mount(OnboardingWizard);
    // Step 0 -> 1 (welcome -> provider)
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    // Step 1 -> 2 (provider -> verify) — fill in required fields first
    const apiKeyInput = wrapper.find('[data-testid="onboard-api-key"]');
    await apiKeyInput.setValue("sk-test-key");
    // Mock verify to succeed
    mockInvoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (args[1] === "verifyApiKey") return { success: true, modelName: "test-model" };
      return null;
    });
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    await flushPromises();
    // Step 2 -> 3 (verify success -> identity)
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    // Step 3 -> 4 (identity -> complete) — fill in user name
    const userNameInput = wrapper.find('[data-testid="onboard-username"]');
    await userNameInput.setValue("alice");
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    // Step 4: click complete
    mockInvoke.mockResolvedValue(true);
    await wrapper.find('[data-testid="complete-btn"]').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("done")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/OnboardingWizard.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Create WelcomeStep.vue**

Create `src/renderer/src/components/onboarding/WelcomeStep.vue`:

```vue
<script setup lang="ts">
defineEmits<{ next: [] }>();
</script>

<template>
  <div data-testid="welcome-step" class="flex flex-col items-center gap-5">
    <!-- Nucleus glow -->
    <div
      class="h-[72px] w-[72px] animate-pulse rounded-full"
      style="
        background: radial-gradient(circle, #a855f7 0%, #7c3aed 40%, transparent 70%);
        box-shadow:
          0 0 24px rgba(168, 85, 247, 0.4),
          0 0 48px rgba(168, 85, 247, 0.1);
      "
    />
    <h1 class="text-xl font-semibold text-slate-200">欢迎来到 Slime</h1>
    <p class="max-w-[320px] text-center text-sm leading-relaxed text-slate-400">
      我是一个能够自我进化的软件生命体。<br />
      通过 AI Agent，我可以理解你的需求，<br />
      修改自己的代码，然后重生为更好的版本。
    </p>
    <button
      data-testid="next-btn"
      class="mt-2 rounded-[20px] px-7 py-2.5 text-sm font-medium text-white"
      style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
      @click="$emit('next')"
    >
      初始化配置 →
    </button>
  </div>
</template>
```

- [ ] **Step 4: Create OnboardingWizard.vue**

Create `src/renderer/src/components/onboarding/OnboardingWizard.vue`:

```vue
<script setup lang="ts">
import { ref, reactive } from "vue";
import { useConfigStore } from "@/stores/config";
import { usePresenter } from "@/composables/usePresenter";
import WelcomeStep from "./WelcomeStep.vue";

const emit = defineEmits<{ done: [] }>();
const configStore = useConfigStore();
const agentPresenter = usePresenter("agentPresenter");

const currentStep = ref(0);
const TOTAL_STEPS = 5;

const config = reactive({
  provider: "anthropic" as "anthropic" | "openai",
  apiKey: "",
  model: "",
  baseUrl: "",
  userName: "",
});

const verifyResult = ref<{ success: boolean; error?: string; modelName?: string } | null>(null);
const verifying = ref(false);
const skippedVerify = ref(false);

function next() {
  if (currentStep.value < TOTAL_STEPS - 1) currentStep.value++;
}

function prev() {
  if (currentStep.value > 0) currentStep.value--;
}

async function runVerify() {
  verifying.value = true;
  verifyResult.value = null;
  try {
    const result = (await agentPresenter.verifyApiKey(
      config.provider,
      config.apiKey,
      config.model || defaultModel(),
      config.baseUrl || undefined,
    )) as { success: boolean; error?: string; modelName?: string };
    verifyResult.value = result;
  } catch {
    verifyResult.value = { success: false, error: "验证请求失败" };
  }
  verifying.value = false;
}

function defaultModel(): string {
  return config.provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o-mini";
}

async function complete() {
  await configStore.set("ai.provider", config.provider);
  await configStore.set("ai.apiKey", config.apiKey);
  await configStore.set("ai.model", config.model || defaultModel());
  if (config.baseUrl) await configStore.set("ai.baseUrl", config.baseUrl);
  await configStore.set("evolution.user", config.userName || "dev");
  await configStore.set("app.onboarded", true);
  emit("done");
}
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center"
    style="background: linear-gradient(135deg, #1a1025 0%, #0d0d1a 50%, #0a0a12 100%)"
  >
    <!-- Progress dots -->
    <div class="mb-8 flex gap-2.5">
      <div
        v-for="i in TOTAL_STEPS"
        :key="i"
        class="h-2.5 w-2.5 rounded-full transition-all"
        :class="
          i - 1 < currentStep
            ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]'
            : i - 1 === currentStep
              ? 'bg-violet-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]'
              : 'border-[1.5px] border-violet-900 bg-transparent'
        "
      />
    </div>

    <!-- Step content -->
    <WelcomeStep v-if="currentStep === 0" @next="next" />

    <!-- Steps 1-4 are added in subsequent tasks -->
    <div v-else-if="currentStep === 1" data-testid="provider-step">
      <!-- ProviderStep placeholder — Task 3 -->
    </div>
    <div v-else-if="currentStep === 2" data-testid="verify-step">
      <!-- VerifyStep placeholder — Task 4 -->
    </div>
    <div v-else-if="currentStep === 3" data-testid="identity-step">
      <!-- IdentityStep placeholder — Task 5 -->
    </div>
    <div v-else-if="currentStep === 4" data-testid="complete-step">
      <!-- CompleteStep placeholder — Task 6 -->
    </div>
  </div>
</template>
```

- [ ] **Step 5: Run test to verify first two tests pass**

Run: `pnpm test -- test/renderer/components/OnboardingWizard.test.ts`

Expected: First 2 tests PASS, third (full navigation) FAIL (placeholder steps — expected for now)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/onboarding/OnboardingWizard.vue src/renderer/src/components/onboarding/WelcomeStep.vue test/renderer/components/OnboardingWizard.test.ts
git commit -m "feat(onboarding): add OnboardingWizard container and WelcomeStep"
```

---

### Task 3: ProviderStep

**Files:**
- Create: `src/renderer/src/components/onboarding/ProviderStep.vue`
- Modify: `src/renderer/src/components/onboarding/OnboardingWizard.vue` (replace placeholder)

- [ ] **Step 1: Create ProviderStep.vue**

Create `src/renderer/src/components/onboarding/ProviderStep.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  baseUrl: string;
}>();

const emit = defineEmits<{
  "update:provider": [value: "anthropic" | "openai"];
  "update:apiKey": [value: string];
  "update:model": [value: string];
  "update:baseUrl": [value: string];
  next: [];
  prev: [];
}>();

const canNext = computed(() => props.apiKey.trim().length > 0);
</script>

<template>
  <div data-testid="provider-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <h2 class="text-[17px] font-semibold text-slate-200">配置 AI 服务</h2>
    <p class="text-sm text-slate-400">Slime 需要一个 AI 引擎来实现自我进化。</p>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">Provider</label>
      <select
        data-testid="onboard-provider"
        :value="provider"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-500/50"
        @change="emit('update:provider', ($event.target as HTMLSelectElement).value as any)"
      >
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="openai">OpenAI Compatible</option>
      </select>
    </div>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">API Key</label>
      <input
        data-testid="onboard-api-key"
        type="password"
        :value="apiKey"
        placeholder="sk-ant-api03-xxxxx..."
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)"
      />
      <a
        href="https://console.anthropic.com"
        target="_blank"
        class="text-[11px] text-violet-400 no-underline"
        >→ 获取 Anthropic API Key</a
      >
    </div>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">Model</label>
      <input
        data-testid="onboard-model"
        type="text"
        :value="model"
        :placeholder="provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:model', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400"
        >Base URL <span class="text-slate-600">(可选)</span></label
      >
      <input
        data-testid="onboard-base-url"
        type="text"
        :value="baseUrl"
        placeholder="https://api.anthropic.com"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:baseUrl', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="mt-2 flex gap-2.5">
      <button
        data-testid="prev-btn"
        class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
        @click="emit('prev')"
      >
        ← 返回
      </button>
      <button
        data-testid="next-btn"
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!canNext"
        @click="emit('next')"
      >
        验证连接 →
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Wire ProviderStep into OnboardingWizard.vue**

In `OnboardingWizard.vue` `<script setup>`, add:

```typescript
import ProviderStep from "./ProviderStep.vue";
```

Replace the `currentStep === 1` placeholder div with:

```vue
<ProviderStep
  v-else-if="currentStep === 1"
  v-model:provider="config.provider"
  v-model:api-key="config.apiKey"
  v-model:model="config.model"
  v-model:base-url="config.baseUrl"
  @next="currentStep = 2; runVerify()"
  @prev="prev"
/>
```

- [ ] **Step 3: Run tests**

Run: `pnpm test -- test/renderer/components/OnboardingWizard.test.ts`

Expected: First 2 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/onboarding/ProviderStep.vue src/renderer/src/components/onboarding/OnboardingWizard.vue
git commit -m "feat(onboarding): add ProviderStep with AI config form"
```

---

### Task 4: VerifyStep

**Files:**
- Create: `src/renderer/src/components/onboarding/VerifyStep.vue`
- Modify: `src/renderer/src/components/onboarding/OnboardingWizard.vue` (replace placeholder)
- Test: `test/renderer/components/VerifyStep.test.ts`

- [ ] **Step 1: Write the failing test for VerifyStep states**

Create `test/renderer/components/VerifyStep.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

;(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import VerifyStep from "@/components/onboarding/VerifyStep.vue";

describe("VerifyStep", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows loading state when verifying", () => {
    const wrapper = mount(VerifyStep, {
      props: { verifying: true, result: null, skipped: false },
    });
    expect(wrapper.find('[data-testid="verify-loading"]').exists()).toBe(true);
  });

  it("shows success state and next button", () => {
    const wrapper = mount(VerifyStep, {
      props: {
        verifying: false,
        result: { success: true, modelName: "claude-sonnet-4-20250514" },
        skipped: false,
      },
    });
    expect(wrapper.find('[data-testid="verify-success"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("claude-sonnet-4-20250514");
    expect(wrapper.find('[data-testid="next-btn"]').exists()).toBe(true);
  });

  it("shows error state with retry and skip buttons", () => {
    const wrapper = mount(VerifyStep, {
      props: {
        verifying: false,
        result: { success: false, error: "Invalid API key" },
        skipped: false,
      },
    });
    expect(wrapper.find('[data-testid="verify-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Invalid API key");
    expect(wrapper.find('[data-testid="prev-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="skip-btn"]').exists()).toBe(true);
  });

  it("emits skip event when skip button clicked", async () => {
    const wrapper = mount(VerifyStep, {
      props: {
        verifying: false,
        result: { success: false, error: "fail" },
        skipped: false,
      },
    });
    await wrapper.find('[data-testid="skip-btn"]').trigger("click");
    expect(wrapper.emitted("skip")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/VerifyStep.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Create VerifyStep.vue**

Create `src/renderer/src/components/onboarding/VerifyStep.vue`:

```vue
<script setup lang="ts">
defineProps<{
  verifying: boolean;
  result: { success: boolean; error?: string; modelName?: string } | null;
  skipped: boolean;
}>();

defineEmits<{
  next: [];
  prev: [];
  skip: [];
  retry: [];
}>();
</script>

<template>
  <div data-testid="verify-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <!-- Loading -->
    <template v-if="verifying">
      <div
        data-testid="verify-loading"
        class="h-14 w-14 animate-pulse rounded-full border-2 border-violet-500/30 bg-violet-500/5"
        style="box-shadow: 0 0 20px rgba(168, 85, 247, 0.2)"
      />
      <h2 class="text-[17px] font-semibold text-slate-200">验证中...</h2>
      <p class="text-sm text-slate-400">正在连接 AI 服务</p>
    </template>

    <!-- Success -->
    <template v-else-if="result?.success">
      <div
        data-testid="verify-success"
        class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-500/30 bg-green-500/10 text-2xl"
        style="box-shadow: 0 0 20px rgba(34, 197, 94, 0.2)"
      >
        ✓
      </div>
      <h2 class="text-[17px] font-semibold text-slate-200">连接成功</h2>
      <p class="text-sm text-slate-400">
        API 服务已就绪<br />
        <span class="text-green-400">{{ result.modelName }}</span>
      </p>
      <button
        data-testid="next-btn"
        class="mt-2 rounded-[20px] px-7 py-2.5 text-sm font-medium text-white"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        @click="$emit('next')"
      >
        继续 →
      </button>
    </template>

    <!-- Error -->
    <template v-else-if="result && !result.success">
      <div
        data-testid="verify-error"
        class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-500/30 bg-red-500/10 text-2xl text-red-400"
      >
        ×
      </div>
      <h2 class="text-[17px] font-semibold text-slate-200">连接失败</h2>
      <p class="text-sm text-red-400">{{ result.error }}</p>
      <div class="mt-2 flex gap-2.5">
        <button
          data-testid="prev-btn"
          class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
          @click="$emit('prev')"
        >
          ← 返回修改
        </button>
        <button
          data-testid="skip-btn"
          class="rounded-[20px] border border-slate-600 bg-transparent px-6 py-2.5 text-sm text-slate-400"
          @click="$emit('skip')"
        >
          跳过验证
        </button>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Wire VerifyStep into OnboardingWizard.vue**

In `OnboardingWizard.vue` `<script setup>`, add:

```typescript
import VerifyStep from "./VerifyStep.vue";
```

Replace the `currentStep === 2` placeholder div with:

```vue
<VerifyStep
  v-else-if="currentStep === 2"
  :verifying="verifying"
  :result="verifyResult"
  :skipped="skippedVerify"
  @next="next"
  @prev="prev(); verifyResult = null"
  @skip="skippedVerify = true; next()"
  @retry="runVerify()"
/>
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- test/renderer/components/VerifyStep.test.ts`

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/onboarding/VerifyStep.vue src/renderer/src/components/onboarding/OnboardingWizard.vue test/renderer/components/VerifyStep.test.ts
git commit -m "feat(onboarding): add VerifyStep with loading/success/error states"
```

---

### Task 5: IdentityStep

**Files:**
- Create: `src/renderer/src/components/onboarding/IdentityStep.vue`
- Modify: `src/renderer/src/components/onboarding/OnboardingWizard.vue` (replace placeholder)
- Test: `test/renderer/components/IdentityStep.test.ts`

- [ ] **Step 1: Write the failing test for IdentityStep validation**

Create `test/renderer/components/IdentityStep.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

;(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import IdentityStep from "@/components/onboarding/IdentityStep.vue";

describe("IdentityStep", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows version preview when username is entered", () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: "alice" },
    });
    expect(wrapper.text()).toContain("egg-v0.1-alice");
  });

  it("disables next button when username is empty", () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: "" },
    });
    const btn = wrapper.find('[data-testid="next-btn"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows validation error for special characters", async () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: "" },
    });
    const input = wrapper.find('[data-testid="onboard-username"]');
    await input.setValue("bad user!");
    expect(wrapper.text()).toContain("只允许");
  });

  it("accepts valid usernames with letters, numbers, hyphens, underscores", async () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: "" },
    });
    const input = wrapper.find('[data-testid="onboard-username"]');
    await input.setValue("alice_2024-test");
    expect(wrapper.find('[data-testid="validation-error"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/IdentityStep.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Create IdentityStep.vue**

Create `src/renderer/src/components/onboarding/IdentityStep.vue`:

```vue
<script setup lang="ts">
import { ref, computed, watch } from "vue";

const props = defineProps<{
  userName: string;
}>();

const emit = defineEmits<{
  "update:userName": [value: string];
  next: [];
  prev: [];
}>();

const localName = ref(props.userName);
const VALID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const validationError = computed(() => {
  if (!localName.value) return null;
  if (!VALID_PATTERN.test(localName.value)) return "只允许字母、数字、下划线和连字符";
  return null;
});

const canNext = computed(() => localName.value.trim().length > 0 && !validationError.value);

watch(localName, (val) => emit("update:userName", val));
</script>

<template>
  <div data-testid="identity-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <h2 class="text-[17px] font-semibold text-slate-200">你是谁？</h2>
    <p class="text-sm text-slate-400">设置你的标识，它会出现在每次进化的版本号中。</p>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">用户标识</label>
      <input
        v-model="localName"
        data-testid="onboard-username"
        type="text"
        placeholder="alice"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
      />
      <p v-if="validationError" data-testid="validation-error" class="text-xs text-red-400">
        {{ validationError }}
      </p>
      <p v-else-if="localName" class="text-[11px] text-slate-500">
        版本号示例: <span class="text-violet-400">egg-v0.1-{{ localName }}.1</span>
      </p>
    </div>

    <div class="mt-2 flex gap-2.5">
      <button
        data-testid="prev-btn"
        class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
        @click="emit('prev')"
      >
        ← 返回
      </button>
      <button
        data-testid="next-btn"
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!canNext"
        @click="emit('next')"
      >
        完成 →
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Wire IdentityStep into OnboardingWizard.vue**

In `OnboardingWizard.vue` `<script setup>`, add:

```typescript
import IdentityStep from "./IdentityStep.vue";
```

Replace the `currentStep === 3` placeholder div with:

```vue
<IdentityStep
  v-else-if="currentStep === 3"
  v-model:user-name="config.userName"
  @next="next"
  @prev="prev"
/>
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- test/renderer/components/IdentityStep.test.ts`

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/onboarding/IdentityStep.vue src/renderer/src/components/onboarding/OnboardingWizard.vue test/renderer/components/IdentityStep.test.ts
git commit -m "feat(onboarding): add IdentityStep with username validation"
```

---

### Task 6: CompleteStep

**Files:**
- Create: `src/renderer/src/components/onboarding/CompleteStep.vue`
- Modify: `src/renderer/src/components/onboarding/OnboardingWizard.vue` (replace placeholder)

- [ ] **Step 1: Create CompleteStep.vue**

Create `src/renderer/src/components/onboarding/CompleteStep.vue`:

```vue
<script setup lang="ts">
defineProps<{
  provider: string;
  model: string;
  userName: string;
  skippedVerify: boolean;
}>();

defineEmits<{ complete: [] }>();
</script>

<template>
  <div data-testid="complete-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <!-- Green nucleus -->
    <div
      class="h-14 w-14 rounded-full"
      style="
        background: radial-gradient(circle, #22c55e 0%, #16a34a 50%, transparent 80%);
        box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
      "
    />
    <h2 class="text-[17px] font-semibold text-slate-200">准备就绪</h2>
    <p class="text-sm text-slate-400">一切配置完成，Slime 即将苏醒。</p>

    <!-- Warning if verify was skipped -->
    <div
      v-if="skippedVerify"
      class="w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400"
    >
      API 验证已跳过，请确保配置正确。
    </div>

    <!-- Summary -->
    <div class="w-full">
      <div class="flex items-center justify-between border-b border-violet-500/10 py-2.5">
        <span class="text-sm text-slate-500">AI Provider</span>
        <span class="text-sm font-medium text-slate-200">{{
          provider === "anthropic" ? "Anthropic" : "OpenAI"
        }}</span>
      </div>
      <div class="flex items-center justify-between border-b border-violet-500/10 py-2.5">
        <span class="text-sm text-slate-500">Model</span>
        <span class="text-sm font-medium text-slate-200">{{ model || "(默认)" }}</span>
      </div>
      <div class="flex items-center justify-between border-b border-violet-500/10 py-2.5">
        <span class="text-sm text-slate-500">用户标识</span>
        <span class="text-sm font-medium text-violet-400">{{ userName || "dev" }}</span>
      </div>
      <div class="flex items-center justify-between py-2.5">
        <span class="text-sm text-slate-500">版本号格式</span>
        <span class="text-sm font-medium text-slate-200"
          >egg-v0.1-{{ userName || "dev" }}.N</span
        >
      </div>
    </div>

    <button
      data-testid="complete-btn"
      class="mt-2 rounded-[20px] px-7 py-2.5 text-sm font-medium text-white"
      style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
      @click="$emit('complete')"
    >
      进入 Slime →
    </button>
  </div>
</template>
```

- [ ] **Step 2: Wire CompleteStep into OnboardingWizard.vue**

In `OnboardingWizard.vue` `<script setup>`, add:

```typescript
import CompleteStep from "./CompleteStep.vue";
```

Replace the `currentStep === 4` placeholder div with:

```vue
<CompleteStep
  v-else-if="currentStep === 4"
  :provider="config.provider"
  :model="config.model"
  :user-name="config.userName"
  :skipped-verify="skippedVerify"
  @complete="complete"
/>
```

- [ ] **Step 3: Run the full OnboardingWizard test**

Run: `pnpm test -- test/renderer/components/OnboardingWizard.test.ts`

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/onboarding/CompleteStep.vue src/renderer/src/components/onboarding/OnboardingWizard.vue
git commit -m "feat(onboarding): add CompleteStep with config summary"
```

---

### Task 7: Integrate OnboardingWizard into EvolutionCenter

**Files:**
- Modify: `src/renderer/src/views/EvolutionCenter.vue`
- Test: `test/renderer/views/EvolutionCenter.test.ts`

- [ ] **Step 1: Write the failing test for onboarding condition in EvolutionCenter**

Create `test/renderer/views/EvolutionCenter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn();

;(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import EvolutionCenter from "@/views/EvolutionCenter.vue";

describe("EvolutionCenter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
  });

  it("shows OnboardingWizard when app.onboarded is falsy", async () => {
    mockInvoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "presenter:call" && args[0] === "configPresenter" && args[1] === "get") {
        if (args[2] === "app.onboarded") return null;
      }
      if (channel === "recovery:check") return null;
      return null;
    });
    const wrapper = mount(EvolutionCenter);
    await flushPromises();
    expect(wrapper.findComponent({ name: "OnboardingWizard" }).exists()).toBe(true);
  });

  it("skips onboarding when app.onboarded is true", async () => {
    mockInvoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "presenter:call" && args[0] === "configPresenter" && args[1] === "get") {
        if (args[2] === "app.onboarded") return true;
      }
      if (channel === "presenter:call" && args[0] === "workspacePresenter" && args[1] === "needsInit") {
        return false;
      }
      if (channel === "recovery:check") return null;
      return null;
    });
    const wrapper = mount(EvolutionCenter);
    await flushPromises();
    expect(wrapper.findComponent({ name: "OnboardingWizard" }).exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/views/EvolutionCenter.test.ts`

Expected: FAIL — no onboarding condition exists yet

- [ ] **Step 3: Modify EvolutionCenter.vue to add onboarding condition**

In `src/renderer/src/views/EvolutionCenter.vue`:

Add import at the top of `<script setup>`:

```typescript
import OnboardingWizard from "../components/onboarding/OnboardingWizard.vue";
```

Add state after the existing `needsWorkspaceInit` ref:

```typescript
const configPresenter = usePresenter("configPresenter");
const needsOnboarding = ref<boolean | null>(null);
```

Replace the first `onMounted` (the one that sets `needsWorkspaceInit`) with:

```typescript
onMounted(async () => {
  const onboarded = await configPresenter.get("app.onboarded");
  needsOnboarding.value = !onboarded;
  if (!needsOnboarding.value) {
    needsWorkspaceInit.value = await workspacePresenter.needsInit();
  }
});
```

Add handler:

```typescript
async function onOnboardingDone() {
  needsOnboarding.value = false;
  needsWorkspaceInit.value = await workspacePresenter.needsInit();
}
```

Update the `<template>` — change loading condition and insert onboarding:

```html
<template>
  <!-- Loading -->
  <div
    v-if="needsOnboarding === null"
    class="flex h-full items-center justify-center bg-background"
  >
    <div class="text-muted-foreground">加载中...</div>
  </div>

  <!-- Onboarding -->
  <OnboardingWizard v-else-if="needsOnboarding" @done="onOnboardingDone" />

  <!-- Workspace setup -->
  <WorkspaceSetup v-else-if="needsWorkspaceInit" @ready="onWorkspaceReady" />

  <!-- Main layout -->
  <div v-else class="flex h-full flex-col bg-sidebar">
    <!-- ... existing main layout code unchanged ... -->
  </div>
</template>
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- test/renderer/views/EvolutionCenter.test.ts`

Expected: PASS

- [ ] **Step 5: Run all tests to confirm no regressions**

Run: `pnpm test`

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/views/EvolutionCenter.vue test/renderer/views/EvolutionCenter.test.ts
git commit -m "feat(onboarding): integrate wizard into EvolutionCenter render chain"
```

---

### Task 8: Format, lint, typecheck, build

**Files:**
- All modified files

- [ ] **Step 1: Run formatter**

Run: `pnpm run format`

- [ ] **Step 2: Run linter**

Run: `pnpm run lint`

Fix any issues.

- [ ] **Step 3: Run type checker**

Run: `pnpm run typecheck`

Fix any type errors. Watch for:
- `IAgentPresenter` interface — ensure `verifyApiKey` matches implementation
- `usePresenter("agentPresenter")` proxy — `verifyApiKey` args must match interface

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`

Expected: ALL PASS

- [ ] **Step 5: Run build**

Run: `pnpm run build`

Expected: BUILD SUCCESS

- [ ] **Step 6: Commit any format/lint fixes**

```bash
git add -A
git commit -m "style: format and lint onboarding components"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Onboarding Wizard to architecture docs**

Add after the "Evolution StatusBar UI" section in the "已实现 Presenter" table area of `CLAUDE.md`:

```markdown
### Onboarding Wizard

- 条件渲染链: `loading → onboarding → WorkspaceSetup → main layout`
- 判断: `configPresenter.get("app.onboarded")` 为 falsy 显示向导
- 5 步: Welcome → ProviderStep → VerifyStep → IdentityStep → CompleteStep
- API 验证: `agentPresenter.verifyApiKey()` 使用 `generateText` 发送 maxTokens:1 请求
- 完成后写入: `ai.provider`, `ai.apiKey`, `ai.model`, `ai.baseUrl`, `evolution.user`, `app.onboarded`
- 组件: `src/renderer/src/components/onboarding/`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add onboarding wizard to architecture docs"
```
