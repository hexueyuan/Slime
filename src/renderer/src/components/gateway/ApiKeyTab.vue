<script setup lang="ts">
import { ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { GatewayApiKey } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showEditor = ref(false);
const justCreatedKey = ref<string | null>(null);
const copied = ref(false);

const form = ref({
  name: "",
  expiresAt: "",
  maxCost: undefined as number | undefined,
  allowedModels: "",
});

function openCreate() {
  justCreatedKey.value = null;
  form.value = { name: "", expiresAt: "", maxCost: undefined, allowedModels: "" };
  showEditor.value = true;
}

async function save() {
  const allowedModels = form.value.allowedModels
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ak = await gw.createApiKey({
    name: form.value.name,
    expiresAt: form.value.expiresAt || undefined,
    maxCost: form.value.maxCost,
    allowedModels: allowedModels.length ? allowedModels : undefined,
  });

  justCreatedKey.value = ak.key;
  await store.loadApiKeys();
}

async function toggleEnabled(ak: GatewayApiKey) {
  await gw.updateApiKey(ak.id, { enabled: !ak.enabled });
  await store.loadApiKeys();
}

async function deleteKey(id: number) {
  await gw.deleteApiKey(id);
  await store.loadApiKeys();
}

async function copyKey(key: string) {
  await navigator.clipboard.writeText(key);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function maskKey(key: string): string {
  return key.length > 8 ? key.slice(0, 8) + "..." : key;
}

function formatDate(d?: string): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString();
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-medium">接入 Key</h3>
      <button
        class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
        @click="openCreate"
      >
        + 新增 Key
      </button>
    </div>

    <!-- Key list -->
    <div v-if="store.apiKeys.length" class="space-y-2">
      <div
        v-for="ak in store.apiKeys"
        :key="ak.id"
        class="flex items-center justify-between rounded-lg bg-muted/30 p-3"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ ak.name }}</span>
            <span
              :class="[
                'inline-block h-1.5 w-1.5 rounded-full',
                ak.enabled ? 'bg-green-500' : 'bg-neutral-500',
              ]"
            />
            <span
              v-if="ak.isInternal"
              class="rounded bg-violet-500/20 px-1.5 py-0.5 text-xs text-violet-400"
            >
              内置
            </span>
          </div>
          <div class="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span class="font-mono">{{ maskKey(ak.key) }}</span>
            <span v-if="ak.expiresAt">过期: {{ formatDate(ak.expiresAt) }}</span>
            <span v-if="ak.maxCost != null">上限: ${{ ak.maxCost }}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="复制 Key"
            @click="copyKey(ak.key)"
          >
            <Icon icon="lucide:copy" class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            :title="ak.enabled ? '禁用' : '启用'"
            @click="toggleEnabled(ak)"
          >
            <Icon
              :icon="ak.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'"
              class="h-3.5 w-3.5"
            />
          </button>
          <button
            v-if="!ak.isInternal"
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
            title="删除"
            @click="deleteKey(ak.id)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="py-12 text-center text-sm text-muted-foreground">暂无 Key</div>

    <!-- Editor overlay -->
    <Teleport to="body">
      <div v-if="showEditor" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showEditor = false" />
        <div
          class="relative max-h-[80vh] w-[480px] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl"
        >
          <!-- Created key display -->
          <template v-if="justCreatedKey">
            <h3 class="mb-3 text-sm font-medium">Key 已创建</h3>
            <p class="mb-2 text-xs text-muted-foreground">
              请立即复制，关闭后将无法再次查看完整 Key。
            </p>
            <div class="mb-4 flex items-center gap-2 rounded border border-border bg-muted/50 p-2">
              <code class="min-w-0 flex-1 break-all text-xs">{{ justCreatedKey }}</code>
              <button
                class="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
                @click="copyKey(justCreatedKey!)"
              >
                <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
              </button>
            </div>
            <div class="flex justify-end">
              <button
                class="rounded bg-violet-600 px-4 py-1.5 text-xs text-white transition-colors hover:bg-violet-500"
                @click="showEditor = false"
              >
                关闭
              </button>
            </div>
          </template>

          <!-- Create form -->
          <template v-else>
            <h3 class="mb-4 text-sm font-medium">新增 Key</h3>

            <label class="mb-3 block">
              <span class="mb-1 block text-xs text-muted-foreground">名称</span>
              <input
                v-model="form.name"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="My Key"
              />
            </label>

            <label class="mb-3 block">
              <span class="mb-1 block text-xs text-muted-foreground">过期时间（可选）</span>
              <input
                v-model="form.expiresAt"
                type="date"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              />
            </label>

            <label class="mb-3 block">
              <span class="mb-1 block text-xs text-muted-foreground">费用上限（可选）</span>
              <input
                v-model.number="form.maxCost"
                type="number"
                step="0.01"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="100.00"
              />
            </label>

            <label class="mb-4 block">
              <span class="mb-1 block text-xs text-muted-foreground"
                >模型白名单（可选，逗号分隔）</span
              >
              <input
                v-model="form.allowedModels"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="gpt-4o, claude-3-opus"
              />
            </label>

            <div class="flex justify-end gap-2">
              <button
                class="rounded px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="showEditor = false"
              >
                取消
              </button>
              <button
                class="rounded bg-violet-600 px-4 py-1.5 text-xs text-white transition-colors hover:bg-violet-500"
                @click="save"
              >
                创建
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>
