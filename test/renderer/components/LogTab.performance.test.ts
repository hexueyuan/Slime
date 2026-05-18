import { nextTick } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";

const mockLogs = [
  {
    id: 1,
    groupName: "default",
    channelName: "Anthropic",
    apiKeyName: "primary",
    modelName: "claude-3-5-sonnet",
    inputTokens: 120,
    outputTokens: 80,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.0042,
    durationMs: 840,
    ttftMs: 120,
    status: "success" as const,
    createdAt: "2026-05-18T10:00:00.000Z",
  },
];

const invoke = vi.fn(async (_channel: string, _presenter: string, method: string) => {
  if (method === "getRecentLogs") return mockLogs;
  return [];
});

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@/components/ModelIcon.vue", () => ({
  default: { template: "<span />", props: ["modelName", "size"] },
}));

vi.mock("@/components/gateway/JsonViewer.vue", () => ({
  default: { template: "<pre />", props: ["data"] },
}));

import LogTab from "@/components/gateway/LogTab.vue";

describe("LogTab first paint behavior", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    invoke.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("首次加载使用较小分页，减少日志页首屏渲染量", async () => {
    vi.useFakeTimers();
    mount(LogTab, { attachTo: document.body });

    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledWith(
      "presenter:call",
      "gatewayPresenter",
      "getRecentLogs",
      20,
      0,
    );
  });

  it("renders logs in responsive grid rows without fixed width table columns", async () => {
    vi.useFakeTimers();
    const wrapper = mount(LogTab, { attachTo: document.body });

    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
    await nextTick();

    const rows = wrapper.findAll('[data-testid="log-row"]');

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].attributes("data-layout")).toBe("responsive-grid");
  });
});
