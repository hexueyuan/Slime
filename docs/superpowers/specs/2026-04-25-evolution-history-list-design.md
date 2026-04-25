# TASK-008: 进化历史列表设计

## 目标

在 FunctionPanel 新增 "历史" tab，展示所有进化版本，支持回滚到历史版本。

## 后端改动

### 丰富 `EvolutionPresenter.getHistory()` 数据

当前 `getHistory()` 只返回 tag 名，description/request/createdAt/changes 全为空。

改为：

1. 读取 `CHANGELOG.slime.md` 并解析，提取每个 tag 的 request、summary、date、changes
2. 调用 `git.listTags('egg-*')` 获取所有 tag
3. 合并数据：CHANGELOG 中有的填充完整信息，没有的用 tag 名作 fallback
4. 标记当前版本（tag 列表中的第一个 = 最新 = isCurrent）

**新增方法**: `parseChangelog(): Map<string, {request, summary, date, changes}>`

解析规则：

- `## [tag] - YYYY-MM-DD` → tag + date
- `- Request: "..."` → request
- `- Summary: ...` → summary (作为 description)
- `### Changes` 下的 `- ...` 列表 → changes[]

### `EvolutionNode` 类型不变

已有的 `EvolutionNode` 接口字段足够：id, tag, description, request, changes, createdAt, gitRef, parent。

## 前端改动

### 1. FunctionPanel 扩展

文件：`src/renderer/src/components/function/FunctionPanel.vue`

- `activeTab` 类型扩展为 `"tools" | "preview" | "history"`
- 新增 tab 按钮 "历史"
- 条件渲染 `HistoryPanel`

### 2. 新增 HistoryPanel 组件

文件：`src/renderer/src/components/function/HistoryPanel.vue`

内容：

- mount 时调用 `usePresenter("evolutionPresenter").getHistory()` 加载数据
- 时间轴风格列表，每条展示：tag（monospace）、日期、request 摘要
- 当前版本（列表第一条）紫色高亮 + "当前" badge
- 非当前版本 hover 时显示 "回滚到此版本" 按钮
- 空状态："还没有进化记录"
- loading 状态

样式：

- 匹配现有暗色主题，使用 TailwindCSS
- 当前版本用 `text-violet-500` 高亮
- 时间轴左侧竖线 + 圆点指示器

### 3. 回滚确认

- 点击 "回滚" → 显示 AlertDialog 确认弹窗
- 确认后调用 `usePresenter("evolutionPresenter").rollback(tag)`
- 完成后刷新列表

### 4. 自动刷新

- 监听 `evolution:completed` 事件，自动重新加载历史
- rollback 成功后也刷新

## 不做

- 不做归档版本展示
- 不做搜索/过滤
- 不做详情展开
- 不做折叠/展开
- 不做版本对比 diff

## 数据流

```
HistoryPanel mount
  → usePresenter("evolutionPresenter").getHistory()
  → EvolutionPresenter: parseChangelog() + listTags()
  → EvolutionNode[]
  → 渲染列表

回滚操作
  → AlertDialog 确认
  → usePresenter("evolutionPresenter").rollback(tag)
  → git checkout tag -- . + git commit
  → 刷新列表
```
