# 分组编辑双面板 UI 设计

日期: 2026-04-27

## 概述

将 Gateway 分组编辑器从单列表行式 UI 改为双面板布局：左面板按渠道折叠展示可选模型（点击添加），右面板展示已选模型（拖拽排序）。简化 priority/weight 交互——priority 由排列顺序隐式决定，weight 统一默认值 1 不暴露。

## 布局

对话框加宽，内部 grid 两栏：

```
┌─────────────────────────────────────────────────┐
│  名称 [___________]    均衡模式 [Failover ▾]    │
├────────────────────────┬────────────────────────┤
│  可选模型         🔍   │  已选模型 (2)    清空  │
├────────────────────────┤────────────────────────┤
│  ▼ 百度Oneapi (5)      │  ⠿ Claude Opus 4.6    │
│    Claude Opus 4.6  ✓  │    百度Oneapi     #1 ✕│
│    Claude Opus 4.5  ✓  │  ⠿ Claude Opus 4.5    │
│    Claude Sonnet 4.6 + │    百度Oneapi     #2 ✕│
│    Claude Sonnet 4.5 + │                        │
│    GLM-5.1           + │   拖拽调整优先级顺序   │
│  ▶ OpenAI Direct (3)   │                        │
├────────────────────────┴────────────────────────┤
│                          [取消]  [保存]          │
└─────────────────────────────────────────────────┘
```

## 交互规则

- **左面板点击 +**：添加模型到右面板尾部
- **左面板已选模型**：半透明 + ✓ 标记，不可重复添加
- **右面板 ⠿ 拖拽**：上下拖动调整顺序
- **右面板 ✕**：移除模型，左面板对应项恢复可点击
- **右面板 #N**：显示优先级序号（纯展示）
- **搜索框**：按模型名或渠道名过滤左面板
- **清空按钮**：一键移除所有已选模型

## 组件设计

### 新增文件

`src/renderer/src/components/gateway/GroupEditDialog.vue`

### Props

```ts
interface Props {
  open: boolean; // v-model:open
  group?: Group | null; // null = 新建, 非 null = 编辑
}
```

### Emits

```ts
interface Emits {
  "update:open": [value: boolean];
  saved: []; // 保存成功后通知父组件刷新
}
```

### 内部状态

```ts
const form = ref({
  name: "",
  balanceMode: "round_robin" as Group["balanceMode"],
});

interface SelectedItem {
  channelId: number;
  channelName: string;
  modelName: string;
}

const selectedItems = ref<SelectedItem[]>([]);
const searchQuery = ref("");
```

### 修改文件

`GroupTab.vue`：移除内联编辑器（Teleport 弹出层），改为引用 `GroupEditDialog`。保留分组列表展示和删除逻辑。

## 数据流

### 左面板数据源

`useGatewayStore().channels` → 按 channel 分组，每个 channel 的 `models: string[]` 提供模型列表。已有数据，无需新增 API。

### 已选判定

```ts
const selectedKeys = computed(
  () => new Set(selectedItems.value.map((i) => `${i.channelId}-${i.modelName}`)),
);
```

左面板每个模型用 `selectedKeys.has(key)` 判断是否已选。

### 搜索过滤

`searchQuery` 对渠道名和模型名做 case-insensitive includes 过滤。匹配逻辑：渠道名匹配则展示该渠道所有模型，否则只展示匹配的模型。

### 保存

selectedItems 数组的 index 反向映射为 priority：

- index 0 → priority = len - 1（最高优先级）
- index N → priority = len - 1 - N

weight 统一设为 1。

```ts
const items = selectedItems.value.map((item, i) => ({
  channelId: item.channelId,
  modelName: item.modelName,
  priority: selectedItems.value.length - 1 - i,
  weight: 1,
}));
```

调用现有 `gw.createGroup()` / `gw.updateGroup()` + `gw.setGroupItems()`。DAO 层无需改动。

### 编辑模式加载

`openEdit(group)` 时，通过 `gw.listGroupItems(group.id)` 获取现有 items，按 priority 降序排列后映射为 `SelectedItem[]`。channelName 从 `store.channels` 中查找。

## 技术选型

- **拖拽库**: `vue-draggable-plus`（SortableJS 的 Vue 3 封装，活跃维护）
- **折叠面板**: 手写简单 disclosure（channels 列表较短，不需要 shadcn Accordion 的完整功能）
- **对话框**: 复用现有 Teleport + overlay 模式，加宽为 `max-w-4xl`

## 不做的事

- 不实现跨面板拖拽（点击添加即可）
- 不暴露 weight 输入框
- 不暴露 priority 数字输入框
- 不添加"自动匹配"批量添加功能
- 不改动 DAO 层、GatewayPresenter、数据库 schema
