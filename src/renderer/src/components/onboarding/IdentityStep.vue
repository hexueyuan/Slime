<script setup lang="ts">
import { ref, computed, watch } from "vue";

const props = defineProps<{
  userName: string;
}>();

const emit = defineEmits<{
  "update:userName": [value: string];
  next: [];
  prev: [];
}>();

const localName = ref(props.userName);
const VALID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const validationError = computed(() => {
  if (!localName.value) return null;
  if (!VALID_PATTERN.test(localName.value)) return "只允许字母、数字、下划线和连字符";
  return null;
});

const canNext = computed(() => localName.value.trim().length > 0 && !validationError.value);

watch(localName, (val) => emit("update:userName", val));
</script>

<template>
  <div data-testid="identity-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <h2 class="text-[17px] font-semibold text-slate-200">你是谁？</h2>
    <p class="text-sm text-slate-400">设置你的标识，它会出现在每次进化的版本号中。</p>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">用户标识</label>
      <input
        v-model="localName"
        data-testid="onboard-username"
        type="text"
        placeholder="alice"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
      />
      <p v-if="validationError" data-testid="validation-error" class="text-xs text-red-400">
        {{ validationError }}
      </p>
      <p v-else-if="localName" class="text-[11px] text-slate-500">
        版本号示例: <span class="text-violet-400">egg-v0.1-{{ localName }}.1</span>
      </p>
    </div>

    <div class="mt-2 flex gap-2.5">
      <button
        data-testid="prev-btn"
        class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
        @click="emit('prev')"
      >
        ← 返回
      </button>
      <button
        data-testid="next-btn"
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!canNext"
        @click="emit('next')"
      >
        完成 →
      </button>
    </div>
  </div>
</template>
