<script setup lang="ts">
import { ref, watch } from "vue";
import { useAgentStore } from "@/stores/agent";
import MCPToolChecklist from "@/components/mcp/MCPToolChecklist.vue";

const props = defineProps<{ open: boolean; sessionId: string; agentId: string }>();
defineEmits<{ "update:open": [boolean] }>();

const agentStore = useAgentStore();
const mcpTools = ref<string[]>([]);

watch(
  () => props.open,
  (val) => {
    if (val) {
      const agent = agentStore.agents.find((a) => a.id === props.agentId);
      mcpTools.value = agent?.config?.mcpTools ?? [];
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="$emit('update:open', false)" />
      <div
        class="relative w-[400px] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-foreground">会话 MCP 工具</h2>
          <button
            class="rounded p-1 text-muted-foreground hover:text-foreground"
            @click="$emit('update:open', false)"
          >
            <span class="text-sm">&times;</span>
          </button>
        </div>
        <p class="text-[11px] text-muted-foreground mb-3">
          仅影响当前会话。新会话使用 Agent 默认设置。勾选 = 启用（默认），取消 = 禁用。
        </p>
        <MCPToolChecklist v-model="mcpTools" :session-id="sessionId" />
      </div>
    </div>
  </Teleport>
</template>
