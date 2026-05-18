import { nextTick } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";

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

const cleanupListener = vi.fn();
const wrappers: VueWrapper[] = [];

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => cleanupListener),
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

function mountLogTab() {
  const wrapper = mount(LogTab, { attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

describe("LogTab first paint behavior", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    invoke.mockClear();
    cleanupListener.mockClear();
  });

  afterEach(() => {
    while (wrappers.length) {
      wrappers.pop()?.unmount();
    }
    vi.useRealTimers();
  });

  it("首次加载使用较小分页，减少日志页首屏渲染量", async () => {
    vi.useFakeTimers();
    mountLogTab();

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
    const wrapper = mountLogTab();

    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
    await nextTick();

    const scrollport = wrapper.find('[data-testid="log-scrollport"]');
    const header = wrapper.find('[data-testid="log-scrollport"] [data-testid="log-header"]');
    const rows = wrapper.findAll('[data-testid="log-scrollport"] [data-testid="log-row"]');

    expect(scrollport.exists()).toBe(true);
    expect(header.exists()).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].attributes("data-layout")).toBe("responsive-grid");
  });
});
