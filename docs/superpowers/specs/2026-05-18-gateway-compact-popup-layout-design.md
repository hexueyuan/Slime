# Gateway 紧凑布局与弹窗管理设计

**日期**: 2026-05-18
**状态**: 已确认

## 背景

当前 Gateway 页面上半部分由 PageHeader、六个指标卡、趋势图和两个排行面板组成，下方的渠道、分组、密钥、日志 tab 可用高度偏少。渠道 tab 还直接展示完整模型管理区，分组和密钥 tab 也在主页面内承载完整列表和编辑入口，容易形成页面外层滚动与 tab 内层滚动叠加，视觉上出现滑条和空间挤压。

本次设计目标是保持 Gateway 的运行概览能力，同时把重型管理流收进独立弹窗，让主页面变成更稳定、更紧凑的操作台。

## 目标

- 上半区高度自适应，避免硬编码高度导致指标卡、图表和排行重叠。
- 保留六个核心指标卡，但降低视觉高度和间距。
- 趋势图与供应商排名、模型排名在宽屏下同一行展示。
- 下半区四个 tab 成为主要工作区，主页面不出现横向滑条。
- 渠道 tab 不再直接展开完整模型管理，改为渠道卡片 + 模型管理弹窗。
- 分组和密钥的完整管理也进入独立弹窗。
- 模型管理、分组、密钥使用单独卡片式组件，提升复用和可测试性。

## 非目标

- 不改变 Gateway Presenter、IPC 方法名、Pinia store 字段或数据库结构。
- 不改变统计数据刷新、排行排序、日志详情 drawer 的数据契约。
- 不引入新的 UI 框架或图表库。
- 不做 Gateway 之外页面的视觉重构。

## 总体布局

Gateway 页面采用上下两段式：

1. 顶部概览区：PageHeader、指标卡、趋势图、双排行。
2. 下方工作区：tab 工具栏 + 当前 tab 主内容。

顶层容器使用 `h-full min-h-0 flex flex-col`。顶部概览区保持 `shrink-0`，但内部高度通过内容和响应式约束决定，不写死固定像素总高。下方工作区使用 `min-h-0 flex-1`，让 tab panel 明确吃掉剩余空间。

### 顶部概览区

指标区保留六项：

- 请求
- 费用
- Input Token
- Output Token
- 缓存率
- 平均延迟

指标卡布局规则：

- 宽屏优先一行六列，使用 `repeat(auto-fit, minmax(...))` 或响应式 grid。
- 单卡内部使用紧凑 padding、截断的 label/value/meta，避免文字撑开卡片。
- value 字号保持可读，但不使用 hero 级别字号。
- meta 只展示一行，例如缓存读写和 TTFT P50。

趋势与排行布局规则：

- 宽屏下趋势图在左，供应商排名和模型排名在右侧同一行两列。
- 排行面板只展示 Top 3 到 Top 5，避免占用过多高度。
- 排行 metric 切换保留，但必须可换行或紧凑显示。
- 中窄宽度下允许趋势图和排行区上下堆叠，不能产生横向滚动。

## Tab 工作区

Tab 工具栏放在工作区顶部，左侧为 `SlimeTabs`，右侧显示当前 tab 的主操作按钮。

主操作按钮随 tab 切换：

- 渠道：`新增渠道`
- 分组：`管理分组`
- 密钥：`管理密钥`
- 日志：刷新图标按钮

Tab panel 本身使用一个主滚动区域。主页面避免在外层页面、tab panel、列表内部同时滚动。确实需要大量内容时，滚动发生在当前 tab 的唯一内容区，或发生在弹窗内部。

## 渠道 Tab

渠道 tab 从 master-detail 模式改为渠道卡片网格。

### GatewayChannelCard

新增业务组件：`src/renderer/src/components/gateway/GatewayChannelCard.vue`

职责：

- 展示渠道名称、启用状态、类型、模型数、最近稳定性摘要。
- 展示测试结果的简短状态。
- 提供操作入口：测试、编辑、删除、模型管理。

