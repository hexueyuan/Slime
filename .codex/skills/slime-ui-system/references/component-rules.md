# Slime UI Component Rules

## Visual Baseline

- Approved prototype: `docs/superpowers/prototypes/codex-style-ui-preview.html`
- Design spec: `docs/superpowers/specs/2026-05-15-codex-style-ui-system-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-15-codex-style-ui-system.md`
- Project rules: `AGENTS.md`, section `UI 设计系统规范（Codex-style）`

## Component Directories

Use these locations by default:

- `src/renderer/src/components/ui/`: pure primitives, no business stores.
- `src/renderer/src/components/layout/`: app shell and page layout.
- `src/renderer/src/components/slime/`: reusable Slime business components, still store-free.

## UI Primitives

- `SlimeButton`: primary, secondary, ghost, danger actions. Use for explicit commands such as create, save, cancel, delete.
- `SlimeIconButton`: icon-only action. Use for refresh, retry, copy, collapse, expand, settings, close, prev, next. Must expose `title` or tooltip.
- `SlimeBadge`: metadata and status. Use for health, retry, capability tags, selected states, status code labels.
- `SlimeInput`: search and single-line form input.
- `SlimeTextarea`: multi-line text and config input.
- `SlimeSelect`: single-select and multi-select dropdown. Trigger follows parent width, multi-select chips wrap, menu uses bounded internal scroll.
- `SlimePanel`: low-contrast section wrapper. Use for major operational sections, not nested cards.
- `SlimeListItem`: selectable/list row for sessions, tasks, agents, logs, navigation.
- `SlimeTabs`: compact tab strip.
- `SlimeChecklist`: checkbox/switch rows for MCP tools, abilities, settings toggles.
- `SlimeComposer`: Chatroom and GroupChat composer with toolbar, attachments, send/stop, disabled state.

## Layout Components

- `AppShell`: full-window shell. Owns sidebar + rounded main canvas.
- `AppSidebarNav`: expanded Codex-like sidebar. Owns window controls, main navigation, project/session groups, bottom settings/status.
- `WorkspaceCanvas`: main content canvas.
- `SplitWorkspace`: split layout for chat + function panel.
- `PageHeader`: operational page title/action row.

## Slime Business Components

- `SlimeAgentCard`: Agent selection, Agent management list, GroupChat participant selection.
- `SlimeProfileCard`: user or Agent profile summary.
- `SlimeRealtimeChart`: Gateway realtime metrics. Use chips for multiple metrics; main chart shows one active metric.
- `SlimeRankBoard`: Gateway ranking list for requests, success rate, latency, cost.
- `SlimeResourceCard`: resource card for Gateway groups, keys, channels, and similar one-resource-per-card layouts. Width follows the parent grid and facts wrap responsively.
- `SlimeLogCard`: Gateway log row/card with status code, request summary, timing, retry/circuit state.
- `SlimeWeekCalendar`: Schedule week strip with prev/next and day selection.
- `SlimeTaskList`: Schedule task rows with done, pending, priority, date/state badges.
- `SlimeTimeline`: Schedule timeline event stream.

## Adding a New Component

Before adding a component, prove the existing library cannot express the need:

1. Check `components/ui`, `components/layout`, and `components/slime` for an existing primitive, layout, or business component.
2. Prefer composition of existing components over a new component.
3. If existing components are insufficient, add the visual pattern to `docs/superpowers/prototypes/codex-style-ui-preview.html`.
4. Get visual approval if the user is involved in the UI direction.
5. Implement the Vue component in the correct directory.
6. Add or update this reference and the component rule in `AGENTS.md` if it is long-lived.
7. Add behavior tests under `test/renderer/components/`.
8. Replace page-local styling with the shared component.

## API Rules

