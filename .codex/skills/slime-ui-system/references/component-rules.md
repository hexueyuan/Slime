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
- `SlimeLogCard`: Gateway log row/card with status code, request summary, timing, retry/circuit state.
- `SlimeWeekCalendar`: Schedule week strip with prev/next and day selection.
- `SlimeTaskList`: Schedule task rows with done, pending, priority, date/state badges.
- `SlimeTimeline`: Schedule timeline event stream.

## Adding a New Component

1. Add the visual pattern to `docs/superpowers/prototypes/codex-style-ui-preview.html`.
2. Get visual approval if the user is involved in the UI direction.
3. Add or update the component rule in `AGENTS.md` if it is long-lived.
4. Implement the Vue component in the correct directory.
5. Add behavior tests under `test/renderer/components/`.
6. Replace page-local styling with the shared component.

## API Rules

- Use `modelValue` / `update:modelValue` for form controls.
- Use `selected` or `active` for selection.
- Use `variant` and `size` for visual variants.
- Use explicit events: `submit`, `stop`, `toggle`, `select`, `remove`, `open`, `close`, `next`, `prev`.
- Use slots for variable content instead of importing business stores.

## Style Rules

- Prefer semantic CSS variables and Tailwind arbitrary values that reference tokens.
- Keep body text at 13-14px and metadata at 11-12px.
- Keep controls stable in size; hover/selected/disabled states must not shift layout.
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

Avoid tests that only assert CSS class names, icon presence, or static labels unless they are product contracts.
