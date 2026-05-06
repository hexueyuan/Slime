<template>
  <button
    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
    @click="$emit('select', task.id)"
  >
    <div
      :class="[
        'h-2 w-2 shrink-0 rounded-full',
        task.status === 'todo'
          ? 'bg-slate-400'
          : task.status === 'in_progress'
            ? 'bg-amber-400'
            : task.status === 'done'
              ? 'bg-emerald-400'
              : 'bg-slate-600',
      ]"
    />
    <span
      :class="[
        'flex-1 truncate',
        task.status === 'cancelled' ? 'text-muted-foreground line-through' : '',
      ]"
      >{{ task.title }}</span
    >
  </button>
</template>

<script setup lang="ts">
import type { Task } from "@shared/types/schedule";

defineProps<{ task: Task }>();
defineEmits<{ select: [id: string] }>();
</script>
