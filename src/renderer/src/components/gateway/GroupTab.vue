<script setup lang="ts">
import { ref, watch } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GroupManagerDialog from "./GroupManagerDialog.vue";
import GatewayGroupCard from "./GatewayGroupCard.vue";
import type { GroupItem } from "@shared/types/gateway";

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const managerOpen = ref(false);
const groupSummaries = ref<Map<number, { itemCount: number; channelSummary: string }>>(new Map());

function openManager() {
  managerOpen.value = true;
}

function buildGroupSummary(items: GroupItem[]) {
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const labels = sorted.slice(0, 3).map((item) => {
    const channel = store.channels.find((candidate) => candidate.id === item.channelId);
    return `${channel?.name ?? `#${item.channelId}`} / ${item.modelName}`;
  });
  if (!labels.length) return "暂无渠道";
  return labels.length < sorted.length
    ? `${labels.join("、")} 等 ${sorted.length} 项`
    : labels.join("、");
}

async function loadGroupSummaries() {
  if (!store.groups.length) {
    groupSummaries.value = new Map();
    return;
  }

  const entries = await Promise.all(
    store.groups.map(async (group) => {
      const items: GroupItem[] = (await gw.listGroupItems(group.id)) ?? [];
      return [
        group.id,
        {
          itemCount: items.length,
          channelSummary: buildGroupSummary(items),
        },
      ] as const;
    }),
  );
  groupSummaries.value = new Map(entries);
}

function groupSummary(groupId: number) {
  return groupSummaries.value.get(groupId) ?? { itemCount: null, channelSummary: "加载中..." };
}

watch(
  () => store.groups.map((group) => `${group.id}:${group.updatedAt}`).join("|"),
  () => {
    void loadGroupSummaries();
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4">
    <div class="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-medium text-[var(--color-text-primary)]">分组</h3>
        <p class="mt-1 text-xs text-[var(--color-text-muted)]">
          {{ store.groups.length }} 个分组路由
        </p>
      </div>
      <button
        type="button"
        data-testid="open-group-manager"
        class="inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
        @click="openManager"
      >
        管理分组
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="store.groups.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="group in store.groups" :key="group.id" data-testid="group-route-card">
          <GatewayGroupCard
            :group="group"
            :item-count="groupSummary(group.id).itemCount"
            :channel-summary="groupSummary(group.id).channelSummary"
            :actions="false"
          />
        </div>
      </div>
      <div
        v-else
        class="flex min-h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-control)] text-sm text-[var(--color-text-muted)]"
      >
        暂无分组
        <button
          type="button"
          class="ml-3 inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-control-hover)]"
          @click="openManager"
        >
          新建分组
        </button>
      </div>
    </div>

    <GroupManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
