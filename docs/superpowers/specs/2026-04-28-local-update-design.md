# Slime 本地更新 & 端口隔离设计

## 概述

两个独立目标：
1. **本地更新**：在 Settings 对话框新增"更新"tab，支持选择本地 `.zip` 安装包替换当前 `.app`（参考 deepchat `applyLocalZip` 实现）
2. **端口隔离**：dev 模式默认端口 8920，packaged 模式默认端口 8930，两个 Slime 实例互不影响

---

## 1. 端口隔离

**改动文件**：`src/main/presenter/gatewayPresenter.ts:61`

```ts
// 改前
private port = 8930

// 改后
private port = app.isPackaged ? 8930 : 8920
```

dev 模式（`pnpm run dev`，`app.isPackaged === false`）默认 8920；packaged 后默认 8930。

userData 路径天然隔离（dev: `~/Library/Application Support/Electron`，packaged: `~/Library/Application Support/Slime`），配置文件不会互相覆盖。用户仍可在 Settings 里手动覆盖端口，行为不变。

---

## 2. 后端：AppPresenter 新增方法

**改动文件**：
- `src/main/presenter/appPresenter.ts`
- `src/shared/presenter.d.ts`（IAppPresenter 接口）

### `selectLocalZip(): Promise<string | null>`

调 `dialog.showOpenDialog`，过滤 `.zip`，返回选中路径；取消返回 `null`。

### `applyLocalZip(zipPath: string): Promise<{ success: boolean; error?: string }>`

1. `!app.isPackaged` → 直接返回 `{ success: false, error: '仅 packaged 模式支持' }`
2. `resolveAppBundlePath()` — 从 `app.getAppPath()` 向上 `dirname()` 遍历，找到以 `.app` 结尾的路径
3. 在 `app.getPath('temp')/slime-local-update-{Date.now()}` 建临时目录
4. `execSync('ditto -xk "{zipPath}" "{tempDir}"', { timeout: 120000 })` 解压
5. 读 tempDir 找第一个 `.app` 条目作为 `extractedAppPath`
6. 写 shell 脚本 `swap.sh`：
   ```bash
   #!/bin/bash
   while kill -0 {pid} 2>/dev/null; do sleep 0.5; done
   rm -rf "{currentAppPath}"
   mv "{extractedAppPath}" "{currentAppPath}"
   open "{currentAppPath}"
   rm -rf "{tempDir}"
   ```
7. `spawn('/bin/bash', [swap.sh], { detached: true, stdio: 'ignore' })` + `child.unref()` + `app.exit(0)`

错误处理：resolveAppBundlePath 失败、ditto 失败、找不到 `.app` 条目，均返回 `{ success: false, error: message }`。

IPC 暴露：通过现有 `presenter:call` 分发，无需独立 IPC channel。

---

## 3. 前端：Settings 更新 Tab

**改动文件**：
- `src/renderer/src/components/settings/`（新增 `UpdateTab.vue` 或在现有 dialog 加 tab）
- Settings dialog 的 tab 列表

### UI 布局

```
[更新] tab
┌──────────────────────────────────────────┐
│  版本：v{currentVersion}                  │
│                                          │
│  本地安装包更新                             │
│  从本地 .zip 文件手动更新 Slime             │
│                                          │
│  [选择安装包并更新]  ← packaged 时可用      │
│                   ← dev 时置灰+tooltip   │
└──────────────────────────────────────────┘
```

### 交互流程

1. 点击按钮 → `appPresenter.selectLocalZip()` 弹文件选框
2. 用户选中 → 按钮进入 loading + 禁用 → `appPresenter.applyLocalZip(path)`
3. 返回 error → toast 显示错误信息，按钮恢复
4. 成功 → app 直接退出（shell 脚本接管），无需额外 UI

### dev 模式处理

通过 `appPresenter.isPackaged()` 或直接读环境判断，按钮 `disabled` + tooltip "仅 packaged 模式支持"。

---

## 约束

- 仅支持 macOS（`ditto` 命令）
- 仅支持 packaged 模式执行替换
- zip 内必须包含一个 `.app` bundle（与 deepchat 同假设）
