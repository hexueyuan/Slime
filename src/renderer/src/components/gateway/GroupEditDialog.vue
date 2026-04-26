<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Group, GroupItem } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";

interface SelectedItem {
  channelId: number;
  channelName: string;
  modelName: string;
}

const props = defineProps<{
  open: boolean;
  group?: Group | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const form = ref({
  name: "",
  balanceMode: "round_robin" as Group["balanceMode"],
});

const selectedItems = ref<SelectedItem[]>([]);
const searchQuery = ref("");
const expandedChannels = ref<Set<number>>(new Set());

const balanceModeOptions = [
  { value: "round_robin", label: "Round Robin" },
  { value: "random", label: "Random" },
  { value: "failover", label: "Failover" },
  { value: "weighted", label: "Weighted" },
];

const selectedKeys = computed(
  () => new Set(selectedItems.value.map((i) => `${i.channelId}-${i.modelName}`)),
);

const filteredChannels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return store.channels;
  return store.channels
    .map((ch) => {
      if (ch.name.toLowerCase().includes(q)) return ch;
      const filtered = ch.models.filter((m) => m.toLowerCase().includes(q));
      if (filtered.length === 0) return null;
      return { ...ch, models: filtered };
    })
    .filter(Boolean) as typeof store.channels;
});

function toggleChannel(id: number) {
  const next = new Set(expandedChannels.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedChannels.value = next;
}

function addItem(channelId: number, channelName: string, modelName: string) {
  const key = `${channelId}-${modelName}`;
  if (selectedKeys.value.has(key)) return;
  selectedItems.value.push({ channelId, channelName, modelName });
}

function removeItem(index: number) {
  selectedItems.value.splice(index, 1);
}

function clearAll() {
  selectedItems.value = [];
}

async function loadEditData() {
  if (!props.group) {
    form.value = { name: "", balanceMode: "round_robin" };
    selectedItems.value = [];
    return;
  }
  form.value = { name: props.group.name, balanceMode: props.group.balanceMode };
  const items: GroupItem[] = (await gw.listGroupItems(props.group.id)) ?? [];
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  selectedItems.value = sorted.map((i) => {
    const ch = store.channels.find((c) => c.id === i.channelId);
    return {
      channelId: i.channelId,
      channelName: ch?.name ?? `#${i.channelId}`,
      modelName: i.modelName,
    };
  });
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      searchQuery.value = "";
      expandedChannels.value = new Set(store.channels.map((c) => c.id));
      loadEditData();
    }
  },
  { immediate: true },
);

async function save() {
  if (!form.value.name.trim()) return;
  const items = selectedItems.value.map((item, i) => ({
    channelId: item.channelId,
    modelName: item.modelName,
    priority: selectedItems.value.length - 1 - i,
    weight: 1,
  }));

  try {
    if (props.group) {
      await gw.updateGroup(props.group.id, {
        name: form.value.name,
        balanceMode: form.value.balanceMode,
      });
      await gw.setGroupItems(props.group.id, items);
    } else {
      const g = await gw.createGroup({
        name: form.value.name,
        balanceMode: form.value.balanceMode,
      });
      await gw.setGroupItems(g.id, items);
    }
    emit("saved");
    emit("update:open", false);
  } catch {
    // keep dialog open on failure
  }
}

