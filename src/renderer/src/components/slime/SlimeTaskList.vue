<script setup lang="ts">
defineProps<{
  title?: string;
  emptyText?: string;
  showCreate?: boolean;
  tasks: Array<{
    id: string;
    title: string;
    status?: string;
    meta?: string;
    completed?: boolean;
    tone?: "default" | "warning" | "success" | "muted";
  }>;
}>();

defineEmits<{ selectTask: [id: string]; createTask: [] }>();
</script>

<template>
  <section
    data-component-id="SlimeTaskList"
    data-layout="adaptive"
    class="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]"
  >
    <div
      class="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3"
    >
      <h3 class="text-sm font-semibold text-[var(--color-text-primary)]">{{ title ?? "任务" }}</h3>
      <button
        type="button"
        class="text-xs font-medium text-[var(--color-accent-brand-hover)]"
        @click="$emit('createTask')"
        v-if="showCreate"
      >
        新建
      </button>
    </div>
    <div v-if="tasks.length" class="min-h-0 flex-1 overflow-y-auto p-2">
      <button
        v-for="task in tasks"
        :key="task.id"
        type="button"
        class="mb-1 flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-control-hover)]"
        @click="$emit('selectTask', task.id)"
      >
        <span
          :class="[
            'h-4 w-4 shrink-0 rounded-full border',
            task.completed
              ? 'border-[var(--color-success)] bg-[var(--color-success)]'
              : task.tone === 'warning'
                ? 'border-[var(--color-warning)] bg-[var(--color-warning)]/20'
                : 'border-[var(--color-border-strong)]',
          ]"
        />
        <span class="min-w-0 flex-1">
          <span
            :class="[
              'block truncate',
              task.tone === 'warning'
                ? 'text-[var(--color-warning)]'
                : task.tone === 'success'
                  ? 'text-[var(--color-success)]'
                  : task.tone === 'muted'
                    ? 'text-[var(--color-text-muted)] line-through'
                    : 'text-[var(--color-text-primary)]',
            ]"
            >{{ task.title }}</span
          >
          <span v-if="task.meta" class="block truncate text-xs text-[var(--color-text-muted)]">{{
            task.meta
          }}</span>
        </span>
        <span v-if="task.status" class="text-[11px] text-[var(--color-text-muted)]">{{
          task.status
        }}</span>
      </button>
    </div>
    <div
      v-else
      class="flex flex-1 items-center justify-center text-xs text-[var(--color-text-muted)]"
    >
      {{ emptyText ?? "暂无任务" }}
    </div>
  </section>
</template>
