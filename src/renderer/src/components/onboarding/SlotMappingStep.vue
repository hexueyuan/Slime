<script setup lang="ts">
import { computed } from "vue";

const SLOTS = [
  { key: "reasoning_auto", label: "Reasoning Auto", desc: "自动选择推理等级" },
  { key: "reasoning_lite", label: "Reasoning Lite", desc: "轻量推理" },
  { key: "reasoning_pro", label: "Reasoning Pro", desc: "标准推理" },
  { key: "reasoning_max", label: "Reasoning Max", desc: "最强推理" },
  { key: "chat", label: "Chat", desc: "日常对话" },
] as const;

const props = defineProps<{
  selectedModels: string[];
  slotMapping: Record<string, string>;
}>();

const emit = defineEmits<{
  "update:slotMapping": [value: Record<string, string>];
  next: [];
  prev: [];
}>();

const hasModels = computed(() => props.selectedModels.length > 0);

function updateSlot(slotKey: string, model: string) {
  emit("update:slotMapping", { ...props.slotMapping, [slotKey]: model });
}

const assignedCount = computed(() => Object.values(props.slotMapping).filter((v) => v).length);
</script>

<template>
  <div
    data-testid="slot-mapping-step"
    class="flex w-full max-w-[360px] flex-col items-center gap-4"
  >
    <h2 class="text-[17px] font-semibold text-slate-200">配置模型 Slot</h2>
    <p class="text-sm text-slate-400">
      为不同场景分配模型。Slot 是 Slime 内部的能力槽位，进化时会按需调用。
    </p>

    <template v-if="hasModels">
      <div class="flex w-full flex-col gap-3">
        <div v-for="slot in SLOTS" :key="slot.key" class="flex w-full flex-col gap-1">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-slate-300">{{ slot.label }}</label>
            <span class="text-[10px] text-slate-500">{{ slot.desc }}</span>
          </div>
          <select
            :data-testid="`slot-${slot.key}`"
            :value="slotMapping[slot.key] || ''"
            class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-500/50"
            @change="updateSlot(slot.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">-- 未分配 --</option>
            <option v-for="model in selectedModels" :key="model" :value="model">
              {{ model }}
            </option>
          </select>
        </div>
      </div>
      <p class="text-[11px] text-slate-500">
        已分配 {{ assignedCount }}/{{ SLOTS.length }} 个 Slot
      </p>
    </template>

    <template v-else>
      <div
        class="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-6 text-center text-sm text-slate-500"
      >
        未选择任何模型，跳过 Slot 配置。<br />
        后续可在网关设置中手动添加。
      </div>
    </template>

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
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        @click="emit('next')"
      >
        {{ hasModels ? "下一步" : "跳过" }} &rarr;
      </button>
    </div>
  </div>
</template>
