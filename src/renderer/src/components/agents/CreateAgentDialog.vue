<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="$emit('cancel')"
  >
    <div class="w-[400px] rounded-lg border border-border bg-background p-5 shadow-xl space-y-4">
      <h3 class="text-sm font-medium text-foreground">新建 Agent</h3>

      <!-- ID -->
      <div class="space-y-1">
        <label class="text-xs text-muted-foreground">英文ID（小写字母、数字、短横线）</label>
        <input
          v-model="form.id"
          type="text"
          class="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm"
          placeholder="my-agent"
          @keydown.enter="submit"
        />
        <p v-if="idError" class="text-xs text-red-400">{{ idError }}</p>
      </div>

      <!-- 名称 -->
      <div class="space-y-1">
        <label class="text-xs text-muted-foreground">名称</label>
        <input
          v-model="form.name"
          type="text"
          class="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm"
          placeholder="Agent 名称"
          @keydown.enter="submit"
        />
      </div>

      <!-- 性别 -->
      <div class="space-y-1">
        <label class="text-xs text-muted-foreground">性别</label>
        <select
          v-model="form.gender"
          class="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm"
        >
          <option value="unknown">未设置</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </div>

      <!-- MBTI -->
      <div class="space-y-1">
        <label class="text-xs text-muted-foreground">MBTI 性格类型</label>
        <select
          v-model="form.mbti"
          class="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm"
        >
          <option v-for="mbti in MBTI_TYPES" :key="mbti" :value="mbti">{{ mbti }}</option>
        </select>
      </div>

      <!-- 按钮 -->
      <div class="flex justify-end gap-2 pt-1">
        <button
          class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          @click="$emit('cancel')"
        >
          取消
        </button>
        <button
          :disabled="!canSubmit || submitting"
          class="rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
          @click="submit"
        >
          {{ submitting ? "创建中..." : "创建" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, ref } from "vue";
import { useAgentStore } from "@/stores/agent";
import type { GenderType } from "@shared/types/agent";
import type { MBTIType } from "@shared/constants/mbti";

const emit = defineEmits<{ created: [id: string]; cancel: [] }>();

const agentStore = useAgentStore();

const MBTI_TYPES: MBTIType[] = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];

const form = reactive({
  id: "",
  name: "",
  gender: "unknown" as GenderType,
  mbti: "INTJ" as MBTIType,
});

const submitting = ref(false);

const idError = computed(() => {
  if (!form.id) return "";
  if (!/^[a-z][a-z0-9-]*$/.test(form.id)) return "只允许小写字母、数字和短横线，必须字母开头";
  if (form.id.length > 50) return "最长50字符";
  return "";
});

const canSubmit = computed(() => form.id && form.name && !idError.value);

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const agent = await agentStore.createAgent({
      id: form.id,
      name: form.name,
      gender: form.gender !== "unknown" ? form.gender : undefined,
      mbti: form.mbti,
    });
    emit("created", agent.id);
  } finally {
    submitting.value = false;
  }
}
</script>
