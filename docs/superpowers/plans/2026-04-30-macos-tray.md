# macOS Tray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Slime 关闭窗口时隐藏到 macOS 菜单栏托盘，点击托盘图标恢复窗口，支持托盘菜单退出。

**Architecture:** 新建 `src/main/tray.ts` 封装 Tray 管理逻辑，修改 `src/main/window.ts` 拦截 close 事件改为 hide，修改 `src/main/index.ts` 管理 isQuitting 标志和 Tray 生命周期。仅 macOS 生效。

**Tech Stack:** Electron Tray API, nativeImage, TypeScript

---

### Task 1: 新建 tray.ts — TrayManager

**Files:**

- Create: `src/main/tray.ts`
- Test: `test/main/tray.test.ts`

- [x] **Step 1: 写 tray 单测**

```ts
// test/main/tray.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockTrayDestroy = vi.fn();
const mockTraySetContextMenu = vi.fn();
const mockTrayOn = vi.fn();
let clickHandler: (() => void) | null = null;

const mockTrayInstance = {
  destroy: mockTrayDestroy,
  setContextMenu: mockTraySetContextMenu,
  on: vi.fn((event: string, cb: () => void) => {
    if (event === "click") clickHandler = cb;
  }),
  setToolTip: vi.fn(),
};

const mockTrayConstructor = vi.fn(() => mockTrayInstance);
const mockMenuConstructor = vi.fn();

const { mockNativeImage, mockBrowserWindow } = vi.hoisted(() => {
  return {
    mockNativeImage: {
      createFromPath: vi.fn(() => ({
        resize: vi.fn(() => ({ setTemplateImage: vi.fn() })),
      })),
    },
    mockBrowserWindow: {
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      isVisible: vi.fn(() => false),
    },
  };
});

vi.mock("electron", () => ({
  Tray: mockTrayConstructor,
  Menu: { buildFromTemplate: mockMenuConstructor },
  nativeImage: mockNativeImage,
}));

import { TrayManager } from "@/tray";

describe("TrayManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clickHandler = null;
  });

  afterEach(() => {
    TrayManager.destroy();
  });

  it("init creates a Tray with icon", () => {
    TrayManager.init(mockBrowserWindow as any);

    expect(mockTrayConstructor).toHaveBeenCalled();
  });

  it("left-click shows window when hidden", () => {
    (mockBrowserWindow.isVisible as any).mockReturnValue(false);
    TrayManager.init(mockBrowserWindow as any);

    clickHandler?.();

    expect(mockBrowserWindow.show).toHaveBeenCalled();
    expect(mockBrowserWindow.focus).toHaveBeenCalled();
  });

  it("left-click hides window when visible", () => {
    (mockBrowserWindow.isVisible as any).mockReturnValue(true);
    TrayManager.init(mockBrowserWindow as any);

    clickHandler?.();

    expect(mockBrowserWindow.hide).toHaveBeenCalled();
  });

  it("destroy destroys the tray", () => {
    TrayManager.init(mockBrowserWindow as any);
    TrayManager.destroy();

    expect(mockTrayDestroy).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: 跑测试确认失败**

```bash
pnpm test test/main/tray.test.ts --run
```

Expected: FAIL — `@/tray` 模块不存在

- [x] **Step 3: 实现 TrayManager 最小代码**

```ts
// src/main/tray.ts
import { app, Tray, Menu, nativeImage, BrowserWindow } from "electron";
import { join } from "path";
import { paths } from "@/utils/paths";

let tray: Tray | null = null;
let win: BrowserWindow | null = null;

