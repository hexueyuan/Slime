<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import SlimeButton from "@/components/ui/SlimeButton.vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";
import type { Channel } from "@shared/types/gateway";

type TestResult = { loading: boolean; success?: boolean; error?: string };

const props = withDefaults(
  defineProps<{
    channel: Channel;
    modelCount: number;
    stabilitySummary?: string;
    testResult?: TestResult;
    selected?: boolean;
  }>(),
  {
    stabilitySummary: "-",
    selected: false,
  },
);

const emit = defineEmits<{
  select: [channel: Channel];
  test: [channel: Channel];
  edit: [channel: Channel];
  delete: [channel: Channel];
  "manage-models": [channel: Channel];
}>();

const statusText = computed(() => (props.channel.enabled ? "启用" : "停用"));

const testResultText = computed(() => {
  if (!props.testResult) return "-";
  if (props.testResult.loading) return "测试中...";
  if (props.testResult.success) return "连接成功";
  if (props.testResult.success === false) return "连接失败";
  return "-";
});

const testResultTone = computed(() => {
  if (!props.testResult || props.testResult.loading) return "text-[var(--color-text-muted)]";
  if (props.testResult.success === true) return "text-[var(--color-success)]";
  if (props.testResult.success === false) return "text-[var(--color-danger)]";
  return "text-[var(--color-text-muted)]";
});

const statItems = computed(() => [
  { label: "模型", value: String(props.modelCount) },
  { label: "稳定性", value: props.stabilitySummary },
]);

function emitSelect() {
  emit("select", props.channel);
}

function emitChannel(event: "test" | "edit" | "delete" | "manage-models") {
  if (event === "test") {
    emit("test", props.channel);
  } else if (event === "edit") {
    emit("edit", props.channel);
  } else if (event === "delete") {
    emit("delete", props.channel);
  } else {
    emit("manage-models", props.channel);
  }
}
</script>

<template>
  <article
    data-testid="channel-card"
    role="button"
    tabindex="0"
    :data-selected="selected ? 'true' : 'false'"
    :class="[
      'min-w-0 cursor-pointer rounded-[var(--radius-md)] border bg-[var(--color-app-elevated)] p-3 transition-colors',
      'hover:border-[var(--color-border-strong)]',
      selected
        ? 'border-[var(--color-accent-brand)] shadow-[inset_0_0_0_1px_var(--color-accent-brand-soft)]'
        : 'border-[var(--color-border-subtle)]',
      !channel.enabled && 'opacity-70',
    ]"
    @click="emitSelect"
    @keydown.enter.prevent="emitSelect"
    @keydown.space.prevent="emitSelect"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <div class="flex min-w-0 items-center">
          <h3 class="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
            {{ channel.name }}
          </h3>
        </div>
        <div
          data-testid="channel-status"
          class="flex min-w-0 items-center gap-2 text-xs text-[var(--color-text-muted)]"
        >
          <span
            data-testid="channel-status-dot"
            :class="[
              'h-2 w-2 shrink-0 rounded-full',
              channel.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-disabled)]',
            ]"
          />
          <span class="truncate">{{ channel.type }}</span>
          <span class="h-1 w-1 rounded-full bg-[var(--color-border-strong)]" />
          <span>{{ statusText }}</span>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <SlimeIconButton
          data-testid="channel-test"
          icon="lucide:activity"
          title="测试连接"
          size="sm"
          @click.stop="emitChannel('test')"
        />
        <SlimeIconButton
          data-testid="channel-edit"
          icon="lucide:pencil"
          title="编辑渠道"
          size="sm"
          @click.stop="emitChannel('edit')"
        />
        <SlimeIconButton
          data-testid="channel-delete"
          icon="lucide:trash-2"
          title="删除渠道"
          size="sm"
          @click.stop="emitChannel('delete')"
        />
      </div>
    </div>

    <dl class="mt-3 grid grid-cols-3 gap-2">
      <div
        v-for="item in statItems"
        :key="item.label"
        class="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-2 py-1.5"
      >
        <dt class="truncate text-[11px] text-[var(--color-text-muted)]">{{ item.label }}</dt>
        <dd class="truncate text-xs font-medium text-[var(--color-text-primary)]">
          {{ item.value }}
        </dd>
      </div>
      <div
        class="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-2 py-1.5"
      >
        <dt class="truncate text-[11px] text-[var(--color-text-muted)]">测试</dt>
        <dd
          data-testid="channel-test-result"
          :class="['truncate text-xs font-medium', testResultTone]"
        >
          {{ testResultText }}
        </dd>
      </div>
    </dl>

    <p
      v-if="testResult?.error"
      class="mt-2 line-clamp-2 text-xs text-[var(--color-danger)]"
      :title="testResult.error"
    >
      {{ testResult.error }}
    </p>

    <div class="mt-3 flex justify-end">
      <SlimeButton
        data-testid="channel-manage-models"
        variant="primary"
        size="sm"
        @click.stop="emitChannel('manage-models')"
      >
        <Icon icon="lucide:boxes" class="h-4 w-4" />
        管理模型
      </SlimeButton>
    </div>
  </article>
</template>
