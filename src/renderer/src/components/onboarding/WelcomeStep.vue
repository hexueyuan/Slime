<script setup lang="ts">
defineEmits<{ next: [] }>()
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
      通过 AI Agent，我可以理解你的需求，<br />
      修改自己的代码，然后重生为更好的版本。
    </p>
    <button
      data-testid="next-btn"
      class="mt-2 rounded-[20px] px-7 py-2.5 text-sm font-medium text-white"
      style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
      @click="$emit('next')"
    >
      初始化配置 →
    </button>
  </div>
</template>
