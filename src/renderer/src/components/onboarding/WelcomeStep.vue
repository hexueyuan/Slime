<script setup lang="ts">
defineEmits<{ next: [] }>();
</script>

<template>
  <div data-testid="welcome-step" class="flex flex-col items-center gap-5">
    <!-- Nucleus glow -->
    <div
      class="h-[72px] w-[72px] animate-pulse rounded-full"
      style="
        background: radial-gradient(circle, #a855f7 0%, #7c3aed 40%, transparent 70%);
        box-shadow:
          0 0 24px rgba(168, 85, 247, 0.4),
          0 0 48px rgba(168, 85, 247, 0.1);
      "
    />
    <h1 class="text-xl font-semibold text-slate-200">欢迎来到 Slime</h1>
    <p class="max-w-[320px] text-center text-sm leading-relaxed text-slate-400">
      我是一个能够自我进化的软件生命体。<br />
      内置 LLM 网关统一管理多家 AI 服务，<br />
      让我理解你的需求，自主迭代进化。
    </p>
    <button
      data-testid="next-btn"
      class="mt-2 rounded-[20px] px-7 py-2.5 text-sm font-medium text-white"
      style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
      @click="$emit('next')"
    >
      配置网关 &rarr;
    </button>
  </div>
</template>
