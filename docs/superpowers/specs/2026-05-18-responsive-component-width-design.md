# 响应式组件宽度优化设计

## 背景

Codex-style UI 系统已经落地了一批共享组件和页面迁移，但部分组件与页面仍带有固定宽度假设。典型风险包括：

- `SlimeAgentCard` 固定 `w-[260px]`，依赖调用方 `flex-wrap` 消化宽度。
- `GatewayPanel` 使用固定 6 列指标和 `360px` 排行列。
- `SchedulePanel` 使用 `min-w-[400px]` 主列和 `w-[300px]` 时间线列。
- `SlimeWeekCalendar` 在空间不足时没有明确的紧凑布局契约。

这些固定宽度在窄窗口、分栏面板、未来独立预览页面中容易造成横向溢出、内容挤压或文字覆盖。

## 目标

本次优化采用“契约驱动”策略：先定义共享组件的响应式宽度契约，再同步更新高风险页面组合布局。

优先覆盖：

- Gateway Dashboard 顶部指标、趋势图和排名区域。
- Schedule 页面主任务区、周日历和 Timeline 组合。
- Chatroom / GroupChat 新建会话里的 Agent 选择卡片。
- UI 组件预览页的设备宽度切换能力。

## 非目标

- 不重构 Presenter、IPC、Pinia store 或数据持久化逻辑。
- 不进行全站页面迁移，只处理当前确认的高风险区域。
- 不使用横向滚动条作为响应式宽度适配方案。
- 不引入新的前端框架、运行时依赖或设计语言。

## 响应式契约

共享组件默认遵守以下规则：

- 容器型组件默认可收缩：使用 `w-full`、`min-w-0`，避免写死业务宽度。
- 固定尺寸只用于天然固定元素，例如图标按钮、头像、状态点。
- 多项内容优先换行、堆叠、降低列数或收紧间距。
- 长文本通过截断、行数限制或短标签兜底，不能撑开父容器。
- 图表和密集组件保持可读的最小高度，宽度跟随容器变化。
- 响应式布局不新增横向滚动条；页面已有内容数量导致的纵向滚动可以保留。

## 组件设计

### SlimeAgentCard

`SlimeAgentCard` 去掉固定 `w-[260px]`，默认使用 `w-full min-w-0`。调用方通过 grid 容器控制列数与最大宽度。

保留现有 props 和 `select` 事件，不改变 Agent 选择行为。组件内部的名称、角色、描述继续做截断和两行限制，头像保持固定尺寸。

### SlimeWeekCalendar

`SlimeWeekCalendar` 保留 `selectedDate` 双向绑定契约。空间充足时维持 7 天横排；空间不足时切换为紧凑网格，而不是横向滚动。

布局规则：

- 宽屏：标题、徽章、切换按钮和 7 天日期卡保持舒展布局。
- 中等宽度：标题区与日期区可以分行，日期卡降低高度和间距。
- 窄宽度：日期卡使用 `auto-fit / minmax` 形成多行紧凑网格，保持可点击面积。
- 左右切换按钮保持稳定尺寸，不能挤压日期文案。

### SlimeRankBoard

`SlimeRankBoard` 的标题、metric 切换按钮和排行项都必须在窄容器内可收缩。metric 切换区域允许换行，排行 label 截断，排行值保持稳定但不能撑开整行。

### SlimeRealtimeChart

`SlimeRealtimeChart` 宽度跟随容器，chip 区域允许换行。图表区域保持固定高度和 `min-w-0`，避免 SVG 或长指标值撑开父容器。

### SlimeMetricCard

`SlimeMetricCard` 不负责决定一行放几张卡，只保证自身在 grid 单元内可收缩。数值和 meta 使用截断，不制造横向溢出。

## 页面布局设计

### GatewayPanel

Gateway 顶部区域改为自适应布局：

