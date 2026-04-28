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
