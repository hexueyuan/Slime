<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import type { SkillManifest } from "@shared/types/presenters/dev.presenter";

const devPresenter = usePresenter("devPresenter");

const skills = ref<SkillManifest[]>([]);
const isDev = ref(false);
const installing = ref(false);
const selectedSkill = ref<SkillManifest | null>(null);
const skillContent = ref("");
const saving = ref(false);
const saveSuccess = ref(false);

onMounted(async () => {
  isDev.value = (await devPresenter.isDev()) as boolean;
  await refreshSkills();
});

async function refreshSkills() {
  skills.value = (await devPresenter.listGlobalSkills()) as SkillManifest[];
}

async function selectSkill(skill: SkillManifest) {
  selectedSkill.value = skill;
  const content = await devPresenter.getSkillContent(skill.name, skill.source || "installed");
  skillContent.value = (content as string) || "";
}

async function saveSkill() {
  if (!selectedSkill.value) return;
  saving.value = true;
  try {
    await devPresenter.saveSkillContent(
      selectedSkill.value.name,
      selectedSkill.value.source || "installed",
      skillContent.value,
    );
    saveSuccess.value = true;
    setTimeout(() => (saveSuccess.value = false), 2000);
    await refreshSkills();
  } finally {
    saving.value = false;
  }
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

async function uninstallSkill(skill: SkillManifest) {
  if (!confirm(`确认卸载 Skill "${skill.name}"?`)) return;
  if (skill.source === "builtin") {
    await devPresenter.uninstallBuiltinSkill(skill.name);
  } else if (skill.source === "market") {
    await devPresenter.uninstallMarketSkill(skill.name);
  } else {
    await devPresenter.uninstallSkill(skill.name);
  }
  if (selectedSkill.value?.name === skill.name) {
    selectedSkill.value = null;
    skillContent.value = "";
  }
  await refreshSkills();
}

const readonly = computed(() => selectedSkill.value?.source === "builtin" && !isDev.value);
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Skill List -->
    <div class="flex w-[250px] flex-col border-r border-border">
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <span class="text-xs font-medium text-muted-foreground">Skills</span>
        <button
          v-if="isDev"
          :disabled="installing"
          class="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-violet-400 hover:bg-muted disabled:opacity-50"
          @click="installSkill"
        >
          <Icon icon="lucide:plus" class="h-3 w-3" />
          安装
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
        <div v-if="skills.length === 0" class="px-2 py-4 text-xs text-muted-foreground">
          暂无 Skill
        </div>
        <button
          v-for="skill in skills"
          :key="skill.name"
          class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
          :class="{ 'bg-muted': selectedSkill?.name === skill.name }"
          @click="selectSkill(skill)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1">
              <span class="truncate text-foreground">{{ skill.name }}</span>
              <span
                v-if="skill.source === 'builtin'"
                class="shrink-0 rounded bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-400"
              >
                内置
              </span>
              <span
                v-else-if="skill.source === 'market'"
                class="shrink-0 rounded bg-blue-500/15 px-1 py-0.5 text-[10px] text-blue-400"
              >
                Market
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Right: Skill Detail / Edit -->
    <div class="flex min-w-0 flex-1 flex-col">
      <template v-if="selectedSkill">
        <div class="flex items-center justify-between border-b border-border px-4 py-2">
          <div>
            <div class="text-sm font-medium text-foreground">{{ selectedSkill.name }}</div>
            <div class="text-xs text-muted-foreground">{{ selectedSkill.description }}</div>
          </div>
          <button
            v-if="isDev"
            class="text-xs text-red-400 hover:text-red-300"
            @click="uninstallSkill(selectedSkill)"
          >
            卸载
          </button>
        </div>
        <div class="flex min-h-0 flex-1 flex-col p-4">
          <label class="mb-1 text-xs font-medium text-muted-foreground">SKILL.md</label>
          <textarea
            v-model="skillContent"
            :disabled="readonly"
            class="min-h-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed disabled:opacity-50"
            spellcheck="false"
          />
          <div v-if="!readonly" class="mt-3 flex items-center gap-2">
            <button
              :disabled="saving"
              class="rounded-md bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
              @click="saveSkill"
            >
              {{ saving ? "保存中..." : "保存" }}
            </button>
            <span v-if="saveSuccess" class="text-xs text-green-500">已保存</span>
          </div>
          <p v-else class="mt-2 text-xs text-muted-foreground">Skill 仅在开发模式下可编辑</p>
        </div>
      </template>
      <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个 Skill 查看详情
      </div>
    </div>
  </div>
</template>
