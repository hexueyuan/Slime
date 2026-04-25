<script setup lang="ts">
import { ref, computed } from "vue";
import { useEvolutionStore } from "@/stores/evolution";
import { useMessageStore } from "@/stores/chat";
import { usePresenter } from "@/composables/usePresenter";
import { useSessionStore } from "@/stores/session";

const evolutionStore = useEvolutionStore();
const messageStore = useMessageStore();
const sessionStore = useSessionStore();
const evolutionPresenter = usePresenter("evolutionPresenter");
const agentPresenter = usePresenter("agentPresenter");
const sessionPresenter = usePresenter("sessionPresenter");

const stages = [
  { key: "discuss", label: "选择进化方向" },
  { key: "coding", label: "进化中" },
  { key: "applying", label: "进化完成" },
] as const;

const showDialog = ref(false);
const isResetting = ref(false);

function stageStatus(stageKey: string): "completed" | "active" | "pending" {
  const stageKeys = stages.map((s) => s.key);
  const idx = stageKeys.indexOf(stageKey as any);
  const currentIdx = stageKeys.indexOf(evolutionStore.stage as any);
  if (evolutionStore.stage === "idle") {
    return evolutionStore.completedTag ? "completed" : "pending";
  }
  if (idx < currentIdx) return "completed";
  if (idx === currentIdx) return "active";
  return "pending";
}

const isInProgress = computed(() => evolutionStore.stage !== "idle");

function handleResetClick() {
  showDialog.value = true;
}

function handleCancelDialog() {
  showDialog.value = false;
}

async function handleConfirmReset() {
  isResetting.value = true;
  try {
    if (sessionStore.activeSessionId) {
      await agentPresenter.stopGeneration(sessionStore.activeSessionId);
    }
    await evolutionPresenter.cancel();
    await window.electron.ipcRenderer.invoke("agent:reset");
  } finally {
    if (sessionStore.activeSessionId) {
      await sessionPresenter.clearMessages(sessionStore.activeSessionId);
    }
    messageStore.clearAll();
    evolutionStore.reset();
    isResetting.value = false;
    showDialog.value = false;
  }
}

function handleRestart() {
  evolutionPresenter.restart();
}
</script>

<template>
  <div
    data-testid="evolution-status-bar"
    class="flex items-center border-b border-border px-4 py-2"
  >
    <template v-for="(stage, i) in stages" :key="stage.key">
      <!-- 有机曲线连线 (SVG) -->
      <svg v-if="i > 0" class="mx-1" width="40" height="16" viewBox="0 0 40 16">
        <path
          d="M0,8 C10,3 30,13 40,8"
          :class="[
            'fill-none',
            stageStatus(stages[i - 1].key) === 'completed'
              ? 'stroke-green-500/50'
              : 'stroke-muted-foreground/10',
          ]"
          stroke-width="1.5"
        />
        <!-- 粒子：仅 completed 连线 -->
        <circle
          v-if="stageStatus(stages[i - 1].key) === 'completed'"
          r="2"
          class="fill-green-500/80"
        >
          <animateMotion dur="2s" repeatCount="indefinite" path="M0,8 C10,3 30,13 40,8" />
        </circle>
      </svg>

      <!-- 节点 -->
      <div
        data-testid="stage-node"
        class="flex items-center gap-1.5"
        :class="{
          'stage-completed': stageStatus(stage.key) === 'completed',
          'stage-active': stageStatus(stage.key) === 'active',
          'stage-dormant': stageStatus(stage.key) === 'pending',
        }"
      >
        <!-- 细胞膜节点容器 -->
        <div
          class="relative flex shrink-0 items-center justify-center"
          style="width: 28px; height: 28px"
        >
          <!-- completed: 单层膜呼吸 -->
          <div
            v-if="stageStatus(stage.key) === 'completed'"
            class="membrane-breathe absolute inset-0 rounded-full border border-green-500/40"
          />
          <!-- active: 双层膜交替呼吸 -->
          <template v-if="stageStatus(stage.key) === 'active'">
            <div
              class="membrane-breathe-fast absolute inset-0 rounded-full border border-violet-500/50"
            />
            <div
              class="membrane-breathe-delayed absolute inset-[3px] rounded-full border border-violet-500/20"
            />
          </template>
          <!-- pending: 静态虚线环 (仅进化中，dormant 不显示) -->
          <div
            v-if="stageStatus(stage.key) === 'pending' && isInProgress"
            class="absolute inset-0 rounded-full border border-dashed border-muted-foreground/10"
          />

          <!-- 核心圆 -->
          <div
            v-if="stageStatus(stage.key) === 'completed'"
            class="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgb(34_197_94)]"
          />
          <div
            v-else-if="stageStatus(stage.key) === 'active'"
            class="h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgb(139_92_246)]"
          />
          <div v-else class="h-2 w-2 rounded-full border-[1.5px] border-muted-foreground/20" />
        </div>

        <!-- 文字标签 -->
        <span
          class="text-xs"
          :class="{
            'text-green-500': stageStatus(stage.key) === 'completed',
            'font-semibold text-violet-500': stageStatus(stage.key) === 'active',
            'text-muted-foreground/40': stageStatus(stage.key) === 'pending',
          }"
        >
          {{ stage.label }}
        </span>
      </div>
    </template>

    <template v-if="evolutionStore.completedTag">
      <div class="ml-4 flex items-center gap-1.5">
        <div
          class="relative flex shrink-0 items-center justify-center"
          style="width: 20px; height: 20px"
        >
          <div class="membrane-breathe absolute inset-0 rounded-full border border-green-500/40" />
          <div class="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgb(34_197_94)]" />
        </div>
        <span class="text-xs text-green-500">进化完成</span>
      </div>
      <span class="ml-2 font-mono text-xs text-green-500/70">{{
        evolutionStore.completedTag
      }}</span>
    </template>

    <div class="flex-1" />

    <button
      data-testid="reset-btn"
      class="rounded border border-red-500 px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10"
      :disabled="isResetting"
      @click="handleResetClick"
    >
      重置
    </button>

    <button
      v-if="evolutionStore.completedTag"
      class="ml-2 rounded bg-primary px-3 py-1 text-xs text-primary-foreground transition-opacity hover:opacity-90"
      @click="handleRestart"
    >
      重启以生效
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="showDialog"
      data-testid="reset-dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="handleCancelDialog"
    >
      <div class="w-[360px] rounded-lg border border-border bg-background p-6 shadow-lg">
        <h3 class="text-sm font-semibold text-foreground">确认重置？</h3>
        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
          <template v-if="isInProgress">
            此操作将丢弃本次进化的所有代码修改，回退到进化开始前的状态并重建
            Agent。对话记录将被清空。此操作不可恢复。
          </template>
          <template v-else> 此操作将重建 Agent 并清空对话记录。 </template>
        </p>
        <div class="mt-5 flex justify-end gap-3">
          <button
            class="rounded border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            @click="handleCancelDialog"
          >
            取消
          </button>
          <button
            class="rounded bg-red-500 px-4 py-1.5 text-xs text-white hover:bg-red-600"
            :disabled="isResetting"
            @click="handleConfirmReset"
          >
            确认重置
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes cell-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

.membrane-breathe {
  animation: cell-breathe 3s ease-in-out infinite;
}

.membrane-breathe-fast {
  animation: cell-breathe 2.5s ease-in-out infinite;
}

.membrane-breathe-delayed {
  animation: cell-breathe 2.5s ease-in-out infinite 0.3s;
}
</style>
