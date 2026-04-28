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
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn().mockReturnThis(),
      getAttribute: vi.fn().mockResolvedValue("Submit"),
      textContent: vi.fn().mockResolvedValue("Submit"),
    };
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://example.com"),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("screenshot")),
      ariaSnapshot: vi
        .fn()
        .mockResolvedValue('- button "Submit" [ref=e1]\n- textbox "Email" [ref=e2]'),
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
    // ref table appended at end
    expect(text).toContain("# Interactive element refs");
    expect(text).toContain("e1:");
    // ariaSnapshot content also present
    expect(text).toContain("button");
    expect(mockPage.getByRole).toHaveBeenCalled();
  });

  it("snapshot() assigns refs only to interactive roles", async () => {
    await session.navigate("https://example.com");
    await session.snapshot();
    // e1 should be populated from getByRole mock (count=1 per role)
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
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
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
