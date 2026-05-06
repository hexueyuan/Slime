<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-foreground">任务</h2>
      <button
        class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        title="新建任务"
        @click="$emit('createTask')"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
      </button>
    </div>

    <TaskGroup
      label="待办"
      color-class="text-slate-300"
      :tasks="todoTasks"
      @select-task="$emit('selectTask', $event)"
    />
    <TaskGroup
      label="进行中"
      color-class="text-amber-400"
      :tasks="inProgressTasks"
      @select-task="$emit('selectTask', $event)"
    />
    <TaskGroup
      label="已完成"
      color-class="text-emerald-400"
      :tasks="doneTasks"
      :default-collapsed="true"
      @select-task="$emit('selectTask', $event)"
    />
    <TaskGroup
      label="已取消"
      color-class="text-slate-500"
      :tasks="cancelledTasks"
      :default-collapsed="true"
      @select-task="$emit('selectTask', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import TaskGroup from "./TaskGroup.vue";
import type { Task } from "@shared/types/schedule";

const props = defineProps<{ tasks: Task[] }>();
defineEmits<{ selectTask: [id: string]; createTask: [] }>();

const todoTasks = computed(() => props.tasks.filter((t) => t.status === "todo"));
const inProgressTasks = computed(() => props.tasks.filter((t) => t.status === "in_progress"));
const doneTasks = computed(() => props.tasks.filter((t) => t.status === "done"));
const cancelledTasks = computed(() => props.tasks.filter((t) => t.status === "cancelled"));
</script>
