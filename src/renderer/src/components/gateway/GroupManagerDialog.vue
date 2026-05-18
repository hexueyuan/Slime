<script setup lang="ts">
import { computed, ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GatewayManagerDialog from "./GatewayManagerDialog.vue";
import GatewayGroupCard from "./GatewayGroupCard.vue";
import GroupEditDialog from "./GroupEditDialog.vue";
import type { Group } from "@shared/types/gateway";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showEditor = ref(false);
const editingGroup = ref<Group | null>(null);
const deletingGroupId = ref<number | null>(null);
const deleteError = ref("");

const builtinCount = computed(() => store.groups.filter((group) => group.isBuiltin).length);

function openCreate() {
  editingGroup.value = null;
  showEditor.value = true;
}

function openEdit(group: Group) {
  editingGroup.value = group;
  showEditor.value = true;
}

async function deleteGroup(group: Group) {
  if (group.isBuiltin) return;
  if (deletingGroupId.value !== null) return;
  if (!window.confirm(`确认删除分组「${group.name}」？`)) return;

  deletingGroupId.value = group.id;
  deleteError.value = "";
  try {
    await gw.deleteGroup(group.id);
    await store.loadGroups();
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : String(error);
  } finally {
    deletingGroupId.value = null;
  }
}

async function onSaved() {
  await store.loadGroups();
}
</script>

<template>
  <GatewayManagerDialog
    :open="open"
    title="分组管理"
    :subtitle="`${store.groups.length} 个分组 · ${builtinCount} 个内置`"
    @close="emit('close')"
  >
    <template #actions>
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
        @click="openCreate"
      >
        + 新增分组
      </button>
    </template>

    <p v-if="deleteError" class="mb-3 text-xs text-[var(--color-danger)]">
      {{ deleteError }}
    </p>

    <div v-if="store.groups.length" class="grid gap-3 md:grid-cols-2">
      <GatewayGroupCard
        v-for="group in store.groups"
        :key="group.id"
        :group="group"
        :item-count="0"
        channel-summary="打开编辑查看成员"
        @edit="openEdit"
        @delete="deleteGroup"
      />
    </div>

    <div
      v-else
      class="flex min-h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-control)] text-sm text-[var(--color-text-muted)]"
    >
      暂无分组
    </div>

    <GroupEditDialog v-model:open="showEditor" :group="editingGroup" @saved="onSaved" />
  </GatewayManagerDialog>
</template>
