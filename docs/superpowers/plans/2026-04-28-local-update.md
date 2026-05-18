# Slime 本地更新 & 端口隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Slime 添加本地 zip 安装包更新功能（Settings > 更新 tab），并统一 Gateway 默认端口为 8930。

**Architecture:** `AppPresenter` 新增 `selectLocalZip` / `applyLocalZip` 两个方法（仅 packaged 模式生效，通过现有 `presenter:call` IPC 暴露）；`GatewayPresenter` 默认使用 8930；Settings 对话框新增"更新"tab，承载 `UpdateSettings.vue` 组件。

**Tech Stack:** TypeScript, Electron (app/dialog/child_process/fs), Vue 3 Composition API, Vitest + Vue Test Utils

---

## 文件清单

| 操作 | 文件                                                            |
| ---- | --------------------------------------------------------------- |
| 修改 | `src/main/presenter/gatewayPresenter.ts`（第 61 行端口）        |
| 修改 | `src/shared/types/presenters/app.presenter.d.ts`                |
| 修改 | `src/main/presenter/appPresenter.ts`                            |
| 修改 | `test/main/appPresenter.test.ts`（扩展现有文件，加新 describe） |
| 新建 | `src/renderer/src/components/settings/UpdateSettings.vue`       |
| 新建 | `test/renderer/components/settings/UpdateSettings.test.ts`      |
| 修改 | `src/renderer/src/components/settings/SettingsDialog.vue`       |

---

### Task 1: Gateway 默认端口

**Files:**

- Modify: `src/main/presenter/gatewayPresenter.ts`

- [ ] **Step 1: 修改默认端口**

找到第 61 行：

```typescript
  private port = 8930;
```

确保 dev 模式和 packaged 模式默认都使用 8930。

- [ ] **Step 2: typecheck 验证**

```bash
pnpm run typecheck
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add src/main/presenter/gatewayPresenter.ts
git commit -m "fix(gateway): default port 8930"
```

---

### Task 2: IAppPresenter 接口扩展

**Files:**

- Modify: `src/shared/types/presenters/app.presenter.d.ts`

- [ ] **Step 1: 添加新方法签名**

将 `src/shared/types/presenters/app.presenter.d.ts` 改为：

```typescript
export interface IAppPresenter {
  getVersion(): string;
  resetAllData(): Promise<{ success: boolean; error?: string }>;
  selectLocalZip(): Promise<string | null>;
  applyLocalZip(zipPath: string): Promise<{ success: boolean; error?: string }>;
}
```

- [ ] **Step 2: typecheck（预期报错）**

```bash
pnpm run typecheck
```

Expected: 报错 `AppPresenter` 未实现 `selectLocalZip` / `applyLocalZip`（正常，Task 3 修复）

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/presenters/app.presenter.d.ts
git commit -m "feat(types): add selectLocalZip + applyLocalZip to IAppPresenter"
```

---

### Task 3: AppPresenter 实现（TDD）

**Files:**

- Modify: `src/main/presenter/appPresenter.ts`
- Modify: `test/main/appPresenter.test.ts`（在文件末尾追加新 describe 块）

- [ ] **Step 1: 在现有测试文件末尾追加失败测试**

在 `test/main/appPresenter.test.ts` 末尾（第 57 行后）追加：

```typescript
// --- 扩展 electron mock：将现有的 vi.mock("electron", ...) 替换如下 ---
// 注意：需要把文件顶部的
//   vi.mock("electron", () => ({ app: { getVersion: () => "0.0.0" } }));
// 替换为下面的版本（保持原有 getVersion 逻辑不变，加入新字段）
```

**实际操作**：将文件顶部第 4 行：

```typescript
vi.mock("electron", () => ({ app: { getVersion: () => "0.0.0" } }));
```

替换为：

```typescript
const mockElectronApp = {
  getVersion: () => "0.0.0",
  isPackaged: false as boolean,
  getAppPath: vi.fn(() => "/Applications/Slime.app/Contents/Resources/app.asar"),
  getPath: vi.fn(() => "/tmp"),
  exit: vi.fn(),
};
const mockDialog = { showOpenDialog: vi.fn() };
vi.mock("electron", () => ({ app: mockElectronApp, dialog: mockDialog }));
```

然后在文件末尾（现有 `});` 之后）追加：

```typescript
const mockMkdirSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockWriteFileSync = vi.fn();
vi.mock("fs", () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

const mockExecSync = vi.fn();
const mockSpawnReturn = { unref: vi.fn() };
const mockSpawn = vi.fn(() => mockSpawnReturn);
vi.mock("child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe("AppPresenter.selectLocalZip", () => {
  let presenter: AppPresenter;

  beforeEach(() => {
    presenter = new AppPresenter();
    vi.clearAllMocks();
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });
  });

  it("returns null when dialog canceled", async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await presenter.selectLocalZip();
    expect(result).toBeNull();
  });

  it("returns path when file selected", async () => {
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/path/to/slime.zip"],
    });
    const result = await presenter.selectLocalZip();
    expect(result).toBe("/path/to/slime.zip");
  });
});

