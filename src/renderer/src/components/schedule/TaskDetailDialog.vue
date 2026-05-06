<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @click.self="$emit('update:open', false)"
  >
    <div class="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
      <div class="mb-4 flex items-center justify-between">
        <input
          v-model="title"
          class="flex-1 bg-transparent text-lg font-semibold text-foreground focus:outline-none"
          placeholder="任务标题"
          @blur="saveTitle"
        />
        <button
          class="ml-2 text-muted-foreground hover:text-foreground"
          @click="$emit('update:open', false)"
        >
          <Icon icon="lucide:x" class="h-5 w-5" />
        </button>
      </div>

      <div class="mb-4 flex gap-2">
        <button
          v-for="s in statuses"
          :key="s.value"
          :class="[
            'rounded-md px-2 py-1 text-xs',
            task?.status === s.value
              ? 'bg-violet-500/20 text-violet-400'
              : 'text-muted-foreground hover:bg-muted',
          ]"
          @click="changeStatus(s.value)"
        >
          {{ s.label }}
        </button>
      </div>

      <div class="mb-4">
        <div class="mb-1 text-xs text-muted-foreground">详情</div>
        <textarea
          v-model="detail"
          class="w-full resize-none rounded-md border border-border bg-muted/30 p-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          rows="4"
          placeholder="Markdown 格式，支持链接和图片引用..."
          @blur="saveDetail"
        />
      </div>

      <!-- 归属人 -->
      <div class="mb-4">
        <div class="mb-1 text-xs text-muted-foreground">归属人</div>
        <select
          :value="assigneeId ?? '__user__'"
          class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          @change="onAssigneeChange"
        >
          <option value="__user__">我</option>
          <option value="__none__">暂无归属</option>
          <option v-for="agent in agents" :key="agent.id" :value="agent.id">
            {{ agent.name }}
          </option>
        </select>
      </div>

      <!-- 定时设置 -->
      <div class="mb-4">
        <div class="mb-1 text-xs text-muted-foreground">定时</div>
        <ScheduleConfig
          :scheduled-at="scheduledAt"
          :repeat-interval="repeatInterval"
          @update:scheduled-at="onScheduledAtChange"
          @update:repeat-interval="onRepeatIntervalChange"
        />
      </div>

      <div class="mb-4">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs text-muted-foreground">附件</span>
          <button class="text-xs text-violet-400 hover:text-violet-300" @click="pickFile">
            + 添加
          </button>
        </div>
        <div
          class="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <div v-if="attachments.length === 0">拖拽文件到此处，或点击"添加"</div>
          <div v-else class="space-y-1 text-left">
            <div
              v-for="att in attachments"
              :key="att.id"
              class="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50"
            >
              <span class="truncate">{{ att.fileName }}</span>
              <button class="text-muted-foreground hover:text-red-400" @click="removeAtt(att.id)">
                <Icon icon="lucide:x" class="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="text-[11px] text-muted-foreground/60">
        <span v-if="task?.creatorType === 'agent'">由 {{ task.creatorId }} 创建</span>
        <span v-else>由我创建</span>
        · 创建于 {{ formatTime(task?.createdAt) }}
        <span v-if="task?.startedAt"> · 开始于 {{ formatTime(task.startedAt) }}</span>
        <span v-if="task?.finishedAt"> · 结束于 {{ formatTime(task.finishedAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import type { Task, TaskStatus, TaskAttachment } from "@shared/types/schedule";
import ScheduleConfig from "./ScheduleConfig.vue";
import type { ActorType } from "@shared/types/schedule";

const ipc = window.electron.ipcRenderer;

const props = defineProps<{ open: boolean; taskId: string | null }>();
const emit = defineEmits<{ "update:open": [v: boolean]; changed: [] }>();

const task = ref<Task | null>(null);
const title = ref("");
const detail = ref("");
const attachments = ref<TaskAttachment[]>([]);
const assigneeType = ref<ActorType>("user");
const assigneeId = ref<string | undefined>(undefined);
const scheduledAt = ref<number | undefined>(undefined);
const repeatInterval = ref<number | undefined>(undefined);
const agents = ref<{ id: string; name: string }[]>([]);

const statuses = [
  { value: "todo" as const, label: "待办" },
  { value: "in_progress" as const, label: "进行中" },
  { value: "done" as const, label: "已完成" },
  { value: "cancelled" as const, label: "已取消" },
];

watch(
  () => [props.open, props.taskId],
  async () => {
    if (!props.open || !props.taskId) return;
    const tasks = (await ipc.invoke("task:getTasks")) as Task[];
    task.value = tasks.find((t) => t.id === props.taskId) ?? null;
    title.value = task.value?.title ?? "";
    detail.value = task.value?.detail ?? "";
    assigneeType.value = task.value?.assigneeType ?? "user";
    assigneeId.value = task.value?.assigneeId;
    scheduledAt.value = task.value?.scheduledAt;
    repeatInterval.value = task.value?.repeatInterval;
    const agentList = (await ipc.invoke(
      "presenter:call",
      "agentConfigPresenter",
      "listAgents",
    )) as {
      id: string;
      name: string;
    }[];
    agents.value = agentList;
    attachments.value = (await ipc.invoke("task:getAttachments", props.taskId)) as TaskAttachment[];
  },
);

async function saveTitle(): Promise<void> {
  if (!props.taskId || title.value === task.value?.title) return;
  await ipc.invoke("task:updateTask", props.taskId, { title: title.value });
  emit("changed");
}

async function saveDetail(): Promise<void> {
  if (!props.taskId || detail.value === (task.value?.detail ?? "")) return;
  await ipc.invoke("task:updateTask", props.taskId, { detail: detail.value });
  emit("changed");
}

async function changeStatus(status: TaskStatus): Promise<void> {
  if (!props.taskId || status === task.value?.status) return;
  await ipc.invoke("task:updateTaskStatus", props.taskId, status);
  task.value = { ...task.value!, status };
  emit("changed");
}

async function pickFile(): Promise<void> {
  const input = document.createElement("input");
  input.type = "file";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || !props.taskId) return;
    const att = (await ipc.invoke(
      "task:addAttachment",
      props.taskId,
      (file as File & { path: string }).path,
    )) as TaskAttachment;
    attachments.value.push(att);
  };
  input.click();
}

async function onDrop(e: DragEvent): Promise<void> {
  const files = e.dataTransfer?.files;
  if (!files || !props.taskId) return;
  for (const file of Array.from(files)) {
    const att = (await ipc.invoke(
      "task:addAttachment",
      props.taskId,
      (file as File & { path: string }).path,
    )) as TaskAttachment;
    attachments.value.push(att);
  }
}

async function removeAtt(id: number): Promise<void> {
  await ipc.invoke("task:removeAttachment", id);
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function formatTime(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function onAssigneeChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value;
  if (value === "__user__") {
    assigneeType.value = "user";
    assigneeId.value = undefined;
  } else if (value === "__none__") {
    assigneeType.value = "user";
    assigneeId.value = undefined;
  } else {
    assigneeType.value = "agent";
    assigneeId.value = value;
  }
  saveAssignee();
}

async function saveAssignee(): Promise<void> {
  if (!props.taskId) return;
  await ipc.invoke("task:updateTask", props.taskId, {
    assigneeType: assigneeType.value,
    assigneeId: assigneeId.value ?? null,
  });
  emit("changed");
}

function onScheduledAtChange(value: number | undefined): void {
  scheduledAt.value = value;
  saveSchedule();
}

function onRepeatIntervalChange(value: number | undefined): void {
  repeatInterval.value = value;
  saveSchedule();
}

async function saveSchedule(): Promise<void> {
  if (!props.taskId) return;
  await ipc.invoke("task:updateTask", props.taskId, {
    scheduledAt: scheduledAt.value ?? null,
    repeatInterval: repeatInterval.value ?? null,
  });
  emit("changed");
}
</script>
