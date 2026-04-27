<script setup lang="ts">
import { ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Group } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";
import GroupEditDialog from "./GroupEditDialog.vue";

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showEditor = ref(false);
const editingGroup = ref<Group | null>(null);

function openCreate() {
  editingGroup.value = null;
  showEditor.value = true;
}

function openEdit(g: Group) {
  editingGroup.value = g;
  showEditor.value = true;
}

async function onSaved() {
  await store.loadGroups();
}

async function deleteGroup(id: number) {
  await gw.deleteGroup(id);
  await store.loadGroups();
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
            <span
              v-if="g.isBuiltin"
              class="rounded bg-violet-600/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400"
            >
              内置
            </span>
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
            v-if="!g.isBuiltin"
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

    <!-- Edit Dialog -->
    <GroupEditDialog v-model:open="showEditor" :group="editingGroup" @saved="onSaved" />
  </div>
</template>
