# Codex-style UI System Design

## Goal

Slime needs a unified visual system inspired by Codex: calm dark surfaces, a soft translucent sidebar, large focused work areas, compact operational pages, and a central prompt-first chat experience. The goal is not to clone Codex pixel-for-pixel. The goal is to create a reusable Slime design system so future pages and components feel consistent by default.

This work should turn the current page-by-page styling into a foundation made of global tokens, shared primitives, layout components, and page templates. Chatroom, GroupChat, Gateway, Agents, Schedule, Settings, and future features should consume the same shared components instead of hand-building their own shells, cards, inputs, and lists.

## Design Principles

Slime should feel like a focused desktop tool. The interface should be quiet, dense enough for repeated work, and generous only where attention benefits from space, such as the empty chat state and message composer.

The visual language should use:

- A near-black app background with subtle contrast between the main canvas and panels.
- A translucent macOS-like sidebar with blur, low-contrast dividers, and grouped navigation.
- System fonts optimized for Chinese and English: `Inter`, `SF Pro Text`, `PingFang SC`, `Microsoft YaHei`, `system-ui`, `sans-serif`.
- Small, stable radii for operational surfaces, with larger radii reserved for the prompt composer and modals.
- Purple as an accent for focus, selection, and primary actions, not as a dominant page background.
- Clear text hierarchy: primary text, secondary text, muted text, disabled text.
- Icon-first controls with tooltips for toolbar actions.
- No nested cards, no decorative gradient blobs, and no marketing-style hero sections.

## Scope

The first implementation should cover the global system and enough page migration to prove the system:

- Global CSS tokens in `src/renderer/src/assets/main.css`.
- Shared UI primitives under `src/renderer/src/components/ui/`.
- Shared app layout components under `src/renderer/src/components/layout/`.
- Migration of `App.vue` and `AppSidebar.vue` to the new app shell.
- Migration of Chatroom empty state, active chat composer, and session list.
- Migration of GroupChat empty state, active composer, and session list.
- Light alignment pass for Gateway, Agents, Schedule, Settings, and function panels using shared containers and controls where practical.

Deep rewrites of data flow, stores, presenters, gateway behavior, agent behavior, and schedule logic are out of scope. Existing user flows should keep their current behavior unless a visual component requires a small prop or event shape cleanup.

## Architecture

### Layer 1: Design Tokens

`main.css` should define semantic CSS variables rather than relying on raw colors in each component. Existing Tailwind theme mappings can remain, but they should point to a richer token set.

Core token groups:

