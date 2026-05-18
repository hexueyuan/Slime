<template>
  <div
    class="grid h-full min-w-0 grid-cols-1 overflow-y-auto bg-[var(--color-app-canvas)] xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] xl:overflow-hidden"
  >
    <!-- 左列 -->
    <div class="flex min-h-[640px] min-w-0 flex-col xl:min-h-0">
      <div class="shrink-0 border-b border-[var(--color-border-subtle)] px-5 py-4">
        <WeekCalendar v-model:selected-date="store.selectedDate" />
      </div>
      <div class="min-h-0 flex-1 px-5 py-4">
        <TaskBoard
          :tasks="store.tasks"
          :selected-date="store.selectedDate"
          @select-task="openTaskDetail"
          @create-task="createNewTask"
        />
      </div>
      <div class="shrink-0 border-t border-[var(--color-border-subtle)] px-5 py-4">
        <NoteInput @submit="store.addNote" />
      </div>
    </div>
    <!-- 分割线 -->
    <div
      class="hidden w-px bg-[var(--color-border-subtle)] xl:col-start-2 xl:row-start-1 xl:block xl:justify-self-start xl:self-stretch"
    />
    <!-- 右列 -->
    <div
      class="min-w-0 border-t border-[var(--color-border-subtle)] px-4 py-4 xl:col-start-2 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-t-0"
    >
      <TimelinePanel
        :entries="store.timeline"
        :dates="store.timelineDates"
        @add-entry="showTimelineAdd = true"
        @load-before="store.loadMoreBefore"
        @load-after="store.loadMoreAfter"
      />
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
  const task = await store.createTask({ title: "新任务" });
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
