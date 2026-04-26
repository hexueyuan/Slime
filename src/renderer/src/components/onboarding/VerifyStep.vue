<script setup lang="ts">
defineProps<{
  verifying: boolean;
  result: { success: boolean; error?: string; modelName?: string } | null;
  skipped: boolean;
}>();

defineEmits<{
  next: [];
  prev: [];
  skip: [];
  retry: [];
}>();
</script>

<template>
  <div data-testid="verify-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <!-- Loading -->
    <template v-if="verifying">
      <div
        data-testid="verify-loading"
        class="h-14 w-14 animate-pulse rounded-full border-2 border-violet-500/30 bg-violet-500/5"
        style="box-shadow: 0 0 20px rgba(168, 85, 247, 0.2)"
      />
      <h2 class="text-[17px] font-semibold text-slate-200">验证中...</h2>
      <p class="text-sm text-slate-400">正在连接 AI 服务</p>
    </template>

    <!-- Success -->
    <template v-else-if="result?.success">
      <div
        data-testid="verify-success"
        class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-500/30 bg-green-500/10 text-2xl"
        style="box-shadow: 0 0 20px rgba(34, 197, 94, 0.2)"
      >
        ✓
      </div>
      <h2 class="text-[17px] font-semibold text-slate-200">连接成功</h2>
      <p class="text-sm text-slate-400">
        API 服务已就绪<br />
        <span class="text-green-400">{{ result.modelName }}</span>
      </p>
      <button
        data-testid="next-btn"
        class="mt-2 rounded-[20px] px-7 py-2.5 text-sm font-medium text-white"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        @click="$emit('next')"
      >
        继续 →
      </button>
    </template>

    <!-- Error -->
    <template v-else-if="result && !result.success">
      <div
        data-testid="verify-error"
        class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-500/30 bg-red-500/10 text-2xl text-red-400"
      >
        ×
      </div>
      <h2 class="text-[17px] font-semibold text-slate-200">连接失败</h2>
      <p class="text-sm text-red-400">{{ result.error }}</p>
      <div class="mt-2 flex gap-2.5">
        <button
          data-testid="prev-btn"
          class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
          @click="$emit('prev')"
        >
          ← 返回修改
        </button>
        <button
          data-testid="skip-btn"
          class="rounded-[20px] border border-slate-600 bg-transparent px-6 py-2.5 text-sm text-slate-400"
          @click="$emit('skip')"
        >
          跳过验证
        </button>
      </div>
    </template>
  </div>
</template>
