<script setup lang="ts">
import { ref, computed } from "vue";
import { useEvolutionStore } from "@/stores/evolution";
import { usePresenter } from "@/composables/usePresenter";
import { useSessionStore } from "@/stores/session";
import { useMessageStore } from "@/stores/chat";

const evolutionStore = useEvolutionStore();
const sessionStore = useSessionStore();
const messageStore = useMessageStore();
const evolutionPresenter = usePresenter("evolutionPresenter");
const sessionPresenter = usePresenter("sessionPresenter");

const stages = [
  { key: "discuss", label: "需求澄清" },
  { key: "coding", label: "执行进化" },
  { key: "applying", label: "应用变更" },
] as const;

const showDialog = ref(false);
const isDiscarding = ref(false);

function stageStatus(stageKey: string): "completed" | "active" | "pending" {
  const stageKeys = stages.map((s) => s.key);
  const idx = stageKeys.indexOf(stageKey as any);
  const currentIdx = stageKeys.indexOf(evolutionStore.stage as any);
  if (evolutionStore.stage === "idle") return "completed";
  if (idx < currentIdx) return "completed";
  if (idx === currentIdx) return "active";
  return "pending";
}

const isActive = computed(() => evolutionStore.stage !== "idle" || !!evolutionStore.completedTag);

const isInProgress = computed(() => evolutionStore.stage !== "idle");

function handleDiscardClick() {
  showDialog.value = true;
}

function handleCancelDialog() {
  showDialog.value = false;
}

async function handleConfirmDiscard() {
  isDiscarding.value = true;
  try {
    await evolutionPresenter.cancel();
    if (sessionStore.activeSessionId) {
      await sessionPresenter.clearMessages(sessionStore.activeSessionId);
      messageStore.clearAll();
    }
  } finally {
    isDiscarding.value = false;
    showDialog.value = false;
  }
}

function handleRestart() {
  evolutionPresenter.restart();
}
</script>

<template>
  <div
    v-if="isActive"
    data-testid="evolution-status-bar"
    class="flex items-center border-b border-border px-4 py-2"
  >
    <template v-for="(stage, i) in stages" :key="stage.key">
      <div
        v-if="i > 0"
        class="mx-2 h-0.5 w-6"
        :class="
          stageStatus(stage.key) !== 'pending'
            ? 'bg-green-500'
            : 'bg-border'
        "
      />
      <div class="flex items-center gap-1.5">
        <div
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="{
            'bg-green-500': stageStatus(stage.key) === 'completed',
            'bg-primary shadow-[0_0_6px_rgba(124,106,239,0.5)]':
              stageStatus(stage.key) === 'active',
            'border-2 border-muted-foreground/30': stageStatus(stage.key) === 'pending',
          }"
        />
        <span
          class="text-xs"
          :class="{
            'text-green-500': stageStatus(stage.key) === 'completed',
            'font-semibold text-primary': stageStatus(stage.key) === 'active',
            'text-muted-foreground': stageStatus(stage.key) === 'pending',
          }"
        >
          {{ stage.label }}
        </span>
      </div>
    </template>

    <template v-if="evolutionStore.completedTag">
      <div class="ml-4 rounded bg-green-500/10 px-2 py-0.5">
        <span class="text-xs font-medium text-green-500">✓ 进化完成</span>
      </div>
      <span class="ml-2 font-mono text-xs text-primary">{{ evolutionStore.completedTag }}</span>
    </template>

    <div class="flex-1" />

    <button
      v-if="isInProgress"
      data-testid="discard-btn"
      class="rounded border border-red-500 px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10"
      :disabled="isDiscarding"
      @click="handleDiscardClick"
    >
      丢弃进化
    </button>

    <button
      v-if="evolutionStore.completedTag"
      class="rounded bg-primary px-3 py-1 text-xs text-primary-foreground transition-opacity hover:opacity-90"
      @click="handleRestart"
    >
      重启以生效
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="showDialog"
      data-testid="discard-dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="handleCancelDialog"
    >
      <div class="w-[360px] rounded-lg border border-border bg-background p-6 shadow-lg">
        <h3 class="text-sm font-semibold text-foreground">确认丢弃进化？</h3>
        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
          此操作将丢弃本次进化的所有代码修改，回退到进化开始前的状态，并清空当前对话记录。此操作不可恢复。
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
            :disabled="isDiscarding"
            @click="handleConfirmDiscard"
          >
            确认丢弃
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
