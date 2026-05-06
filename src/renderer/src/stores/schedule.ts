import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Task, TaskStatus, TimelineEntry, Note } from "@shared/types/schedule";

export const useScheduleStore = defineStore("schedule", () => {
  const ipc = window.electron.ipcRenderer;
  const selectedDate = ref(new Date().toISOString().slice(0, 10));
  const tasks = ref<Task[]>([]);
  const timeline = ref<TimelineEntry[]>([]);
  const timelineDates = ref<string[]>([]); // 已加载的日期列表（有序）
  const notes = ref<Note[]>([]);

  async function fetchTasks(): Promise<void> {
    tasks.value = (await ipc.invoke("task:getTasks")) as Task[];
  }

  async function fetchTimeline(): Promise<void> {
    // 以 selectedDate 为中心，加载前后各3天（共7天）
    const dates = getDateRange(selectedDate.value, 3);
    const entries: TimelineEntry[] = [];
    for (const d of dates) {
      const dayEntries = (await ipc.invoke("task:getTimeline", d)) as TimelineEntry[];
      entries.push(...dayEntries);
    }
    timeline.value = entries;
    timelineDates.value = dates;
  }

  async function loadMoreBefore(): Promise<void> {
    if (timelineDates.value.length === 0) return;
    const earliest = timelineDates.value[0];
    const newDates = getDateRange(offsetDate(earliest, -3), 0, 2); // 再往前3天
    const entries: TimelineEntry[] = [];
    for (const d of newDates) {
      const dayEntries = (await ipc.invoke("task:getTimeline", d)) as TimelineEntry[];
      entries.push(...dayEntries);
    }
    timeline.value = [...entries, ...timeline.value];
    timelineDates.value = [...newDates, ...timelineDates.value];
  }

  async function loadMoreAfter(): Promise<void> {
    if (timelineDates.value.length === 0) return;
    const latest = timelineDates.value[timelineDates.value.length - 1];
    const newDates = getDateRange(offsetDate(latest, 1), 0, 2); // 再往后3天
    const entries: TimelineEntry[] = [];
    for (const d of newDates) {
      const dayEntries = (await ipc.invoke("task:getTimeline", d)) as TimelineEntry[];
      entries.push(...dayEntries);
    }
    timeline.value = [...timeline.value, ...entries];
    timelineDates.value = [...timelineDates.value, ...newDates];
  }

  async function fetchNotes(): Promise<void> {
    notes.value = (await ipc.invoke("task:getNotes", 50)) as Note[];
  }

  async function createTask(title: string, detail?: string): Promise<Task> {
    const task = (await ipc.invoke("task:createTask", title, detail)) as Task;
    await fetchTasks();
    return task;
  }

  async function updateTask(
    id: string,
    fields: { title?: string; detail?: string },
  ): Promise<void> {
    await ipc.invoke("task:updateTask", id, fields);
    await fetchTasks();
  }

  async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await ipc.invoke("task:updateTaskStatus", id, status);
    await fetchTasks();
    await fetchTimeline();
  }

  async function deleteTask(id: string): Promise<void> {
    await ipc.invoke("task:deleteTask", id);
    await fetchTasks();
  }

  async function addNote(content: string): Promise<void> {
    await ipc.invoke("task:addNote", content);
    await fetchNotes();
    await fetchTimeline();
  }

  async function deleteNote(id: number): Promise<void> {
    await ipc.invoke("task:deleteNote", id);
    await fetchNotes();
    await fetchTimeline();
  }

  async function addTimelineEntry(entry: {
    date: string;
    startTime: string;
    endTime?: string;
    content: string;
  }): Promise<void> {
    await ipc.invoke("task:addTimelineEntry", entry);
    await fetchTimeline();
  }

  async function removeTimelineEntry(id: number): Promise<void> {
    await ipc.invoke("task:removeTimelineEntry", id);
    await fetchTimeline();
  }

  function setupListeners(): () => void {
    const unsub1 = ipc.on("task:tasks-changed", () => {
      fetchTasks();
    });
    const unsub2 = ipc.on("task:timeline-changed", () => {
      fetchTimeline();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }

  watch(selectedDate, () => {
    fetchTimeline();
  });

  return {
    selectedDate,
    tasks,
    timeline,
    timelineDates,
    notes,
    fetchTasks,
    fetchTimeline,
    fetchNotes,
    loadMoreBefore,
    loadMoreAfter,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    addNote,
    deleteNote,
    addTimelineEntry,
    removeTimelineEntry,
    setupListeners,
  };
});

// 工具函数
function getDateRange(center: string, before: number, after?: number): string[] {
  const a = after ?? before;
  const dates: string[] = [];
  for (let i = -before; i <= a; i++) {
    dates.push(offsetDate(center, i));
  }
  return dates;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
