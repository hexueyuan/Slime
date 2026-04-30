<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useMcpStore } from "@/stores/mcp";

const props = defineProps<{
  modelValue: string[];
  sessionId?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

const store = useMcpStore();
const disabledToolIds = ref<Set<number>>(new Set());

onMounted(async () => {
  await store.loadServers();
  for (const s of store.servers) {
    await store.loadServerTools(s.id);
  }
  if (props.sessionId) {
    const ids = await store.getSessionDisabledTools(props.sessionId);
    disabledToolIds.value = new Set(ids);
  }
});

function isChecked(serverId: string, toolName: string): boolean {
  return props.modelValue.includes(`${serverId}/${toolName}`);
}

function toggle(serverId: string, toolName: string) {
  const key = `${serverId}/${toolName}`;
  const arr = [...props.modelValue];
  const idx = arr.indexOf(key);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(key);
  emit("update:modelValue", arr);
}

async function toggleSessionDisable(toolId: number) {
  if (!props.sessionId) return;
  const disabled = !disabledToolIds.value.has(toolId);
  await store.setSessionToolState(props.sessionId, toolId, disabled);
  if (disabled) {
    disabledToolIds.value.add(toolId);
  } else {
    disabledToolIds.value.delete(toolId);
  }
}
</script>

<template>
  <div v-if="store.servers.length === 0" class="text-xs text-muted-foreground py-2">
    暂无 MCP Server
  </div>
  <div v-for="s in store.servers" :key="s.id" class="mb-3">
    <div class="flex items-center gap-2 mb-1">
      <span
        :class="[
          'rounded px-1.5 py-0.5 text-[10px]',
          s.status === 'connected'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-red-500/20 text-red-400',
        ]"
      >
        {{ s.status }}
      </span>
      <span class="text-xs font-medium text-foreground">{{ s.name }}</span>
      <span class="text-[10px] text-muted-foreground">{{ s.toolsCount }} tools</span>
    </div>
    <div v-if="store.getServerToolsCached(s.id).length > 0" class="grid grid-cols-2 gap-1">
      <div v-if="s.status !== 'connected'" class="col-span-2 text-[10px] text-amber-400 mb-0.5">
        Server {{ s.status }}，以下为缓存的工具列表
      </div>
      <label
        v-for="t in store.getServerToolsCached(s.id)"
        :key="t.id"
        class="flex items-center gap-1.5 text-xs text-foreground py-0.5"
      >
        <input
          type="checkbox"
          :checked="isChecked(s.id, t.toolName)"
          class="accent-violet-500"
          @change="toggle(s.id, t.toolName)"
        />
        {{ t.toolName }}
        <input
          v-if="sessionId && isChecked(s.id, t.toolName)"
          type="checkbox"
          :checked="!disabledToolIds.has(t.id)"
          class="ml-auto accent-amber-500"
          @change="toggleSessionDisable(t.id)"
        />
      </label>
    </div>
    <div v-else class="text-[11px] text-muted-foreground">
      {{ s.status === "connected" ? "No tools" : "Server unavailable, no cached tools" }}
    </div>
  </div>
</template>
