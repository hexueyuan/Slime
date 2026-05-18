<script setup lang="ts">
import { computed, ref } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import GroupManagerDialog from "./GroupManagerDialog.vue";

const store = useGatewayStore();

const managerOpen = ref(false);
const builtinCount = computed(() => store.groups.filter((group) => group.isBuiltin).length);
const customCount = computed(() => store.groups.length - builtinCount.value);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4">
    <div class="grid shrink-0 gap-3 md:grid-cols-3">
      <section
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3"
      >
        <p class="text-xs text-[var(--color-text-muted)]">分组</p>
        <p class="mt-2 text-2xl font-medium text-[var(--color-text-primary)]">
          {{ store.groups.length }}
        </p>
      </section>

      <section
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3"
      >
        <p class="text-xs text-[var(--color-text-muted)]">内置</p>
        <p class="mt-2 text-2xl font-medium text-[var(--color-text-primary)]">
          {{ builtinCount }}
        </p>
      </section>

      <section
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3"
      >
        <p class="text-xs text-[var(--color-text-muted)]">自定义</p>
        <p class="mt-2 text-2xl font-medium text-[var(--color-text-primary)]">
          {{ customCount }}
        </p>
      </section>
    </div>

    <div class="flex min-h-0 flex-1 items-center justify-center">
      <div
        class="flex w-full max-w-sm flex-col items-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] px-5 py-6 text-center"
      >
        <h3 class="text-sm font-medium text-[var(--color-text-primary)]">分组路由管理</h3>
        <p class="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
          维护对外模型分组、均衡策略和渠道成员。
        </p>
        <button
          type="button"
          data-testid="open-group-manager"
          class="mt-4 inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
          @click="managerOpen = true"
        >
          管理分组
        </button>
      </div>
    </div>

    <GroupManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
