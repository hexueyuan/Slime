<template>
  <div class="flex h-full flex-col">
    <!-- 上半：今日待办 -->
    <div class="flex-1 overflow-y-auto border-b border-border pb-2">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-foreground">今日待办</h2>
        <button
          class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          title="新建任务"
          @click="$emit('createTask')"
        >
          <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
        </button>
      </div>
      <div v-if="activeTasks.length === 0" class="py-4 text-center text-xs text-muted-foreground">
        暂无任务
      </div>
      <div v-else class="space-y-1">
        <button
          v-for="task in activeTasks"
          :key="task.id"
          class="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-muted/50"
          @click="$emit('selectTask', task.id)"
        >
          <div class="flex items-center gap-2 text-xs">
            <span
              class="w-[28px] shrink-0 font-mono text-[10px]"
              :class="task.status === 'in_progress' ? 'text-amber-400' : 'text-foreground'"
              >#{{ taskSeqMap[task.id] }}</span
            >
            <span
              class="flex-1 truncate"
              :class="task.status === 'in_progress' ? 'text-amber-400' : 'text-foreground'"
              >{{ task.title }}</span
            >
            <span
              v-if="task.scheduledAt"
              class="flex shrink-0 items-center gap-0.5 text-[10px] text-blue-400"
            >
              <Icon icon="lucide:clock" class="h-2.5 w-2.5" />
              <Icon v-if="task.repeatInterval" icon="lucide:repeat" class="h-2.5 w-2.5" />
            </span>
            <span class="shrink-0 text-[10px] text-muted-foreground">{{
              formatDate(task.createdAt)
            }}</span>
          </div>
          <div class="flex items-center gap-3 pl-[36px] text-[10px] text-muted-foreground">
            <span class="flex items-center gap-1">
              <AgentAvatar :avatar="getActorAvatar(task.creatorType, task.creatorId)" size="sm" />
              <span>{{ getActorName(task.creatorType, task.creatorId) }} 创建</span>
            </span>
            <span class="flex items-center gap-1">
              <Icon icon="lucide:arrow-right" class="h-2.5 w-2.5" />
              <AgentAvatar :avatar="getActorAvatar(task.assigneeType, task.assigneeId)" size="sm" />
              <span>{{ getActorName(task.assigneeType, task.assigneeId) }}</span>
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- 下半：今日已完成 / 已取消 -->
    <div class="flex-1 overflow-y-auto pt-2">
      <h2 class="mb-2 text-sm font-semibold text-muted-foreground">今日已完成 / 已取消</h2>
      <div v-if="finishedTasks.length === 0" class="py-4 text-center text-xs text-muted-foreground">
        暂无记录
      </div>
      <div v-else class="space-y-1">
        <button
          v-for="task in finishedTasks"
          :key="task.id"
          class="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-muted/50"
          @click="$emit('selectTask', task.id)"
        >
          <div class="flex items-center gap-2 text-xs">
            <span class="w-[28px] shrink-0 font-mono text-[10px] text-muted-foreground"
              >#{{ taskSeqMap[task.id] }}</span
            >
            <span
              class="flex-1 truncate"
              :class="
                task.status === 'cancelled'
                  ? 'text-muted-foreground line-through'
                  : 'text-emerald-400/80'
              "
              >{{ task.title }}</span
            >
            <span
              v-if="task.scheduledAt"
              class="flex shrink-0 items-center gap-0.5 text-[10px] text-blue-400"
            >
              <Icon icon="lucide:clock" class="h-2.5 w-2.5" />
              <Icon v-if="task.repeatInterval" icon="lucide:repeat" class="h-2.5 w-2.5" />
            </span>
            <span class="shrink-0 text-[10px] text-muted-foreground">{{
              formatTimeRange(task.startedAt, task.finishedAt)
            }}</span>
          </div>
          <div class="flex items-center gap-3 pl-[36px] text-[10px] text-muted-foreground">
            <span class="flex items-center gap-1">
              <AgentAvatar :avatar="getActorAvatar(task.creatorType, task.creatorId)" size="sm" />
              <span>{{ getActorName(task.creatorType, task.creatorId) }} 创建</span>
            </span>
            <span class="flex items-center gap-1">
              <Icon icon="lucide:arrow-right" class="h-2.5 w-2.5" />
              <AgentAvatar :avatar="getActorAvatar(task.assigneeType, task.assigneeId)" size="sm" />
              <span>{{ getActorName(task.assigneeType, task.assigneeId) }}</span>
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import type { Task } from "@shared/types/schedule";
import type { Agent, AgentAvatar as AgentAvatarType, UserProfile } from "@shared/types/agent";
import AgentAvatar from "@/components/chat/AgentAvatar.vue";

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

function getActorAvatar(type: string, id?: string): AgentAvatarType | undefined {
  if (type === "agent" && id) {
    const agent = agents.value.find((a) => a.id === id);
    return (
      agent?.avatar ?? {
        kind: "monogram",
        text: (id[0] ?? "A").toUpperCase(),
        backgroundColor: "#7c3aed",
      }
    );
  }
  return userProfile.value.avatar ?? { kind: "monogram", text: "U", backgroundColor: "#3b82f6" };
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

// 今日已完成/已取消：finishedAt 在所选日期
const finishedTasks = computed(() =>
  props.tasks
    .filter((t) => {
      if (t.status !== "done" && t.status !== "cancelled") return false;
      return toDateStr(t.finishedAt) === props.selectedDate;
    })
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)),
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