组件输入：

- `channel`
- `modelCount`
- `stabilitySummary`
- `testResult`

组件事件：

- `test`
- `edit`
- `delete`
- `manage-models`

卡片只展示摘要，不直接展示模型列表。模型数量较多时不会增加主页面高度。

### 模型管理弹窗

点击 `模型管理` 打开独立弹窗，弹窗标题包含当前渠道名称和类型。

弹窗内容：

- 顶部操作：拉取模型、添加模型、关闭。
- 模型列表：使用 `GatewayModelCard` 网格或列表。
- 添加模型表单：可作为弹窗内的 inline panel 展开。
- 错误信息：在弹窗内展示，不占用主页面空间。

弹窗内部允许纵向滚动，主 Gateway 页面保持稳定。

### GatewayModelCard

新增业务组件：`src/renderer/src/components/gateway/GatewayModelCard.vue`

职责：

- 展示模型名称、启用状态、类型。
- 展示能力标签：reasoning、vision、image_gen、tool_call。
- 提供能力切换、启停、删除入口。
- 展示价格未配置、禁用等轻量状态提示。

组件输入：

- `model`
- `capabilities`
- `disabled?`

组件事件：

- `toggle-capability`
- `toggle-enabled`
- `delete`

能力按钮继续沿用现有业务行为，只改变呈现位置和组件边界。

## 分组 Tab

分组 tab 主页面只展示轻量摘要，完整管理进入弹窗。

主页面展示：

- 分组数量。
- 内置分组数量。
- 最近使用或主要分组摘要。
- `管理分组` 主操作按钮。

### 分组管理弹窗

弹窗中展示全部分组，并提供新增、编辑、删除入口。现有 `GroupEditDialog` 继续作为编辑表单，列表呈现改为卡片式。

### GatewayGroupCard

新增业务组件：`src/renderer/src/components/gateway/GatewayGroupCard.vue`

职责：

- 展示分组名称、是否内置、负载均衡策略。
- 展示成员渠道数量和简短渠道摘要。
- 提供编辑、删除入口。

组件输入：

- `group`
- `itemCount`
- `channelSummary`

组件事件：

- `edit`
- `delete`

内置分组不展示删除动作，或展示 disabled 删除动作且无危险色强调。

## 密钥 Tab

密钥 tab 主页面只展示密钥摘要，完整管理进入弹窗。

主页面展示：

- 启用密钥数量。
- 内置密钥数量。
- 最近创建或主要密钥摘要。
- `管理密钥` 主操作按钮。

### 密钥管理弹窗

弹窗中展示全部 Gateway API Key，并提供新增、复制、启停、删除入口。新建密钥后的一次性明文展示仍保留在弹窗内，关闭后不可再查看。

### GatewayApiKeyCard

新增业务组件：`src/renderer/src/components/gateway/GatewayApiKeyCard.vue`

职责：

- 展示密钥名称、启用状态、是否内置。
- 展示掩码 key。
- 提供复制、启停、删除入口。
- 支持新建后的一次性明文 key 展示状态。

组件输入：

- `apiKey`
- `revealedKey?`
- `copied?`

组件事件：

- `copy`
- `toggle-enabled`
- `delete`

内置密钥不展示删除动作，危险操作只在可执行时使用 danger 语义。

## 日志 Tab

日志 tab 保留在主页面内，因为日志本身就是主要查看内容。

优化方向：

- 使用响应式 grid 代替固定宽度列，长模型名和供应商名截断。
- 主列表只有一个纵向滚动区域。
- 日志详情继续使用 drawer。
- JSON 请求/响应体只在 drawer 内滚动，不影响主页面。
- 刷新使用 icon button，保留 `GATEWAY_EVENTS.LOG_ADDED` 驱动刷新。

## 组件复用与设计系统

优先复用现有共享组件：

