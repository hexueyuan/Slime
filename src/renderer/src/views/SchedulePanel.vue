<template>
  <div class="flex h-full">
    <!-- 左列 -->
    <div class="flex min-w-[400px] flex-1 flex-col">
      <div class="shrink-0 border-b border-border px-4 py-2">
        <WeekCalendar v-model:selected-date="store.selectedDate" />
      </div>
      <div class="min-h-0 flex-1 px-4 py-3">
        <TaskBoard
          :tasks="store.tasks"
          @select-task="openTaskDetail"
          @create-task="createNewTask"
        />
      </div>
      <div class="shrink-0 border-t border-border px-4 py-3">
        <NoteInput @submit="store.addNote" />
      </div>
    </div>
    <!-- 分割线 -->
    <div class="w-px bg-border" />
    <!-- 右列 -->
    <div class="w-[280px] shrink-0 overflow-y-auto px-3 py-3">
      <TimelinePanel :entries="store.timeline" @add-entry="showTimelineAdd = true" />
    </div>

    <TaskDetailDialog
      v-model:open="showTaskDetail"
      :task-id="selectedTaskId"
      @changed="
        store.fetchTasks();
        store.fetchTimeline();
      "
    />
    <TimelineAddDialog
      v-model:open="showTimelineAdd"
      :date="store.selectedDate"
      @submit="store.addTimelineEntry"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import WeekCalendar from "@/components/schedule/WeekCalendar.vue";
import TaskBoard from "@/components/schedule/TaskBoard.vue";
import NoteInput from "@/components/schedule/NoteInput.vue";
import TimelinePanel from "@/components/schedule/TimelinePanel.vue";
import TaskDetailDialog from "@/components/schedule/TaskDetailDialog.vue";
import TimelineAddDialog from "@/components/schedule/TimelineAddDialog.vue";
import { useScheduleStore } from "@/stores/schedule";

const store = useScheduleStore();

const showTaskDetail = ref(false);
const selectedTaskId = ref<string | null>(null);
const showTimelineAdd = ref(false);

function openTaskDetail(id: string): void {
  selectedTaskId.value = id;
  showTaskDetail.value = true;
}

async function createNewTask(): Promise<void> {
  const task = await store.createTask("新任务");
  selectedTaskId.value = task.id;
  showTaskDetail.value = true;
}

let cleanupListeners: (() => void) | null = null;

onMounted(() => {
  store.fetchTasks();
  store.fetchTimeline();
  store.fetchNotes();
  cleanupListeners = store.setupListeners();
});

onUnmounted(() => {
  cleanupListeners?.();
});
</script>
