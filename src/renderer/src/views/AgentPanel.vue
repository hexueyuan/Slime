<script setup lang="ts">
import { ref } from "vue";
import AgentManageTab from "../components/agents/AgentManageTab.vue";
import SkillManageTab from "../components/agents/SkillManageTab.vue";

const activeTab = ref<"agents" | "skills">("agents");
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Tab Bar -->
    <div class="flex shrink-0 border-b border-border px-4">
      <button
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
          activeTab === 'agents'
            ? 'border-violet-500 text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        ]"
        @click="activeTab = 'agents'"
      >
        Agents
      </button>
      <button
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
          activeTab === 'skills'
            ? 'border-violet-500 text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        ]"
        @click="activeTab = 'skills'"
      >
        Skills
      </button>
    </div>

    <!-- Tab Content -->
    <div class="min-h-0 flex-1">
      <AgentManageTab v-if="activeTab === 'agents'" />
      <SkillManageTab v-if="activeTab === 'skills'" />
    </div>
  </div>
</template>
