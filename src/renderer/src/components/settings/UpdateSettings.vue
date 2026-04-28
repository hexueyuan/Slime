<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-base font-semibold text-foreground">更新</h3>
      <p class="mt-1 text-sm text-muted-foreground">当前版本 v{{ version }}</p>
    </div>
    <div class="space-y-3">
      <div>
        <h4 class="text-sm font-medium text-foreground">本地安装包更新</h4>
        <p class="mt-0.5 text-xs text-muted-foreground">从本地 .zip 文件手动更新 Slime</p>
      </div>
      <button
        :disabled="!isEnabled || applying"
        :title="!isEnabled ? '仅 packaged 模式支持' : undefined"
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        @click="handleUpdate"
      >
        {{ applying ? "安装中..." : "选择安装包并更新" }}
      </button>
      <p v-if="errorMsg" class="text-xs text-destructive">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";

const props = withDefaults(defineProps<{ forceEnabled?: boolean }>(), { forceEnabled: false });

const appPresenter = usePresenter("appPresenter");
const version = ref("");
const applying = ref(false);
const errorMsg = ref("");
const isEnabled = import.meta.env.PROD || props.forceEnabled;

onMounted(async () => {
  version.value = await appPresenter.getVersion();
});

async function handleUpdate() {
  errorMsg.value = "";
  const zipPath = await appPresenter.selectLocalZip();
  if (!zipPath) return;
  applying.value = true;
  const result = await appPresenter.applyLocalZip(zipPath);
  applying.value = false;
  if (!result.success) {
    errorMsg.value = result.error ?? "更新失败";
  }
}
</script>
