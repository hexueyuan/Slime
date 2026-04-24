import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import FunctionPanel from "@/components/function/FunctionPanel.vue";

describe("FunctionPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should show workflow tab by default", () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: "workflow", toolCallBlocks: [] },
    });
    expect(wrapper.text()).toContain("在对话中开始进化");
  });

  it("should show tool panel when activeTab is tools", () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: "tools", toolCallBlocks: [] },
    });
    expect(wrapper.text()).toContain("暂无工具调用");
  });

  it("should emit update:activeTab on tab click", async () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: "workflow", toolCallBlocks: [] },
    });
    await wrapper.find('[data-testid="tab-tools"]').trigger("click");
    expect(wrapper.emitted("update:activeTab")).toBeTruthy();
    expect(wrapper.emitted("update:activeTab")![0]).toEqual(["tools"]);
  });

  it("should show preview tab and emit update:activeTab", async () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: "workflow", toolCallBlocks: [] },
    });
    const previewTab = wrapper.find('[data-testid="tab-preview"]');
    expect(previewTab.exists()).toBe(true);
    await previewTab.trigger("click");
    expect(wrapper.emitted("update:activeTab")).toBeTruthy();
    expect(wrapper.emitted("update:activeTab")![0]).toEqual(["preview"]);
  });

  it("should show ContentDispatcher when activeTab is preview", () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: "preview", toolCallBlocks: [] },
    });
    expect(wrapper.text()).toContain("暂无预览内容");
  });
});
