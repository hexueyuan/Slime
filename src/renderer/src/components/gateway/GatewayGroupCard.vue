<script setup lang="ts">
import { Icon } from "@iconify/vue";
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
</script>

<template>
  <article
    class="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3 transition-colors hover:border-[var(--color-border-strong)]"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <div class="flex min-w-0 items-center gap-2">
          <h3 class="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
            {{ group.name }}
          </h3>
          <span
            v-if="group.isBuiltin"
            class="shrink-0 rounded-[var(--radius-xs)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)]"
          >
            内置
          </span>
        </div>
        <div class="flex min-w-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span class="truncate">{{ group.balanceMode }}</span>
          <span class="h-1 w-1 rounded-full bg-[var(--color-border-strong)]" />
          <span>{{ itemCount == null ? "成员加载中" : `${itemCount} 渠道` }}</span>
        </div>
      </div>

      <div v-if="actions" class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          data-testid="group-edit"
          title="编辑分组"
          aria-label="编辑分组"
          class="inline-grid h-7 w-7 place-items-center rounded-md border border-transparent bg-transparent text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
          @click="emitEdit"
        >
          <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
        </button>
        <button
          v-if="!group.isBuiltin"
          type="button"
          data-testid="group-delete"
          title="删除分组"
          aria-label="删除分组"
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
      <p class="truncate text-[11px] text-[var(--color-text-muted)]">渠道</p>
      <p class="truncate text-xs font-medium text-[var(--color-text-primary)]">
        {{ channelSummary || "暂无渠道" }}
      </p>
    </div>
  </article>
</template>
