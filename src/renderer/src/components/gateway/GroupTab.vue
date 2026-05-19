<script setup lang="ts">
import { ref, watch } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GroupManagerDialog from "./GroupManagerDialog.vue";
import GatewayResourceCard from "./GatewayResourceCard.vue";
import SlimeButton from "@/components/ui/SlimeButton.vue";
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

function groupMemberCountLabel(groupId: number) {
  const itemCount = groupSummary(groupId).itemCount;
  return itemCount == null ? "-" : String(itemCount);
}

function groupMemberBadgeLabel(groupId: number) {
  const itemCount = groupSummary(groupId).itemCount;
  return itemCount == null ? "成员加载中" : `${itemCount} 渠道`;
}

function balanceModeLabel(mode: string) {
  const labels: Record<string, string> = {
    round_robin: "轮询",
    random: "随机",
    failover: "故障转移",
    weighted: "加权",
  };
  return labels[mode] ?? mode;
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
      <SlimeButton data-testid="open-group-manager" size="md" @click="openManager">
        管理分组
      </SlimeButton>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="store.groups.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="group in store.groups" :key="group.id" data-testid="group-route-card">
          <GatewayResourceCard
            kind="group"
            eyebrow="分组路由"
            :title="group.name"
            :subtitle="`${balanceModeLabel(group.balanceMode)}策略`"
            :badges="[
              {
                label: group.isBuiltin ? '内置' : '自定义',
                variant: group.isBuiltin ? 'neutral' : 'accent',
              },
              {
                label: groupMemberBadgeLabel(group.id),
                variant: 'neutral',
              },
            ]"
            :stats="[
              { label: '均衡策略', value: balanceModeLabel(group.balanceMode) },
              {
                label: '成员数量',
                value: groupMemberCountLabel(group.id),
              },
            ]"
            detail-label="渠道成员"
            :detail-value="groupSummary(group.id).channelSummary"
          />
        </div>
      </div>
      <div
        v-else
        class="flex min-h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-control)] text-sm text-[var(--color-text-muted)]"
      >
        暂无分组
        <SlimeButton class="ml-3" size="md" @click="openManager"> 新建分组 </SlimeButton>
      </div>
    </div>

    <GroupManagerDialog :open="managerOpen" @close="managerOpen = false" />
  </div>
</template>
