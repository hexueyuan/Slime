# 进化条重置修复 + 生物细胞膜视觉升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复重置后进化条状态残留 bug，并将进化条视觉升级为生物细胞膜风格。

**Architecture:** 修改 EvolutionStatusBar.vue 的 `stageStatus()` 逻辑区分 dormant/completed idle，在 `handleConfirmReset` 中显式调 `evolutionStore.reset()`。模板从 div+tailwind 改为 SVG 节点（膜环+核心圆）+ SVG 有机曲线连线，用 CSS `@keyframes cell-breathe` 和 SVG `<animateMotion>` 实现动效。

**Tech Stack:** Vue 3, Pinia, TailwindCSS, 内联 SVG, CSS animations

**Spec:** `docs/superpowers/specs/2026-04-24-statusbar-reset-and-visual-design.md`

---

### File Structure

| File                                                           | Action | Responsibility                                        |
| -------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| `src/renderer/src/components/evolution/EvolutionStatusBar.vue` | Modify | stageStatus 逻辑修复 + 模板视觉重写 + scoped CSS 动画 |
| `test/renderer/components/EvolutionStatusBar.test.ts`          | Modify | 新增 dormant 测试 + 重置归零测试 + 修复现有断言       |

---

### Task 1: 修复 stageStatus 逻辑 + handleConfirmReset

**Files:**

- Modify: `src/renderer/src/components/evolution/EvolutionStatusBar.vue:24-32,44-59`
- Test: `test/renderer/components/EvolutionStatusBar.test.ts`

- [ ] **Step 1: 写失败测试 — dormant 状态（idle 无 completedTag）**

在 `test/renderer/components/EvolutionStatusBar.test.ts` 的 describe 块末尾追加：

```typescript
it("should show dormant (pending) state when idle without completedTag", () => {
  const store = useEvolutionStore();
  // store 默认 idle, completedTag = null
  const wrapper = mount(EvolutionStatusBar);
  const bar = wrapper.find('[data-testid="evolution-status-bar"]');
  // dormant 节点应有 dormant 类样式，不应有 completed 样式
  const nodes = bar.findAll('[data-testid="stage-node"]');
  expect(nodes.length).toBe(3);
  nodes.forEach((node) => {
    // dormant: 无膜环动画，无绿色
    expect(node.classes()).not.toContain("stage-completed");
    expect(node.classes()).not.toContain("stage-active");
  });
});

it("should reset to dormant state after confirm reset", async () => {
  const store = useEvolutionStore();
  store.setCompleted("egg-v0.1-dev.3", "Added feature X");
  const wrapper = mount(EvolutionStatusBar, {
    global: { stubs: { teleport: true } },
  });
  // 确认有完成状态
  expect(wrapper.text()).toContain("进化完成");

  // 点击重置 -> 确认
  await wrapper.find('[data-testid="reset-btn"]').trigger("click");
  await wrapper.find('[data-testid="reset-dialog"]').find("button:last-child").trigger("click");
  await flushPromises();

  // completedTag 应已清零，不再显示完成 badge
  expect(store.completedTag).toBeNull();
  expect(store.stage).toBe("idle");
  expect(wrapper.text()).not.toContain("进化完成");

  // 所有节点应为 dormant
  const nodes = wrapper.findAll('[data-testid="stage-node"]');
  nodes.forEach((node) => {
    expect(node.classes()).not.toContain("stage-completed");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/renderer/components/EvolutionStatusBar.test.ts`
Expected: 两个新测试 FAIL（当前 stageStatus idle 返回 completed，且 handleConfirmReset 不调 evolutionStore.reset()）

- [ ] **Step 3: 修复 stageStatus 逻辑**

在 `src/renderer/src/components/evolution/EvolutionStatusBar.vue` 中，替换第 28 行：

```typescript
// 修改前
if (evolutionStore.stage === "idle") return "completed";

// 修改后
if (evolutionStore.stage === "idle") {
  return evolutionStore.completedTag ? "completed" : "pending";
}
```

- [ ] **Step 4: 修复 handleConfirmReset — 加 evolutionStore.reset()**

在 `src/renderer/src/components/evolution/EvolutionStatusBar.vue` 的 `handleConfirmReset` 中，替换 finally 块：

```typescript
// 修改前
} finally {
  isResetting.value = false;
  showDialog.value = false;
}

// 修改后
} finally {
  evolutionStore.reset();
  isResetting.value = false;
  showDialog.value = false;
}
```

