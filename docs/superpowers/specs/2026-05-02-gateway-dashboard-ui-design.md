# Gateway Dashboard UI 优化设计

## 背景

优化 LLM Gateway Dashboard 的视觉表现和布局密度，具体包括：统计卡片颜色标记、趋势图合并为单图多线、布局紧凑化。

## 变更范围

涉及文件：

- `src/renderer/src/views/GatewayPanel.vue`
- `src/renderer/src/components/gateway/StatsChart.vue`

## 1. 统计卡片颜色

6 张卡片的数值（`text-lg font-semibold`）加颜色标记，卡片背景/标签/子文本不变：

| 卡片         | 颜色类             |
| ------------ | ------------------ |
| 请求         | `text-violet-400`  |
| 费用         | `text-amber-400`   |
| Input Token  | `text-blue-400`    |
| Output Token | `text-emerald-400` |
| 缓存率       | `text-cyan-400`    |
| 平均延迟     | `text-rose-400`    |

卡片上的"缓存读/缓存写"子标签保留。

## 2. 趋势图：合并为 4 线单图

### StatsChart.vue

- 移除 `metric` prop，组件固定显示 4 条线
- 4 条 series 及颜色：

| 线           | name           | 颜色           |
| ------------ | -------------- | -------------- |
| 请求数       | `requests`     | `#7c3aed` 紫   |
| 费用         | `cost`         | `#f59e0b` 琥珀 |
| Input Token  | `inputTokens`  | `#3b82f6` 蓝   |
| Output Token | `outputTokens` | `#10b981` 绿   |

- Y 轴：`axisLabel: { show: false }`，grid left 从 50 → 8
- Tooltip formatter：每条线显示值+单位（费用加 `$` 前缀，Token 无后缀直接格式化数字，请求无单位）
- 图高改为 `height: 100%`，由外层容器控制

### GatewayPanel.vue（趋势图部分）

- 移除 `activeMetric`、`metricOptions` 及 tab 切换按钮 UI
- `StatsChart` 不再传 `metric` prop

## 3. 布局：趋势图 + RankBoard 同行

当前两行（趋势图 ~90px + RankBoard ~140px ≈ 230px），调整后整体高度 `175px`（约 0.75 倍）。

```
before:
[  StatsChart (全宽 90px)  ]
[  RankBoard  (全宽 ~140px) ]

after:
[  StatsChart (flex-1)  |  RankBoard (w-220px)  ]  h-[175px]
```

- 外层容器：`flex flex-row gap-3 h-[175px]`
- 趋势图侧：`flex-1 min-w-0`，StatsChart `height: 100%`
- RankBoard 侧：`w-[220px] shrink-0 overflow-y-auto`
