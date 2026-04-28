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
    // e1=button Submit, clicking e1 should use the locator
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

  it("scroll() calls window.scrollBy when no ref/selector (down)", async () => {
    await session.navigate("https://example.com");
    await session.scroll({ direction: "down", amount: 300 });
    expect(mockPage.evaluate).toHaveBeenCalled();
  });

  it("scroll() calls element scrollBy when ref given", async () => {
    await session.navigate("https://example.com");
    await session.snapshot(); // populate refs
    await session.scroll({ ref: "e1", direction: "up", amount: 100 });
    expect(mockLocator.evaluate).toHaveBeenCalled();
  });

  it("screenshot({ element }) calls locator.screenshot() by CSS selector", async () => {
    await session.navigate("https://example.com");
    await session.screenshot({ element: "#hero" });
    expect(mockPage.locator).toHaveBeenCalledWith("#hero");
  });

  it("click({ selector }) clicks by CSS selector", async () => {
    await session.navigate("https://example.com");
    await session.click({ selector: "#submit-btn" });
    expect(mockPage.locator).toHaveBeenCalledWith("#submit-btn");
    expect(mockLocator.click).toHaveBeenCalled();
  });

  it("click({ double_click: true }) calls dblclick", async () => {
    await session.navigate("https://example.com");
    await session.snapshot();
    await session.click({ ref: "e1", double_click: true });
    expect(mockLocator.dblclick).toHaveBeenCalled();
  });

  it("type({ selector }) fills by CSS selector", async () => {
    await session.navigate("https://example.com");
    await session.type({ selector: "input[name=email]", text: "test@test.com" });
    expect(mockPage.locator).toHaveBeenCalledWith("input[name=email]");
    expect(mockLocator.fill).toHaveBeenCalledWith("test@test.com");
  });

  it("type() does not press Enter when submit=false", async () => {
    await session.navigate("https://example.com");
    await session.snapshot();
    await session.type({ ref: "e2", text: "no-submit" });
    expect(mockLocator.fill).toHaveBeenCalledWith("no-submit");
    expect(mockLocator.press).not.toHaveBeenCalled();
  });

  it("wait({ text }) calls page.waitForFunction", async () => {
    await session.navigate("https://example.com");
    await session.wait({ text: "Loading complete" });
    expect(mockPage.waitForFunction).toHaveBeenCalled();
  });

  it("wait({ url }) calls page.waitForURL", async () => {
    await session.navigate("https://example.com");
    await session.wait({ url: "https://example.com/done" });
    expect(mockPage.waitForURL).toHaveBeenCalledWith("https://example.com/done");
  });

  it("wait({ load_state }) calls page.waitForLoadState", async () => {
    await session.navigate("https://example.com");
    await session.wait({ load_state: "networkidle" });
    expect(mockPage.waitForLoadState).toHaveBeenCalledWith("networkidle");
  });

  it("click({ selector, double_click: true }) calls dblclick by selector", async () => {
    await session.navigate("https://example.com");
    await session.click({ selector: ".card", double_click: true });
    expect(mockPage.locator).toHaveBeenCalledWith(".card");
    expect(mockLocator.dblclick).toHaveBeenCalled();
  });

  it("scroll({ selector }) calls element scrollBy by selector", async () => {
    await session.navigate("https://example.com");
    await session.scroll({ selector: ".list", direction: "down", amount: 200 });
    expect(mockPage.locator).toHaveBeenCalledWith(".list");
    expect(mockLocator.evaluate).toHaveBeenCalled();
  });
});
