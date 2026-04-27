<template>
  <div class="flex h-full flex-col">
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
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";

const appPresenter = usePresenter("appPresenter");

const showConfirm = ref(false);
const resetting = ref(false);
const resetSuccess = ref(false);
const resetError = ref("");

async function doReset() {
  showConfirm.value = false;
  resetting.value = true;
  resetError.value = "";
  const result = (await appPresenter.resetAllData()) as { success: boolean; error?: string };
  resetting.value = false;
  if (result.success) {
    resetSuccess.value = true;
  } else {
    resetError.value = result.error ?? "重置失败";
  }
}
</script>
