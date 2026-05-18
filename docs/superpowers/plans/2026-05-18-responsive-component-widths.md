# Responsive Component Widths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the high-risk Slime UI components and pages adapt to narrower widths without introducing horizontal scrollbars.

**Architecture:** Define responsive behavior in shared Slime components first, then let Gateway, Schedule, Chatroom, and GroupChat pages compose those components with adaptive grids. Keep all Presenter, IPC, Pinia, and persistence contracts unchanged. Update the static component preview page with a device-width switcher so the responsive contract is visible during review.

**Tech Stack:** Vue 3 Composition API, TypeScript, Tailwind CSS v4, static HTML/CSS/JS prototype, Vitest, Vue Test Utils, jsdom.

---

## File Structure

- Modify: `src/renderer/src/components/slime/SlimeAgentCard.vue`  
  Removes fixed card width and keeps the select/disabled behavior intact.
- Modify: `src/renderer/src/components/slime/SlimeWeekCalendar.vue`  
  Converts the week strip into a no-horizontal-scroll responsive layout with compact grid behavior.
- Modify: `src/renderer/src/components/slime/SlimeRankBoard.vue`  
  Allows metric controls and rank rows to wrap or shrink without forcing parent overflow.
- Modify: `src/renderer/src/components/slime/SlimeRealtimeChart.vue`  
  Keeps metric chips, header, and SVG chart within a shrinking container.
- Modify: `src/renderer/src/components/slime/SlimeMetricCard.vue`  
  Ensures metric text truncates inside the grid cell and never decides page-level columns.
- Modify: `src/renderer/src/views/GatewayPanel.vue`  
  Replaces fixed dashboard columns with adaptive metric and chart/rank grids.
- Modify: `src/renderer/src/views/SchedulePanel.vue`  
  Replaces fixed task/timeline columns with responsive wide/tight layouts.
- Modify: `src/renderer/src/components/chat/NewThread.vue`  
  Uses a responsive grid for Agent selection cards.
- Modify: `src/renderer/src/components/groupchat/NewGroupThread.vue`  
  Uses the same responsive Agent selection grid and tight-width form rules.
- Modify: `docs/superpowers/prototypes/codex-style-components-preview.html`  
  Adds a device-width switcher and updates preview CSS to demonstrate the responsive contract.
- Create: `test/renderer/components/SlimeAgentCard.test.ts`  
  Locks `select` and disabled behavior.
- Modify: `test/renderer/components/SlimeWeekCalendar.test.ts`  
  Adds compact layout contract assertions via stable attributes.
- Modify: `test/renderer/components/SlimeRankBoard.test.ts`  
  Adds a metric-switch wrapping contract via stable attributes.
- Create: `test/renderer/prototypes/codex-style-components-preview.test.ts`  
  Verifies the static preview device switcher uses explicit widths and active states.

## Task 1: Add Behavior Tests for Responsive Component Contracts

**Files:**
- Create: `test/renderer/components/SlimeAgentCard.test.ts`
- Modify: `test/renderer/components/SlimeWeekCalendar.test.ts`
- Modify: `test/renderer/components/SlimeRankBoard.test.ts`

- [ ] **Step 1: Create `SlimeAgentCard` behavior test**

Create `test/renderer/components/SlimeAgentCard.test.ts` with this content:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeAgentCard from "@/components/slime/SlimeAgentCard.vue";