- [ ] **Step 5: 在模板节点上加 data-testid 和状态 class**

在当前模板的每个 stage `<div class="flex items-center gap-1.5">` 上加属性，让测试能定位：

```html
<div
  data-testid="stage-node"
  class="flex items-center gap-1.5"
  :class="{
    'stage-completed': stageStatus(stage.key) === 'completed',
    'stage-active': stageStatus(stage.key) === 'active',
    'stage-dormant': stageStatus(stage.key) === 'pending',
  }"
></div>
```

注意：这里 pending 对应 dormant（初始 idle 时）和 pending（进化中未来阶段），因为 `stageStatus` 返回值就是 `pending`，统一用 `stage-dormant` class 名在测试中区分。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/EvolutionStatusBar.test.ts`
Expected: 全部 PASS（包括原有 5 个 + 新增 2 个）

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/components/evolution/EvolutionStatusBar.vue test/renderer/components/EvolutionStatusBar.test.ts
git commit -m "fix(evolution): reset statusbar state on confirm, distinguish dormant from completed idle"
```

---

### Task 2: 视觉升级 — 生物细胞膜节点 + 有机曲线连线

**Files:**

- Modify: `src/renderer/src/components/evolution/EvolutionStatusBar.vue:67-99` (template 步骤区域 + scoped style)

- [ ] **Step 1: 添加 scoped CSS 动画**

在 `EvolutionStatusBar.vue` 底部添加 `<style scoped>` 块：

```vue
<style scoped>
@keyframes cell-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

.membrane-breathe {
  animation: cell-breathe 3s ease-in-out infinite;
}

.membrane-breathe-fast {
  animation: cell-breathe 2.5s ease-in-out infinite;
}

.membrane-breathe-delayed {
  animation: cell-breathe 2.5s ease-in-out infinite 0.3s;
}
</style>
```

- [ ] **Step 2: 替换模板步骤区域 — 节点部分**

将模板中 `<template v-for="(stage, i) in stages">` 到 `</template>` 之间的内容（第 72-99 行）替换为：

```html
<template v-for="(stage, i) in stages" :key="stage.key">
  <!-- 有机曲线连线 -->
  <svg v-if="i > 0" class="mx-1" width="40" height="16" viewBox="0 0 40 16">
    <path
      d="M0,8 C10,3 30,13 40,8"
      :stroke="
        stageStatus(stages[i - 1].key) === 'completed'
          ? 'rgb(34 197 94 / 0.5)'
          : 'rgb(var(--color-muted-foreground) / 0.1)'
      "
      stroke-width="1.5"
      fill="none"
    />
    <!-- 粒子：仅 completed 连线 -->
    <circle v-if="stageStatus(stages[i - 1].key) === 'completed'" r="2" fill="rgb(34 197 94 / 0.8)">
      <animateMotion dur="2s" repeatCount="indefinite" path="M0,8 C10,3 30,13 40,8" />
    </circle>
  </svg>

  <!-- 节点 -->
  <div
    data-testid="stage-node"
    class="flex items-center gap-1.5"
    :class="{
      'stage-completed': stageStatus(stage.key) === 'completed',
      'stage-active': stageStatus(stage.key) === 'active',
      'stage-dormant': stageStatus(stage.key) === 'pending',
    }"
  >
    <!-- 细胞膜节点容器 -->
    <div
      class="relative flex shrink-0 items-center justify-center"
      style="width: 28px; height: 28px;"
    >
      <!-- completed: 单层膜呼吸 -->
      <div
        v-if="stageStatus(stage.key) === 'completed'"
        class="membrane-breathe absolute inset-0 rounded-full border border-green-500/40"
      />
      <!-- active: 双层膜交替呼吸 -->
      <template v-if="stageStatus(stage.key) === 'active'">
        <div
          class="membrane-breathe-fast absolute inset-0 rounded-full border border-violet-500/50"
        />
        <div
          class="membrane-breathe-delayed absolute inset-[3px] rounded-full border border-violet-500/20"
        />
      </template>
      <!-- pending: 静态虚线环 -->
      <div
        v-if="stageStatus(stage.key) === 'pending'"
        class="absolute inset-0 rounded-full border border-dashed border-muted-foreground/10"
      />
      <!-- dormant (pending in idle): 无膜环，下面仅核心圆 -->

      <!-- 核心圆 -->
      <div
        v-if="stageStatus(stage.key) === 'completed'"
        class="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgb(34_197_94)]"
      />
      <div
        v-else-if="stageStatus(stage.key) === 'active'"
        class="h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgb(139_92_246)]"
      />
      <div v-else class="h-2 w-2 rounded-full border-[1.5px] border-muted-foreground/20" />
    </div>

    <!-- 文字标签 -->
    <span
      class="text-xs"
      :class="{
        'text-green-500': stageStatus(stage.key) === 'completed',
        'font-semibold text-violet-500': stageStatus(stage.key) === 'active',
        'text-muted-foreground/40': stageStatus(stage.key) === 'pending',
      }"
    >
      {{ stage.label }}
    </span>
  </div>
</template>
```

