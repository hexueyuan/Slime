<script setup lang="ts">
import { ref } from "vue";
import AgentManageTab from "../components/agents/AgentManageTab.vue";
import SkillManageTab from "../components/agents/SkillManageTab.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import SlimeTabs from "@/components/ui/SlimeTabs.vue";

const activeTab = ref<"agents" | "skills">("agents");
const tabs = [
  { value: "agents" as const, label: "Agents" },
  { value: "skills" as const, label: "Skills" },
];
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--color-app-canvas)]">
    <PageHeader title="Agent" subtitle="管理内置与自定义 Agent、Skill 能力">
      <template #actions>
        <SlimeTabs v-model="activeTab" :tabs="tabs" />
      </template>
    </PageHeader>

    <!-- Tab Content -->
    <div class="min-h-0 flex-1">
      <AgentManageTab v-if="activeTab === 'agents'" />
      <SkillManageTab v-if="activeTab === 'skills'" />
    </div>
  </div>
</template>
