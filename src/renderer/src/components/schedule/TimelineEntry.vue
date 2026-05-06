<template>
  <div class="relative flex gap-2 pb-4">
    <div class="flex w-12 shrink-0 flex-col items-end pt-0.5">
      <span class="text-[11px] text-muted-foreground">{{ entry.startTime }}</span>
      <span v-if="entry.endTime" class="text-[10px] text-muted-foreground/60">
        {{ entry.endTime }}
      </span>
    </div>
    <div class="flex flex-col items-center">
      <div
        :class="[
          'mt-1.5 h-2 w-2 rounded-full',
          entry.source === 'task_auto'
            ? 'bg-violet-400'
            : entry.source === 'note'
              ? 'bg-emerald-400'
              : 'bg-slate-400',
        ]"
      />
      <div class="w-px flex-1 bg-border" />
    </div>
    <div class="flex-1 pt-0.5">
      <p class="text-sm text-foreground">{{ entry.content }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TimelineEntry } from "@shared/types/schedule";

defineProps<{ entry: TimelineEntry }>();
</script>
