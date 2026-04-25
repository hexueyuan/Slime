<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { EvolutionNode } from "@shared/types/evolution";
import { usePresenter } from "@/composables/usePresenter";
import { EVOLUTION_EVENTS } from "@shared/events";

const evolutionPresenter = usePresenter("evolutionPresenter");

const nodes = ref<EvolutionNode[]>([]);
const isLoading = ref(true);
const rollbackTarget = ref<EvolutionNode | null>(null);

async function loadHistory() {
  isLoading.value = true;
  try {
    nodes.value = await evolutionPresenter.getHistory();
  } catch {
    nodes.value = [];
  } finally {
    isLoading.value = false;
  }
}

async function confirmRollback() {
  if (!rollbackTarget.value) return;
  await evolutionPresenter.rollback(rollbackTarget.value.tag);
  rollbackTarget.value = null;
  await loadHistory();
}

onMounted(() => {
  loadHistory();
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.COMPLETED, () => loadHistory());
});

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners(EVOLUTION_EVENTS.COMPLETED);
});
</script>

<template>
  <div class="flex h-full flex-col overflow-y-auto">
    <!-- Loading -->
    <div
      v-if="isLoading"
      data-testid="history-loading"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      加载中...
    </div>

    <!-- Empty -->
    <div
      v-else-if="nodes.length === 0"
      data-testid="history-empty"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      还没有进化记录
    </div>

    <!-- List -->
    <div v-else class="p-3">
      <div
        v-for="(node, index) in nodes"
        :key="node.tag"
        data-testid="history-item"
        class="relative flex gap-3 pb-4"
      >
        <!-- Timeline indicator -->
        <div class="flex flex-col items-center pt-1">
          <div
            class="h-2.5 w-2.5 shrink-0 rounded-full border-2"
            :class="
              index === 0
                ? 'border-violet-500 bg-violet-500'
                : 'border-muted-foreground/40 bg-transparent'
            "
          />
          <div v-if="index < nodes.length - 1" class="mt-1 w-px flex-1 bg-border" />
        </div>

        <!-- Content -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="font-mono text-xs font-semibold"
              :class="index === 0 ? 'text-violet-500' : 'text-foreground'"
            >
              {{ node.tag }}
            </span>
            <span
              v-if="index === 0"
              class="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400"
            >
              当前
            </span>
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            <span v-if="node.createdAt">{{ node.createdAt }}</span>
            <template v-if="node.request">
              <span v-if="node.createdAt" class="mx-1 opacity-40">|</span>
              <span class="truncate">{{ node.request }}</span>
            </template>
          </div>

          <!-- Rollback button (non-current only) -->
          <button
            v-if="index !== 0"
            data-testid="rollback-btn"
            class="mt-1.5 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-violet-500 hover:text-violet-400"
            @click="rollbackTarget = node"
          >
            回滚到此版本
          </button>
        </div>
      </div>
    </div>

    <!-- Rollback confirm dialog -->
    <Teleport to="body">
      <div
        v-if="rollbackTarget"
        data-testid="rollback-dialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="rollbackTarget = null"
      >
        <div class="w-80 rounded-lg border border-border bg-background p-5 shadow-xl">
          <h3 class="text-sm font-semibold text-foreground">确认回滚</h3>
          <p class="mt-2 text-xs text-muted-foreground">
            即将回滚到
            <code class="rounded bg-muted px-1 py-0.5 font-mono text-violet-400">{{
              rollbackTarget.tag
            }}</code>
          </p>
          <div class="mt-4 flex gap-2">
            <button
              data-testid="rollback-confirm-btn"
              class="flex-1 rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500"
              @click="confirmRollback"
            >
              确认回滚
            </button>
            <button
              class="flex-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              @click="rollbackTarget = null"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
