<script setup lang="ts">
import { useEvolutionStore } from "@/stores/evolution";
import { usePresenter } from "@/composables/usePresenter";

const store = useEvolutionStore();
const evolutionPresenter = usePresenter("evolutionPresenter");

const stageLabels: Record<string, { label: string; icon: string }> = {
  idle: { label: "等待进化需求", icon: "○" },
  discuss: { label: "需求澄清中", icon: "💬" },
  coding: { label: "正在执行进化...", icon: "⚡" },
  applying: { label: "正在应用变更...", icon: "📦" },
};

const stages = ["discuss", "coding", "applying"] as const;

function stageClass(stage: string) {
  const idx = stages.indexOf(stage as any);
  const currentIdx = stages.indexOf(store.stage as any);
  if (store.stage === "idle") return "pending";
  if (idx < currentIdx) return "completed";
  if (idx === currentIdx) return "active";
  return "pending";
}

function handleRestart() {
  evolutionPresenter.restart();
}

function handleCancel() {
  evolutionPresenter.cancel();
}
</script>

<template>
  <div class="evolution-panel">
    <div v-if="store.completedTag" class="evolution-panel__completed">
      <div class="evolution-panel__completed-icon">✅</div>
      <div class="evolution-panel__completed-title">进化完成</div>
      <div class="evolution-panel__completed-tag">{{ store.completedTag }}</div>
      <div class="evolution-panel__completed-summary">{{ store.completedSummary }}</div>
      <button class="evolution-panel__restart-btn" @click="handleRestart">重启以生效</button>
    </div>

    <div v-else class="evolution-panel__stages">
      <div class="evolution-panel__status">
        <span>{{ stageLabels[store.stage]?.icon }}</span>
        <span>{{ stageLabels[store.stage]?.label }}</span>
      </div>

      <div class="evolution-panel__timeline">
        <div
          v-for="s in stages"
          :key="s"
          class="evolution-panel__step"
          :class="`evolution-panel__step--${stageClass(s)}`"
        >
          <div class="evolution-panel__dot" />
          <span class="evolution-panel__step-label">{{ s }}</span>
        </div>
      </div>

      <button
        v-if="store.stage !== 'idle'"
        class="evolution-panel__cancel-btn"
        @click="handleCancel"
      >
        取消进化
      </button>
    </div>
  </div>
</template>

<style scoped>
.evolution-panel {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.evolution-panel__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 20px;
}

.evolution-panel__timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 8px;
}

.evolution-panel__step {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--color-muted);
}

.evolution-panel__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  flex-shrink: 0;
}

.evolution-panel__step--active {
  color: var(--color-primary);
  font-weight: 500;
}
.evolution-panel__step--active .evolution-panel__dot {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.evolution-panel__step--completed {
  color: #51cf66;
}
.evolution-panel__step--completed .evolution-panel__dot {
  background: #51cf66;
  border-color: #51cf66;
}

.evolution-panel__cancel-btn {
  margin-top: auto;
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-muted);
  font-size: 13px;
  cursor: pointer;
}

.evolution-panel__cancel-btn:hover {
  border-color: #ff6b6b;
  color: #ff6b6b;
}

.evolution-panel__completed {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  text-align: center;
}

.evolution-panel__completed-icon {
  font-size: 32px;
}

.evolution-panel__completed-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.evolution-panel__completed-tag {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.evolution-panel__completed-summary {
  font-size: 13px;
  color: var(--color-muted);
}

.evolution-panel__restart-btn {
  margin-top: 12px;
  padding: 10px 24px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.evolution-panel__restart-btn:hover {
  opacity: 0.9;
}
</style>
