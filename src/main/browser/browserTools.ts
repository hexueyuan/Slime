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
      "Take a screenshot. Returns base64 PNG. Note: AI cannot view images in current tool-result format; use browser_snapshot to understand page structure instead.",
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
      "Get the ARIA accessibility tree of the current page as text. Interactive elements get ref labels (e1, e2, ...) usable in browser_click/browser_type/browser_scroll.",
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
        : Buffer.from(new Uint8Array(await response.arrayBuffer())).toString("base64");
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
