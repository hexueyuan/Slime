import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import HistoryPanel from "@/components/function/HistoryPanel.vue";

const mockGetHistory = vi.fn();
const mockRollback = vi.fn();

vi.mock("@/composables/usePresenter", () => ({
  usePresenter: (name: string) => {
    if (name === "evolutionPresenter") {
      return { getHistory: mockGetHistory, rollback: mockRollback };
    }
    return new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) });
  },
}));
(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
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

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mockGetHistory.mockResolvedValue(TWO_NODES);
    mockRollback.mockResolvedValue(true);
  });

  it("shows loading state initially", () => {
    mockGetHistory.mockReturnValue(new Promise(() => {})); // never resolves
    const wrapper = mount(HistoryPanel);
    expect(wrapper.find('[data-testid="history-loading"]').exists()).toBe(true);
  });

  it("shows empty state when no history", async () => {
    mockGetHistory.mockResolvedValue([]);
    const wrapper = mount(HistoryPanel);
    await flushPromises();
    expect(wrapper.find('[data-testid="history-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("还没有进化记录");
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

  it("shows rollback button on non-current items", async () => {
    const wrapper = mount(HistoryPanel);
    await flushPromises();
    const items = wrapper.findAll('[data-testid="history-item"]');
    expect(items[0].find('[data-testid="rollback-btn"]').exists()).toBe(false);
    expect(items[1].find('[data-testid="rollback-btn"]').exists()).toBe(true);
  });

  it("shows confirm dialog and executes rollback", async () => {
    const wrapper = mount(HistoryPanel, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    await wrapper
      .findAll('[data-testid="history-item"]')[1]
      .find('[data-testid="rollback-btn"]')
      .trigger("click");

    expect(wrapper.find('[data-testid="rollback-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("确认回滚");
    expect(wrapper.text()).toContain("egg-v0.1-dev.1");

    await wrapper.find('[data-testid="rollback-confirm-btn"]').trigger("click");
    await flushPromises();

    expect(mockRollback).toHaveBeenCalledWith("egg-v0.1-dev.1");
    expect(mockGetHistory).toHaveBeenCalledTimes(2); // initial + after rollback
  });
});