function close() {
  emit("update:open", false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      data-testid="group-edit-overlay"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div class="absolute inset-0 bg-black/50" @click="close" />
      <div
        class="relative max-h-[80vh] w-[800px] overflow-hidden rounded-lg border border-border bg-card shadow-xl flex flex-col"
      >
        <!-- Header -->
        <div class="shrink-0 p-5 pb-0">
          <h3 class="mb-4 text-sm font-medium">
            {{ group ? "编辑分组" : "新增分组" }}
          </h3>

          <!-- Name + Balance Mode -->
          <div class="mb-4 flex gap-3">
            <label class="flex-1">
              <span class="mb-1 block text-xs text-muted-foreground">名称（对外模型名）</span>
              <input
                v-model="form.name"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="gpt-4o"
              />
            </label>
            <label class="flex-1">
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
          </div>
        </div>

        <!-- Dual Panel -->
        <div class="flex-1 min-h-0 px-5 pb-0">
          <div class="grid grid-cols-2 gap-3 h-[400px]">
            <!-- Left Panel: Available Models -->
            <div class="flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden">
              <div
                class="shrink-0 flex items-center justify-between border-b border-border px-3 py-2"
              >
                <span class="text-xs text-muted-foreground">可选模型</span>
                <input
                  v-model="searchQuery"
                  class="w-32 rounded border border-input-border bg-input px-2 py-1 text-xs text-foreground outline-none focus:border-violet-500"
                  placeholder="搜索模型..."
                />
              </div>
              <div class="flex-1 overflow-y-auto">
                <div v-for="ch in filteredChannels" :key="ch.id">
                  <button
                    class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-muted/50"
                    @click="toggleChannel(ch.id)"
                  >
                    <Icon
                      :icon="
                        expandedChannels.has(ch.id) ? 'lucide:chevron-down' : 'lucide:chevron-right'
                      "
                      class="h-3 w-3 shrink-0 text-muted-foreground"
                    />
                    <span class="text-xs font-medium">{{ ch.name }}</span>
                    <span class="ml-auto text-[10px] text-muted-foreground">{{
                      ch.models.length
                    }}</span>
                  </button>
                  <div v-if="expandedChannels.has(ch.id)">
                    <button
                      v-for="m in ch.models"
                      :key="m"
                      class="flex w-full items-center justify-between px-7 py-1 text-left text-xs transition-colors"
                      :class="
                        selectedKeys.has(`${ch.id}-${m}`)
                          ? 'text-muted-foreground opacity-50 cursor-default'
                          : 'text-foreground hover:bg-muted/50 cursor-pointer'
                      "
                      :disabled="selectedKeys.has(`${ch.id}-${m}`)"
                      @click="addItem(ch.id, ch.name, m)"
                    >
                      <span>{{ m }}</span>
                      <Icon
                        v-if="selectedKeys.has(`${ch.id}-${m}`)"
                        icon="lucide:check"
                        class="h-3 w-3 text-green-500"
                      />
                      <Icon v-else icon="lucide:plus" class="h-3 w-3 text-violet-500" />
                    </button>
                  </div>
                </div>
                <div
                  v-if="filteredChannels.length === 0"
                  class="py-8 text-center text-xs text-muted-foreground"
                >
                  无匹配结果
                </div>
              </div>
            </div>

            <!-- Right Panel: Selected Models -->
            <div class="flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden">
              <div
                class="shrink-0 flex items-center justify-between border-b border-border px-3 py-2"
              >
                <span class="text-xs text-muted-foreground">
                  已选模型
                  <span
                    v-if="selectedItems.length"
                    class="ml-1 inline-flex items-center rounded-full bg-violet-600 px-1.5 text-[10px] text-white"
                  >
                    {{ selectedItems.length }}
                  </span>
                </span>
                <button
                  v-if="selectedItems.length"
                  class="text-[10px] text-red-400 hover:text-red-300"
                  @click="clearAll"
                >
                  清空
                </button>
              </div>
              <div class="flex-1 overflow-y-auto p-2">
                <VueDraggable
                  v-model="selectedItems"
                  :animation="150"
                  handle=".drag-handle"
                  class="min-h-full"
                >
                  <div
                    v-for="(item, idx) in selectedItems"
                    :key="`${item.channelId}-${item.modelName}`"
                    class="mb-1.5 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <Icon
                      icon="lucide:grip-vertical"
                      class="drag-handle h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-xs font-medium text-foreground">
                        {{ item.modelName }}
                      </div>
                      <div class="truncate text-[10px] text-muted-foreground">
                        {{ item.channelName }}
                      </div>
                    </div>
                    <span
                      class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      #{{ idx + 1 }}
                    </span>
                    <button
                      class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-red-400"
                      @click="removeItem(idx)"
                    >
                      <Icon icon="lucide:x" class="h-3 w-3" />
                    </button>
                  </div>
                </VueDraggable>
                <div
                  v-if="selectedItems.length === 0"
                  class="flex h-full items-center justify-center text-xs text-muted-foreground"
                >
                  点击左侧模型添加
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="shrink-0 flex justify-end gap-2 p-5">
          <button
            class="rounded px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="close"
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
</template>
