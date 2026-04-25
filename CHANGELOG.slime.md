# Slime Evolution Changelog

## [egg-v0.1-dev.5] - 2026-04-25

### Evolution

- Request: "把时钟的基础色系改成绿色"
- Summary: 将时钟基础色系从青紫色（#06b6d4 + #a855f7）改为霓虹绿色系（#22c55e + #16a34a）
- Status: Success

### Changes

- src/renderer/src/components/clock/CyberClock.vue
- src/renderer/src/components/evolution/EvolutionStatusBar.vue

---

## [egg-v0.1-dev.4] - 2026-04-25

### Evolution

- Request: "将时钟从24小时制修改为12小时制，增加AM/PM标记"
- Summary: 将 CyberClock 时钟组件从 24 小时制改为 12 小时制，增加 AM/PM 徽章标记
- Status: Success

### Changes

- src/renderer/src/components/clock/CyberClock.vue

---

## [egg-v0.1-dev.3] - 2026-04-25

### Evolution

- Request: "将时钟的星期信息从英文改为中文显示"
- Summary: 将时钟星期显示从英文改为中文（星期日、星期一...星期六）
- Status: Success

### Changes

- .gitignore
- docs/AGENTS.md
- docs/evo/EVOLUTION.md
- src/main/presenter/evolutionPresenter.ts
- src/main/presenter/index.ts
- src/main/presenter/systemPrompt.ts
- src/main/presenter/toolPresenter.ts
- src/renderer/src/components/clock/CyberClock.vue
- src/renderer/src/components/function/HistoryPanel.vue
- src/renderer/src/stores/evolution.ts
- src/shared/events.ts
- src/shared/types/evolution.d.ts
- src/shared/types/presenters/evolution.presenter.d.ts
- test/main/evolutionPresenter.test.ts
- test/main/toolPresenter.evolution.test.ts
- test/renderer/components/HistoryPanel.test.ts
- test/renderer/stores/evolution.test.ts

---

## [egg-v0.1-dev.2] - 2026-04-24

### Evolution

- Request: "增加一个侧边栏tab，点击后显示一个炫酷的动态数字时钟"
- Summary: 新增侧边栏时钟 tab，点击后全屏展示赛博朋克风格动态数字时钟（含翻转动画、扫描线、霓虹光晕）
- Status: Success

### Changes

- (no file changes recorded)

---

## [egg-v0.1-dev.1] - 2026-04-24

### Evolution

- Request: "优化对话字体大小，整体缩小"
- Summary: 缩小对话字体大小：用户消息 text-sm→text-xs，助手消息 prose-sm→prose-xs(13px)，输入框 text-sm→text-xs，标题层级整体缩小一档
- Status: Success

### Changes

- (no file changes recorded)

---