关键变化说明：

- active 颜色从 `text-primary`（dark 下是白色）改为固定 `text-violet-500`
- 节点从 10px 扁平圆改为 28px 容器内含膜环 + 8px 核心圆
- 连线从 div 直线改为 SVG 贝塞尔曲线
- completed 连线有 `<animateMotion>` 粒子
- dormant（idle 无 completedTag 时 pending）仅显示空心核心圆，无膜环

- [ ] **Step 3: 确认 muted-foreground/10 在 SVG stroke 中的渲染**

SVG `stroke` 属性不识别 tailwind CSS 变量语法。连线 pending 段的 stroke 需要用 CSS class 或 currentColor 替代。修正连线的 pending stroke：

将 SVG 中 pending 段的 stroke 改为使用 CSS class：

```html
<path
  d="M0,8 C10,3 30,13 40,8"
  :class="
    stageStatus(stages[i - 1].key) === 'completed'
      ? 'stroke-green-500/50'
      : 'stroke-muted-foreground/10'
  "
  stroke-width="1.5"
  fill="none"
/>
<!-- 粒子 -->
<circle v-if="stageStatus(stages[i - 1].key) === 'completed'" r="2" class="fill-green-500/80">
  <animateMotion dur="2s" repeatCount="indefinite" path="M0,8 C10,3 30,13 40,8" />
</circle>
```

去掉内联 `stroke=` 和 `fill=`，改用 tailwind `stroke-` 和 `fill-` class。

- [ ] **Step 4: 运行 format + lint**

Run: `pnpm run format && pnpm run lint`
Expected: 无报错

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/EvolutionStatusBar.test.ts`
Expected: 全部 7 个 PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/evolution/EvolutionStatusBar.vue
git commit -m "feat(evolution): bio-cell membrane visual for statusbar with breathing animations"
```

---

### Task 3: 补充视觉状态测试

**Files:**

- Modify: `test/renderer/components/EvolutionStatusBar.test.ts`

- [ ] **Step 1: 写 active 阶段膜环存在性测试**

在测试文件 describe 块追加：

```typescript
it("should show active membrane rings when stage is coding", () => {
  const store = useEvolutionStore();
  store.setStage("coding");
  const wrapper = mount(EvolutionStatusBar);
  const nodes = wrapper.findAll('[data-testid="stage-node"]');

  // discuss(idx=0) 应为 completed
  expect(nodes[0].classes()).toContain("stage-completed");
  // coding(idx=1) 应为 active
  expect(nodes[1].classes()).toContain("stage-active");
  // applying(idx=2) 应为 dormant (pending)
  expect(nodes[2].classes()).toContain("stage-dormant");
});

it("should show completed membrane for all stages when idle with completedTag", () => {
  const store = useEvolutionStore();
  store.setCompleted("egg-v0.1-dev.5", "Improved X");
  const wrapper = mount(EvolutionStatusBar);
  const nodes = wrapper.findAll('[data-testid="stage-node"]');

  nodes.forEach((node) => {
    expect(node.classes()).toContain("stage-completed");
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/EvolutionStatusBar.test.ts`
Expected: 全部 9 个 PASS

- [ ] **Step 3: 运行全局测试确认无回归**

Run: `pnpm test`
Expected: 全部 PASS

- [ ] **Step 4: format + lint**

Run: `pnpm run format && pnpm run lint`

- [ ] **Step 5: 提交**

```bash
git add test/renderer/components/EvolutionStatusBar.test.ts
git commit -m "test(evolution): add visual state tests for bio-cell statusbar"
```