export const TrayManager = {
  init(window: BrowserWindow): void {
    if (process.platform !== "darwin") return;

    win = window;
    const iconPath = join(paths.projectRoot, "build", "icon.png");
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip("Slime");

    tray.on("click", () => {
      if (win?.isVisible()) {
        win.hide();
      } else {
        win?.show();
        win?.focus();
      }
    });

    tray.on("right-click", () => {
      const menu = Menu.buildFromTemplate([
        {
          label: win?.isVisible() ? "隐藏窗口" : "显示窗口",
          click: () => {
            if (win?.isVisible()) {
              win.hide();
            } else {
              win?.show();
              win?.focus();
            }
          },
        },
        { type: "separator" },
        {
          label: "退出 Slime",
          click: () => {
            app.quit();
          },
        },
      ]);
      tray!.setContextMenu(menu);
    });
  },

  destroy(): void {
    tray?.destroy();
    tray = null;
    win = null;
  },
};
```

- [x] **Step 4: 跑测试确认通过**

```bash
pnpm test test/main/tray.test.ts --run
```

Expected: PASS

- [x] **Step 5: 提交**

```bash
git add src/main/tray.ts test/main/tray.test.ts
git commit -m "feat(tray): add TrayManager for macos menu bar"
```

---

### Task 2: 修改 window.ts — 关闭拦截

**Files:**

- Modify: `src/main/window.ts`

- [x] **Step 1: 添加 isQuitting 标志和 close 拦截**

在 `src/main/window.ts` 中，在 `let mainWindow` 声明后添加：

```ts
export let isQuitting = false;
export function setIsQuitting(v: boolean): void {
  isQuitting = v;
}
```

在 `mainWindow.on('closed', ...)` 之前添加 close 拦截：

```ts
mainWindow.on("close", (e) => {
  if (process.platform === "darwin" && !isQuitting) {
    e.preventDefault();
    mainWindow?.hide();
  }
});
```

完整的 `mainWindow` 事件部分变为：

```ts
mainWindow.on("close", (e) => {
  if (process.platform === "darwin" && !isQuitting) {
    e.preventDefault();
    mainWindow?.hide();
  }
});

mainWindow.once("ready-to-show", () => {
  mainWindow?.show();
  logger.info("Main window ready");
});

// ... 其余不变

mainWindow.on("closed", () => {
  mainWindow = null;
});
```

> 注意：关闭拦截和 `ready-to-show` 之间没有依赖关系，`close` 在前仅为了可读性。

- [x] **Step 2: 验证无类型错误**

```bash
pnpm run typecheck
```

Expected: PASS

- [x] **Step 3: 提交**

```bash
git add src/main/window.ts
git commit -m "feat(tray): intercept close to hide window on macos"
```

---

### Task 3: 修改 index.ts — 生命周期集成

**Files:**

- Modify: `src/main/index.ts`

- [x] **Step 1: 在 index.ts 中集成 Tray 生命周期**

修改 `src/main/index.ts`：

1. 顶部新增加 import：

```ts
import { setIsQuitting } from "./window";
import { TrayManager } from "./tray";
```

2. `bootstrap()` 末尾，在 `logger.info('Slime ready')` 之前加：

```ts
TrayManager.init(mainWindow);
```

3. 将原有的 `app.on('window-all-closed', ...)` 替换为：

```ts
app.on("window-all-closed", () => {
  // macOS: 窗口关闭后隐藏到托盘，不退出
  // 非 macOS: 所有窗口关闭后退出
});
```

> 原有逻辑是 `process.platform !== 'darwin'` 时退出，现在 close 已被拦截，macOS 上窗口实际不会 close，所以 `window-all-closed` 在 macOS 上永远不会触发。保留事件处理以保持代码意图清晰，非 macOS 仍退出。

4. 在 `app.on('activate', ...)` 之后添加：

```ts
app.on("before-quit", () => {
  setIsQuitting(true);
});

app.on("will-quit", () => {
  TrayManager.destroy();
});
```

- [x] **Step 2: 验证**

```bash
pnpm run typecheck
pnpm run lint
```

Expected: 全部 PASS

- [x] **Step 3: 提交**

```bash
git add src/main/index.ts
git commit -m "feat(tray): integrate TrayManager lifecycle into bootstrap"
```

---

### Task 4: 手动验证

- [x] **Step 1: 启动开发模式**

```bash
pnpm run dev
```

- [x] **Step 2: 验证托盘图标**

确认 macOS 菜单栏出现 Slime 图标

- [x] **Step 3: 验证关闭隐藏**

点击窗口关闭按钮 → 窗口消失，菜单栏图标仍在

- [x] **Step 4: 验证左键恢复**

左键点击托盘图标 → 窗口重新出现

- [x] **Step 5: 验证右键菜单**

右键点击托盘图标 → 弹出菜单（显示/隐藏、退出）

- [x] **Step 6: 验证 Cmd+Q 退出**

Cmd+Q → 应用完全退出，托盘图标消失

```

```
