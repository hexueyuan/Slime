<script setup lang="ts">
import { ref, computed, watch } from "vue";

const props = defineProps<{
  userName: string;
}>();

const emit = defineEmits<{
  "update:userName": [value: string];
  complete: [];
  prev: [];
}>();

const localName = ref(props.userName);

const canComplete = computed(() => localName.value.trim().length > 0);

watch(localName, (val) => emit("update:userName", val));
</script>

<template>
  <div
    data-testid="identity-complete-step"
    class="flex w-full max-w-[360px] flex-col items-center gap-4"
  >
    <!-- Green nucleus -->
    <div
      class="h-14 w-14 rounded-full"
      style="
        background: radial-gradient(circle, #22c55e 0%, #16a34a 50%, transparent 80%);
        box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
      "
    />
    <h2 class="text-[17px] font-semibold text-slate-200">最后一步</h2>

    <!-- Username -->
    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">用户名</label>
      <input
        v-model="localName"
        data-testid="onboard-username"
        type="text"
        placeholder="何雪源"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
      />
      <p v-if="localName" class="text-[11px] text-slate-500">完成后你可以开始和 HalAI 对话了</p>
      <p v-else class="text-[11px] text-slate-500">将显示在对话消息旁</p>
    </div>

    <!-- Nav -->
    <div class="mt-2 flex gap-2.5">
      <button
        data-testid="prev-btn"
        class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
        @click="emit('prev')"
      >
        &larr; 返回
      </button>
      <button
        data-testid="complete-btn"
        class="rounded-[20px] px-7 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!canComplete"
        @click="emit('complete')"
      >
        进入 Slime &rarr;
      </button>
    </div>
  </div>
</template>
