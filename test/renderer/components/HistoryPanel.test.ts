import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import HistoryPanel from "@/components/function/HistoryPanel.vue";

const mockGetHistory = vi.fn();
const mockCheckDeps = vi.fn();

vi.mock("@/composables/usePresenter", () => ({
  usePresenter: (name: string) => {
    if (name === "evolutionPresenter") {
      return { getHistory: mockGetHistory };
    }
    return new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) });
  },
}));

const ipcInvoke = vi.fn().mockImplementation((channel: string) => {
  if (channel === "rollback:check-deps") {
    return mockCheckDeps();
  }
  if (channel === "rollback:start") {
    return Promise.resolve({ success: true });
  }
  return Promise.resolve({});
});

(window as any).electron = {
  ipcRenderer: {
    invoke: ipcInvoke,
    on: vi.fn().mockReturnValue(() => {}),
    removeAllListeners: vi.fn(),
  },
};

const TWO_NODES = [
  {
    id: "egg-v0.1-dev.2",
    tag: "egg-v0.1-dev.2",
    description: "新增赛博时钟",
    request: "添加时钟功能",
    changes: ["src/Clock.vue"],
    createdAt: "2026-04-24",
    gitRef: "egg-v0.1-dev.2",
    parent: "egg-v0.1-dev.1",
  },
  {
    id: "egg-v0.1-dev.1",
    tag: "egg-v0.1-dev.1",
    description: "缩小字体",
    request: "缩小字体",
    changes: [],
    createdAt: "2026-04-24",
    gitRef: "egg-v0.1-dev.1",
  },
];

const NODES_WITH_ARCHIVED = [
  {
    id: "egg-v0.1-dev.2",
    tag: "egg-v0.1-dev.2",
    description: "新增赛博时钟",
    request: "添加时钟功能",
    changes: ["src/Clock.vue"],
    createdAt: "2026-04-24",
    gitRef: "egg-v0.1-dev.2",
    parent: "egg-v0.1-dev.1",
  },
  {
    id: "egg-v0.1-dev.1",
    tag: "egg-v0.1-dev.1",
    description: "缩小字体",
    request: "缩小字体",
    changes: [],
    createdAt: "2026-04-24",
    gitRef: "egg-v0.1-dev.1",
    archived: true,
  },
];

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mockGetHistory.mockResolvedValue(TWO_NODES);
    mockCheckDeps.mockResolvedValue({ dependencies: [], affected: [], hasArchive: true });
    ipcInvoke.mockImplementation((channel: string) => {
      if (channel === "rollback:check-deps") {
        return mockCheckDeps();
      }
      if (channel === "rollback:start") {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({});
    });
    (window as any).electron.ipcRenderer.on = vi.fn().mockReturnValue(() => {});
  });

  it("renders version list after loading", async () => {
    const wrapper = mount(HistoryPanel);
    await flushPromises();
    const items = wrapper.findAll('[data-testid="history-item"]');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("egg-v0.1-dev.2");
    expect(items[0].text()).toContain("添加时钟功能");
    expect(items[0].text()).toContain("当前");
  });
});
