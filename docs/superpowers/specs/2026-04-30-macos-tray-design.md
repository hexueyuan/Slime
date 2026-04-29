# macOS Tray — 状态栏常驻设计

## 目标

Slime 关闭窗口时隐藏到 macOS 菜单栏托盘，点击托盘图标重新打开窗口，支持托盘菜单退出。

## 行为规格

### 窗口关闭

- 点击窗口关闭按钮（红色 X）→ `window.hide()`，不销毁窗口
- 窗口状态完整保留（DOM、Vue 状态均不丢失）
- Cmd+W 同样触发 hide

### 托盘交互

- 左键点击托盘图标 → 显示窗口 + 聚焦
- 右键点击托盘图标 → 弹出上下文菜单
- 菜单项：
  - 显示/隐藏窗口（窗口可见时显示"隐藏"，隐藏时显示"显示"）
  - 退出 Slime（完全退出应用）

### 应用退出

- Cmd+Q → `app.quit()`
- 托盘菜单"退出" → `app.quit()`
- 退出前设 `isQuitting = true`，防止 close 事件拦截真正退出

## 实现方案

### 新建文件

**`src/main/tray.ts`** — TrayManager

```ts
// 核心接口
class TrayManager {
  static init(window: BrowserWindow): void   // 创建 Tray，绑定事件
  static destroy(): void                      // 销毁 Tray
}
```

- 托盘图标：`nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })`
- 图标设为 template image（`setTemplateImage(true)`）自动适配暗色/亮色菜单栏
- 菜单动态切换"显示"/"隐藏"文案
- 单例模式，全局一个 Tray

### 修改文件

**`src/main/window.ts`** — 关闭拦截

```ts
// createMainWindow 中新增
mainWindow.on('close', (e) => {
  if (!isQuitting) {
    e.preventDefault()
    mainWindow.hide()
  }
})
```

**`src/main/index.ts`** — 生命周期

- `bootstrap()` 末尾：`TrayManager.init(mainWindow)`
- `app.on('before-quit')`：设置 `isQuitting = true`
- `app.on('will-quit')`：`TrayManager.destroy()`

### isQuitting 标志

- `window.ts` 中模块级变量，`export` 供 `tray.ts` 读取
- `index.ts` 中 `before-quit` 设为 true
- 防止托盘退出和 Cmd+Q 时 close 事件再次拦截

## 影响范围

| 层 | 改动 |
|----|------|
| 主进程 | 新建 tray.ts + 修改 window.ts/index.ts 少量代码 |
| 渲染进程 | 无改动 |
| 测试 | 新增 tray 单测 |

## 不做什么

- 不添加系统通知
- 不添加 Dock 图标隐藏（保持 Dock 图标显示）
- 不添加开机启动
- 不在非 macOS 平台实现
