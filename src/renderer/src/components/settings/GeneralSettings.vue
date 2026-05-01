<template>
  <div class="flex h-full flex-col gap-4">
    <!-- Obsidian Vault 路径 -->
    <div class="space-y-2">
      <label class="text-sm font-medium text-foreground">Obsidian Vault 路径</label>
      <div class="flex gap-2">
        <input
          v-model="vaultPath"
          type="text"
          placeholder="未设置，使用默认目录 (~/.slime/agents/)"
          class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
          @blur="saveVaultPath"
        />
        <button
          class="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
          @click="selectVaultDir"
        >
          选择目录
        </button>
        <button
          v-if="vaultPath"
          class="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
          @click="clearVaultPath"
        >
          清除
        </button>
      </div>
      <p class="text-xs text-muted-foreground">修改路径后，已有 Agent 目录不会自动迁移。</p>
    </div>

    <div class="rounded-md border border-red-800/50 p-4">
      <h3 class="mb-3 text-sm font-semibold text-red-500">危险区域</h3>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-foreground">重置数据</p>
          <p class="text-xs text-muted-foreground">删除所有本地数据并恢复出厂设置，操作不可撤销</p>
        </div>
        <div class="shrink-0">
          <span v-if="resetSuccess" class="text-sm text-green-500">重置成功，请重启应用</span>
          <template v-else>
            <button
              data-testid="reset-btn"
              class="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="resetting"
              @click="showConfirm = true"
            >
              重置数据
            </button>
            <p v-if="resetError" class="mt-1 text-xs text-red-500">{{ resetError }}</p>
          </template>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showConfirm" class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showConfirm = false" />
        <div class="relative w-80 rounded-lg border border-border bg-card p-5 shadow-xl">
          <h4 class="mb-2 text-sm font-semibold text-foreground">确认重置</h4>
          <p class="mb-4 text-xs text-muted-foreground">此操作不可撤销，确认删除所有数据？</p>
          <div class="flex justify-end gap-2">
            <button
              class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
              @click="showConfirm = false"
            >
              取消
            </button>
            <button
              data-testid="confirm-reset-btn"
              class="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
              @click="doReset"
            >
              确认删除
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";

const appPresenter = usePresenter("appPresenter");
const configPresenter = usePresenter("configPresenter");

const vaultPath = ref<string>("");

onMounted(async () => {
  const saved = await configPresenter.get("obsidian.vaultPath");
  vaultPath.value = typeof saved === "string" ? saved : "";
});

async function selectVaultDir() {
  const result = await window.electron.ipcRenderer.invoke("dialog:openDirectory");
  if (result) {
    vaultPath.value = result as string;
    await configPresenter.set("obsidian.vaultPath", result);
  }
}

async function clearVaultPath() {
  vaultPath.value = "";
  await configPresenter.set("obsidian.vaultPath", "");
}

async function saveVaultPath() {
  await configPresenter.set("obsidian.vaultPath", vaultPath.value);
}

const showConfirm = ref(false);
const resetting = ref(false);
const resetSuccess = ref(false);
const resetError = ref("");

async function doReset() {
  showConfirm.value = false;
  resetting.value = true;
  resetError.value = "";
  try {
    const result = (await appPresenter.resetAllData()) as { success: boolean; error?: string };
    if (result.success) {
      resetSuccess.value = true;
    } else {
      resetError.value = result.error ?? "重置失败";
    }
  } catch (err) {
    resetError.value = err instanceof Error ? err.message : "重置失败";
  } finally {
    resetting.value = false;
  }
}
</script>