- Use `modelValue` / `update:modelValue` for form controls.
- Use `selected` or `active` for selection.
- Use `variant` and `size` for visual variants.
- Use explicit events: `submit`, `stop`, `toggle`, `select`, `remove`, `open`, `close`, `next`, `prev`.
- Use slots for variable content instead of importing business stores.
- Component previews must render the real Vue component from `components/ui`, `components/layout`, or `components/slime`. Preview files may provide fixture data and outer demo layout only; they must not hand-code static HTML/CSS copies of component internals.
- Layout and component previews must be checked at multiple PC window sizes: standard window, minimum window, fullscreen reference, and at least one manually adjusted size that is not below the app minimum. At every checked size, all required visible information must remain complete, with no unintended line wrapping, overlap, truncation/ellipsis/line-clamp, or horizontal/inner scrollbars. If a preview cannot satisfy this, revise the component density, hierarchy, grid, or minimum size instead of hiding information.
- Product pages must consume shared components through public props, slots, and emits. If a page needs a new visual state, extend the shared component API and preview first instead of redefining the component's DOM or visual classes locally.

## Style Rules

- Prefer semantic CSS variables and Tailwind arbitrary values that reference tokens.
- Keep body text at 13-14px and metadata at 11-12px.
- Keep controls stable in size; hover/selected/disabled states must not shift layout.
- Components must be adaptive by default. Do not hard-code fixed width or height on reusable components unless the component has an intrinsically fixed shape, such as an icon button, avatar, switch, checkbox, calendar day cell, board square, or chart viewport.
- Let the parent container decide available width. Reusable components should usually render with `width: 100%`, `min-width: 0`, and responsive constraints such as `minmax(0, 1fr)`, `auto-fit`, `clamp`, `min()`, `max()`, `max-width`, or `aspect-ratio`.
- Let content decide height where possible. Use `min-height` for comfortable touch/click targets, but allow resource cards, select triggers, list rows, and form controls with chips or descriptions to grow when content wraps.
- Text and metadata inside reusable components must shrink safely with `min-width: 0` and layout-aware grids. Required labels, values, badges, actions, paths, model ids, keys, and Chinese/English mixed text must remain fully readable at supported PC preview sizes; do not rely on truncation, ellipsis, line-clamp, or accidental wrapping to pass layout review.
- Badges, chips, facts, and action groups must use responsive grids or reserved space that keeps their content complete. They must not force horizontal page scroll or introduce their own scrollbars at supported PC preview sizes.
- Internal scroll areas are allowed only where the interaction expects a bounded list or viewport, such as dropdown menus, log panes, tables, and chart containers. Repeated cards should not contain their own scrollbars; scrolling belongs to the parent page region.
- Disabled, hover, selected, loading, empty, and error states must preserve stable outer dimensions unless the component explicitly supports content-driven expansion, such as a multiline composer or multi-select trigger.
- Component previews must show the component in constrained PC window states when the component is likely to appear in responsive grids, side panels, cards, or dialogs. The preview must prove complete information display with no unintended wrapping, overlap, truncation, or scrollbars.
- Use purple only for accent/focus/primary metric.
- Use red only for danger/error, amber for warning/cost/retry, green for success/healthy.
- Do not preserve red danger emphasis in disabled states.
- Do not stack multiple strong colors in charts.

## Testing Rules

Prefer tests that prove user-visible behavior:

- Composer submits on Enter, not Shift+Enter.
- Disabled controls do not emit actions.
- Checklist rows emit `toggle`.
- Week calendar emits `prev`, `next`, and `select`.
- Tabs emit active change.
- Page migrations preserve existing store/Presenter events.
- UI layout changes update relevant E2E cases under `test/e2e/`.
- Main app layout, navigation, page visibility, panel resizing, responsive layout, and shell changes require relevant E2E coverage.

Avoid tests that only assert CSS class names, icon presence, or static labels unless they are product contracts.

Required verification for UI work:

- Run `pnpm run format` and `pnpm run lint` after code changes.
- Run targeted renderer unit tests for changed components/pages.
- Run relevant E2E tests after UI changes; run `pnpm run test:e2e` for app shell, layout, navigation, or main-page changes.
- Run `pnpm run typecheck:web` when touching shared components or major renderer views.
