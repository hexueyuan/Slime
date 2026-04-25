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

  it("shows rollback button on all non-archived items", async () => {
    const wrapper = mount(HistoryPanel);
    await flushPromises();
    const items = wrapper.findAll('[data-testid="history-item"]');
    expect(items[0].find('[data-testid="rollback-btn"]').exists()).toBe(true);
    expect(items[1].find('[data-testid="rollback-btn"]').exists()).toBe(true);
  });

  it("shows confirm dialog with dep check and executes rollback", async () => {
    const wrapper = mount(HistoryPanel, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    await wrapper
      .findAll('[data-testid="history-item"]')[1]
      .find('[data-testid="rollback-btn"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="rollback-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("确认回滚");
    expect(wrapper.text()).toContain("egg-v0.1-dev.1");

    await wrapper.find('[data-testid="rollback-confirm-btn"]').trigger("click");
    await flushPromises();

    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      "rollback:start",
      "egg-v0.1-dev.1",
    );
  });

  it("renders archived nodes with badge and no rollback button", async () => {
    mockGetHistory.mockResolvedValue(NODES_WITH_ARCHIVED);
    const wrapper = mount(HistoryPanel);
    await flushPromises();

    const items = wrapper.findAll('[data-testid="history-item"]');
    expect(items[1].find('[data-testid="archived-badge"]').exists()).toBe(true);
    expect(items[1].text()).toContain("已归档");
    // Archived node has opacity-50
    expect(items[1].classes()).toContain("opacity-50");
    // No rollback button on archived node
    expect(items[1].find('[data-testid="rollback-btn"]').exists()).toBe(false);
  });

  it("shows dependency warning in dialog", async () => {
    mockCheckDeps.mockResolvedValue({
      dependencies: [
        { tag: "egg-v0.1-dev.2", summary: "新增时钟", overlappingFiles: ["src/a.ts"] },
      ],
      affected: [],
      hasArchive: true,
    });

    const wrapper = mount(HistoryPanel, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    await wrapper
      .findAll('[data-testid="history-item"]')[1]
      .find('[data-testid="rollback-btn"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="dep-item"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("以下进化可能受到影响");
  });

  it("shows no-archive message for old versions", async () => {
    mockCheckDeps.mockResolvedValue({
      dependencies: [],
      affected: [],
      hasArchive: false,
    });

    const wrapper = mount(HistoryPanel, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    await wrapper
      .findAll('[data-testid="history-item"]')[1]
      .find('[data-testid="rollback-btn"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="no-archive-msg"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("此版本无进化档案，不支持语义回滚");
    // Confirm button should not exist
    expect(wrapper.find('[data-testid="rollback-confirm-btn"]').exists()).toBe(false);
  });
});
