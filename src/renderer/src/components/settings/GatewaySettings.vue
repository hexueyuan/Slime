<template>
  <div class="flex h-full flex-col">
    <div class="space-y-4">
      <!-- 监听端口 -->
      <div class="space-y-1">
        <label class="text-xs text-muted-foreground">监听端口</label>
        <input
          v-model.number="form.port"
          type="number"
          class="w-full rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      <!-- 熔断器 -->
      <fieldset class="space-y-2 rounded-md border border-border p-3">
        <legend class="px-1 text-xs font-medium text-muted-foreground">熔断器</legend>
        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">失败阈值</label>
            <input
              v-model.number="form.circuitFailureThreshold"
              type="number"
              class="w-full rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">初始冷却 (秒)</label>
            <input
              v-model.number="form.circuitBaseCooldown"
              type="number"
              class="w-full rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">最大冷却 (秒)</label>
            <input
              v-model.number="form.circuitMaxCooldown"
              type="number"
              class="w-full rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>
      </fieldset>

      <!-- 数据保留 -->
      <fieldset class="space-y-2 rounded-md border border-border p-3">
        <legend class="px-1 text-xs font-medium text-muted-foreground">数据保留</legend>
        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">原始日志 (天)</label>
            <input
              v-model.number="form.retentionRawDays"
              type="number"
              class="w-full rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">小时聚合 (天)</label>
            <input
              v-model.number="form.retentionHourlyDays"
              type="number"
              class="w-full rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">天聚合 (天)</label>
            <input
              v-model.number="form.retentionDailyDays"
              type="number"
              class="w-full rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>
      </fieldset>
    </div>

    <!-- 保存 -->
    <div class="mt-auto flex items-center gap-3 pt-4">
      <button
        class="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        @click="onSave"
      >
        保存
      </button>
      <span v-if="saveStatus" class="text-xs text-green-500">{{ saveStatus }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useConfigStore } from "@/stores/config";

const configStore = useConfigStore();
const saveStatus = ref("");

const form = reactive({
  port: 8930,
  circuitFailureThreshold: 5,
  circuitBaseCooldown: 30,
  circuitMaxCooldown: 300,
  retentionRawDays: 7,
  retentionHourlyDays: 30,
  retentionDailyDays: 90,
});

onMounted(async () => {
  form.port = ((await configStore.get("gateway.port")) as number) || 8930;
  form.circuitFailureThreshold =
    ((await configStore.get("gateway.circuit.failureThreshold")) as number) || 5;
  form.circuitBaseCooldown =
    ((await configStore.get("gateway.circuit.baseCooldown")) as number) || 30;
  form.circuitMaxCooldown =
    ((await configStore.get("gateway.circuit.maxCooldown")) as number) || 300;
  form.retentionRawDays = ((await configStore.get("gateway.retention.rawDays")) as number) || 7;
  form.retentionHourlyDays =
    ((await configStore.get("gateway.retention.hourlyDays")) as number) || 30;
  form.retentionDailyDays =
    ((await configStore.get("gateway.retention.dailyDays")) as number) || 90;
});

async function onSave() {
  await configStore.set("gateway.port", form.port);
  await configStore.set("gateway.circuit.failureThreshold", form.circuitFailureThreshold);
  await configStore.set("gateway.circuit.baseCooldown", form.circuitBaseCooldown);
  await configStore.set("gateway.circuit.maxCooldown", form.circuitMaxCooldown);
  await configStore.set("gateway.retention.rawDays", form.retentionRawDays);
  await configStore.set("gateway.retention.hourlyDays", form.retentionHourlyDays);
  await configStore.set("gateway.retention.dailyDays", form.retentionDailyDays);
  saveStatus.value = "已保存";
  setTimeout(() => {
    saveStatus.value = "";
  }, 2000);
}
</script>
