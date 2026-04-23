<template>
  <div
    data-testid="app-sidebar"
    class="flex w-[45px] shrink-0 flex-col items-center bg-sidebar pt-2"
  >
    <button
      data-testid="sidebar-evolution"
      class="flex h-8 w-8 items-center justify-center rounded-md bg-muted"
      title="进化实验室"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke-width="1.5">
        <defs>
          <linearGradient id="dna-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ff6ec7" />
            <stop offset="100%" stop-color="#7c3aed" />
          </linearGradient>
          <linearGradient id="dna-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#a855f7" />
          </linearGradient>
        </defs>
        <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" stroke="url(#dna-grad-1)" />
        <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" stroke="url(#dna-grad-1)" />
        <path d="M2 15c6.667-6 13.333 0 20-6" stroke="url(#dna-grad-2)" />
        <path d="m17 6-2.5-2.5" stroke="#ff6ec7" />
        <path d="m14 8-1-1" stroke="#c850c0" />
        <path d="m7 18 2.5 2.5" stroke="#06b6d4" />
        <path d="m3.5 14.5.5.5" stroke="#06b6d4" />
        <path d="m20 9 .5.5" stroke="#a855f7" />
        <path d="m6.5 12.5 1 1" stroke="#06b6d4" />
        <path d="m16.5 10.5 1 1" stroke="#c850c0" />
        <path d="m10 16 1.5 1.5" stroke="#a855f7" />
      </svg>
    </button>

    <div class="flex-1" />

    <button
      data-testid="sidebar-settings"
      class="mb-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      title="设置"
      @click="showSettings = true"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>

    <SettingsDialog v-model:open="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import SettingsDialog from "./settings/SettingsDialog.vue";

const showSettings = ref(false);
</script>
