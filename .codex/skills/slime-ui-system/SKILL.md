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

2. **Read and obey the UI design rules**
   - For component inventory and usage rules, read `references/component-rules.md`.
   - For current implementation order, read `docs/superpowers/plans/2026-05-15-codex-style-ui-system.md`.
   - For visual feel, use `docs/superpowers/prototypes/codex-style-ui-preview.html` as the approved baseline.
   - If rules seem stale, check the `UI 设计系统规范（Codex-style）` section in `AGENTS.md`.
   - UI changes MUST comply with the approved design system. Do not introduce a local visual language because it is faster for a single page.

3. **Use the component library first**
   - Before writing page-local Tailwind clusters or custom controls, check whether existing shared components in `src/renderer/src/components/ui/`, `src/renderer/src/components/layout/`, or `src/renderer/src/components/slime/` cover the need.
   - Prefer composing existing shared components over creating a new component.
   - If existing components are insufficient, follow the new component path below. Do not bypass the component library with one-off UI unless the change is truly page-specific and not reusable.

4. **Follow the new component path when needed**
   - Update the component preview first, but render the real Vue component in the preview entrypoint. Do not hand-code a static HTML/CSS mockup of the component internals.
   - Show or describe the updated visual state for approval.
   - Add the component in the correct shared directory (`ui`, `layout`, or `slime`) with props/slots and upward emits.
   - Update `references/component-rules.md` and `AGENTS.md` when adding a long-lived component or rule.
   - Only then use the new component from business pages.

5. **Implement with shared components**
   - Prefer existing shared components before writing new Tailwind class clusters.
   - New shared components must receive data through props/slots and emit events upward.
   - Shared components must not import feature stores or call Presenters.
   - Product pages must only pass public props/slots/emits to shared components. If a page needs a new visual state, extend the shared component and preview instead of recreating its internal DOM or styles locally.

6. **Preserve behavior**
   - Do not change IPC contracts, Pinia stores, Presenter method names, or persistence behavior for visual-only work.
   - When migrating pages, keep existing user flows such as pending questions, retry, stop generation, detached group chat, MCP tool state, gateway refresh, and schedule timeline actions.

7. **Update tests with the UI change**
   - Add/adjust renderer tests for behavior contracts: emits, disabled state, keyboard submit, selection changes, prev/next/select events.
   - If the change affects app shell, layout, navigation, page visibility, responsive behavior, resizing, panels, tabs, or major page regions, update the relevant E2E case(s) under `test/e2e/`.
   - Avoid tests that only assert CSS classes or static text unless that text is a product contract.

8. **Run required verification**
   - For any UI change, run relevant renderer unit tests and the relevant E2E tests.
   - For layout or main-page changes, run `pnpm run test:e2e`.
   - Always run `pnpm run format` and `pnpm run lint` after code changes.
   - When touching shared components, Chatroom, GroupChat, Schedule, Gateway, Agents, Settings, or app layout, also run `pnpm run typecheck:web`.

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
- Existing component library checked first; new component path used only when needed.
- UI design system rules followed.
- Prototype updated first for new visual patterns.
- `AGENTS.md` updated if a long-lived component or rule was added.
- Relevant behavior tests added or updated.
- Relevant E2E cases added or updated for layout/page/navigation/UI behavior changes.
- `pnpm run format`, `pnpm run lint`, targeted renderer unit tests, relevant E2E tests, and `pnpm run typecheck:web` run when applicable.