describe("AppPresenter.applyLocalZip", () => {
  let presenter: AppPresenter;

  beforeEach(() => {
    presenter = new AppPresenter();
    vi.clearAllMocks();
    mockElectronApp.isPackaged = false;
    mockElectronApp.getAppPath.mockReturnValue(
      "/Applications/Slime.app/Contents/Resources/app.asar",
    );
    mockElectronApp.getPath.mockReturnValue("/tmp");
    mockReaddirSync.mockReturnValue(["Slime.app"]);
    mockSpawn.mockReturnValue(mockSpawnReturn);
  });

  it("returns error in dev mode", async () => {
    const result = await presenter.applyLocalZip("/fake/slime.zip");
    expect(result).toEqual({ success: false, error: "仅 packaged 模式支持本地更新" });
  });

  it("returns error when no .app found in zip", async () => {
    mockElectronApp.isPackaged = true;
    mockReaddirSync.mockReturnValue([]);
    const result = await presenter.applyLocalZip("/fake/slime.zip");
    expect(result).toEqual({ success: false, error: "安装包内未找到 .app 文件" });
  });

  it("spawns swap script and exits in packaged mode", async () => {
    mockElectronApp.isPackaged = true;
    await presenter.applyLocalZip("/fake/slime.zip");
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("ditto -xk"),
      expect.any(Object),
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      "/bin/bash",
      expect.any(Array),
      expect.objectContaining({ detached: true }),
    );
    expect(mockElectronApp.exit).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/main/appPresenter.test.ts
```

Expected: FAIL — `presenter.selectLocalZip is not a function`

- [ ] **Step 3: 实现 AppPresenter**

将 `src/main/presenter/appPresenter.ts` 完整替换为：

```typescript
import { app, dialog } from "electron";
import { mkdirSync, readdirSync, writeFileSync } from "fs";
import { unlink } from "fs/promises";
import { join, dirname } from "path";
import { execSync, spawn } from "child_process";
import { paths } from "@/utils";
import type { IAppPresenter } from "@shared/types/presenters";

function resolveAppBundlePath(): string | null {
  let current = app.getAppPath();
  for (let i = 0; i < 10; i++) {
    if (current.endsWith(".app")) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export class AppPresenter implements IAppPresenter {
  getVersion(): string {
    return app.getVersion();
  }

  async resetAllData(): Promise<{ success: boolean; error?: string }> {
    const targets = [join(paths.slimeDir, "gateway.db"), paths.configFile];
    try {
      for (const p of targets) {
        await unlink(p).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async selectLocalZip(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: "选择 Slime 安装包",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  async applyLocalZip(zipPath: string): Promise<{ success: boolean; error?: string }> {
    if (!app.isPackaged) {
      return { success: false, error: "仅 packaged 模式支持本地更新" };
    }
    try {
      const currentAppPath = resolveAppBundlePath();
      if (!currentAppPath) {
        return { success: false, error: "无法找到当前 .app 路径" };
      }
      const tempDir = join(app.getPath("temp"), `slime-local-update-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      execSync(`ditto -xk "${zipPath}" "${tempDir}"`, { timeout: 120000 });
      const entries = readdirSync(tempDir) as string[];
      const appEntry = entries.find((e) => e.endsWith(".app"));
      if (!appEntry) {
        return { success: false, error: "安装包内未找到 .app 文件" };
      }
      const extractedAppPath = join(tempDir, appEntry);
      const pid = process.pid;
      const scriptPath = join(tempDir, "swap.sh");
      const script = [
        "#!/bin/bash",
        `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`,
        `rm -rf "${currentAppPath}"`,
        `mv "${extractedAppPath}" "${currentAppPath}"`,
        `open "${currentAppPath}"`,
        `rm -rf "${tempDir}"`,
      ].join("\n");
      writeFileSync(scriptPath, script, { mode: 0o755 });
      const child = spawn("/bin/bash", [scriptPath], { detached: true, stdio: "ignore" });
      child.unref();
      app.exit(0);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/appPresenter.test.ts
```

Expected: PASS（所有测试，含原有 4 个 + 新增 5 个）

- [ ] **Step 5: typecheck 验证**

```bash
pnpm run typecheck
```

Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add src/main/presenter/appPresenter.ts test/main/appPresenter.test.ts
git commit -m "feat(app): add selectLocalZip + applyLocalZip"
```

---

### Task 4: UpdateSettings 组件（TDD）

**Files:**

- Create: `src/renderer/src/components/settings/UpdateSettings.vue`
- Create: `test/renderer/components/settings/UpdateSettings.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/renderer/components/settings/UpdateSettings.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const mockInvoke = vi.fn();
(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import UpdateSettings from "@/components/settings/UpdateSettings.vue";

describe("UpdateSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (_channel: string, _name: string, method: string) => {
      if (method === "getVersion") return "0.3.0";
      return null;
    });
  });

  it("displays current version", async () => {
    const wrapper = mount(UpdateSettings);
    await flushPromises();
    expect(wrapper.text()).toContain("0.3.0");
  });

  it("button is disabled in test env (import.meta.env.PROD=false)", async () => {
    const wrapper = mount(UpdateSettings);
    await flushPromises();
    const btn = wrapper.find("button");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("shows error when applyLocalZip returns error", async () => {
    mockInvoke.mockImplementation(async (_channel: string, _name: string, method: string) => {
      if (method === "getVersion") return "0.3.0";
      if (method === "selectLocalZip") return "/fake/slime.zip";
      if (method === "applyLocalZip") {
        return { success: false, error: "安装包内未找到 .app 文件" };
      }
      return null;
    });
    const wrapper = mount(UpdateSettings, { props: { forceEnabled: true } });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("安装包内未找到 .app 文件");
  });

  it("button shows loading state while applying", async () => {
    let resolveApply!: (v: unknown) => void;
    mockInvoke.mockImplementation(async (_channel: string, _name: string, method: string) => {
      if (method === "getVersion") return "0.3.0";
      if (method === "selectLocalZip") return "/fake/slime.zip";
      if (method === "applyLocalZip") return new Promise((r) => (resolveApply = r));
      return null;
    });
    const wrapper = mount(UpdateSettings, { props: { forceEnabled: true } });
    await flushPromises();
    wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.find("button").text()).toContain("安装中");
    resolveApply({ success: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/renderer/components/settings/UpdateSettings.test.ts
```

Expected: FAIL — 组件文件不存在

- [ ] **Step 3: 创建 UpdateSettings.vue**

创建 `src/renderer/src/components/settings/UpdateSettings.vue`：

```vue
<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-base font-semibold text-foreground">更新</h3>
      <p class="mt-1 text-sm text-muted-foreground">当前版本 v{{ version }}</p>
    </div>
    <div class="space-y-3">
      <div>
        <h4 class="text-sm font-medium text-foreground">本地安装包更新</h4>
        <p class="mt-0.5 text-xs text-muted-foreground">从本地 .zip 文件手动更新 Slime</p>
      </div>
      <button
        :disabled="!isEnabled || applying"
        :title="!isEnabled ? '仅 packaged 模式支持' : undefined"
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        @click="handleUpdate"
      >
        {{ applying ? "安装中..." : "选择安装包并更新" }}
      </button>
      <p v-if="errorMsg" class="text-xs text-destructive">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";

const props = withDefaults(defineProps<{ forceEnabled?: boolean }>(), { forceEnabled: false });

const appPresenter = usePresenter("appPresenter");
const version = ref("");
const applying = ref(false);
const errorMsg = ref("");
const isEnabled = import.meta.env.PROD || props.forceEnabled;

onMounted(async () => {
  version.value = await appPresenter.getVersion();
});

async function handleUpdate() {
  errorMsg.value = "";
  const zipPath = await appPresenter.selectLocalZip();
  if (!zipPath) return;
  applying.value = true;
  const result = await appPresenter.applyLocalZip(zipPath);
  applying.value = false;
  if (!result.success) {
    errorMsg.value = result.error ?? "更新失败";
  }
}
</script>
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/renderer/components/settings/UpdateSettings.test.ts
```

Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/settings/UpdateSettings.vue test/renderer/components/settings/UpdateSettings.test.ts
git commit -m "feat(ui): add UpdateSettings component"
```

---

### Task 5: SettingsDialog 接入

**Files:**

- Modify: `src/renderer/src/components/settings/SettingsDialog.vue`

- [ ] **Step 1: 添加 import**

在 `<script setup>` 中现有 import 末尾添加：

```typescript
import UpdateSettings from "./UpdateSettings.vue";
```

- [ ] **Step 2: 扩展 activeTab 类型**

将：

```typescript
const activeTab = ref<"profile" | "gateway" | "general" | "agents">("profile");
```

改为：

```typescript
const activeTab = ref<"profile" | "gateway" | "general" | "agents" | "update">("profile");
```

- [ ] **Step 3: 左侧 nav 添加按钮**

在 Agent 按钮（`@click="activeTab = 'agents'"`）所在 `<button>` 块后添加：

```html
<button
  :class="[
    'rounded-md px-3 py-1.5 text-left text-sm',
    activeTab === 'update'
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/50',
  ]"
  @click="activeTab = 'update'"
>
  更新
</button>
```

- [ ] **Step 4: 右侧内容区添加条件渲染**

在 `<AgentSettings v-else-if="activeTab === 'agents'" />` 后添加：

```html
<UpdateSettings v-else-if="activeTab === 'update'" />
```

- [ ] **Step 5: typecheck + lint**

```bash
pnpm run typecheck && pnpm run lint
```

Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/settings/SettingsDialog.vue
git commit -m "feat(ui): add 更新 tab to SettingsDialog"
```

---

### Task 6: 全量验证

- [ ] **Step 1: format**

```bash
pnpm run format
```

- [ ] **Step 2: 全量测试**

```bash
pnpm test
```

Expected: 所有测试通过（新增 9 个）

- [ ] **Step 3: 如有 format 改动则 commit**

```bash
git add -A
git commit -m "style: format"
```
