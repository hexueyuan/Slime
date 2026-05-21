<script setup lang="ts">
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";

defineProps<{
  title?: string;
  entries: Array<{
    id: string;
    label: string;
    description?: string;
    time?: string;
    active?: boolean;
  }>;
}>();

defineEmits<{ addEntry: []; locate: [] }>();
</script>

<template>
  <section
    data-component-id="SlimeTimeline"
    data-layout="adaptive"
    class="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]"
  >
    <div
      class="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3"
    >
      <h3 class="text-sm font-semibold text-[var(--color-text-primary)]">
        {{ title ?? "时间线" }}
      </h3>
      <div class="flex items-center gap-1">
        <SlimeIconButton icon="lucide:locate" title="回到今天" size="sm" @click="$emit('locate')" />
        <SlimeIconButton icon="lucide:plus" title="添加条目" size="sm" @click="$emit('addEntry')" />
      </div>
    </div>
    <div v-if="entries.length" class="min-h-0 flex-1 overflow-y-auto p-4">
      <div v-for="entry in entries" :key="entry.id" class="relative pb-5 pl-5 last:pb-0">
        <span
          class="absolute bottom-0 left-[7px] top-3 w-px bg-[var(--color-border-subtle)] last:hidden"
        />
        <span
          :class="[
            'absolute left-0 top-1 h-3.5 w-3.5 rounded-full border',
            entry.active
              ? 'border-[var(--color-accent-brand)] bg-[var(--color-accent-brand)]'
              : 'border-[var(--color-border-strong)] bg-[var(--color-app-elevated)]',
          ]"
        />
        <div class="text-sm font-medium text-[var(--color-text-primary)]">{{ entry.label }}</div>
        <div
          v-if="entry.description"
          class="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]"
        >
          {{ entry.description }}
        </div>
        <div v-if="entry.time" class="mt-1 text-[11px] text-[var(--color-text-disabled)]">
          {{ entry.time }}
        </div>
      </div>
    </div>
    <div
      v-else
      class="flex flex-1 items-center justify-center text-xs text-[var(--color-text-muted)]"
    >
      暂无记录
    </div>
  </section>
</template>
