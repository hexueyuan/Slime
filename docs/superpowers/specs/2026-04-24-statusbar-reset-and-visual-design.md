# 进化条重置 Bug 修复 + 生物细胞膜视觉升级

## 问题

1. **Bug**: `stageStatus()` 在 idle 时无条件返回 `completed`，导致初始状态和重置后三个 dot 全绿。`handleConfirmReset` 没有显式重置渲染进程的 `completedTag/completedSummary`。
2. **视觉**: 当前进化条是普通 dot + 直线，缺乏"进化"主题感。

## Bug 修复

### stageStatus 逻辑修正

```typescript
// 修改前
if (evolutionStore.stage === "idle") return "completed";

// 修改后
if (evolutionStore.stage === "idle") {
  return evolutionStore.completedTag ? "completed" : "pending";
}
```

idle 时根据 `completedTag` 区分"从未进化"（pending）和"进化完成"（completed）。

### handleConfirmReset 补充重置

在 `handleConfirmReset` 的 finally 块中，`showDialog = false` 之前加：

```typescript
evolutionStore.reset();
```

确保 `completedTag`、`completedSummary`、`stage` 全部清零。

## 视觉升级：生物细胞膜

### 节点状态映射

| 状态      | 触发条件                          | 核心圆                                        | 膜环                                                                                           | 文字                  |
| --------- | --------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| dormant   | idle 且无 completedTag            | 10px 灰色空心，border `muted-foreground/20`   | 无                                                                                             | `muted-foreground/40` |
| completed | 已过阶段，或 idle 有 completedTag | 8px 绿色实心，`box-shadow: 0 0 6px green-500` | 28px 单层圆环，`border green-500/40`，`cell-breathe` 3s 动画                                   | `green-500`           |
| active    | 当前阶段                          | 8px 紫色实心，`box-shadow: 0 0 8px primary`   | 28px 双层圆环，外层 `primary/50`，内层 `primary/20`，交替 `cell-breathe` 2.5s（内层延迟 0.3s） | `primary` 加粗        |
| pending   | 未来阶段                          | 8px 灰色空心，border `muted-foreground/20`    | 28px 单层虚线环，`border-dashed muted-foreground/10`                                           | `muted-foreground/40` |

### 连线

- 直线改为 SVG `<path>` 有机曲线（贝塞尔）
- completed 段：`stroke green-500/50`，加 `<circle>` 粒子沿 `<animateMotion>` 2s 循环
- pending/dormant 段：`stroke muted-foreground/10`，无粒子

### CSS 动画

```css
@keyframes cell-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}
```

仅两个动画：`cell-breathe`（膜呼吸）和 SVG `animateMotion`（粒子流动）。无额外 JS 动画。

### 不变的部分

- 重置按钮样式不变（红色 border）
- 完成 badge 样式不变（绿色背景）
- 重启按钮样式不变
- Dialog 样式不变
- 整体布局（flex 横排）不变

## 涉及文件

| 文件                                                           | 改动                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/renderer/src/components/evolution/EvolutionStatusBar.vue` | stageStatus 逻辑、handleConfirmReset 加 reset、模板改为 SVG 节点+曲线连线 |
| `test/renderer/components/EvolutionStatusBar.test.ts`          | 新增 dormant 状态测试、重置后状态归零测试                                 |

无新增文件，无其他文件改动。
