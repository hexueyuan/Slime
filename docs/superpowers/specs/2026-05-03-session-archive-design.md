# Agent 会话归档设计

## 需求

- 活跃区会话按 `updatedAt` 从新到旧排序
- 三天前无对话的会话自动归入归档区（纯前端计算，无数据库变更）
- 置顶会话始终在活跃区，不受时间限制
- 归档区折叠在列表最底部，点击 header 展开/收起，默认折叠

## 归档判断规则

```
isArchived(session) =
  session.updatedAt < (Date.now() - 3 * 24 * 60 * 60 * 1000)
  && !session.isPinned
```

## 数据层（无变更）

不改动数据库 schema、DAO、Presenter。`updated_at` 字段已在每条消息后由 `touchUpdatedAt()` 更新，直接作为"最后对话时间"使用。

## Store 改动（`src/renderer/src/stores/agentSession.ts`）

将 `sortedSessions` computed 拆分为两个：

```typescript
const ARCHIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

const activeSessions = computed(() =>
  [...sessions.value]
    .filter((s) => s.isPinned || s.updatedAt >= Date.now() - ARCHIVE_THRESHOLD_MS)
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    }),
);

const archivedSessions = computed(() =>
  [...sessions.value]
    .filter((s) => !s.isPinned && s.updatedAt < Date.now() - ARCHIVE_THRESHOLD_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt),
);
```

`sortedSessions` 直接重命名为 `activeSessions`，SessionList 是唯一消费方，同步更新引用即可。

## UI 改动（`src/renderer/src/components/chat/SessionList.vue`）

列表结构：

```
[ 搜索框 ]

[ 活跃会话列表 ]         ← 无分组 header，直接渲染
  会话 A（刚刚）
  会话 B（1小时前）

[ 归档 (N) ▶ ]          ← 固定在底部，有归档时才渲染
  会话 C（5天前）        ← 点击 header 后展开
  会话 D（2周前）
```

本地状态：

```typescript
const isArchivedExpanded = ref(false);
```

初始值计算：若当前 `activeSessionId` 在 `archivedSessions` 中，则初始展开。

归档区右键菜单：移除「置顶/取消置顶」选项（归档会话置顶语义不明确）。

搜索行为：搜索词非空时，活跃和归档两个区块均过滤；若归档区有命中结果，自动展开归档区。

## 边界情况

| 情况                 | 处理                             |
| -------------------- | -------------------------------- |
| 无活跃会话           | 活跃区空白，不渲染占位           |
| 无归档会话           | 归档区块整体不渲染               |
| 当前激活会话在归档区 | `isArchivedExpanded` 初始为 true |
| 新建会话             | `updatedAt = now`，必在活跃区    |
| 搜索命中归档会话     | 归档区自动展开                   |

## 测试

**Store 单元测试**（新增 case，`test/renderer/agentSession.test.ts`）：

- 置顶会话始终在 `activeSessions`
- `updatedAt < 3天前` 且非置顶 → 在 `archivedSessions`
- 边界值：恰好 3 天前归入归档

**SessionList 组件测试**（新增 case，`test/renderer/SessionList.test.ts`）：

- 无归档时归档区不渲染
- 点击归档 header 展开/收起
- 激活会话在归档时，归档区初始展开

## 改动文件清单

| 文件                                               | 变更                                                          |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `src/renderer/src/stores/agentSession.ts`          | 拆分 `sortedSessions` → `activeSessions` + `archivedSessions` |
| `src/renderer/src/components/chat/SessionList.vue` | 分组渲染 + 折叠 toggle + 搜索联动                             |
| `test/renderer/agentSession.test.ts`               | 新增归档逻辑测试 case                                         |
| `test/renderer/SessionList.test.ts`                | 新增归档 UI 测试 case                                         |
