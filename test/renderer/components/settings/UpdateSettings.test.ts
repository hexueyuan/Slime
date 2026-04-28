import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const mockInvoke = vi.fn();
(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import UpdateSettings from "@/components/settings/UpdateSettings.vue";

describe("UpdateSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (_channel: string, _name: string, method: string) => {
      if (method === "getVersion") return "0.3.0";
      return null;
    });
  });

  it("displays current version", async () => {
    const wrapper = mount(UpdateSettings);
    await flushPromises();
    expect(wrapper.text()).toContain("0.3.0");
  });

  it("button is disabled in test env (import.meta.env.PROD=false)", async () => {
    const wrapper = mount(UpdateSettings);
    await flushPromises();
    const btn = wrapper.find("button");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("shows error when applyLocalZip returns error", async () => {
    mockInvoke.mockImplementation(async (_channel: string, _name: string, method: string) => {
      if (method === "getVersion") return "0.3.0";
      if (method === "selectLocalZip") return "/fake/slime.zip";
      if (method === "applyLocalZip") {
        return { success: false, error: "安装包内未找到 .app 文件" };
      }
      return null;
    });
    const wrapper = mount(UpdateSettings, { props: { forceEnabled: true } });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("安装包内未找到 .app 文件");
  });

  it("button shows loading state while applying", async () => {
    let resolveApply!: (v: unknown) => void;
    mockInvoke.mockImplementation(async (_channel: string, _name: string, method: string) => {
      if (method === "getVersion") return "0.3.0";
      if (method === "selectLocalZip") return "/fake/slime.zip";
      if (method === "applyLocalZip") return new Promise((r) => (resolveApply = r));
      return null;
    });
    const wrapper = mount(UpdateSettings, { props: { forceEnabled: true } });
    await flushPromises();
    wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.find("button").text()).toContain("安装中");
    resolveApply({ success: true });
  });
});
