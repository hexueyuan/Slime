<template>
  <div class="mb-2">
    <button
      class="flex w-full items-center gap-1 px-1 py-1 text-xs font-medium uppercase tracking-wide"
      :class="colorClass"
      @click="collapsed = !collapsed"
    >
      <Icon :icon="collapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="h-3 w-3" />
      <span>{{ label }}</span>
      <span class="ml-1 text-muted-foreground">({{ tasks.length }})</span>
    </button>
    <div v-if="!collapsed" class="mt-0.5">
      <TaskItem
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @select="$emit('selectTask', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import TaskItem from "./TaskItem.vue";
import type { Task } from "@shared/types/schedule";

const props = defineProps<{
  label: string;
  tasks: Task[];
  colorClass: string;
  defaultCollapsed?: boolean;
}>();

defineEmits<{ selectTask: [id: string] }>();

const collapsed = ref(props.defaultCollapsed ?? false);
</script>
