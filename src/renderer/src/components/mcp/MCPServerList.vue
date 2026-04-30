<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { useMcpStore } from "@/stores/mcp";
import MCPServerForm from "./MCPServerForm.vue";

const store = useMcpStore();
const showForm = ref(false);
const editingServer = ref<any>(null);

onMounted(() => store.loadServers());

function onAdd() {
  editingServer.value = null;
  showForm.value = true;
}

function onEdit(server: any) {
  editingServer.value = server;
  showForm.value = true;
}

async function onDelete(id: string) {
  try {
    await store.deleteServer(id);
  } catch {}
}

async function onSaved(config: any) {
  if (editingServer.value) {
    await store.updateServer(editingServer.value.id, config);
  } else {
    await store.createServer(config);
  }
}

function statusBadge(status: string) {
  if (status === "connected") return "bg-emerald-500/20 text-emerald-400";
  if (status === "connecting") return "bg-amber-500/20 text-amber-400";
  if (status === "error") return "bg-red-500/20 text-red-400";
  return "bg-muted text-muted-foreground";
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold">MCP Servers</h3>
      <button
        class="rounded-md bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500"
        @click="onAdd"
      >
        + 添加
      </button>
    </div>

    <div v-if="store.servers.length === 0" class="text-xs text-muted-foreground py-4 text-center">
      暂无 MCP Server，点击"添加"开始
    </div>

    <div
      v-for="s in store.servers"
      :key="s.id"
      class="flex items-center justify-between rounded-md border border-border p-3 mb-2"
    >
      <div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-foreground">{{ s.name }}</span>
          <span :class="['rounded px-1.5 py-0.5 text-[10px]', statusBadge(s.status)]">
            {{ s.status }}
          </span>
        </div>
        <div class="text-[11px] text-muted-foreground mt-0.5">
          {{ s.transport }} · {{ s.toolsCount }} tools
          <span v-if="s.error" class="text-red-400 ml-1">{{ s.error }}</span>
        </div>
      </div>
      <div class="flex gap-1">
        <button class="rounded p-1 text-muted-foreground hover:text-foreground" @click="onEdit(s)">
          <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
        </button>
        <button
          class="rounded p-1 text-muted-foreground hover:text-red-400"
          @click="onDelete(s.id)"
        >
          <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <MCPServerForm
      :open="showForm"
      :server="editingServer"
      @update:open="showForm = $event"
      @saved="onSaved"
    />
  </div>
</template>
