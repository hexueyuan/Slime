import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Task, TaskStatus, TimelineEntry, Note } from "@shared/types/schedule";

const ipc = window.electron.ipcRenderer;

export const useScheduleStore = defineStore("schedule", () => {
  const selectedDate = ref(new Date().toISOString().slice(0, 10));
  const tasks = ref<Task[]>([]);
  const timeline = ref<TimelineEntry[]>([]);
  const notes = ref<Note[]>([]);

  async function fetchTasks(): Promise<void> {
    tasks.value = (await ipc.invoke("task:getTasks")) as Task[];
  }

  async function fetchTimeline(): Promise<void> {
    timeline.value = (await ipc.invoke("task:getTimeline", selectedDate.value)) as TimelineEntry[];
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
    notes,
    fetchTasks,
    fetchTimeline,
    fetchNotes,
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
