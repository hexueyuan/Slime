<script setup lang="ts">
import { ref } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import ApiKeyManagerDialog from "./ApiKeyManagerDialog.vue";
import GatewayApiKeyCard from "./GatewayApiKeyCard.vue";

const store = useGatewayStore();

const managerOpen = ref(false);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4">
    <div class="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-medium text-[var(--color-text-primary)]">密钥</h3>
        <p class="mt-1 text-xs text-[var(--color-text-muted)]">
          {{ store.apiKeys.length }} 个访问密钥
        </p>
      </div>
      <button
        type="button"
        data-testid="open-key-manager"
        class="inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
        @click="managerOpen = true"
      >
        管理密钥
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="store.apiKeys.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="apiKey in store.apiKeys" :key="apiKey.id" data-testid="api-key-resource-card">
          <GatewayApiKeyCard :api-key="apiKey" :actions="false" />
        </div>
      </div>
      <div
        v-else
        class="flex min-h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-control)] text-sm text-[var(--color-text-muted)]"
      >
        暂无密钥
        <button
          type="button"
          class="ml-3 inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-control-hover)]"
          @click="managerOpen = true"
        >
          新建密钥
        </button>
      </div>
    </div>

    <ApiKeyManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
