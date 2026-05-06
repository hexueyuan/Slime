<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import type { SkillManifest } from "@shared/types/presenters/dev.presenter";

const devPresenter = usePresenter("devPresenter");

const skills = ref<SkillManifest[]>([]);
const isDev = ref(false);
const installing = ref(false);

onMounted(async () => {
  isDev.value = (await devPresenter.isDev()) as boolean;
  await refreshSkills();
});

async function refreshSkills() {
  skills.value = (await devPresenter.listGlobalSkills()) as SkillManifest[];
}

async function installSkill() {
  const path = await window.electron.ipcRenderer.invoke("dialog:openDirectoryOrFile");
  if (!path) return;
  installing.value = true;
  try {
    const result = await devPresenter.installSkill(path as string);
    if (!result.success) {
      alert(`安装失败: ${result.error}`);
    }
    await refreshSkills();
  } finally {
    installing.value = false;
  }
}

async function uninstallSkill(name: string, source?: string) {
  if (!confirm(`确认卸载 Skill "${name}"?`)) return;
  if (source === "builtin") {
    await devPresenter.uninstallBuiltinSkill(name);
  } else {
    await devPresenter.uninstallSkill(name);
  }
  await refreshSkills();
}
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-medium text-foreground">Skills</h2>
      <button
        v-if="isDev"
        :disabled="installing"
        class="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        @click="installSkill"
      >
        <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
        安装 Skill
      </button>
    </div>

    <div v-if="skills.length === 0" class="text-sm text-muted-foreground">暂无 Skill</div>

    <div class="space-y-2">
      <div
        v-for="skill in skills"
        :key="skill.name"
        class="flex items-center justify-between rounded-md border border-border px-3 py-2"
      >
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium text-foreground">{{ skill.name }}</span>
            <span
              v-if="skill.source === 'builtin'"
              class="rounded bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-400"
            >
              内置
            </span>
          </div>
          <div class="text-xs text-muted-foreground">{{ skill.description }}</div>
          <div v-if="skill.version" class="text-xs text-muted-foreground">
            v{{ skill.version }}
            <span v-if="skill.author"> by {{ skill.author }}</span>
          </div>
        </div>
        <button
          v-if="isDev"
          class="text-xs text-red-400 hover:text-red-300"
          @click="uninstallSkill(skill.name, skill.source)"
        >
          卸载
        </button>
      </div>
    </div>
  </div>
</template>