- `PageHeader`
- `SlimeTabs`
- `SlimeMetricCard`
- `SlimeRealtimeChart`
- `SlimeRankBoard`
- `SlimeButton`
- `SlimeIconButton`
- `SlimeBadge`
- `SlimePanel`

新增的 Gateway 卡片属于业务组件，放在 `src/renderer/src/components/gateway/`。它们可以组合共享 UI primitives，但不直接调用 Presenter，也不导入 store。业务数据加载和操作仍由 `ChannelTab.vue`、`GroupTab.vue`、`ApiKeyTab.vue` 等容器组件负责。

## 状态与数据流

本次改造保留现有数据流：

- `GatewayPanel.vue` 继续负责加载统计、排行和趋势。
- `ChannelTab.vue` 继续使用 `useGatewayStore()` 与 `gatewayPresenter` 管理渠道和模型。
- `GroupTab.vue` 继续使用现有分组 CRUD 与 `GroupEditDialog`。
- `ApiKeyTab.vue` 继续使用现有 API Key CRUD。
- `LogTab.vue` 继续使用现有分页和详情 drawer。

弹窗状态属于各 tab 容器本地状态，例如：

- `modelManagerOpen`
- `managedChannel`
- `groupManagerOpen`
- `apiKeyManagerOpen`

关闭弹窗不清空已经加载的 store 数据，只清空临时表单、错误和一次性明文 key 状态。

## 响应式与滚动契约

- Gateway 根节点：`h-full min-h-0 overflow-hidden`。
- 顶部概览区：内容自适应，不写死总高度。
- 指标卡：可换列，可截断，不撑开父容器。
- 趋势与排行：宽屏同一行，窄屏堆叠。
- 工作区：`min-h-0 flex-1`。
- 当前 tab：主页面只有一个主要滚动上下文。
- 弹窗：内部可滚动，主页面不跟随滚动。
- 不使用横向滚动条作为布局适配方案。

## 测试计划

新增或调整 renderer 测试：

- `GatewayChannelCard`：点击测试、编辑、删除、模型管理会 emit 对应事件；禁用态不触发危险动作。
- `GatewayModelCard`：能力标签切换、启停、删除事件正确；长模型名不会影响事件契约。
- `GatewayGroupCard`：内置分组不触发删除；编辑事件正确。
- `GatewayApiKeyCard`：复制、启停、删除事件正确；内置密钥不触发删除。
- `SlimeRankBoard` 现有 metric 切换测试保持通过。
- `LogTab` 性能测试保持通过，日志分页行为不变。

布局相关验证：

- Gateway 宽屏下指标、趋势、排行不重叠。
- 渠道 tab 主页面不直接渲染完整模型列表。
- 打开模型管理弹窗后可管理模型能力、启停和删除。
- 分组和密钥管理弹窗可打开、关闭，并保留现有 CRUD 行为。
- 日志列表无横向滑条，详情 drawer 内 JSON 可滚动。

验证命令：

- `pnpm run format`
- `pnpm run lint`
- `pnpm run typecheck:web`
- `pnpm vitest run test/renderer/components/SlimeRankBoard.test.ts test/renderer/components/LogTab.performance.test.ts`
- 新增卡片组件测试对应的 `pnpm vitest run ...`

有明显视觉变更后，需要启动本地应用或预览，在桌面宽屏下检查 Gateway 的渠道、分组、密钥、日志四个 tab，以及模型管理、分组管理、密钥管理弹窗。

## 验收标准

- Gateway 顶部在常见桌面宽度下更紧凑，指标、趋势、排行没有重叠。
- 下方 tab 区域获得更多可用高度，渠道、分组、密钥、日志页面不出现不必要滑条。
- 渠道 tab 主页面只展示渠道摘要卡片，不直接展示完整模型管理列表。
- 模型管理、分组管理、密钥管理都在独立弹窗中完成。
- 新增卡片组件遵守 Slime Codex-style 视觉系统，使用语义 token 和共享 UI primitives。
- 原有 Gateway CRUD、模型能力配置、API Key 一次性明文展示、日志详情查看行为保持不变。