- App surfaces: `--color-app`, `--color-app-panel`, `--color-app-sidebar`, `--color-app-elevated`.
- Text: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-text-disabled`.
- Borders: `--color-border`, `--color-border-subtle`, `--color-border-strong`.
- Controls: `--color-control`, `--color-control-hover`, `--color-control-active`.
- Accent: `--color-accent`, `--color-accent-hover`, `--color-accent-soft`.
- Status: success, warning, danger, info.
- Radii: `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`.
- Shadows: subtle panel shadow, floating composer shadow, popover shadow.

The existing shadcn-style aliases such as `--color-background`, `--color-card`, and `--color-muted` should be preserved for compatibility, mapped to the new semantic palette.

### Layer 2: Shared Primitives

Create focused primitives in `src/renderer/src/components/ui/`. These components should encode Slime's visual rules and avoid one-off class strings across views.

Initial primitives:

- `SlimeButton.vue`: variants `primary`, `secondary`, `ghost`, `danger`, `icon`; sizes `sm`, `md`, `lg`, `icon`.
- `SlimeIconButton.vue`: icon-only control with title/tooltip support and stable square dimensions.
- `SlimeInput.vue`: text input with search, normal, and compact density.
- `SlimeTextarea.vue`: auto-resizing textarea for prompt composers and plain forms.
- `SlimePanel.vue`: unframed or lightly framed surface for operational page sections.
- `SlimeListItem.vue`: reusable selectable row for sessions, agents, tasks, and navigation lists.
- `SlimeSectionHeader.vue`: small title/action row for dense pages.
- `SlimeTabs.vue`: compact tab strip with low-contrast active state.
- `SlimeBadge.vue`: status and metadata badge.
- `SlimeEmptyState.vue`: centered empty state with optional action/composer slot.
- `SlimeComposer.vue`: large prompt composer with internal toolbar, attachment slot, meta slot, and send/stop controls.

These should be plain Vue Composition API components. They should not introduce new state libraries or styling frameworks.

### Layer 3: Layout Components

Create shared layout components in `src/renderer/src/components/layout/`.

Initial layout components:

- `AppShell.vue`: owns the full-window background, drag region, sidebar, and rounded main canvas.
- `AppSidebarNav.vue`: Codex-style sidebar with grouped primary actions, search, project/session areas, and bottom settings.
- `WorkspaceCanvas.vue`: right-side main surface with optional top toolbar and scroll handling.
- `SplitWorkspace.vue`: reusable left-center-right split layout for chat plus function panel.
- `PageHeader.vue`: compact title/action/header pattern for Gateway, Agents, Schedule, and Settings.

`App.vue` should become thin: onboarding state, detached-window routing, active view selection, and shell composition.

### Layer 4: Feature Migration

Feature pages should consume the layout and primitives rather than restyling from scratch.

Chatroom:

- Empty state uses centered title and `SlimeComposer`, similar in composition to Codex.
- Session list uses `SlimeListItem`, grouped headers, and compact metadata.
- Active chat keeps the message list but adopts the shared composer and canvas spacing.
- Function panel uses `SlimePanel`, `SlimeTabs`, and shared list rows.

GroupChat:

- Empty create screen uses a centered creation flow with shared agent selection cards/list rows.
- Active group chat uses the shared composer with mention support.
- Detached windows use the same canvas and composer style without the full app sidebar.

Gateway, Agents, Schedule:

- Use `WorkspaceCanvas` and `PageHeader`.
- Replace large isolated cards with compact panels, tables, split panes, and shared controls.
- Preserve information density and avoid decorative sections.

Settings:

- Keep modal/dialog behavior but use shared tabs, inputs, buttons, and panel spacing.

## Component API Guidelines

Shared components should expose behavior through simple props and events:

- `modelValue` / `update:modelValue` for form controls.
- `selected` or `active` for list and nav items.
- `variant` and `size` for visual choices.
- Named slots for content areas that differ by page.
- Explicit events such as `submit`, `cancel`, `select`, `remove`, `open`.

Shared components should not import feature stores. Feature components own data and pass plain props down.

## Styling Rules For Future Components

New UI should follow these rules:

- Prefer shared components before writing raw Tailwind class clusters.
- Use semantic tokens instead of raw hex colors except inside token definitions.
- Use lucide/iconify icons for buttons when an icon exists.
- Keep cards for repeated items, modals, and genuinely framed tools.
- Do not put cards inside cards.
- Do not create oversized marketing-style hero areas inside the app.
- Do not use large purple or blue gradients as page backgrounds.
- Keep text readable at Chinese UI sizes; common body text should be 13-14px, dense metadata 11-12px, page headings 18-24px depending on context.
- Keep toolbar and list dimensions stable so hover/selection states do not shift layout.
- Use tooltips/titles for unfamiliar icon-only actions.

## Data Flow

No backend or database changes are required.

Existing stores continue to own state:

- `useAgentStore`, `useAgentSessionStore`, `useAgentChatStore` for Chatroom.
- `useGroupChatSessionStore`, `useGroupChatStore` for GroupChat.
- Existing Gateway, MCP, Schedule, and Agent stores for their pages.

UI components receive data through props and emit events upward. Feature containers translate those events into store calls or presenter IPC calls.

## Error Handling And States

Shared components should support common states:

- Loading: skeleton or muted inline status where a page already has async loading.
- Empty: `SlimeEmptyState` with concise copy and optional action.
- Disabled: reduced opacity, no hover emphasis, no layout shift.
- Error: shared danger color and compact inline recovery actions.
- Streaming: composer send button switches to stop control; message lists keep existing streaming logic.

The implementation should preserve current behavior for pending questions, retry/dismiss error actions, session rename, context menus, detached group chat windows, and MCP settings.

## Testing Strategy

Because this is a visual-system change, tests should focus on behavior contracts rather than shallow class assertions.

Recommended tests:

- `AppSidebar` or new nav component still emits the correct active view updates.
- `SlimeComposer` submits on Enter, allows Shift+Enter, respects disabled state, and emits stop while streaming.
- Chatroom empty state creates a session and sends the first message when an agent is selected.
- GroupChat composer preserves mention parsing behavior.
- Existing Gateway and Schedule tests should continue passing after visual migration.

Manual verification:

- Run `pnpm run format`.
- Run `pnpm run lint`.
- Run targeted renderer tests for changed components.
- Run `pnpm run typecheck`.
- Launch the app and verify Chatroom, GroupChat, Gateway, Agents, Schedule, Settings, and onboarding do not visually break.
- Use browser or screenshots if a local preview target is available for visual QA.

## Implementation Order

1. Add global tokens and typography baseline.
2. Build shared primitives with minimal tests around behavior-heavy components.
3. Build layout components and migrate `App.vue` / sidebar.
4. Migrate Chatroom empty state and active composer.
5. Migrate GroupChat empty state and active composer.
6. Apply layout and primitive pass to Gateway, Agents, Schedule, Settings, and function panels.
7. Run verification and tune spacing/color after seeing the app.

## Risks

- Large visual diffs may obscure behavior regressions. Mitigation: keep feature logic in containers and move only presentation into shared components.
- Existing dirty worktree changes may overlap with Gateway UI files. Mitigation: inspect diffs before editing and avoid reverting unrelated work.
- A reusable component layer can become too abstract. Mitigation: only create primitives that are immediately used by migrated pages.
- Pixel-perfect Codex cloning could make Slime feel derivative. Mitigation: use Codex as a style reference, while preserving Slime-specific agent and evolution identity through subtle accent states and interaction patterns.

## Acceptance Criteria

- The app has a single shared visual palette and typography baseline.
- New reusable UI primitives exist and are used by migrated pages.
- Chatroom and GroupChat match the Codex-like layout direction: soft sidebar, deep canvas, centered empty state, large integrated composer.
- Gateway, Agents, Schedule, Settings, and function panels no longer feel like separate visual systems.
- Future page work has clear rules and components to reuse.
- Format, lint, typecheck, and relevant tests pass or any unrelated failures are clearly documented with evidence.
