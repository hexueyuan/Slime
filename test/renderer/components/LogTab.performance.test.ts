import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const invoke = vi.fn(async () => []);

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
    vi.useRealTimers();
  });
});
