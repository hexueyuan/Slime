<template>
  <div class="flex h-full flex-col p-4">
    <!-- 空状态 -->
    <div
      v-if="!store.workflow"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      在对话中开始进化，流程将在此展示
    </div>

    <!-- 流程步骤 -->
    <div v-else class="space-y-1">
      <div class="mb-3 text-xs font-medium uppercase text-muted-foreground">Workflow</div>
      <div
        v-for="step in store.workflow.steps"
        :key="step.id"
        class="flex items-start gap-3 rounded-lg px-3 py-2 text-sm"
        :class="{ 'bg-muted/50': step.status === 'in_progress' }"
      >
        <!-- 状态图标 -->
        <div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          <!-- pending -->
          <div
            v-if="step.status === 'pending'"
            class="h-2 w-2 rounded-full border border-muted-foreground/40"
          />
          <!-- in_progress -->
          <svg
            v-else-if="step.status === 'in_progress'"
            class="h-4 w-4 animate-spin text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <!-- completed -->
          <svg
            v-else-if="step.status === 'completed'"
            class="h-4 w-4 text-green-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <!-- skipped -->
          <svg
            v-else-if="step.status === 'skipped'"
            class="h-4 w-4 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m5 12h14" />
          </svg>
          <!-- failed -->
          <svg
            v-else-if="step.status === 'failed'"
            class="h-4 w-4 text-destructive"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <!-- 内容 -->
        <div class="min-w-0 flex-1">
          <div
            class="font-medium"
            :class="{
              'text-foreground': step.status === 'in_progress',
              'text-muted-foreground': step.status === 'pending' || step.status === 'skipped',
              'text-foreground/80': step.status === 'completed',
              'text-destructive': step.status === 'failed',
            }"
          >
            {{ step.title }}
          </div>
          <div v-if="step.description" class="mt-0.5 text-xs text-muted-foreground">
            {{ step.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWorkflowStore } from "@/stores/workflow";

const store = useWorkflowStore();
</script>
