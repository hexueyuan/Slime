# Chat UX Optimization Design

## Overview

Optimize Slime's chat experience with four enhancements:

1. Agent & User avatars in message bubbles
2. Message timestamps, copy, and regenerate actions
3. Auto-generated conversation titles from first 3 user messages
4. Configurable user profile (name + avatar)

## 1. Message Layout (iMessage Style)

### Layout Rules

- **Agent messages**: Left-aligned, AgentAvatar (size="sm") on left, dark bubble (`bg-muted`)
- **User messages**: Right-aligned, user avatar (size="sm") on right, purple bubble (`bg-violet-600`, white text)
- **Avatar row**: avatar + name + timestamp above bubble on same line
  - Agent: `[Avatar] HalAI · 今天 14:32` (left-aligned)
  - User: `你 · 今天 14:33 [Avatar]` (right-aligned, time left of name)
- **Bubble border radius**: `rounded-xl` for both
- **Message spacing**: `mb-5` (20px), consecutive same-role messages `mb-3`

### Component Changes

**ChatMessageAssistant.vue**:

- Wrap content in flex row: `[AgentAvatar | bubble-column]`
- Bubble-column: name+time row → content blocks → action bar
- AgentAvatar reads from `agentStore.agents` by `session.agentId`

**ChatMessageUser.vue**:

- Restructure to `flex-row-reverse`: `[bubble-column | UserAvatar]`
- Bubble-column: name+time row (right-aligned) → content → action bar
- User bubble uses `bg-violet-600 text-white` instead of current `bg-violet-500/20`

**ChatMessageList.vue**:

- Pass `agentId` + `isLastMessage` props to message components
- Determine "consecutive same role within 5 min" for timestamp suppression

## 2. Message Actions

### Timestamps

- Format: `formatMessageTime(createdAt)`:
  - Today → `HH:mm`
  - Yesterday → `昨天 HH:mm`
  - This year → `MM-DD HH:mm`
  - Older → `YYYY-MM-DD HH:mm`
- Position: avatar row, after name, color `text-muted-foreground`, size `text-xs`
- Suppression: consecutive same-role messages within 5 minutes only show timestamp on first

### Copy Button

- Position: below bubble, left-aligned (Agent) / right-aligned (User), hidden by default, shown on hover
- Icon: `lucide:copy`, color `text-muted-foreground`, hover `text-foreground`
- Behavior: copy plain text to clipboard, icon changes to `lucide:check` for 1.5s after click
- Text extraction: Agent → concatenate all `content` blocks' text; User → `message.content` directly

### Regenerate Button

- Position: right of copy button, only on last Agent message
- Condition: `isLastAssistant && !isGenerating`
- Icon: `lucide:refresh-cw`, color `text-muted-foreground`, hover `text-violet-500`
- Behavior: call `chatStore.retryLast()` — deletes last assistant message + re-sends last user message

### Action Bar Structure

```
Agent: [📋 Copy] [🔄 Regenerate]    (regenerate only on last message)
User:                  [📋 Copy]
```

## 3. Auto-Generated Conversation Titles

### Trigger Logic

- Counter: each session maintains `titleGeneratedCount` (stored in session metadata)
- After each **user** message sent, if `titleGeneratedCount < 3`, trigger async title generation
- On success: `titleGeneratedCount++`, update session title via `updateSessionTitle()`
- If user manually renamed title (metadata `titleManuallyEdited: true`), skip auto-generation

### Title Generation Flow

1. Collect current session's user messages (up to first 3)
2. Select model via `selector.select({ chat: true })`
3. Call Gateway `generateText` (non-stream), prompt:

   ```
   根据以下对话内容，生成一个简短的标题（不超过20字），只返回标题文本，不要加引号或其他格式：

   用户：{userMessage1}
   用户：{userMessage2}
   ...
   ```

4. Parameters: `maxOutputTokens: 50`, `temperature: 0.7`
5. Trim returned text as new title, call `updateSessionTitle(sessionId, newTitle)`

### Error Handling

- Generation failure: silently ignore (don't affect conversation), don't increment `titleGeneratedCount`
- Model selection failure (no available chat model): silently skip

### Storage

- `titleGeneratedCount` and `titleManuallyEdited` stored in session metadata JSON (`agent_sessions` table)
- SessionList manual rename sets `titleManuallyEdited = true`

### Implementation Location

- In `AgentChatPresenterAdapter.chat()`, before awaiting `engine.chat()`, fire-and-forget `generateTitle(sessionId, content)`
- `generateTitle()` receives `content` param because user message isn't in DB yet at this point
- It reads existing user messages from DB, appends `content`, calls `generateText` via Gateway
- Uses `selector.select({ chat: true })` to pick model, calls `generateText` (not stream)
- On success: `updateSessionTitle()` + increment `titleGeneratedCount` in metadata
- Fire-and-forget: `this.generateTitle(sessionId, content).catch(() => {})` — never awaits

## 4. User Profile

### Data Model

- New type `UserProfile`: `{ name?: string; avatar?: AgentAvatar }` (reuses AgentAvatar union type)
- Stored in ConfigPresenter key `app.userProfile`
- Default: `{ kind: "monogram", text: evolution.user first char || "U" }`
- Avatar default: `{ kind: "monogram", text: "U", backgroundColor: "#3b82f6" }`

### Settings Entry

- SettingsDialog: new "个人资料" (Profile) tab
- Fields: name input + avatar selector (reuse AgentEditDialog's avatar picker logic)
- On save: write to ConfigPresenter, update `agentChatStore.userProfile`

### Runtime Access

- `agentChatStore` adds `userProfile` ref, loaded from ConfigPresenter on mount
- Components read `agentChatStore.userProfile` for rendering
- If `userProfile.avatar` is null/undefined, render default monogram avatar

## File Change Summary

| File                                                        | Change                                                |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `src/shared/types/agent.d.ts`                               | Add `UserProfile` type                                |
| `src/renderer/src/components/chat/ChatMessageAssistant.vue` | Add avatar, name, timestamp, action bar               |
| `src/renderer/src/components/chat/ChatMessageUser.vue`      | Restructure layout, add avatar, timestamp, copy       |
| `src/renderer/src/components/chat/ChatMessageList.vue`      | Pass agentId, isLastMessage, timestamp grouping logic |
| `src/renderer/src/components/chat/ChatView.vue`             | Pass agentId to ChatMessageList                       |
| `src/renderer/src/stores/agentChat.ts`                      | Add userProfile, formatMessageTime helper             |
| `src/renderer/src/stores/agentSession.ts`                   | Add titleManuallyEdited on rename                     |
| `src/main/presenter/agentChatPresenterAdapter.ts`           | Add generateTitle() method, fire-and-forget in chat() |
| Settings dialog                                             | New Profile tab                                       |
| `test/renderer/views/EvolabPanel.test.ts`                   | Update snapshot/interaction tests                     |
