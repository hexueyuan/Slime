<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { EvolutionNode, EvolutionDependency } from "@shared/types/evolution";
import { usePresenter } from "@/composables/usePresenter";
import { useEvolutionStore } from "@/stores/evolution";
import { EVOLUTION_EVENTS } from "@shared/events";

const evolutionPresenter = usePresenter("evolutionPresenter");
const evolutionStore = useEvolutionStore();

const nodes = ref<EvolutionNode[]>([]);
const isLoading = ref(true);
const rollbackTarget = ref<EvolutionNode | null>(null);
const rollbackDeps = ref<EvolutionDependency[]>([]);
const rollbackChecking = ref(false);
const rollbackRunning = ref(false);
const rollbackError = ref<string | null>(null);
const noArchive = ref(false);

const cleanups: (() => void)[] = [];

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

async function openRollbackDialog(node: EvolutionNode) {
  rollbackTarget.value = node;
  rollbackDeps.value = [];
  rollbackError.value = null;
  noArchive.value = false;
  rollbackChecking.value = true;
  try {
    const result = (await window.electron.ipcRenderer.invoke("rollback:check-deps", node.tag)) as {
      dependencies: EvolutionDependency[];
      hasArchive: boolean;
    };
    if (!result.hasArchive) {
      noArchive.value = true;
    } else {
      rollbackDeps.value = result.dependencies || [];
    }
  } catch {
    rollbackDeps.value = [];
  } finally {
    rollbackChecking.value = false;
  }
}

async function confirmRollback() {
  if (!rollbackTarget.value) return;
  const tag = rollbackTarget.value.tag;
  rollbackRunning.value = true;
  rollbackError.value = null;
  try {
    const result = (await window.electron.ipcRenderer.invoke("rollback:start", tag)) as {
      success: boolean;
      error?: string;
    };
    if (!result.success) {
      rollbackRunning.value = false;
      rollbackError.value = result.error || "回滚失败";
    }
  } catch (err) {
    rollbackRunning.value = false;
    rollbackError.value = err instanceof Error ? err.message : "回滚失败";
  }
}

async function abortRollback() {
  try {
    await window.electron.ipcRenderer.invoke("rollback:abort");
  } catch {
    /* ignore */
  }
  rollbackRunning.value = false;
  rollbackError.value = null;
  rollbackTarget.value = null;
}

function closeDialog() {
  if (rollbackRunning.value) return;
  rollbackTarget.value = null;
  rollbackError.value = null;
  noArchive.value = false;
}

onMounted(() => {
  loadHistory();
  cleanups.push(
    window.electron.ipcRenderer.on(EVOLUTION_EVENTS.COMPLETED, () =>
      loadHistory(),
    ) as unknown as () => void,
    window.electron.ipcRenderer.on(EVOLUTION_EVENTS.ROLLBACK_COMPLETED, () => {
      rollbackRunning.value = false;
      rollbackTarget.value = null;
      loadHistory();
    }) as unknown as () => void,
    window.electron.ipcRenderer.on(EVOLUTION_EVENTS.ROLLBACK_FAILED, (...args: unknown[]) => {
      rollbackRunning.value = false;
      rollbackError.value = (args[1] as string) || "回滚失败";
    }) as unknown as () => void,
  );
});

onUnmounted(() => {
  for (const fn of cleanups) fn?.();
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
        :class="{ 'opacity-50': node.archived }"
      >
        <!-- Timeline indicator -->
        <div class="flex flex-col items-center pt-1">
          <div
            class="h-2.5 w-2.5 shrink-0 rounded-full border-2"
            :class="
              node.archived
                ? 'border-muted-foreground/30 bg-transparent'
                : index === 0
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
              :class="
                node.archived
                  ? 'text-muted-foreground'
                  : index === 0
                    ? 'text-violet-500'
                    : 'text-foreground'
              "
            >
              {{ node.tag }}
            </span>
            <span
              v-if="index === 0 && !node.archived"
              class="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400"
            >
              当前
            </span>
            <span
              v-if="node.archived"
              data-testid="archived-badge"
              class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              已归档
            </span>
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            <span v-if="node.createdAt">{{ node.createdAt }}</span>
            <template v-if="node.request">
              <span v-if="node.createdAt" class="mx-1 opacity-40">|</span>
              <span class="truncate">{{ node.request }}</span>
            </template>
          </div>

          <!-- Rollback button (non-archived only) -->
          <button
            v-if="!node.archived"
            data-testid="rollback-btn"
            :disabled="evolutionStore.rollbackInProgress"
            class="mt-1.5 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-violet-500 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            @click="openRollbackDialog(node)"
          >
            回滚此进化
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
        @click.self="closeDialog"
      >
        <div class="w-96 rounded-lg border border-border bg-background p-5 shadow-xl">
          <h3 class="text-sm font-semibold text-foreground">确认回滚</h3>
          <p class="mt-2 text-xs text-muted-foreground">
            即将回滚:
            <code class="rounded bg-muted px-1 py-0.5 font-mono text-violet-400">{{
              rollbackTarget.tag
            }}</code>
          </p>

          <!-- Checking deps -->
          <div v-if="rollbackChecking" class="mt-3 text-xs text-muted-foreground">
            检查依赖关系...
          </div>

          <!-- No archive -->
          <p
            v-else-if="noArchive"
            data-testid="no-archive-msg"
            class="mt-3 text-xs text-muted-foreground"
          >
            此版本无进化档案，不支持语义回滚
          </p>

          <!-- No deps -->
          <p
            v-else-if="rollbackDeps.length === 0 && !rollbackError"
            class="mt-3 text-xs text-muted-foreground"
          >
            将使用 AI 语义化清理此进化的代码
          </p>

          <!-- Has deps warning -->
          <div v-else-if="rollbackDeps.length > 0 && !rollbackError" class="mt-3">
            <p class="text-xs font-medium text-amber-400">⚠️ 以下进化可能受到影响：</p>
            <ul class="mt-1 space-y-1">
              <li
                v-for="dep in rollbackDeps"
                :key="dep.tag"
                data-testid="dep-item"
                class="text-xs text-muted-foreground"
              >
                <span class="font-mono">{{ dep.tag }}</span> — {{ dep.summary }}
                <span class="block text-[10px] opacity-60">
                  重叠文件: {{ dep.overlappingFiles.join(", ") }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Error state -->
          <div
            v-if="rollbackError"
            data-testid="rollback-error"
            class="mt-3 rounded bg-red-500/10 p-2 text-xs text-red-400"
          >
            回滚失败: {{ rollbackError }}
          </div>

          <!-- Running state -->
          <div v-if="rollbackRunning && !rollbackError" class="mt-3 text-xs text-violet-400">
            AI 正在执行语义回滚...
          </div>

          <div class="mt-4 flex gap-2">
            <template v-if="noArchive || (!rollbackRunning && rollbackError)">
              <button
                class="flex-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                @click="closeDialog"
              >
                关闭
              </button>
            </template>
            <template v-else-if="!rollbackRunning && !rollbackError">
              <button
                data-testid="rollback-confirm-btn"
                :disabled="rollbackChecking"
                class="flex-1 rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                @click="confirmRollback"
              >
                确认回滚
              </button>
              <button
                class="flex-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                @click="closeDialog"
              >
                取消
              </button>
            </template>
            <template v-else-if="rollbackRunning && rollbackError">
              <button
                data-testid="abort-rollback-btn"
                class="flex-1 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
                @click="abortRollback"
              >
                放弃回滚
              </button>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
