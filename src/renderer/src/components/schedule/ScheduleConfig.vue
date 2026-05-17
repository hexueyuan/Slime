<template>
  <div class="space-y-3">
    <SlimeChecklist
      :items="scheduleToggleItems"
      density="compact"
      @toggle="(_, checked) => toggleEnabled(checked)"
    />

    <template v-if="enabled">
      <div>
        <div class="mb-1 text-xs text-muted-foreground">首次执行时间</div>
        <input
          type="datetime-local"
          :value="scheduledLocal"
          class="w-full rounded-md border border-border bg-muted/30 px-2 py-1 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          @input="onScheduledChange"
        />
      </div>

      <SlimeChecklist
        :items="repeatToggleItems"
        density="compact"
        @toggle="(_, checked) => toggleRepeat(checked)"
      />

      <template v-if="repeatEnabled">
        <div class="flex flex-wrap gap-1">
          <button
            v-for="preset in presets"
            :key="preset.value"
            :class="[
              'rounded px-2 py-0.5 text-xs',
              activePreset === preset.value
                ? 'bg-violet-500/20 text-violet-400'
                : 'text-muted-foreground hover:bg-muted',
            ]"
            @click="selectPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div v-if="activePreset === 'custom'" class="flex items-center gap-2 text-xs">
          <input
            v-model.number="customHours"
            type="number"
            min="0"
            class="w-14 rounded border border-border bg-muted/30 px-1 py-0.5 text-center text-foreground"
            @input="emitCustomInterval"
          />
          <span class="text-muted-foreground">小时</span>
          <input
            v-model.number="customMinutes"
            type="number"
            min="0"
            max="59"
            class="w-14 rounded border border-border bg-muted/30 px-1 py-0.5 text-center text-foreground"
            @input="emitCustomInterval"
          />
          <span class="text-muted-foreground">分钟</span>
        </div>
      </template>

      <div v-if="nextTimes.length > 0" class="rounded bg-muted/30 p-2">
        <div class="mb-1 text-[10px] text-muted-foreground">接下来执行时间</div>
        <div v-for="(t, i) in nextTimes" :key="i" class="text-xs text-foreground">
          {{ formatScheduleTime(t) }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { RepeatPreset } from "@shared/types/schedule";
import { REPEAT_PRESETS, getNextExecutions, formatScheduleTime } from "@/utils/scheduleUtils";
import SlimeChecklist, { type SlimeChecklistItem } from "@/components/ui/SlimeChecklist.vue";

const props = defineProps<{
  scheduledAt?: number;
  repeatInterval?: number;
}>();

const emit = defineEmits<{
  "update:scheduledAt": [value: number | undefined];
  "update:repeatInterval": [value: number | undefined];
}>();

const enabled = computed(() => props.scheduledAt != null);
const repeatEnabled = computed(() => (props.repeatInterval ?? 0) > 0);

const scheduleToggleItems = computed<SlimeChecklistItem[]>(() => [
  {
    id: "scheduled",
    title: "启用定时",
    checked: enabled.value,
  },
]);

const repeatToggleItems = computed<SlimeChecklistItem[]>(() => [
  {
    id: "repeat",
    title: "循环执行",
    checked: repeatEnabled.value,
  },
]);

const presets = REPEAT_PRESETS.filter((p) => p.value !== "none");

const activePreset = computed<RepeatPreset>(() => {
  if (!props.repeatInterval) return "none";
  const found = REPEAT_PRESETS.find((p) => p.minutes === props.repeatInterval);
  return found ? found.value : "custom";
});

const customHours = ref(0);
const customMinutes = ref(0);

watch(
  () => props.repeatInterval,
  (v) => {
    if (v && activePreset.value === "custom") {
      customHours.value = Math.floor(v / 60);
      customMinutes.value = v % 60;
    }
  },
  { immediate: true },
);

const scheduledLocal = computed(() => {
  if (!props.scheduledAt) return "";
  const d = new Date(props.scheduledAt);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
});

const nextTimes = computed(() => {
  if (!props.scheduledAt) return [];
  return getNextExecutions(props.scheduledAt, props.repeatInterval, 3);
});

function toggleEnabled(checked: boolean): void {
  if (checked) {
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    emit("update:scheduledAt", next.getTime());
  } else {
    emit("update:scheduledAt", undefined);
    emit("update:repeatInterval", undefined);
  }
}

function toggleRepeat(checked: boolean): void {
  if (checked) {
    emit("update:repeatInterval", 1440);
  } else {
    emit("update:repeatInterval", undefined);
  }
}

function onScheduledChange(e: Event): void {
  const value = (e.target as HTMLInputElement).value;
  if (value) {
    emit("update:scheduledAt", new Date(value).getTime());
  }
}

function selectPreset(preset: { value: RepeatPreset; minutes: number | null }): void {
  if (preset.value === "custom") {
    const total = customHours.value * 60 + customMinutes.value;
    emit("update:repeatInterval", total > 0 ? total : 60);
  } else if (preset.minutes) {
    emit("update:repeatInterval", preset.minutes);
  }
}

function emitCustomInterval(): void {
  const total = customHours.value * 60 + customMinutes.value;
  if (total > 0) emit("update:repeatInterval", total);
}
</script>
