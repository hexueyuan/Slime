# TASK-022: Apply 阶段 — 自动打包 + Shell 替换

## 概述

进化完成后（`finalizeEvolution` commit/tag/archive 之后），自动执行 `electron-builder --mac` 打包新 `.app`，然后用 detached shell 脚本替换当前运行的应用并重启。

## 方案选择

**方案 C：applying 阶段内分步骤执行**（已选定）

- 不引入新状态机阶段，在 applying 内部用 `APPLY_PROGRESS` 事件区分子步骤
- 改动集中，向后兼容现有状态机和恢复逻辑

## 调用链

### 当前流程

```
agentic loop 结束 → finalizeEvolution() → reset() → idle
```

### 新流程

```
agentic loop 结束 → finalizeEvolution()     (commit/tag/archive, 不再 reset)
                  → applyEvolution()
                    ├─ packaged模式 → runPackage() → selfReplace()
                    └─ 开发模式    → reset() + 现有 relaunch 行为
```

`agentPresenter` 在 `finalizeEvolution()` 成功后调用 `applyEvolution()`。

## 打包流程：runPackage()

- 执行命令：`pnpm run build:mac`（即 `electron-vite build && electron-builder --mac`）
- 工作目录：`paths.effectiveProjectRoot`
- 超时：10 分钟
- 进度推送：`EVOLUTION_EVENTS.APPLY_PROGRESS` → `{ step: 'packaging', message: '正在打包...' }`
- 产物定位：在 `dist/` 下查找 `mac*/**/*.app`
- 开发模式：跳过打包，直接 reset

## 自替换机制：selfReplace()

参考 deepchat 的 `applyLocalZip` 实现。

### 步骤

1. `resolveAppBundlePath()`：从 `app.getAppPath()` 向上遍历找到 `.app` 后缀目录
2. 定位新 `.app`：在 `dist/mac-arm64/` 或 `dist/mac/` 下查找
3. 生成 `swap-update.sh` 到临时目录
4. `spawn('/bin/bash', [scriptPath], { detached: true, stdio: 'ignore' })` + `child.unref()`
5. `app.exit(0)`

### Shell 脚本

```bash
#!/bin/bash
while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done
rm -rf "${currentAppPath}"
cp -R "${newAppPath}" "${currentAppPath}"
open "${currentAppPath}"
```

用 `cp -R` 而非 `mv`，保留 dist 产物供后续归档。

## 进度事件

新增 `EVOLUTION_EVENTS.APPLY_PROGRESS`，类型：

```typescript
type ApplyProgress = {
  step: 'committing' | 'packaging' | 'replacing'
  message: string
  error?: string
}
```

渲染进程 `evolutionStore` 监听该事件，`EvolutionStatusBar` 在 applying 节点下方显示当前步骤文字。

## 错误处理

### 打包失败

- `runPackage()` 返回错误 → 通过 `APPLY_PROGRESS` 发送 `{ step: 'packaging', error: '...' }`
- 保持 applying 阶段，渲染进程显示错误 + "重试打包" / "跳过打包" 按钮
- "跳过打包" → `reset()`，代码已 commit 但未打包替换
- IPC：`evolution:retry-package` / `evolution:skip-package`

### 替换失败

- shell 脚本 fire-and-forget，无法直接捕获错误
- 新 .app 已在 dist/ 中，用户可手动处理

### 开发模式

- 跳过打包和替换步骤
- 直接 `reset()` + 现有 relaunch 行为（electron-vite dev server 热加载）

### 状态恢复

- applying 阶段已有 `saveState()` 支持
- crash 后重启 recovery 检测到 `stage: applying`，提供"继续"（重新打包）或"放弃"选项
- 放弃时直接 `reset()`，commit/tag 已在 finalize 中完成

## 接口变更

### EvolutionPresenter 新增方法

- `applyEvolution()`: 打包+替换入口
- `runPackage()`: private, 执行 electron-builder
- `selfReplace()`: private, 生成 shell 脚本替换 .app
- `resolveAppBundlePath()`: private, 定位当前 .app bundle
- `retryPackage()`: 重试打包
- `skipPackage()`: 跳过打包，reset

### IEvolutionPresenter 接口新增

- `applyEvolution(): Promise<void>`
- `retryPackage(): Promise<void>`
- `skipPackage(): void`

### 事件新增

- `EVOLUTION_EVENTS.APPLY_PROGRESS`

### 类型新增

- `ApplyProgress`

### 行为变更

- `finalizeEvolution()`: 不再调用 `reset()`，保持 applying 状态

### IPC 新增

- `evolution:retry-package`
- `evolution:skip-package`

## 边界情况

| 场景 | 处理 |
|------|------|
| 开发模式 | 跳过打包替换，reset + relaunch |
| 打包超时（>10min） | 返回超时错误，用户可重试或跳过 |
| dist/ 下找不到 .app | 报错，用户可重试或跳过 |
| `app.isPackaged` 但 `resolveAppBundlePath()` 返回 null | 报错，用户可跳过 |
| applying 阶段 crash | recovery 恢复后可重新打包或放弃 |
