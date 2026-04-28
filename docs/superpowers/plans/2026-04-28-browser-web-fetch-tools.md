# browser\_\* + web_fetch 工具集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AgentChatPresenter 新增 9 个 browser\_\* 工具（headless Chromium）和 1 个 web_fetch 工具，共 10 个新工具，总工具数从 9 增至 19。

**Architecture:** BrowserSession 封装所有 playwright-core 操作（懒初始化、idle timer、ref 映射），browserTools.ts 定义 10 个工具的 Zod schema + execute，ToolPresenter 接收 browserSession 作为第 4 个构造参数并注册新工具。

**Tech Stack:** playwright-core ^1.52.0（headless Chromium）、Node.js 内置 fetch（web_fetch）、AI SDK v6 tool() + Zod。

---

## File Map

| 操作 | 文件                                  | 职责                                    |
| ---- | ------------------------------------- | --------------------------------------- |
| 修改 | `package.json`                        | 添加 playwright-core 依赖 + postinstall |
| 新建 | `src/main/browser/browserSession.ts`  | BrowserSession 类 + 模块级单例          |
| 新建 | `src/main/browser/browserTools.ts`    | 10 个工具的 schema + execute 工厂函数   |
| 修改 | `src/main/presenter/toolPresenter.ts` | 添加第 4 个构造参数，注册 10 个新工具   |
| 修改 | `src/main/presenter/index.ts`         | 注入 browserSession，destroy 时关闭     |
| 新建 | `test/main/browser.test.ts`           | BrowserSession + browserTools 单元测试  |
| 修改 | `test/main/toolPresenter.test.ts`     | 工具数量断言从 9 改为 19                |

---

## Task 1: 添加 playwright-core 依赖

**Files:**

- Modify: `package.json`

- [ ] **Step 1: 更新 package.json**

在 `"dependencies"` 中添加（zod 后面）：

```json
"playwright-core": "^1.52.0",
```

在 `"pnpm".onlyBuiltDependencies` 数组中添加：

```json
"playwright-core"
```

将 `"scripts"."postinstall"` 改为：

```json
"postinstall": "electron-builder install-app-deps && simple-git-hooks && npx playwright install chromium"
```

完整修改后的相关片段：

```json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps && simple-git-hooks && npx playwright install chromium"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^3.0.71",
    "@ai-sdk/openai": "^3.0.53",
    "@electron-toolkit/preload": "^3.0.2",
    "@electron-toolkit/utils": "^4.0.0",
    "@pinia/colada": "^1.2.0",
    "@tailwindcss/typography": "^0.5.19",
    "@vueuse/core": "^14.2.1",
    "ai": "^6.0.168",
    "better-sqlite3": "^12.9.0",
    "echarts": "^6.0.0",
    "fastify": "^5.8.5",
    "markstream-vue": "0.0.13-beta.4",
    "pinia": "^3.0.4",
    "playwright-core": "^1.52.0",
    "vue": "^3.5.31",
    "vue-draggable-plus": "^0.6.1",
    "vue-echarts": "^8.0.1",
    "zod": "^4.3.6"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3",
      "electron",
      "electron-winstaller",
      "esbuild",
      "playwright-core",
      "simple-git-hooks"
    ]
  }
}
```

- [ ] **Step 2: 安装依赖 + 下载 Chromium**

```bash
pnpm install
npx playwright install chromium
```

