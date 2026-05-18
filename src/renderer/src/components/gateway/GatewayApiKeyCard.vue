<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import type { GatewayApiKey } from "@shared/types/gateway";

const props = withDefaults(
  defineProps<{
    apiKey: GatewayApiKey;
    revealedKey?: string | null;
    copied?: boolean;
  }>(),
  {
    revealedKey: null,
    copied: false,
  },
);

const emit = defineEmits<{
  copy: [apiKey: GatewayApiKey];
  "toggle-enabled": [apiKey: GatewayApiKey];
  delete: [apiKey: GatewayApiKey];
}>();

const displayKey = computed(() => props.revealedKey || maskKey(props.apiKey.key));

function maskKey(key: string) {
  if (key.length === 0) return "...";
  if (key.length <= 4) return `${key.slice(0, 1)}...`;
  if (key.length <= 8) return `${key.slice(0, 2)}...`;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function emitCopy() {
  emit("copy", props.apiKey);
}

function emitToggleEnabled() {
  emit("toggle-enabled", props.apiKey);
}

function emitDelete() {
  emit("delete", props.apiKey);
}
</script>

<template>
  <article
    :class="[
      'min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3 transition-colors',
      'hover:border-[var(--color-border-strong)]',
      !apiKey.enabled && 'opacity-70',
    ]"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <div class="flex min-w-0 items-center gap-2">
          <h3 class="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
            {{ apiKey.name }}
          </h3>
          <span
            v-if="apiKey.isInternal"
            class="shrink-0 rounded-[var(--radius-xs)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)]"
          >
            internal
          </span>
        </div>
        <div class="flex min-w-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span
            :class="[
              'h-2 w-2 shrink-0 rounded-full',
              apiKey.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-disabled)]',
            ]"
          />
          <span>{{ apiKey.enabled ? "启用" : "停用" }}</span>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          data-testid="key-copy"
          title="复制密钥"
          aria-label="复制密钥"
          class="inline-grid h-7 w-7 place-items-center rounded-md border border-transparent bg-transparent text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
          @click="emitCopy"
        >
          <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          data-testid="key-toggle-enabled"
          title="切换密钥状态"
          aria-label="切换密钥状态"
          :aria-pressed="apiKey.enabled"
          class="inline-grid h-7 w-7 place-items-center rounded-md border border-transparent bg-transparent text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
          @click="emitToggleEnabled"
        >
          <Icon
            :icon="apiKey.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'"
            class="h-4 w-4"
          />
        </button>
        <button
          v-if="!apiKey.isInternal"
          type="button"
          data-testid="key-delete"
          title="删除密钥"
          aria-label="删除密钥"
          class="inline-grid h-7 w-7 place-items-center rounded-md border border-transparent bg-transparent text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
          @click="emitDelete"
        >
          <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div
      class="mt-3 min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-2 py-1.5"
    >
      <p class="truncate text-[11px] text-[var(--color-text-muted)]">Key</p>
      <p class="truncate font-mono text-xs font-medium text-[var(--color-text-primary)]">
        {{ displayKey }}
      </p>
    </div>
  </article>
</template>
