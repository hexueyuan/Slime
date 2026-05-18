<script setup lang="ts">
import { computed, ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GatewayManagerDialog from "./GatewayManagerDialog.vue";
import GatewayApiKeyCard from "./GatewayApiKeyCard.vue";
import type { GatewayApiKey } from "@shared/types/gateway";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showCreate = ref(false);
const form = ref({ name: "" });
const revealedKey = ref<string | null>(null);
const copiedKeyId = ref<number | "revealed" | null>(null);
const error = ref("");

const enabledCount = computed(() => store.apiKeys.filter((apiKey) => apiKey.enabled).length);

function openCreate() {
  error.value = "";
  form.value = { name: "" };
  showCreate.value = true;
}

async function createKey() {
  const name = form.value.name.trim();
  if (!name) return;

  error.value = "";
  const created = await gw.createApiKey({ name });
  revealedKey.value = created.key;
  form.value = { name: "" };
  showCreate.value = false;
  await store.loadApiKeys();
}

async function copyKey(apiKey: GatewayApiKey) {
  const key = apiKey.key === revealedKey.value ? revealedKey.value : apiKey.key;
  await navigator.clipboard.writeText(key);
  copiedKeyId.value = apiKey.id;
  setTimeout(() => {
    if (copiedKeyId.value === apiKey.id) {
      copiedKeyId.value = null;
    }
  }, 1500);
}

async function copyRevealedKey() {
  if (!revealedKey.value) return;

  await navigator.clipboard.writeText(revealedKey.value);
  copiedKeyId.value = "revealed";
  setTimeout(() => {
    if (copiedKeyId.value === "revealed") {
      copiedKeyId.value = null;
    }
  }, 1500);
}

async function toggleEnabled(apiKey: GatewayApiKey) {
  await gw.updateApiKey(apiKey.id, { enabled: !apiKey.enabled });
  await store.loadApiKeys();
}

async function deleteKey(apiKey: GatewayApiKey) {
  if (apiKey.isInternal) return;
  if (!window.confirm(`确认删除密钥「${apiKey.name}」？`)) return;

  error.value = "";
  try {
    await gw.deleteApiKey(apiKey.id);
    await store.loadApiKeys();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function revealedFor(apiKey: GatewayApiKey) {
  return apiKey.key === revealedKey.value ? revealedKey.value : null;
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
        type="button"
        data-testid="open-key-create"
        class="inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
        @click="openCreate"
      >
        + 新增密钥
      </button>
    </template>

    <div class="space-y-4">
      <form
        v-if="showCreate"
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
        @submit.prevent="createKey"
      >
        <label class="block">
          <span class="text-xs text-[var(--color-text-muted)]">名称</span>
          <input
            v-model="form.name"
            data-testid="key-name-input"
            class="mt-1 h-8 w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-disabled)] focus:border-[var(--color-accent-brand)]"
            placeholder="web-client"
          />
        </label>

        <div class="mt-3 flex justify-end gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-transparent px-3 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
            @click="showCreate = false"
          >
            取消
          </button>
          <button
            type="submit"
            data-testid="create-key-submit"
            class="inline-flex h-8 items-center rounded-md border border-[var(--color-accent-brand)] bg-[var(--color-accent-brand)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)] disabled:cursor-not-allowed disabled:border-[var(--color-border-subtle)] disabled:bg-[var(--color-control)] disabled:text-[var(--color-text-disabled)]"
            :disabled="!form.name.trim()"
            @click.prevent="createKey"
          >
            创建
          </button>
        </div>
      </form>

      <section
        v-if="revealedKey"
        class="rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium text-[var(--color-text-primary)]">密钥已创建</p>
            <p class="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
              请立即复制并妥善保管。关闭后将无法再次查看完整密钥。
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-2 py-1 text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-control-hover)]"
            @click="copyRevealedKey"
          >
            {{ copiedKeyId === "revealed" ? "已复制" : "复制" }}
          </button>
        </div>
        <code
          class="mt-3 block break-all rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-input)] px-2 py-1.5 font-mono text-xs text-[var(--color-text-primary)]"
        >
          {{ revealedKey }}
        </code>
      </section>

      <p v-if="error" class="text-xs text-[var(--color-danger)]">{{ error }}</p>

      <div v-if="store.apiKeys.length" class="grid gap-3 md:grid-cols-2">
        <GatewayApiKeyCard
          v-for="apiKey in store.apiKeys"
          :key="apiKey.id"
          :api-key="apiKey"
          :revealed-key="revealedFor(apiKey)"
          :copied="copiedKeyId === apiKey.id"
          @copy="copyKey"
          @toggle-enabled="toggleEnabled"
          @delete="deleteKey"
        />
      </div>

      <div
        v-else
        class="flex min-h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-control)] text-sm text-[var(--color-text-muted)]"
      >
        暂无密钥
      </div>
    </div>
  </GatewayManagerDialog>
</template>
