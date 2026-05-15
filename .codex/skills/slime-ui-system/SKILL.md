---
name: slime-ui-system
description: Use when designing, adding, reviewing, or migrating Slime renderer UI, including Vue components, app layout, Chatroom, GroupChat, Gateway dashboards, Agent cards, Schedule task views, Settings, buttons, inputs, charts, lists, panels, profile cards, logs, ranking boards, checklists, composers, and any request to follow the project's Codex-style UI system.
---

# Slime UI System

## Purpose

Use this skill to keep Slime UI work consistent with the approved Codex-style design system. It applies to visual design, component design, renderer implementation, UI review, and migration of old hand-styled pages to shared components.

## Required Workflow

1. **Classify the request**
   - Pure primitive: `src/renderer/src/components/ui/`
   - App/page layout: `src/renderer/src/components/layout/`
   - Slime business component: `src/renderer/src/components/slime/`
   - Page migration: keep the page's store/Presenter behavior; replace styling and component composition only.

2. **Read the right reference**
   - For component inventory and usage rules, read `references/component-rules.md`.
   - For current implementation order, read `docs/superpowers/plans/2026-05-15-codex-style-ui-system.md`.
   - For visual feel, use `docs/superpowers/prototypes/codex-style-ui-preview.html` as the approved baseline.
   - If rules seem stale, check the `UI 设计系统规范（Codex-style）` section in `AGENTS.md`.

3. **Prototype before implementation when adding a new component family**
   - Update `docs/superpowers/prototypes/codex-style-ui-preview.html` first.
   - Show or describe the updated visual state for approval.
   - Only then add or change real Vue components.

4. **Implement with shared components**
   - Prefer existing shared components before writing new Tailwind class clusters.
   - New shared components must receive data through props/slots and emit events upward.
   - Shared components must not import feature stores or call Presenters.

5. **Preserve behavior**
   - Do not change IPC contracts, Pinia stores, Presenter method names, or persistence behavior for visual-only work.
   - When migrating pages, keep existing user flows such as pending questions, retry, stop generation, detached group chat, MCP tool state, gateway refresh, and schedule timeline actions.

6. **Verify behavior, not classes**
   - Add/adjust renderer tests for behavior contracts: emits, disabled state, keyboard submit, selection changes, prev/next/select events.
   - Avoid tests that only assert CSS classes or static text unless that text is a product contract.

## Non-Negotiable Style Rules

- Use semantic tokens from `src/renderer/src/assets/main.css`; avoid raw hex colors in business components.
- Keep the interface dark, low-noise, dense, and desktop-tool-like.
- Do not create marketing-style hero sections inside the app.
- Do not use decorative gradient blobs or large purple/blue background gradients.
- Do not nest cards inside cards.
- Use icon buttons with `title`/tooltip for clear tool actions.
- Multi-metric charts should use metric chips to switch the main chart, not many bright lines at once.
- Disabled states must preserve dimensions but remove action emphasis.

## Completion Checklist

- Shared component rules followed.
- Prototype updated first for new visual patterns.
- `AGENTS.md` updated if a long-lived component or rule was added.
- Relevant behavior tests added or updated.
- `pnpm run format`, `pnpm run lint`, and targeted type/tests run when code changes.
