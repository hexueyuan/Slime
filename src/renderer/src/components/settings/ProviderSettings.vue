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
      <label class="text-xs text-muted-foreground"
        >Base URL <span class="text-muted-foreground/50">(可选)</span></label
      >
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
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
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
