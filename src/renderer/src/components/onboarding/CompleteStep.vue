<script setup lang="ts">
defineProps<{
  provider: string;
  model: string;
  userName: string;
  skippedVerify: boolean;
}>();

defineEmits<{ complete: [] }>();
</script>

<template>
  <div data-testid="complete-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <!-- Green nucleus -->
    <div
      class="h-14 w-14 rounded-full"
      style="
        background: radial-gradient(circle, #22c55e 0%, #16a34a 50%, transparent 80%);
        box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
      "
    />
    <h2 class="text-[17px] font-semibold text-slate-200">准备就绪</h2>
    <p class="text-sm text-slate-400">一切配置完成，Slime 即将苏醒。</p>

    <!-- Warning if verify was skipped -->
    <div
      v-if="skippedVerify"
      class="w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400"
    >
      API 验证已跳过，请确保配置正确。
    </div>

    <!-- Summary -->
    <div class="w-full">
      <div class="flex items-center justify-between border-b border-violet-500/10 py-2.5">
        <span class="text-sm text-slate-500">AI Provider</span>
        <span class="text-sm font-medium text-slate-200">{{
          provider === "anthropic" ? "Anthropic" : "OpenAI"
        }}</span>
      </div>
      <div class="flex items-center justify-between border-b border-violet-500/10 py-2.5">
        <span class="text-sm text-slate-500">Model</span>
        <span class="text-sm font-medium text-slate-200">{{ model || "(默认)" }}</span>
      </div>
      <div class="flex items-center justify-between border-b border-violet-500/10 py-2.5">
        <span class="text-sm text-slate-500">用户标识</span>
        <span class="text-sm font-medium text-violet-400">{{ userName || "dev" }}</span>
      </div>
      <div class="flex items-center justify-between py-2.5">
        <span class="text-sm text-slate-500">版本号格式</span>
        <span class="text-sm font-medium text-slate-200">egg-v0.1-{{ userName || "dev" }}.N</span>
      </div>
    </div>

    <button
      data-testid="complete-btn"
      class="mt-2 rounded-[20px] px-7 py-2.5 text-sm font-medium text-white"
      style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
      @click="$emit('complete')"
    >
      进入 Slime →
    </button>
  </div>
</template>