Expected: 安装成功，Chromium 下载到 `~/.cache/ms-playwright/`。

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add playwright-core + install chromium"
```

---

## Task 2: BrowserSession 类 (TDD)

**Files:**

- Create: `test/main/browser.test.ts`
- Create: `src/main/browser/browserSession.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/main/browser.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("playwright-core", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

import { chromium } from "playwright-core";
import { BrowserSession } from "@/browser/browserSession";

describe("BrowserSession", () => {
  let session: BrowserSession;
  let mockLocator: any;
  let mockPage: any;
  let mockBrowser: any;

  beforeEach(() => {
    mockLocator = {
      screenshot: vi.fn().mockResolvedValue(Buffer.from("img")),
      click: vi.fn().mockResolvedValue(undefined),
      dblclick: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation((_fn: any, args: any) => Promise.resolve(undefined)),
    };
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://example.com"),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("screenshot")),
      accessibility: {
        snapshot: vi.fn().mockResolvedValue({
          role: "WebArea",
          name: "Test Page",
          children: [
            { role: "button", name: "Submit", children: [] },
            { role: "textbox", name: "Email", children: [] },
            {
              role: "generic",
              name: "Container",
              children: [{ role: "link", name: "Home", children: [] }],
            },
          ],
        }),
      },
      getByRole: vi.fn().mockReturnValue(mockLocator),
      locator: vi.fn().mockReturnValue({ first: () => mockLocator }),
      evaluate: vi.fn().mockResolvedValue("eval-result"),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      mouse: {
        click: vi.fn().mockResolvedValue(undefined),
        dblclick: vi.fn().mockResolvedValue(undefined),
      },
    };
    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as any);
    session = new BrowserSession();
  });

  afterEach(async () => {
    await session.close();
    vi.clearAllMocks();
  });

  it("isActive() returns false before any navigation", () => {
    expect(session.isActive()).toBe(false);
  });

  it("isActive() returns true after navigate", async () => {
    await session.navigate("https://example.com");
    expect(session.isActive()).toBe(true);
  });

  it("navigate() calls page.goto and returns final URL", async () => {
    const url = await session.navigate("https://example.com");
    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", { waitUntil: "load" });
    expect(url).toBe("https://example.com");
  });

  it("navigate() clears refMap so old refs are invalid", async () => {
    await session.navigate("https://example.com");
    await session.snapshot(); // populates e1, e2, e3
    await session.navigate("https://other.com"); // clears
    await expect(session.screenshot({ ref: "e1" })).rejects.toThrow("Unknown ref: e1");
  });

  it("snapshot() builds refMap for interactive elements", async () => {
    await session.navigate("https://example.com");
    const text = await session.snapshot();
    // button, textbox, link should get refs
    expect(text).toContain("[ref=e1]");
    expect(text).toContain("[ref=e2]");
    expect(text).toContain("[ref=e3]");
    // non-interactive generic should NOT get a ref
    expect(text).not.toMatch(/"Container".*\[ref=/);
  });

  it("snapshot() assigns refs only to interactive roles", async () => {
    await session.navigate("https://example.com");
    await session.snapshot();
    // e1=button Submit, e2=textbox Email, e3=link Home
    // Clicking e1 should call getByRole with button/Submit
    await session.click({ ref: "e1" });
    expect(mockLocator.click).toHaveBeenCalled();
  });

  it("screenshot() with no opts calls page.screenshot()", async () => {
    await session.navigate("https://example.com");
    const result = await session.screenshot();
    expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: false });
    expect(result).toHaveProperty("base64");
    expect(result).toHaveProperty("mimeType", "image/png");
  });

  it("screenshot({ full_page: true }) calls page.screenshot({ fullPage: true })", async () => {
    await session.navigate("https://example.com");
    await session.screenshot({ full_page: true });
    expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: true });
  });

  it("screenshot({ ref }) calls locator.screenshot()", async () => {
    await session.navigate("https://example.com");
    await session.snapshot(); // populate refs
    await session.screenshot({ ref: "e1" });
    expect(mockLocator.screenshot).toHaveBeenCalled();
  });

  it("screenshot({ clip }) passes clip to page.screenshot()", async () => {
    await session.navigate("https://example.com");
    const clip = { x: 0, y: 0, width: 100, height: 100 };
    await session.screenshot({ clip });
    expect(mockPage.screenshot).toHaveBeenCalledWith({ clip });
  });

  it("close() sets isActive() to false", async () => {
    await session.navigate("https://example.com");
    await session.close();
    expect(session.isActive()).toBe(false);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("close() on inactive session is a no-op", async () => {
    await session.close(); // no-op
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  it("idle timer auto-closes session after timeout", async () => {
    vi.useFakeTimers();
    try {
      await session.navigate("https://example.com");
      expect(session.isActive()).toBe(true);
      await vi.runAllTimersAsync();
      expect(session.isActive()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evaluate() calls page.evaluate with script", async () => {
    await session.navigate("https://example.com");
    const result = await session.evaluate("document.title");
    expect(mockPage.evaluate).toHaveBeenCalledWith("document.title");
    expect(result).toBe("eval-result");
  });

  it("wait({ time_ms }) calls page.waitForTimeout", async () => {
    await session.navigate("https://example.com");
    await session.wait({ time_ms: 500 });
    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it("wait({ selector }) calls page.waitForSelector", async () => {
    await session.navigate("https://example.com");
    await session.wait({ selector: "#app" });
    expect(mockPage.waitForSelector).toHaveBeenCalledWith("#app");
  });

  it("click({ x, y }) calls page.mouse.click", async () => {
    await session.navigate("https://example.com");
    await session.click({ x: 100, y: 200 });
    expect(mockPage.mouse.click).toHaveBeenCalledWith(100, 200);
  });

  it("type() fills text and presses Enter if submit=true", async () => {
    await session.navigate("https://example.com");
    await session.snapshot();
    await session.type({ ref: "e2", text: "hello@example.com", submit: true });
    expect(mockLocator.fill).toHaveBeenCalledWith("hello@example.com");
    expect(mockLocator.press).toHaveBeenCalledWith("Enter");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/main/browser.test.ts
```

Expected: FAIL — `Cannot find module '@/browser/browserSession'`

- [ ] **Step 3: 创建 BrowserSession**

新建 `src/main/browser/browserSession.ts`：

```typescript
import { chromium } from "playwright-core";
import type { Browser, Page, Locator } from "playwright-core";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface AccessibilityNode {
  role?: string;
  name?: string;
  children?: AccessibilityNode[];
}

export interface ScreenshotOpts {
  full_page?: boolean;
  ref?: string;
  element?: string;
  clip?: { x: number; y: number; width: number; height: number };
}

export interface ClickOpts {
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  double_click?: boolean;
}

export interface TypeOpts {
  ref?: string;
  selector?: string;
  text: string;
  submit?: boolean;
}

export interface ScrollOpts {
  ref?: string;
  selector?: string;
  direction: "up" | "down" | "left" | "right";
  amount: number;
}

export interface WaitOpts {
  time_ms?: number;
  text?: string;
  selector?: string;
  url?: string;
  load_state?: "load" | "domcontentloaded" | "networkidle";
}

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "menuitem",
  "option",
  "tab",
  "searchbox",
]);

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private refMap: Map<string, Locator> = new Map();
  private idleTimer: NodeJS.Timeout | null = null;
  private refCounter = 0;

  async ensureReady(): Promise<Page> {
    if (!this.browser || !this.page) {
      this.browser = await chromium.launch({ headless: true });
      this.page = await this.browser.newPage();
    }
    this._resetIdleTimer();
    return this.page;
  }

  private _resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), IDLE_TIMEOUT_MS);
  }

  async navigate(url: string): Promise<string> {
    const page = await this.ensureReady();
    this.refMap.clear();
    this.refCounter = 0;
    await page.goto(url, { waitUntil: "load" });
    return page.url();
  }

  async screenshot(opts: ScreenshotOpts = {}): Promise<{
    base64: string;
    mimeType: string;
    width: number;
    height: number;
  }> {
    const page = await this.ensureReady();
    let buf: Buffer;
    if (opts.ref) {
      const loc = this.refMap.get(opts.ref);
      if (!loc) throw new Error(`Unknown ref: ${opts.ref}`);
      buf = await loc.screenshot();
    } else if (opts.element) {
      buf = await page.locator(opts.element).first().screenshot();
    } else if (opts.clip) {
      buf = await page.screenshot({ clip: opts.clip });
    } else {
      buf = await page.screenshot({ fullPage: opts.full_page ?? false });
    }
    return { base64: buf.toString("base64"), mimeType: "image/png", width: 0, height: 0 };
  }

  async snapshot(): Promise<string> {
    const page = await this.ensureReady();
    this.refMap.clear();
    this.refCounter = 0;
    // page.accessibility.snapshot() is deprecated in newer playwright,
    // but page.ariaSnapshot() returns YAML without structured node access.
    // Using accessibility.snapshot() for ref mapping; upgrade path: parse ARIA YAML.
    const tree = await (page.accessibility as any).snapshot();
    const lines: string[] = [];
    this._walkTree(tree, 0, lines);
    return lines.join("\n");
  }

  private _walkTree(node: AccessibilityNode | null, depth: number, lines: string[]): void {
    if (!node) return;
    const indent = "  ".repeat(depth);
    const role = node.role ?? "";
    const name = node.name ?? "";
    let ref = "";
    if (INTERACTIVE_ROLES.has(role) && name) {
      this.refCounter++;
      const refKey = `e${this.refCounter}`;
      const locator = this.page!.getByRole(role as any, { name });
      this.refMap.set(refKey, locator);
      ref = ` [ref=${refKey}]`;
    }
    lines.push(`${indent}${role}${name ? ` "${name}"` : ""}${ref}`);
    for (const child of node.children ?? []) {
      this._walkTree(child, depth + 1, lines);
    }
  }

  async click(opts: ClickOpts): Promise<void> {
    const page = await this.ensureReady();
    const dbl = opts.double_click ?? false;
    if (opts.ref) {
      const loc = this.refMap.get(opts.ref);
      if (!loc) throw new Error(`Unknown ref: ${opts.ref}`);
      dbl ? await loc.dblclick() : await loc.click();
    } else if (opts.selector) {
      const loc = page.locator(opts.selector).first();
      dbl ? await loc.dblclick() : await loc.click();
    } else if (opts.x !== undefined && opts.y !== undefined) {
      dbl ? await page.mouse.dblclick(opts.x, opts.y) : await page.mouse.click(opts.x, opts.y);
    } else {
      throw new Error("click requires ref, selector, or x+y coordinates");
    }
  }

  async type(opts: TypeOpts): Promise<void> {
    const page = await this.ensureReady();
    const loc = opts.ref
      ? this.refMap.get(opts.ref)
      : opts.selector
        ? page.locator(opts.selector).first()
        : null;
    if (!loc)
      throw new Error(
        `type requires ref or selector${opts.ref ? ` (unknown ref: ${opts.ref})` : ""}`,
      );
    await loc.fill(opts.text);
    if (opts.submit) await loc.press("Enter");
  }

  async scroll(opts: ScrollOpts): Promise<void> {
    const page = await this.ensureReady();
    const dx =
      opts.direction === "right" ? opts.amount : opts.direction === "left" ? -opts.amount : 0;
    const dy = opts.direction === "down" ? opts.amount : opts.direction === "up" ? -opts.amount : 0;
    if (opts.ref || opts.selector) {
      const loc = opts.ref ? this.refMap.get(opts.ref) : page.locator(opts.selector!).first();
      if (!loc) throw new Error(`Unknown ref: ${opts.ref}`);
      await (loc as any).evaluate(
        (el: Element, args: { dx: number; dy: number }) => el.scrollBy(args.dx, args.dy),
        { dx, dy },
      );
    } else {
      await page.evaluate(({ dx, dy }: { dx: number; dy: number }) => window.scrollBy(dx, dy), {
        dx,
        dy,
      });
    }
  }

  async evaluate(script: string): Promise<unknown> {
    const page = await this.ensureReady();
    return page.evaluate(script);
  }

  async wait(opts: WaitOpts): Promise<void> {
    const page = await this.ensureReady();
    if (opts.time_ms !== undefined) {
      await page.waitForTimeout(opts.time_ms);
    } else if (opts.selector) {
      await page.waitForSelector(opts.selector);
    } else if (opts.text) {
      await page.waitForFunction(
        (text: string) => document.body.textContent?.includes(text),
        opts.text,
      );
    } else if (opts.url) {
      await page.waitForURL(opts.url);
    } else if (opts.load_state) {
      await page.waitForLoadState(opts.load_state);
    }
  }

  async close(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    this.refMap.clear();
    this.refCounter = 0;
  }

  isActive(): boolean {
    return this.browser !== null;
  }
}

export const browserSession = new BrowserSession();
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/browser.test.ts
```

Expected: 所有 BrowserSession 测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/browser/browserSession.ts test/main/browser.test.ts
git commit -m "feat(browser): add BrowserSession with playwright-core"
```

---

## Task 3: browserTools.ts — 10 个工具定义 (TDD)

**Files:**

- Modify: `test/main/browser.test.ts` （追加 web_fetch 测试）
- Create: `src/main/browser/browserTools.ts`

- [ ] **Step 1: 追加 web_fetch 测试到 browser.test.ts**

在 `test/main/browser.test.ts` 末尾，`BrowserSession describe` 块**之后**追加：

```typescript
describe("makeWebFetchTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns text body for text/html content type", async () => {
    const mockResponse = {
      status: 200,
      headers: {
        get: (k: string) => (k === "content-type" ? "text/html; charset=utf-8" : null),
        forEach: (cb: (v: string, k: string) => void) => cb("text/html", "content-type"),
      },
      text: vi.fn().mockResolvedValue("<html>hello</html>"),
      arrayBuffer: vi.fn(),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { makeWebFetchTool } = await import("@/browser/browserTools");
    const toolDef = makeWebFetchTool();
    const result = (await toolDef.execute({ url: "https://example.com" })) as any;

    expect(result.status).toBe(200);
    expect(result.encoding).toBe("text");
    expect(result.body).toBe("<html>hello</html>");
    expect(result.content_type).toBe("text/html; charset=utf-8");
  });

  it("returns base64 body for binary content type", async () => {
    const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const mockResponse = {
      status: 200,
      headers: {
        get: (k: string) => (k === "content-type" ? "image/png" : null),
        forEach: (cb: (v: string, k: string) => void) => cb("image/png", "content-type"),
      },
      text: vi.fn(),
      arrayBuffer: vi.fn().mockResolvedValue(bin.buffer),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { makeWebFetchTool } = await import("@/browser/browserTools");
    const toolDef = makeWebFetchTool();
    const result = (await toolDef.execute({ url: "https://example.com/img.png" })) as any;

    expect(result.encoding).toBe("base64");
    expect(result.body).toBe(bin.toString("base64"));
  });

  it("passes method, headers, body to fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 201,
      headers: {
        get: () => "application/json",
        forEach: (cb: (v: string, k: string) => void) => cb("application/json", "content-type"),
      },
      text: vi.fn().mockResolvedValue('{"ok":true}'),
      arrayBuffer: vi.fn(),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { makeWebFetchTool } = await import("@/browser/browserTools");
    const toolDef = makeWebFetchTool();
    await toolDef.execute({
      url: "https://api.example.com/data",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"x":1}',
    });

    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"x":1}',
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm test test/main/browser.test.ts
```

Expected: FAIL — `Cannot find module '@/browser/browserTools'`

- [ ] **Step 3: 创建 browserTools.ts**

新建 `src/main/browser/browserTools.ts`：

```typescript
import { z } from "zod";
import type { BrowserSession } from "./browserSession";

export function makeBrowserNavigateTool(session: BrowserSession) {
  return {
    description: "Navigate the browser to a URL. Clears all element refs.",
    parameters: z.object({
      url: z.string().describe("URL to navigate to"),
    }),
    execute: async ({ url }: { url: string }) => {
      const finalUrl = await session.navigate(url);
      return { url: finalUrl };
    },
  };
}

export function makeBrowserScreenshotTool(session: BrowserSession) {
  return {
    description:
      "Take a screenshot. Returns base64 PNG. Note: AI cannot view images in current tool-result format; use snapshot() to understand page structure instead.",
    parameters: z.object({
      full_page: z.boolean().optional().describe("Capture full scrollable page"),
      ref: z.string().optional().describe("Element ref from snapshot (e.g. e1)"),
      element: z.string().optional().describe("CSS selector for element screenshot"),
      clip: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .optional()
        .describe("Clip region in pixels"),
    }),
    execute: async (opts: {
      full_page?: boolean;
      ref?: string;
      element?: string;
      clip?: { x: number; y: number; width: number; height: number };
    }) => {
      return session.screenshot(opts);
    },
  };
}

export function makeBrowserSnapshotTool(session: BrowserSession) {
  return {
    description:
      "Get the ARIA accessibility tree of the current page as text. Interactive elements get ref labels (e1, e2, ...) usable in click/type/scroll.",
    parameters: z.object({}),
    execute: async () => {
      const text = await session.snapshot();
      return { snapshot: text };
    },
  };
}

export function makeBrowserClickTool(session: BrowserSession) {
  return {
    description: "Click an element by ref (from snapshot), CSS selector, or x/y coordinates.",
    parameters: z.object({
      ref: z.string().optional().describe("Element ref from snapshot (e.g. e1)"),
      selector: z.string().optional().describe("CSS selector"),
      x: z.number().optional().describe("X coordinate"),
      y: z.number().optional().describe("Y coordinate"),
      double_click: z.boolean().optional().describe("Double-click instead of single"),
    }),
    execute: async (opts: {
      ref?: string;
      selector?: string;
      x?: number;
      y?: number;
      double_click?: boolean;
    }) => {
      await session.click(opts);
      return { clicked: opts.ref ?? opts.selector ?? `(${opts.x},${opts.y})` };
    },
  };
}

export function makeBrowserTypeTool(session: BrowserSession) {
  return {
    description: "Type text into an input element identified by ref or CSS selector.",
    parameters: z.object({
      ref: z.string().optional().describe("Element ref from snapshot"),
      selector: z.string().optional().describe("CSS selector"),
      text: z.string().describe("Text to type"),
      submit: z.boolean().optional().describe("Press Enter after typing"),
    }),
    execute: async (opts: { ref?: string; selector?: string; text: string; submit?: boolean }) => {
      await session.type(opts);
      return { typed: opts.text };
    },
  };
}

export function makeBrowserScrollTool(session: BrowserSession) {
  return {
    description: "Scroll the page or a specific element.",
    parameters: z.object({
      ref: z.string().optional().describe("Element ref to scroll"),
      selector: z.string().optional().describe("CSS selector of element to scroll"),
      direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
      amount: z.number().positive().describe("Pixels to scroll"),
    }),
    execute: async (opts: {
      ref?: string;
      selector?: string;
      direction: "up" | "down" | "left" | "right";
      amount: number;
    }) => {
      await session.scroll(opts);
      return { scrolled: opts.direction, amount: opts.amount };
    },
  };
}

export function makeBrowserEvaluateTool(session: BrowserSession) {
  return {
    description: "Execute JavaScript in the browser page context and return the result.",
    parameters: z.object({
      script: z.string().describe("JavaScript expression to evaluate"),
    }),
    execute: async ({ script }: { script: string }) => {
      const result = await session.evaluate(script);
      return { result };
    },
  };
}

export function makeBrowserWaitTool(session: BrowserSession) {
  return {
    description:
      "Wait for a condition: timeout, selector to appear, text in page, URL match, or load state.",
    parameters: z.object({
      time_ms: z.number().int().positive().optional().describe("Wait N milliseconds"),
      text: z.string().optional().describe("Wait until this text appears in document.body"),
      selector: z.string().optional().describe("Wait until selector is present in DOM"),
      url: z.string().optional().describe("Wait until page URL matches (string or glob)"),
      load_state: z
        .enum(["load", "domcontentloaded", "networkidle"])
        .optional()
        .describe("Wait for load state"),
    }),
    execute: async (opts: {
      time_ms?: number;
      text?: string;
      selector?: string;
      url?: string;
      load_state?: "load" | "domcontentloaded" | "networkidle";
    }) => {
      await session.wait(opts);
      return { waited: true };
    },
  };
}

export function makeBrowserCloseTool(session: BrowserSession) {
  return {
    description: "Close the browser. Use when done browsing to free resources.",
    parameters: z.object({}),
    execute: async () => {
      await session.close();
      return { closed: true };
    },
  };
}

export function makeWebFetchTool() {
  return {
    description:
      "Make an HTTP request and return the response. Text content types (text/*, json, xml, javascript) returned as UTF-8 string; binary as base64.",
    parameters: z.object({
      url: z.string().describe("Request URL"),
      method: z.string().optional().default("GET").describe("HTTP method"),
      headers: z.record(z.string()).optional().describe("Request headers"),
      body: z.string().optional().describe("Request body"),
    }),
    execute: async (opts: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }) => {
      const response = await fetch(opts.url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const isText = /text|json|xml|javascript/.test(contentType);
      const responseBody = isText
        ? await response.text()
        : Buffer.from(await response.arrayBuffer()).toString("base64");
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      return {
        status: response.status,
        content_type: contentType,
        headers: responseHeaders,
        body: responseBody,
        encoding: isText ? "text" : "base64",
      };
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/browser.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/browser/browserTools.ts test/main/browser.test.ts
git commit -m "feat(browser): add browserTools 10 tool factories"
```

---

## Task 4: ToolPresenter — 注入 browserSession，注册 10 个新工具 (TDD)

**Files:**

- Modify: `test/main/toolPresenter.test.ts`
- Modify: `src/main/presenter/toolPresenter.ts`

- [ ] **Step 1: 更新 toolPresenter.test.ts**

将 `test/main/toolPresenter.test.ts` 中所有 `toHaveLength(9)` 改为 `toHaveLength(19)`，描述字符串中的 "10" 改为 "19"，并更新 `arrayContaining` 列表加入新工具名。

找到并替换第一处（describe "should return a ToolSet with all 10 tools"）：

```typescript
it("should return a ToolSet with all 19 tools", () => {
  const tools = tp.getToolSet("s1");
  expect(Object.keys(tools)).toEqual(
    expect.arrayContaining([
      "read",
      "write",
      "edit",
      "exec",
      "ask_user",
      "open",
      "evolution_start",
      "evolution_plan",
      "evolution_complete",
      "browser_navigate",
      "browser_screenshot",
      "browser_snapshot",
      "browser_click",
      "browser_type",
      "browser_scroll",
      "browser_evaluate",
      "browser_wait",
      "browser_close",
      "web_fetch",
    ]),
  );
  expect(Object.keys(tools)).toHaveLength(19);
});
```

同时修改 `beforeEach` 中 `tp = new ToolPresenter(fp, cp, evo)` 的构造调用，需要传入第 4 个参数。在 `beforeEach` 中添加 mock browserSession：

```typescript
beforeEach(() => {
  mkdirSync(testRoot, { recursive: true });
  mockPaths.effectiveProjectRoot = testRoot;
  const fp = new FilePresenter(testRoot);
  const cp = new ContentPresenter();
  const evo = {
    startEvolution: vi.fn().mockReturnValue(true),
    submitPlan: vi.fn().mockReturnValue(true),
    completeEvolution: vi.fn().mockResolvedValue({ success: true, tag: "egg-v0.1-dev.1" }),
    getStatus: vi.fn().mockReturnValue({ stage: "idle" }),
  } as any;
  const mockBrowserSession = {
    navigate: vi.fn().mockResolvedValue("https://example.com"),
    screenshot: vi
      .fn()
      .mockResolvedValue({ base64: "", mimeType: "image/png", width: 0, height: 0 }),
    snapshot: vi.fn().mockResolvedValue("WebArea"),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(null),
    wait: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isActive: vi.fn().mockReturnValue(false),
  } as any;
  tp = new ToolPresenter(fp, cp, evo, mockBrowserSession);
});
```

还需更新第二处 `toHaveLength(9)` 断言（"should include ask_user tool in toolset"）：

```typescript
it("should include ask_user tool in toolset", () => {
  const tools = tp.getToolSet("s1");
  expect(Object.keys(tools)).toContain("ask_user");
  expect(Object.keys(tools)).toHaveLength(19);
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/main/toolPresenter.test.ts
```

Expected: FAIL — ToolPresenter constructor 参数数量不匹配，工具数量仍为 9。

- [ ] **Step 3: 更新 toolPresenter.ts**

在文件顶部 import 区域追加（在 `import { logger, paths }` 之后）：

```typescript
import type { BrowserSession } from "@/browser/browserSession";
import {
  makeBrowserNavigateTool,
  makeBrowserScreenshotTool,
  makeBrowserSnapshotTool,
  makeBrowserClickTool,
  makeBrowserTypeTool,
  makeBrowserScrollTool,
  makeBrowserEvaluateTool,
  makeBrowserWaitTool,
  makeBrowserCloseTool,
  makeWebFetchTool,
} from "@/browser/browserTools";
```

修改构造函数，添加第 4 个参数：

```typescript
constructor(
  private filePresenter: FilePresenter,
  private contentPresenter: ContentPresenter,
  private evolutionPresenter: EvolutionPresenter,
  private browserSession: BrowserSession,
) {}
```

在 `getToolSet()` 中，现有 9 个工具定义之后（`evolution_complete` 工具闭合 `}),` 之后）追加：

```typescript
      browser_navigate: createTool(makeBrowserNavigateTool(this.browserSession)),
      browser_screenshot: createTool(makeBrowserScreenshotTool(this.browserSession)),
      browser_snapshot: createTool(makeBrowserSnapshotTool(this.browserSession)),
      browser_click: createTool(makeBrowserClickTool(this.browserSession)),
      browser_type: createTool(makeBrowserTypeTool(this.browserSession)),
      browser_scroll: createTool(makeBrowserScrollTool(this.browserSession)),
      browser_evaluate: createTool(makeBrowserEvaluateTool(this.browserSession)),
      browser_wait: createTool(makeBrowserWaitTool(this.browserSession)),
      browser_close: createTool(makeBrowserCloseTool(this.browserSession)),
      web_fetch: createTool(makeWebFetchTool()),
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/toolPresenter.test.ts
```

Expected: 所有断言 PASS，工具数量为 19。

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/toolPresenter.ts test/main/toolPresenter.test.ts
git commit -m "feat(tools): register 10 browser+web_fetch tools in ToolPresenter"
```

---

## Task 5: 更新 index.ts，注入 browserSession，destroy 时关闭

**Files:**

- Modify: `src/main/presenter/index.ts`

- [ ] **Step 1: 更新 index.ts**

在 import 区域追加（`import { logger, paths }` 之后）：

```typescript
import { browserSession } from "@/browser/browserSession";
```

将 `this.toolPresenter = new ToolPresenter(...)` 改为：

```typescript
this.toolPresenter = new ToolPresenter(
  this.filePresenter,
  this.contentPresenter,
  this.evolutionPresenter,
  browserSession,
);
```

在 `destroy()` 方法中，`await this.gatewayPresenter.destroy()` 之前追加：

```typescript
await browserSession.close();
```

完整修改后的 `destroy()` 方法：

```typescript
async destroy(): Promise<void> {
  await browserSession.close()
  await this.gatewayPresenter.destroy()
  logger.info('Presenter destroyed')
}
```

- [ ] **Step 2: 运行完整测试套件**

```bash
pnpm test
```

Expected: 所有测试通过（忽略 pre-existing statsDao 失败，与本次变更无关）。

- [ ] **Step 3: 格式化 + Lint**

```bash
pnpm run format && pnpm run lint
```

Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/index.ts
git commit -m "feat(agent): inject browserSession into ToolPresenter + close on destroy"
```

---

## 自检结果

**Spec 覆盖：**

- ✅ BrowserSession 单例 + 懒初始化 + idle timer（Task 2）
- ✅ refMap（e1/e2/...）+ navigate 时清空（Task 2）
- ✅ screenshot 5 种分支（Task 2 测试，Task 3 工具）
- ✅ 10 个新工具（Task 3 browserTools.ts）
- ✅ web_fetch 文本/二进制分支（Task 3 测试）
- ✅ package.json playwright-core + postinstall（Task 1）
- ✅ ToolPresenter 构造第 4 参数 + 注册工具（Task 4）
- ✅ index.ts 注入 + destroy 关闭（Task 5）
- ✅ 测试工具数量从 9 → 19（Task 4）

**注意事项（来自原始计划）：**

- `page.accessibility.snapshot()` 已 deprecated，代码注释已说明
- screenshot 返回 base64 但 AI SDK v6 tool-result 暂不支持图片；Agent 应优先用 snapshot() 理解页面
