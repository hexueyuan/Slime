<script setup lang="ts">
import { computed } from "vue";
import type { Capability } from "@shared/types/gateway";

const ALL_CAPS: { key: Capability; label: string; icon: string }[] = [
  { key: "reasoning", label: "reasoning", icon: "🧠" },
  { key: "chat", label: "chat", icon: "💬" },
  { key: "vision", label: "vision", icon: "👁" },
  { key: "image_gen", label: "image_gen", icon: "🎨" },
];

const props = defineProps<{
  selectedModels: string[];
  modelCapabilities: Record<string, Capability[]>;
}>();

const emit = defineEmits<{
  "update:modelCapabilities": [value: Record<string, Capability[]>];
  next: [];
  prev: [];
}>();

function toggleCap(model: string, cap: Capability) {
  const current = props.modelCapabilities[model] || [];
  const updated = current.includes(cap) ? current.filter((c) => c !== cap) : [...current, cap];
  emit("update:modelCapabilities", { ...props.modelCapabilities, [model]: updated });
}

function hasCap(model: string, cap: Capability): boolean {
  return (props.modelCapabilities[model] || []).includes(cap);
}

const hasReasoning = computed(() =>
  Object.values(props.modelCapabilities).some((caps) => caps.includes("reasoning")),
);
</script>

<template>
  <div
    data-testid="capability-tag-step"
    class="flex w-full max-w-[420px] flex-col items-center gap-4"
  >
    <h2 class="text-[17px] font-semibold text-slate-200">标注模型能力</h2>
    <p class="text-sm text-slate-400">
      为每个模型标注其支持的能力，Slime 会据此解锁对应的功能组件。
    </p>

    <div class="flex w-full flex-col gap-3">
      <div
        v-for="model in selectedModels"
        :key="model"
        class="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3"
      >
        <div class="mb-2 text-sm font-medium text-slate-200">{{ model }}</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="cap in ALL_CAPS"
            :key="cap.key"
            :data-testid="`cap-${model}-${cap.key}`"
            class="rounded-md border px-3 py-1 text-xs transition-colors"
            :class="
              hasCap(model, cap.key)
                ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                : 'border-slate-600 bg-transparent text-slate-500'
            "
            @click="toggleCap(model, cap.key)"
          >
            {{ cap.icon }} {{ cap.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Warning -->
    <div
      v-if="!hasReasoning"
      class="w-full rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-400"
    >
      Slime 的基础功能需要推理能力，请确保至少标注一个模型为 reasoning。
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
        data-testid="next-btn"
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!hasReasoning"
        @click="emit('next')"
      >
        下一步 &rarr;
      </button>
    </div>
  </div>
</template>
