<template>
  <div class="flex h-full flex-col gap-3">
    <SlimeTaskList
      class="min-h-0 flex-1"
      title="今日待办"
      empty-text="暂无任务"
      show-create
      :tasks="activeTaskItems"
      @select-task="$emit('selectTask', $event)"
      @create-task="$emit('createTask')"
    />

    <SlimeTaskList
      class="min-h-0 flex-1"
      title="今日已完成 / 已取消"
      empty-text="暂无记录"
      :tasks="finishedTaskItems"
      @select-task="$emit('selectTask', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import type { Task } from "@shared/types/schedule";
import type { Agent, UserProfile } from "@shared/types/agent";
import SlimeTaskList from "@/components/slime/SlimeTaskList.vue";

const ipc = window.electron.ipcRenderer;

const props = defineProps<{ tasks: Task[]; selectedDate: string }>();
defineEmits<{ selectTask: [id: string]; createTask: [] }>();

const agents = ref<Agent[]>([]);
const userProfile = ref<UserProfile>({
  avatar: { kind: "monogram", text: "U", backgroundColor: "#3b82f6" },
});

onMounted(async () => {
  agents.value = (await ipc.invoke(
    "presenter:call",
    "agentConfigPresenter",
    "listAgents",
  )) as Agent[];
  const raw = await ipc.invoke("presenter:call", "configPresenter", "get", "app.userProfile");
  if (raw && typeof raw === "object") {
    userProfile.value = raw as UserProfile;
  }
});

function getActorName(type: string, id?: string): string {
  if (type === "agent" && id) {
    const agent = agents.value.find((a) => a.id === id);
    return agent?.name ?? id;
  }
  return userProfile.value.name ?? "我";
}

function formatTaskMeta(task: Task): string {
  const assignee = getActorName(task.assigneeType, task.assigneeId);
  const creator = getActorName(task.creatorType, task.creatorId);
  const schedule = task.scheduledAt
    ? `${formatDate(task.scheduledAt)}${task.repeatInterval ? " · 循环" : ""}`
    : formatDate(task.createdAt);
  return `${creator} 创建 → ${assignee} · ${schedule}`;
}

function toDateStr(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

// 按创建时间排序分配序号 #1, #2, ...
const taskSeqMap = computed(() => {
  const sorted = [...props.tasks].sort((a, b) => a.createdAt - b.createdAt);
  const map: Record<string, number> = {};
  sorted.forEach((t, i) => {
    map[t.id] = i + 1;
  });
  return map;
});

// 今日待办：普通任务(无定时) + 定时任务(scheduledAt 在所选日期)，状态为 todo/in_progress
const activeTasks = computed(() =>
  props.tasks
    .filter((t) => {
      if (t.status !== "todo" && t.status !== "in_progress") return false;
      if (!t.scheduledAt) return true;
      return toDateStr(t.scheduledAt) === props.selectedDate;
    })
    .sort((a, b) => b.createdAt - a.createdAt),
);

const activeTaskItems = computed(() =>
  activeTasks.value.map((task) => ({
    id: task.id,
    title: `#${taskSeqMap.value[task.id]}  ${task.title}`,
    meta: formatTaskMeta(task),
    status: task.status === "in_progress" ? "进行中" : undefined,
    tone: task.status === "in_progress" ? ("warning" as const) : ("default" as const),
  })),
);

// 今日已完成/已取消：finishedAt 在所选日期
const finishedTasks = computed(() =>
  props.tasks
    .filter((t) => {
      if (t.status !== "done" && t.status !== "cancelled") return false;
      return toDateStr(t.finishedAt) === props.selectedDate;
    })
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)),
);

const finishedTaskItems = computed(() =>
  finishedTasks.value.map((task) => ({
    id: task.id,
    title: `#${taskSeqMap.value[task.id]}  ${task.title}`,
    meta: formatTaskMeta(task),
    status: formatTimeRange(task.startedAt, task.finishedAt),
    completed: task.status === "done",
    tone: task.status === "cancelled" ? ("muted" as const) : ("success" as const),
  })),
);

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function formatDate(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const w = WEEKDAYS[d.getDay()];
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day}（周${w}）${h}:${min}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTimeRange(startMs?: number, endMs?: number): string {
  if (!startMs && !endMs) return "";
  if (startMs && endMs) return `${formatTime(startMs)} - ${formatTime(endMs)}`;
  if (endMs) return formatTime(endMs);
  return formatTime(startMs!);
}
</script>
