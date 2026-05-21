<script setup lang="ts">
import { computed } from "vue";
import SlimeResourceCard from "@/components/slime/SlimeResourceCard.vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";
import type { Group } from "@shared/types/gateway";

const props = withDefaults(
  defineProps<{
    group: Group;
    itemCount?: number | null;
    channelSummary: string;
    actions?: boolean;
  }>(),
  {
    actions: true,
  },
);

const emit = defineEmits<{
  edit: [group: Group];
  delete: [group: Group];
}>();

function emitEdit() {
  emit("edit", props.group);
}

function emitDelete() {
  emit("delete", props.group);
}

const itemCountLabel = computed(() =>
  props.itemCount == null ? "成员加载中" : `${props.itemCount} 渠道`,
);

const itemCountValue = computed(() => (props.itemCount == null ? "-" : String(props.itemCount)));

const badges = computed(() => [
  {
    label: props.group.isBuiltin ? "内置" : "自定义",
    variant: props.group.isBuiltin ? ("neutral" as const) : ("accent" as const),
  },
  {
    label: itemCountLabel.value,
    variant: "neutral" as const,
  },
]);

const stats = computed(() => [
  { label: "均衡策略", value: props.group.balanceMode },
  { label: "成员数量", value: itemCountValue.value },
]);
</script>

<template>
  <SlimeResourceCard
    kind="group"
    eyebrow="分组路由"
    :title="group.name"
    :subtitle="`${group.balanceMode} 策略`"
    :badges="badges"
    :stats="stats"
    detail-label="渠道"
    :detail-value="channelSummary || '暂无渠道'"
  >
    <template v-if="actions" #actions>
      <div class="flex shrink-0 items-center gap-1">
        <SlimeIconButton
          data-testid="group-edit"
          icon="lucide:pencil"
          title="编辑分组"
          size="sm"
          @click="emitEdit"
        />
        <SlimeIconButton
          v-if="!group.isBuiltin"
          data-testid="group-delete"
          icon="lucide:trash-2"
          title="删除分组"
          size="sm"
          variant="danger"
          @click="emitDelete"
        />
      </div>
    </template>
  </SlimeResourceCard>
</template>
