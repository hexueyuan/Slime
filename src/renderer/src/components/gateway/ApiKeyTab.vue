<script setup lang="ts">
import { ref } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import ApiKeyManagerDialog from "./ApiKeyManagerDialog.vue";
import GatewayResourceCard from "./GatewayResourceCard.vue";
import SlimeButton from "@/components/ui/SlimeButton.vue";

const store = useGatewayStore();

const managerOpen = ref(false);

function maskKey(key: string) {
  if (key.length === 0) return "...";
  if (key.length <= 4) return "...";
  if (key.length <= 8) return `${key.slice(0, 2)}...`;
  const candidate = `${key.slice(0, 4)}...${key.slice(-4)}`;
  return candidate === key ? "********" : candidate;
}

function expiresLabel(expiresAt?: string) {
  if (!expiresAt) return "永不过期";
  return expiresAt.slice(0, 10);
}
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
      <SlimeButton data-testid="open-key-manager" size="md" @click="managerOpen = true">
        管理密钥
      </SlimeButton>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="store.apiKeys.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="apiKey in store.apiKeys" :key="apiKey.id" data-testid="api-key-resource-card">
          <GatewayResourceCard
            kind="key"
            eyebrow="API Key"
            :title="apiKey.name"
            :subtitle="maskKey(apiKey.key)"
            :badges="[
              {
                label: apiKey.enabled ? '启用' : '停用',
                variant: apiKey.enabled ? 'success' : 'neutral',
              },
              ...(apiKey.isInternal ? [{ label: 'internal', variant: 'neutral' as const }] : []),
            ]"
            :stats="[
              { label: '状态', value: apiKey.enabled ? '启用' : '停用' },
              { label: '过期', value: expiresLabel(apiKey.expiresAt) },
            ]"
            detail-label="Key"
            :detail-value="maskKey(apiKey.key)"
          />
        </div>
      </div>
      <div
        v-else
        class="flex min-h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-control)] text-sm text-[var(--color-text-muted)]"
      >
        暂无密钥
        <SlimeButton class="ml-3" size="md" @click="managerOpen = true"> 新建密钥 </SlimeButton>
      </div>
    </div>

    <ApiKeyManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
