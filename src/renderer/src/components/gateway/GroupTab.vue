<script setup lang="ts">
import { ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Group, GroupItem } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showEditor = ref(false);
const editingGroup = ref<Group | null>(null);

const form = ref({
  name: "",
  balanceMode: "round_robin" as Group["balanceMode"],
  items: [] as { channelId: number; modelName: string; priority: number; weight: number }[],
});

const balanceModeOptions = [
  { value: "round_robin", label: "Round Robin" },
  { value: "random", label: "Random" },
  { value: "failover", label: "Failover" },
  { value: "weighted", label: "Weighted" },
];

function openCreate() {
  editingGroup.value = null;
  form.value = {
    name: "",
    balanceMode: "round_robin",
    items: [{ channelId: 0, modelName: "", priority: 0, weight: 1 }],
  };
  showEditor.value = true;
}

async function openEdit(g: Group) {
  editingGroup.value = g;
  const items = await gw.listGroupItems(g.id);
  form.value = {
    name: g.name,
    balanceMode: g.balanceMode,
    items: items.length
      ? items.map((i: GroupItem) => ({
          channelId: i.channelId,
          modelName: i.modelName,
          priority: i.priority,
          weight: i.weight,
        }))
      : [{ channelId: 0, modelName: "", priority: 0, weight: 1 }],
  };
  showEditor.value = true;
}

function addItem() {
  form.value.items.push({ channelId: 0, modelName: "", priority: 0, weight: 1 });
}

function removeItem(idx: number) {
  form.value.items.splice(idx, 1);
}

async function save() {
  const validItems = form.value.items.filter((i) => i.channelId && i.modelName.trim());

  if (editingGroup.value) {
    const id = editingGroup.value.id;
    await gw.updateGroup(id, {
      name: form.value.name,
      balanceMode: form.value.balanceMode,
    });
    await gw.setGroupItems(id, validItems);
  } else {
    const g = await gw.createGroup({
      name: form.value.name,
      balanceMode: form.value.balanceMode,
    });
    await gw.setGroupItems(g.id, validItems);
  }

  showEditor.value = false;
  await store.loadGroups();
}

async function deleteGroup(id: number) {
  await gw.deleteGroup(id);
  await store.loadGroups();
}

function modelsForChannel(channelId: number): string[] {
  const ch = store.channels.find((c) => c.id === channelId);
  return ch?.models ?? [];
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-medium">分组</h3>
      <button
        class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
        @click="openCreate"
      >
        + 新增分组
      </button>
    </div>

    <!-- Group list -->
    <div v-if="store.groups.length" class="space-y-2">
      <div
        v-for="g in store.groups"
        :key="g.id"
        class="flex items-center justify-between rounded-lg bg-muted/30 p-3"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ g.name }}</span>
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ g.balanceMode }}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="编辑"
            @click="openEdit(g)"
          >
            <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
            title="删除"
            @click="deleteGroup(g.id)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="py-12 text-center text-sm text-muted-foreground">暂无分组</div>

    <!-- Editor overlay -->
    <Teleport to="body">
      <div v-if="showEditor" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showEditor = false" />
        <div
          class="relative max-h-[80vh] w-[520px] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl"
        >
          <h3 class="mb-4 text-sm font-medium">
            {{ editingGroup ? "编辑分组" : "新增分组" }}
          </h3>

          <!-- Name -->
          <label class="mb-3 block">
            <span class="mb-1 block text-xs text-muted-foreground">名称（对外模型名）</span>
            <input
              v-model="form.name"
              class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              placeholder="gpt-4o"
            />
          </label>

          <!-- Balance Mode -->
          <label class="mb-3 block">
            <span class="mb-1 block text-xs text-muted-foreground">均衡模式</span>
            <select
              v-model="form.balanceMode"
              class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
            >
              <option v-for="opt in balanceModeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <!-- Group Items -->
          <div class="mb-4">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">关联渠道</span>
              <button class="text-xs text-violet-500 hover:text-violet-400" @click="addItem">
                + 添加
              </button>
            </div>
            <div
              v-for="(item, idx) in form.items"
              :key="idx"
              class="mb-2 flex items-center gap-1.5"
            >
              <select
                v-model.number="item.channelId"
                class="w-32 shrink-0 rounded border border-input-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              >
                <option :value="0" disabled>渠道</option>
                <option v-for="ch in store.channels" :key="ch.id" :value="ch.id">
                  {{ ch.name }}
                </option>
              </select>
              <input
                v-model="item.modelName"
                :list="`models-${idx}`"
                class="min-w-0 flex-1 rounded border border-input-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="模型名"
              />
              <datalist :id="`models-${idx}`">
                <option v-for="m in modelsForChannel(item.channelId)" :key="m" :value="m" />
              </datalist>
              <input
                v-model.number="item.priority"
                type="number"
                class="w-16 shrink-0 rounded border border-input-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="优先"
                title="Priority"
              />
              <input
                v-model.number="item.weight"
                type="number"
                class="w-16 shrink-0 rounded border border-input-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="权重"
                title="Weight"
              />
              <button
                v-if="form.items.length > 1"
                class="shrink-0 rounded p-1.5 text-muted-foreground hover:text-red-400"
                @click="removeItem(idx)"
              >
                <Icon icon="lucide:x" class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <button
              class="rounded px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="showEditor = false"
            >
              取消
            </button>
            <button
              class="rounded bg-violet-600 px-4 py-1.5 text-xs text-white transition-colors hover:bg-violet-500"
              @click="save"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