- 指标卡从固定 `grid-cols-6` 改为 `repeat(auto-fit, minmax(...))`。
- 宽屏展示 6 列，中等宽度降为 3 列，窄宽度降为 2 列或 1 列。
- 趋势图与排行区从固定 `minmax(0,1fr)_360px` 改为响应式 grid。
- 空间充足时趋势图和排行区双列；空间不足时上下堆叠。
- `PageHeader` 的 actions 区在窄宽度下换行，避免标题与 tabs 挤压。

### SchedulePanel

Schedule 顶层布局改为宽屏双列、窄屏上下布局：

- 去掉主任务列 `min-w-[400px]` 和 Timeline `w-[300px]` 的整体硬限制。
- 宽屏保持主任务区 + Timeline 双列。
- 窄宽度下 Timeline 下沉到主任务区下面。
- `WeekCalendar` 使用紧凑网格，不使用横向滚动条。
- Note 输入区和 TaskBoard 保持原业务行为，只调整容器宽度和间距。

### NewThread / NewGroupThread

Agent 选择区从固定卡片宽度的 `flex-wrap` 改为响应式 grid：

- 宽屏多列展示。
- 窄宽度下一列或两列展示。
- 卡片宽度由 grid 单元决定。
- 表单区保持最大宽度限制，但在窄宽度下使用 `w-full` 和更小 padding。

## 组件预览页

`docs/superpowers/prototypes/codex-style-components-preview.html` 增加设备视图切换器，作为响应式验收台。

设备档位：

- 桌面：1280px
- 笔记本：1024px
- 平板：768px
- 手机：390px

交互设计：

- 在预览页顶部导航右侧增加紧凑 segmented control。
- 点击设备按钮后不改变浏览器窗口，只改变组件预览画布的模拟宽度。
- 画布居中展示，带低对比边框和当前宽度标签。
- 使用少量原生 JavaScript 和 CSS class 实现，不引入 Vue 或构建依赖。

验收重点：

- `SlimeAgentCard` 在不同设备档位下不固定宽度。
- Gateway 指标、趋势图、排名组件能降列或堆叠。
- Schedule Kit 中 `SlimeWeekCalendar` 在平板和手机档位展示紧凑网格。
- 所有响应式样例不产生横向滚动条，不出现文字覆盖。

## 行为与数据影响

本次优化只改变展示层宽度、间距和栅格组合，不改变：

- Presenter 方法名和 IPC contract。
- Pinia store 字段和 action。
- Gateway 统计刷新逻辑。
- Schedule 任务、笔记、Timeline 的 CRUD 行为。
- Chatroom / GroupChat 创建会话和发送消息流程。

## 测试计划

需要新增或调整的测试以行为契约为主：

- `SlimeWeekCalendar`：点击日期仍 emit `update:selectedDate`；切换周仍更新到新周日期。
- `SlimeAgentCard`：点击仍 emit `select`；disabled 时不触发选择。
- `SlimeRankBoard`：metric 切换后排序和展示值正确。
- 组件预览页：设备切换按钮能更新预览画布宽度和 active 状态。

验证命令：

- `pnpm run format`
- `pnpm run lint`
- `pnpm run typecheck:web`
- 相关 renderer 测试，例如 `pnpm vitest run test/renderer/components/SlimeWeekCalendar.test.ts test/renderer/components/SlimeRankBoard.test.ts`

有明显视觉改动后，还需要启动本地预览或应用，在桌面宽屏与窄窗口下检查 Gateway、Schedule、Agent 选择和组件预览页。

## 验收标准

- Gateway、Schedule、Agent 选择区在常见桌面宽度和较窄窗口下不出现横向滚动条。
- `SlimeWeekCalendar` 在空间不足时显示紧凑网格，不横向滚动。
- 组件预览页可以通过设备按钮查看桌面、笔记本、平板和手机宽度效果。
- 文本、按钮、图标和卡片在各档位下不互相覆盖。
- 本次变更不影响原有业务交互和数据流。
