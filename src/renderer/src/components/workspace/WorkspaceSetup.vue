<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Icon } from "@iconify/vue";
import type { InitProgress } from "@shared/types/presenters";
import { WORKSPACE_EVENTS } from "@shared/events";
import { usePresenter } from "@/composables/usePresenter";

const emit = defineEmits<{
  ready: [];
}>();

const workspacePresenter = usePresenter("workspacePresenter");

const stage = ref<InitProgress["stage"]>("clone");
const message = ref("准备初始化...");
const percent = ref(0);
const error = ref<string | null>(null);
const initializing = ref(false);

let cleanupListener: (() => void) | null = null;

function onProgress(...args: unknown[]) {
  const progress = args[0] as InitProgress;
  stage.value = progress.stage;
  message.value = progress.message;
  if (progress.percent !== undefined) {
    percent.value = progress.percent;
  }
  if (progress.stage === "error") {
    error.value = progress.message;
    initializing.value = false;
  }
  if (progress.stage === "done") {
    setTimeout(() => emit("ready"), 500);
  }
}

async function startInit() {
  error.value = null;
  initializing.value = true;
  const ok = await workspacePresenter.initialize();
  if (!ok && !error.value) {
    error.value = "初始化失败，请检查网络连接";
  }
  initializing.value = false;
}

onMounted(() => {
  cleanupListener = window.electron.ipcRenderer.on(WORKSPACE_EVENTS.INIT_PROGRESS, onProgress);
});

onUnmounted(() => {
  cleanupListener?.();
});
</script>

<template>
  <div class="flex h-full items-center justify-center bg-background">
    <div class="w-full max-w-md space-y-6 p-8">
      <div class="text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
        >
          <Icon icon="lucide:dna" class="h-8 w-8 text-primary" />
        </div>
        <h1 class="text-2xl font-semibold">进化实验室初始化</h1>
        <p class="mt-2 text-sm text-muted-foreground">首次使用需要克隆源码仓库</p>
      </div>

      <div v-if="!initializing && !error" class="space-y-4">
        <div class="rounded-lg border border-border bg-muted/50 p-4 text-sm">
          <p class="font-medium">即将执行：</p>
          <ul class="mt-2 space-y-1 text-muted-foreground">
            <li>• 克隆 Slime 源码仓库</li>
            <li>• 安装项目依赖</li>
          </ul>
        </div>
        <button
          class="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
          @click="startInit"
        >
          开始初始化
        </button>
      </div>

      <div v-else-if="initializing" class="space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span>{{ message }}</span>
            <span class="text-muted-foreground">{{ percent }}%</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full bg-primary transition-all duration-300"
              :style="{ width: percent + '%' }"
            />
          </div>
        </div>
        <p class="text-center text-xs text-muted-foreground">这可能需要几分钟，请耐心等待...</p>
      </div>

      <div v-else-if="error" class="space-y-4">
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p class="text-sm text-destructive">{{ error }}</p>
        </div>
        <button
          class="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
          @click="startInit"
        >
          重试
        </button>
      </div>
    </div>
  </div>
</template>
