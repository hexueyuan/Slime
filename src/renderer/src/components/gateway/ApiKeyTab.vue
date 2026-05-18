<script setup lang="ts">
import { computed, ref } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import ApiKeyManagerDialog from "./ApiKeyManagerDialog.vue";

const store = useGatewayStore();

const managerOpen = ref(false);
const enabledCount = computed(() => store.apiKeys.filter((apiKey) => apiKey.enabled).length);
const internalCount = computed(() => store.apiKeys.filter((apiKey) => apiKey.isInternal).length);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4">
    <div class="grid shrink-0 gap-3 md:grid-cols-3">
      <section
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3"
      >
        <p class="text-xs text-[var(--color-text-muted)]">密钥</p>
        <p class="mt-2 text-2xl font-medium text-[var(--color-text-primary)]">
          {{ store.apiKeys.length }}
        </p>
      </section>

      <section
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3"
      >
        <p class="text-xs text-[var(--color-text-muted)]">启用</p>
        <p class="mt-2 text-2xl font-medium text-[var(--color-text-primary)]">
          {{ enabledCount }}
        </p>
      </section>

      <section
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3"
      >
        <p class="text-xs text-[var(--color-text-muted)]">内置</p>
        <p class="mt-2 text-2xl font-medium text-[var(--color-text-primary)]">
          {{ internalCount }}
        </p>
      </section>
    </div>

    <div class="flex min-h-0 flex-1 items-center justify-center">
      <div
        class="flex w-full max-w-sm flex-col items-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] px-5 py-6 text-center"
      >
        <h3 class="text-sm font-medium text-[var(--color-text-primary)]">API Key 管理</h3>
        <p class="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
          创建对外访问密钥，并管理启用状态与删除操作。
        </p>
        <button
          type="button"
          data-testid="open-key-manager"
          class="mt-4 inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
          @click="managerOpen = true"
        >
          管理密钥
        </button>
      </div>
    </div>

    <ApiKeyManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
