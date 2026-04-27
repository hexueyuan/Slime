<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { useAgentChatStore } from "@/stores/agentChat";
import AgentAvatar from "@/components/chat/AgentAvatar.vue";
import type { AgentAvatar as AgentAvatarType } from "@shared/types/agent";

const chatStore = useAgentChatStore();

const name = ref("");
const avatarType = ref<"icon" | "monogram">("monogram");
const avatarIcon = ref("lucide:user");
const avatarColor = ref("#3b82f6");
const avatarText = ref("U");
const avatarBgColor = ref("#3b82f6");
const saved = ref(false);

const PRESET_ICONS = [
  "lucide:user",
  "lucide:smile",
  "lucide:code",
  "lucide:pen-line",
  "lucide:zap",
  "lucide:star",
  "lucide:heart",
  "lucide:shield",
];

const PRESET_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const currentAvatar = computed<AgentAvatarType>(() => {
  if (avatarType.value === "icon") {
    return { kind: "lucide", icon: avatarIcon.value, color: avatarColor.value };
  }
  return { kind: "monogram", text: avatarText.value || "U", backgroundColor: avatarBgColor.value };
});

onMounted(async () => {
  await chatStore.fetchUserProfile();
  const profile = chatStore.userProfile;
  if (profile) {
    name.value = profile.name ?? "";
    if (profile.avatar?.kind === "lucide") {
      avatarType.value = "icon";
      avatarIcon.value = profile.avatar.icon ?? "lucide:user";
      avatarColor.value = profile.avatar.color ?? "#3b82f6";
    } else if (profile.avatar?.kind === "monogram") {
      avatarType.value = "monogram";
      avatarText.value = profile.avatar.text ?? "U";
      avatarBgColor.value = profile.avatar.backgroundColor ?? "#3b82f6";
    }
  }
});

async function onSave() {
  await chatStore.saveUserProfile({ name: name.value || undefined, avatar: currentAvatar.value });
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}
</script>

<template>
  <div class="space-y-5">
    <h3 class="text-sm font-semibold text-foreground">个人资料</h3>

    <!-- Preview -->
    <div class="flex items-center gap-3">
      <AgentAvatar :avatar="currentAvatar" size="lg" />
      <div class="text-sm text-muted-foreground">{{ name || "未设置名称" }}</div>
    </div>

    <!-- Name -->
    <div>
      <label class="mb-1 block text-xs text-muted-foreground">名称</label>
      <input
        v-model="name"
        type="text"
        class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none"
        placeholder="你的名字"
      />
    </div>

    <!-- Avatar type toggle -->
    <div>
      <label class="mb-1 block text-xs text-muted-foreground">头像</label>
      <div class="flex gap-2 mb-2">
        <button
          :class="[
            'rounded px-2 py-1 text-xs',
            avatarType === 'icon'
              ? 'bg-violet-500/20 text-violet-400'
              : 'text-muted-foreground hover:bg-muted',
          ]"
          @click="avatarType = 'icon'"
        >
          图标
        </button>
        <button
          :class="[
            'rounded px-2 py-1 text-xs',
            avatarType === 'monogram'
              ? 'bg-violet-500/20 text-violet-400'
              : 'text-muted-foreground hover:bg-muted',
          ]"
          @click="avatarType = 'monogram'"
        >
          文字
        </button>
      </div>

      <!-- Icon mode -->
      <div v-if="avatarType === 'icon'">
        <div class="flex flex-wrap gap-2 mb-2">
          <button
            v-for="icon in PRESET_ICONS"
            :key="icon"
            :class="[
              'flex h-8 w-8 items-center justify-center rounded-md border',
              avatarIcon === icon
                ? 'border-violet-500 bg-violet-500/10'
                : 'border-border hover:bg-muted',
            ]"
            @click="avatarIcon = icon"
          >
            <Icon :icon="icon" class="h-4 w-4" :style="{ color: avatarColor }" />
          </button>
        </div>
        <div class="flex gap-1.5">
          <button
            v-for="color in PRESET_COLORS"
            :key="color"
            :class="[
              'h-5 w-5 rounded-full border-2',
              avatarColor === color ? 'border-foreground' : 'border-transparent',
            ]"
            :style="{ backgroundColor: color }"
            @click="avatarColor = color"
          />
        </div>
      </div>

      <!-- Monogram mode -->
      <div v-else class="flex items-center gap-3">
        <input
          v-model="avatarText"
          type="text"
          maxlength="2"
          class="w-16 rounded-md border border-border bg-muted/50 px-2 py-1 text-center text-sm text-foreground focus:border-violet-500 focus:outline-none"
          placeholder="AB"
        />
        <div class="flex gap-1.5">
          <button
            v-for="color in PRESET_COLORS"
            :key="color"
            :class="[
              'h-5 w-5 rounded-full border-2',
              avatarBgColor === color ? 'border-foreground' : 'border-transparent',
            ]"
            :style="{ backgroundColor: color }"
            @click="avatarBgColor = color"
          />
        </div>
      </div>
    </div>

    <!-- Save -->
    <div class="flex items-center gap-3">
      <button
        class="rounded-md bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-500"
        @click="onSave"
      >
        保存
      </button>
      <span v-if="saved" class="text-xs text-emerald-400">已保存</span>
    </div>
  </div>
</template>