describe("SlimeAgentCard", () => {
  it("emits select when enabled", async () => {
    const wrapper = mount(SlimeAgentCard, {
      props: {
        name: "哈尔",
        role: "reasoning",
        description: "负责拆解任务并规划实现路径",
      },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("does not emit select when disabled", async () => {
    const wrapper = mount(SlimeAgentCard, {
      props: {
        name: "莫斯",
        role: "review",
        description: "适合审查方案和补足风险判断",
        disabled: true,
      },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("select")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new Agent card test and verify current behavior**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeAgentCard.test.ts
```

Expected: PASS. This locks current behavior before width classes change.

- [ ] **Step 3: Replace `SlimeWeekCalendar` tests with behavior plus layout-contract assertions**

Replace `test/renderer/components/SlimeWeekCalendar.test.ts` with:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SlimeWeekCalendar from "@/components/slime/SlimeWeekCalendar.vue";

describe("SlimeWeekCalendar", () => {
  it("emits selected date when a day card is clicked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T10:00:00+08:00"));

    const wrapper = mount(SlimeWeekCalendar, {
      props: {
        selectedDate: "2026-05-17",
      },
    });

    await wrapper.get('[data-testid="week-day-2026-05-11"]').trigger("click");

    expect(wrapper.emitted("update:selectedDate")?.[0]).toEqual(["2026-05-11"]);

    vi.useRealTimers();
  });

  it("moves to the previous week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T10:00:00+08:00"));

    const wrapper = mount(SlimeWeekCalendar, {
      props: {
        selectedDate: "2026-05-17",
      },
    });

    await wrapper.get('button[title="上一周"]').trigger("click");

    expect(wrapper.emitted("update:selectedDate")?.[0]).toEqual(["2026-05-04"]);

    vi.useRealTimers();
  });

  it("marks the day grid as compact-capable without horizontal scrolling", () => {
    const wrapper = mount(SlimeWeekCalendar, {
      props: {
        selectedDate: "2026-05-17",
      },
    });

    const dayGrid = wrapper.get('[data-testid="week-day-grid"]');

    expect(dayGrid.attributes("data-layout")).toBe("responsive-compact-grid");
    expect(dayGrid.classes().join(" ")).not.toContain("overflow-x");
  });
});
```

- [ ] **Step 4: Run the WeekCalendar test and verify the new contract fails**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeWeekCalendar.test.ts
```

Expected: FAIL because `data-testid="week-day-grid"` and `data-testid="week-day-YYYY-MM-DD"` do not exist yet.

- [ ] **Step 5: Add a stable layout-contract assertion to `SlimeRankBoard` tests**

In `test/renderer/components/SlimeRankBoard.test.ts`, append this test inside the existing `describe` block:

```ts
  it("marks metric controls as wrap-capable", () => {
    const wrapper = mount(SlimeRankBoard, {
      props: {
        title: "模型排名",
        metrics: [
          { value: "requests", label: "请求" },
          { value: "cost", label: "费用" },
          { value: "tokens", label: "Token" },
        ],
        items: [
          {
            id: "claude",
            label: "Claude",
            values: { requests: "8", cost: "$0.300", tokens: "1.2k" },
            sortValues: { requests: 8, cost: 0.3, tokens: 1200 },
          },
        ],
      },
    });

    const metricTabs = wrapper.get('[data-testid="rank-metric-tabs"]');

    expect(metricTabs.attributes("data-layout")).toBe("wrap");
  });
```

- [ ] **Step 6: Run the RankBoard test and verify the new contract fails**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeRankBoard.test.ts
```

Expected: FAIL because `data-testid="rank-metric-tabs"` does not exist yet.

- [ ] **Step 7: Keep the failing contract tests unstaged until implementation passes**

Run:

```bash
git status --short test/renderer/components/SlimeAgentCard.test.ts test/renderer/components/SlimeWeekCalendar.test.ts test/renderer/components/SlimeRankBoard.test.ts
```

Expected: the test files are visible as unstaged or staged local changes. They are committed in Task 2 after the component implementation makes the full targeted test set pass.

## Task 2: Make Shared Slime Components Width-Adaptive

**Files:**
- Modify: `src/renderer/src/components/slime/SlimeAgentCard.vue`
- Modify: `src/renderer/src/components/slime/SlimeWeekCalendar.vue`
- Modify: `src/renderer/src/components/slime/SlimeRankBoard.vue`
- Modify: `src/renderer/src/components/slime/SlimeRealtimeChart.vue`
- Modify: `src/renderer/src/components/slime/SlimeMetricCard.vue`
- Test: `test/renderer/components/SlimeAgentCard.test.ts`
- Test: `test/renderer/components/SlimeWeekCalendar.test.ts`
- Test: `test/renderer/components/SlimeRankBoard.test.ts`
- Test: `test/renderer/components/SlimeRealtimeChart.test.ts`
- Test: `test/renderer/components/SlimeMetricCard.test.ts`

- [ ] **Step 1: Update `SlimeAgentCard` root classes**

In `src/renderer/src/components/slime/SlimeAgentCard.vue`, replace the root button class string:

```vue
'group relative min-h-[88px] w-[260px] overflow-hidden rounded-[11px] border px-[11px] py-[11px] text-left transition-colors',
```

with:

```vue
'group relative min-h-[88px] w-full min-w-0 overflow-hidden rounded-[11px] border px-[11px] py-[11px] text-left transition-colors',
```

Then replace:

```vue
<div class="min-w-0">
```

with:

```vue
<div class="min-w-0 flex-1">
```

- [ ] **Step 2: Refactor `SlimeWeekCalendar` template to compact grid**

In `src/renderer/src/components/slime/SlimeWeekCalendar.vue`, replace the entire `<template>` block with:

```vue
<template>
  <section
    class="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3 sm:p-4"
  >
    <div class="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h2 class="min-w-0 truncate text-base font-semibold text-[var(--color-text-primary)] sm:text-lg">
        任务管理
      </h2>
      <SlimeBadge variant="accent">Schedule Kit</SlimeBadge>
    </div>

    <div class="grid min-w-0 grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2">
      <button
        type="button"
        title="上一周"
        class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-[var(--color-border-subtle)] bg-white/[0.03] text-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
        @click="moveWeek(-1)"
      >
        <Icon icon="lucide:chevron-left" class="h-4 w-4" />
      </button>

      <div
        data-testid="week-day-grid"
        data-layout="responsive-compact-grid"
        class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2"
      >
        <button
          v-for="day in weekDays"
          :key="day.date"
          :data-testid="`week-day-${day.date}`"
          type="button"
          :class="[
            'min-h-[58px] min-w-0 rounded-[10px] border px-2 py-1.5 text-left transition-colors sm:min-h-[72px]',
            day.date === selectedDate
              ? 'border-[color-mix(in_srgb,var(--color-accent-brand)_38%,transparent)] bg-[var(--color-accent-brand-soft)]'
              : 'border-[var(--color-border-subtle)] bg-white/[0.026] hover:bg-[var(--color-control-hover)]',
          ]"
          @click="$emit('update:selectedDate', day.date)"
        >
          <span class="block truncate text-[10px] font-medium text-[var(--color-text-muted)]">
            {{ day.label }}
          </span>
          <span class="mt-1 block text-[15px] font-semibold text-[var(--color-text-primary)] sm:mt-1.5 sm:text-[17px]">
            {{ day.dayNum }}
          </span>
          <span v-if="day.dots > 0" class="mt-1 flex gap-[3px] sm:mt-1.5">
            <span
              v-for="dot in day.dots"
              :key="dot"
              :class="[
                'h-[5px] w-[5px] rounded-full',
                day.date === selectedDate && dot === 1
                  ? 'bg-[var(--color-accent-brand)]'
                  : 'bg-white/[0.22]',
              ]"
            />
          </span>
        </button>
      </div>

      <button
        type="button"
        title="下一周"
        class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-[var(--color-border-subtle)] bg-white/[0.03] text-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
        @click="moveWeek(1)"
      >
        <Icon icon="lucide:chevron-right" class="h-4 w-4" />
      </button>
    </div>
  </section>
</template>
```

- [ ] **Step 3: Update `SlimeRankBoard` header and metric tabs**

In `src/renderer/src/components/slime/SlimeRankBoard.vue`, replace:

```vue
<div class="mb-3 flex items-center justify-between gap-3">
```

with:

```vue
<div class="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
```

Then replace the metric tab wrapper:

```vue
<div
  v-if="metrics.length"
  class="flex shrink-0 gap-1 rounded-full bg-[var(--color-control)] p-0.5"
>
```

with:

```vue
<div
  v-if="metrics.length"
  data-testid="rank-metric-tabs"
  data-layout="wrap"
  class="flex min-w-0 flex-wrap gap-1 rounded-full bg-[var(--color-control)] p-0.5"
>
```

Then replace:

```vue
<span class="shrink-0 text-xs font-medium text-[var(--color-text-primary)]">{{
  item.value
}}</span>
```

with:

```vue
<span class="max-w-[96px] shrink-0 truncate text-right text-xs font-medium text-[var(--color-text-primary)]">
  {{ item.value }}
</span>
```

- [ ] **Step 4: Update `SlimeRealtimeChart` to shrink cleanly**

In `src/renderer/src/components/slime/SlimeRealtimeChart.vue`, replace the root section class:

```vue
class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
```

with:

```vue
class="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3 sm:p-4"
```

Replace:

```vue
<div class="mb-4 flex items-start justify-between gap-3">
  <div>
```

with:

```vue
<div class="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
  <div class="min-w-0">
```

Replace the metric chip button class string:

```vue
'inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors',
```

with:

```vue
'inline-flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
```

Replace:

```vue
<span>{{ metric.label }}</span>
```

with:

```vue
<span class="truncate">{{ metric.label }}</span>
```

Replace:

```vue
<span class="text-[var(--color-text-secondary)]">
  {{ metric.value }}
</span>
```

with:

```vue
<span class="max-w-[88px] truncate text-[var(--color-text-secondary)]">
  {{ metric.value }}
</span>
```

- [ ] **Step 5: Update `SlimeMetricCard` root class**

In `src/renderer/src/components/slime/SlimeMetricCard.vue`, replace:

```vue
class="min-w-0 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--metric-color)_24%,var(--color-border-subtle))] bg-[color-mix(in_srgb,var(--metric-color)_10%,var(--color-control))] p-3"
```

with:

```vue
class="w-full min-w-0 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--metric-color)_24%,var(--color-border-subtle))] bg-[color-mix(in_srgb,var(--metric-color)_10%,var(--color-control))] p-3"
```

- [ ] **Step 6: Run targeted component tests**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeAgentCard.test.ts test/renderer/components/SlimeWeekCalendar.test.ts test/renderer/components/SlimeRankBoard.test.ts test/renderer/components/SlimeRealtimeChart.test.ts test/renderer/components/SlimeMetricCard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run formatter for touched Vue/test files**

Run:

```bash
pnpm run format
```

Expected: command exits `0`.

- [ ] **Step 8: Commit shared component changes**

Run:

```bash
git add src/renderer/src/components/slime/SlimeAgentCard.vue src/renderer/src/components/slime/SlimeWeekCalendar.vue src/renderer/src/components/slime/SlimeRankBoard.vue src/renderer/src/components/slime/SlimeRealtimeChart.vue src/renderer/src/components/slime/SlimeMetricCard.vue test/renderer/components/SlimeAgentCard.test.ts test/renderer/components/SlimeWeekCalendar.test.ts test/renderer/components/SlimeRankBoard.test.ts
git commit -m "fix(ui): make shared components width adaptive"
```

Expected: commit succeeds.

## Task 3: Update High-Risk Page Layouts

**Files:**
- Modify: `src/renderer/src/views/GatewayPanel.vue`
- Modify: `src/renderer/src/views/SchedulePanel.vue`
- Modify: `src/renderer/src/components/chat/NewThread.vue`
- Modify: `src/renderer/src/components/groupchat/NewGroupThread.vue`
- Test: `test/renderer/components/SlimeAgentCard.test.ts`
- Test: `test/renderer/components/SlimeWeekCalendar.test.ts`
- Test: `test/renderer/components/SlimeRankBoard.test.ts`

- [ ] **Step 1: Update Gateway metric grid and chart/rank grid**

In `src/renderer/src/views/GatewayPanel.vue`, replace:

```vue
<div class="grid grid-cols-6 gap-2">
```

with:

```vue
<div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
```

Then replace:

```vue
<div class="mb-2 mt-3 grid grid-cols-[minmax(0,1fr)_360px] gap-3">
```

with:

```vue
<div class="mb-2 mt-3 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
```

Then replace:

```vue
<div class="grid gap-3">
```

in the rank board area with:

```vue
<div class="grid min-w-0 gap-3">
```

- [ ] **Step 2: Update Schedule top-level layout**

In `src/renderer/src/views/SchedulePanel.vue`, replace:

```vue
<div class="flex h-full bg-[var(--color-app-canvas)]">
```

with:

```vue
<div class="grid h-full min-w-0 grid-cols-1 bg-[var(--color-app-canvas)] xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
```

Replace:

```vue
<div class="flex min-w-[400px] flex-1 flex-col">
```

with:

```vue
<div class="flex min-w-0 flex-col">
```

Replace:

```vue
<div class="w-px bg-[var(--color-border-subtle)]" />
```

with:

```vue
<div class="hidden w-px bg-[var(--color-border-subtle)] xl:block" />
```

Replace:

```vue
<div class="w-[300px] shrink-0 overflow-y-auto px-4 py-4">
```

with:

```vue
<div class="min-w-0 border-t border-[var(--color-border-subtle)] px-4 py-4 xl:border-t-0">
```

- [ ] **Step 3: Update Chatroom new thread Agent grid**

In `src/renderer/src/components/chat/NewThread.vue`, replace:

```vue
<div class="flex max-w-[760px] flex-wrap justify-center gap-3">
```

with:

```vue
<div class="grid w-full max-w-[760px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
```

Replace:

```vue
<div class="flex flex-1 flex-col items-center justify-center px-8 pb-8">
```

with:

```vue
<div class="flex min-w-0 flex-1 flex-col items-center justify-center px-4 pb-8 sm:px-8">
```

- [ ] **Step 4: Update GroupChat new thread Agent grid and form rows**

In `src/renderer/src/components/groupchat/NewGroupThread.vue`, replace:

```vue
<div class="flex flex-1 flex-col items-center justify-center px-8 py-8">
```

with:

```vue
<div class="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
```

Replace:

```vue
<div class="mb-6 flex max-w-[760px] flex-wrap justify-center gap-3">
```

with:

```vue
<div class="mb-6 grid w-full max-w-[760px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
```

Replace:

```vue
<div class="flex gap-2">
```

with:

```vue
<div class="flex min-w-0 flex-col gap-2 sm:flex-row">
```

Replace:

```vue
<span class="text-[var(--color-text-primary)]">{{ p }}</span>
```

with:

```vue
<span class="min-w-0 truncate text-[var(--color-text-primary)]">{{ p }}</span>
```

- [ ] **Step 5: Run targeted tests after page layout changes**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeAgentCard.test.ts test/renderer/components/SlimeWeekCalendar.test.ts test/renderer/components/SlimeRankBoard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run renderer typecheck**

Run:

```bash
pnpm run typecheck:web
```

Expected: command exits `0`.

- [ ] **Step 7: Commit page layout changes**

Run:

```bash
git add src/renderer/src/views/GatewayPanel.vue src/renderer/src/views/SchedulePanel.vue src/renderer/src/components/chat/NewThread.vue src/renderer/src/components/groupchat/NewGroupThread.vue
git commit -m "fix(ui): adapt gateway schedule and agent grids"
```

Expected: commit succeeds.

## Task 4: Add Device Width Switcher to the Static Components Preview

**Files:**
- Modify: `docs/superpowers/prototypes/codex-style-components-preview.html`
- Create: `test/renderer/prototypes/codex-style-components-preview.test.ts`

- [ ] **Step 1: Create prototype device switcher test**

Create `test/renderer/prototypes/codex-style-components-preview.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const previewPath = resolve("docs/superpowers/prototypes/codex-style-components-preview.html");

describe("codex-style components preview", () => {
  it("defines device buttons for responsive component preview", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain('data-device="desktop"');
    expect(html).toContain('data-width="1280px"');
    expect(html).toContain('data-device="laptop"');
    expect(html).toContain('data-width="1024px"');
    expect(html).toContain('data-device="tablet"');
    expect(html).toContain('data-width="768px"');
    expect(html).toContain('data-device="mobile"');
    expect(html).toContain('data-width="390px"');
  });

  it("contains the script that updates preview width and active state", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain("function setPreviewDevice(button)");
    expect(html).toContain("previewFrame.style.setProperty(\"--preview-width\", width)");
    expect(html).toContain("deviceLabel.textContent = `${button.textContent?.trim()} · ${width}`");
  });
});
```

- [ ] **Step 2: Run the prototype test and verify it fails**

Run:

```bash
pnpm vitest run test/renderer/prototypes/codex-style-components-preview.test.ts
```

Expected: FAIL because the preview page does not have device buttons or switcher script yet.

- [ ] **Step 3: Add preview device CSS**

In `docs/superpowers/prototypes/codex-style-components-preview.html`, inside the existing `<style>` block after `.components-shell, .index-shell { ... }`, add:

```css
      .device-switcher {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }

      .device-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        border: 1px solid var(--border-soft);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.035);
        padding: 3px;
      }

      .device-tab {
        min-height: 26px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--text-muted);
        padding: 0 10px;
        font-size: 12px;
        font-weight: 600;
      }

      .device-tab:hover,
      .device-tab.active {
        background: var(--control-active);
        color: var(--text);
      }

      .device-label {
        color: var(--text-muted);
        font-size: 12px;
        white-space: nowrap;
      }

      .preview-frame-shell {
        max-width: 100%;
        margin: 0 auto;
      }

      .preview-frame-label {
        margin: 0 auto 8px;
        width: min(100%, var(--preview-width, 1280px));
        color: var(--text-muted);
        font-size: 12px;
        text-align: right;
      }

      .preview-frame {
        width: min(100%, var(--preview-width, 1280px));
        margin: 0 auto;
        border: 1px solid var(--border-soft);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.026);
        padding: 16px;
        transition: width 180ms ease;
      }
```

Then replace the existing `.preview-switcher` rule:

```css
      .preview-switcher {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        min-height: 54px;
        padding: 0 24px;
        border-bottom: 1px solid var(--border-soft);
        background: rgba(18, 18, 19, 0.88);
        backdrop-filter: blur(22px);
      }
```

with:

```css
      .preview-switcher {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px 18px;
        min-height: 54px;
        padding: 10px 24px;
        border-bottom: 1px solid var(--border-soft);
        background: rgba(18, 18, 19, 0.88);
        backdrop-filter: blur(22px);
      }
```

- [ ] **Step 4: Wrap the component board in a preview frame**

In the same HTML file, replace:

```html
        <div class="preview-links">
          <a class="" href="codex-style-ui-preview.html">总览</a>
          <a class="" href="codex-style-layout-preview.html">整体布局</a>
          <a class="active" href="codex-style-components-preview.html">基础组件</a>
        </div>
      </nav>
      <section class="components-shell">
        <aside class="component-board">
```

with:

```html
        <div class="preview-links">
          <a class="" href="codex-style-ui-preview.html">总览</a>
          <a class="" href="codex-style-layout-preview.html">整体布局</a>
          <a class="active" href="codex-style-components-preview.html">基础组件</a>
        </div>
        <div class="device-switcher" aria-label="设备宽度预览">
          <div class="device-tabs">
            <button class="device-tab active" type="button" data-device="desktop" data-width="1280px">
              桌面
            </button>
            <button class="device-tab" type="button" data-device="laptop" data-width="1024px">
              笔记本
            </button>
            <button class="device-tab" type="button" data-device="tablet" data-width="768px">
              平板
            </button>
            <button class="device-tab" type="button" data-device="mobile" data-width="390px">
              手机
            </button>
          </div>
          <span class="device-label" id="deviceLabel">桌面 · 1280px</span>
        </div>
      </nav>
      <section class="components-shell">
        <div class="preview-frame-shell">
          <div class="preview-frame-label" id="previewFrameLabel">当前画布：1280px</div>
          <div class="preview-frame" id="previewFrame">
            <aside class="component-board">
```

Then replace the closing block near the end:

```html
          </aside>
      </section>
    </main>
  </body>
</html>
```

with:

```html
            </aside>
          </div>
        </div>
      </section>
    </main>
    <script>
      const previewFrame = document.getElementById("previewFrame");
      const deviceLabel = document.getElementById("deviceLabel");
      const previewFrameLabel = document.getElementById("previewFrameLabel");
      const deviceButtons = document.querySelectorAll(".device-tab");

      function setPreviewDevice(button) {
        const width = button.dataset.width ?? "1280px";
        previewFrame.style.setProperty("--preview-width", width);
        deviceButtons.forEach((item) => item.classList.toggle("active", item === button));
        deviceLabel.textContent = `${button.textContent?.trim()} · ${width}`;
        previewFrameLabel.textContent = `当前画布：${width}`;
      }

      deviceButtons.forEach((button) => {
        button.addEventListener("click", () => setPreviewDevice(button));
      });
    </script>
  </body>
</html>
```

- [ ] **Step 5: Update preview board and Schedule Kit CSS for no horizontal overflow**

In `docs/superpowers/prototypes/codex-style-components-preview.html`, replace:

```css
      .components-page .component-board {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        max-width: 1180px;
        margin: 0 auto;
      }
```

with:

```css
      .components-page .component-board {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
        gap: 16px;
        max-width: 1180px;
        min-width: 0;
        margin: 0 auto;
      }
```

Replace:

```css
      .agent-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
```

with:

```css
      .agent-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
        gap: 8px;
      }
```

Replace the current `.week-strip` rule:

```css
      .week-strip {
        display: grid;
        grid-template-columns: 28px repeat(7, minmax(0, 1fr)) 28px;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
      }
```

with:

```css
      .week-strip {
        display: grid;
        min-width: 0;
        grid-template-columns: 34px minmax(0, 1fr) 34px;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
      }
```

Add this CSS after the `.week-strip` rule:

```css
      .week-days {
        display: grid;
        min-width: 0;
        grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
        gap: 6px;
      }

      .week-strip .day-cell {
        min-width: 0;
      }

      @media (max-width: 720px) {
        .week-strip {
          align-items: stretch;
        }

        .week-strip .day-cell {
          min-height: 58px;
        }
      }
```

Then replace the Schedule Kit `.week-strip` HTML block:

```html
                <div class="week-strip">
                  <button class="week-nav">‹</button>
                  <div class="day-cell">
                    <div class="day-label">周一</div>
                    <div class="day-number">11</div>
                    <div class="day-dots"><span></span></div>
                  </div>
                  <div class="day-cell">
                    <div class="day-label">周二</div>
                    <div class="day-number">12</div>
                    <div class="day-dots"><span></span><span></span></div>
                  </div>
                  <div class="day-cell active">
                    <div class="day-label">今天</div>
                    <div class="day-number">15</div>
                    <div class="day-dots"><span></span><span></span><span></span></div>
                  </div>
                  <div class="day-cell">
                    <div class="day-label">周四</div>
                    <div class="day-number">16</div>
                    <div class="day-dots"><span></span></div>
                  </div>
                  <div class="day-cell">
                    <div class="day-label">周五</div>
                    <div class="day-number">17</div>
                  </div>
                  <div class="day-cell">
                    <div class="day-label">周六</div>
                    <div class="day-number">18</div>
                  </div>
                  <div class="day-cell">
                    <div class="day-label">周日</div>
                    <div class="day-number">19</div>
                  </div>
                  <button class="week-nav">›</button>
                </div>
```

with:

```html
                <div class="week-strip">
                  <button class="week-nav">‹</button>
                  <div class="week-days">
                    <div class="day-cell">
                      <div class="day-label">周一</div>
                      <div class="day-number">11</div>
                      <div class="day-dots"><span></span></div>
                    </div>
                    <div class="day-cell">
                      <div class="day-label">周二</div>
                      <div class="day-number">12</div>
                      <div class="day-dots"><span></span><span></span></div>
                    </div>
                    <div class="day-cell active">
                      <div class="day-label">今天</div>
                      <div class="day-number">15</div>
                      <div class="day-dots"><span></span><span></span><span></span></div>
                    </div>
                    <div class="day-cell">
                      <div class="day-label">周四</div>
                      <div class="day-number">16</div>
                      <div class="day-dots"><span></span></div>
                    </div>
                    <div class="day-cell">
                      <div class="day-label">周五</div>
                      <div class="day-number">17</div>
                    </div>
                    <div class="day-cell">
                      <div class="day-label">周六</div>
                      <div class="day-number">18</div>
                    </div>
                    <div class="day-cell">
                      <div class="day-label">周日</div>
                      <div class="day-number">19</div>
                    </div>
                  </div>
                  <button class="week-nav">›</button>
                </div>
```

- [ ] **Step 6: Run the prototype test**

Run:

```bash
pnpm vitest run test/renderer/prototypes/codex-style-components-preview.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run formatter**

Run:

```bash
pnpm run format
```

Expected: command exits `0`.

- [ ] **Step 8: Commit preview changes**

Run:

```bash
git add docs/superpowers/prototypes/codex-style-components-preview.html test/renderer/prototypes/codex-style-components-preview.test.ts
git commit -m "docs(ui): add responsive preview device switcher"
```

Expected: commit succeeds.

## Task 5: Final Verification and Visual QA

**Files:**
- Verify: `src/renderer/src/components/slime/SlimeAgentCard.vue`
- Verify: `src/renderer/src/components/slime/SlimeWeekCalendar.vue`
- Verify: `src/renderer/src/views/GatewayPanel.vue`
- Verify: `src/renderer/src/views/SchedulePanel.vue`
- Verify: `docs/superpowers/prototypes/codex-style-components-preview.html`

- [ ] **Step 1: Run full formatting**

Run:

```bash
pnpm run format
```

Expected: command exits `0`.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm run lint
```

Expected: command exits `0`.

- [ ] **Step 3: Run renderer typecheck**

Run:

```bash
pnpm run typecheck:web
```

Expected: command exits `0`.

- [ ] **Step 4: Run targeted renderer tests**

Run:

```bash
pnpm vitest run test/renderer/components/SlimeAgentCard.test.ts test/renderer/components/SlimeWeekCalendar.test.ts test/renderer/components/SlimeRankBoard.test.ts test/renderer/components/SlimeRealtimeChart.test.ts test/renderer/components/SlimeMetricCard.test.ts test/renderer/prototypes/codex-style-components-preview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Start the dev server**

Run:

```bash
pnpm run dev
```

Expected: Vite/Electron dev process starts without compile errors and prints a local dev URL or launches the app.

- [ ] **Step 6: Perform visual QA**

Use the Browser plugin or the running Electron app to inspect:

- Gateway at a wide width and a narrow width: metric cards reduce columns, chart and rank boards stack, no horizontal scrollbar appears.
- Schedule at a wide width and a narrow width: Timeline moves below the task area, `SlimeWeekCalendar` becomes compact grid, no horizontal scrollbar appears.
- Chatroom NewThread and GroupChat NewGroupThread: Agent cards fill the grid cells and do not keep a fixed 260px width.
- `docs/superpowers/prototypes/codex-style-components-preview.html`: click 桌面、笔记本、平板、手机; preview width label and active button update, and component examples do not overflow horizontally.

- [ ] **Step 7: Stop the dev server**

If `pnpm run dev` is still running in the terminal, stop it with `Ctrl-C`.

Expected: no task-related dev server remains running.
