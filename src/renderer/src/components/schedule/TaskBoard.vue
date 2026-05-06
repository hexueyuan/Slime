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
      <div v-else class="space-y-0.5">
        <button
          v-for="task in activeTasks"
          :key="task.id"
          class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted/50"
          @click="$emit('selectTask', task.id)"
        >
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
            v-if="task.assigneeType === 'agent' && task.assigneeId"
            class="shrink-0 rounded bg-violet-500/15 px-1 text-[10px] text-violet-400"
            >{{ task.assigneeId }}</span
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
        </button>
      </div>
    </div>

    <!-- 下半：今日已完成 / 已取消 -->
    <div class="flex-1 overflow-y-auto pt-2">
      <h2 class="mb-2 text-sm font-semibold text-muted-foreground">今日已完成 / 已取消</h2>
      <div v-if="finishedTasks.length === 0" class="py-4 text-center text-xs text-muted-foreground">
        暂无记录
      </div>
      <div v-else class="space-y-0.5">
        <button
          v-for="task in finishedTasks"
          :key="task.id"
          class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted/50"
          @click="$emit('selectTask', task.id)"
        >
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
            v-if="task.assigneeType === 'agent' && task.assigneeId"
            class="shrink-0 rounded bg-violet-500/15 px-1 text-[10px] text-violet-400"
            >{{ task.assigneeId }}</span
          >
          <span
            v-if="task.scheduledAt"
            class="flex shrink-0 items-center gap-0.5 text-[10px] text-blue-400"
          >
            <Icon icon="lucide:clock" class="h-2.5 w-2.5" />
            <Icon v-if="task.repeatInterval" icon="lucide:repeat" class="h-2.5 w-2.5" />
          </span>
          <span class="shrink-0 text-[10px] text-muted-foreground">{{
            formatDate(task.finishedAt)
          }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import type { Task } from "@shared/types/schedule";

const props = defineProps<{ tasks: Task[]; selectedDate: string }>();
defineEmits<{ selectTask: [id: string]; createTask: [] }>();

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
      // 无定时 = 普通任务，始终显示
      if (!t.scheduledAt) return true;
      // 有定时：scheduledAt 在所选日期
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
</script>
