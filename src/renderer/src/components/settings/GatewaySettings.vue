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

      <!-- Slot 映射 -->
      <fieldset class="space-y-2 rounded-md border border-border p-3">
        <legend class="px-1 text-xs font-medium text-muted-foreground">Slot 映射</legend>
        <div class="space-y-2">
          <div v-for="slot in SLOTS" :key="slot.key" class="flex items-center gap-3">
            <span class="w-32 shrink-0 text-xs text-muted-foreground">{{ slot.label }}</span>
            <select
              :value="slotGroupMap[slot.key] ?? ''"
              class="flex-1 rounded-md border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              @change="onSlotChange(slot.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">未绑定</option>
              <option v-for="g in groups" :key="g.id" :value="String(g.id)">{{ g.name }}</option>
            </select>
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
import { ref, reactive, onMounted, computed } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useConfigStore } from "@/stores/config";
import { useGatewayStore } from "@/stores/gateway";
import type { ModelSlot } from "@shared/types/gateway";

interface SlotDef {
  key: string;
  label: string;
  slot: ModelSlot;
}

const SLOTS: SlotDef[] = [
  {
    key: "reasoning-auto",
    label: "Reasoning Auto",
    slot: { category: "text", tier: "reasoning", level: "auto" },
  },
  {
    key: "reasoning-lite",
    label: "Reasoning Lite",
    slot: { category: "text", tier: "reasoning", level: "lite" },
  },
  {
    key: "reasoning-pro",
    label: "Reasoning Pro",
    slot: { category: "text", tier: "reasoning", level: "pro" },
  },
  {
    key: "reasoning-max",
    label: "Reasoning Max",
    slot: { category: "text", tier: "reasoning", level: "max" },
  },
  { key: "chat", label: "Chat", slot: { category: "text", tier: "chat" } },
];

const configStore = useConfigStore();
const gatewayStore = useGatewayStore();
const gwPresenter = usePresenter("gatewayPresenter");
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

const groups = computed(() => gatewayStore.groups);

// slot key -> group id string mapping, built from groups that already have a slot assigned
const slotGroupMap = computed(() => {
  const map: Record<string, string> = {};
  for (const g of groups.value || []) {
    if (!g.slot) continue;
    const key = slotToKey(g.slot);
    if (key) map[key] = String(g.id);
  }
  return map;
});

function slotToKey(slot: ModelSlot): string | null {
  if (slot.category === "text" && slot.tier === "chat") return "chat";
  if (slot.category === "text" && slot.tier === "reasoning" && slot.level) {
    return `reasoning-${slot.level}`;
  }
  return null;
}

async function onSlotChange(slotKey: string, groupIdStr: string) {
  const def = SLOTS.find((s) => s.key === slotKey);
  if (!def) return;

  // clear slot from any group that currently holds this slot
  for (const g of groups.value) {
    if (g.slot && slotToKey(g.slot) === slotKey) {
      await gwPresenter.updateGroup(g.id, { slot: undefined });
    }
  }

  // assign slot to selected group
  if (groupIdStr) {
    const gid = Number(groupIdStr);
    await gwPresenter.updateGroup(gid, { slot: def.slot });
  }

  await gatewayStore.loadGroups();
}

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

  await gatewayStore.loadGroups();
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
