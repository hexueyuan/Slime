import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import FunctionPanel from "@/components/function/FunctionPanel.vue";

describe("FunctionPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it("should emit update:activeTab on tab click", async () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: "tools", toolCallBlocks: [] },
    });
    await wrapper.find('[data-testid="tab-preview"]').trigger("click");
    expect(wrapper.emitted("update:activeTab")).toBeTruthy();
    expect(wrapper.emitted("update:activeTab")![0]).toEqual(["preview"]);
  });
  it("should emit update:activeTab with history on tab click", async () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: "tools", toolCallBlocks: [] },
    });
    await wrapper.find('[data-testid="tab-history"]').trigger("click");
    expect(wrapper.emitted("update:activeTab")).toBeTruthy();
    expect(wrapper.emitted("update:activeTab")![0]).toEqual(["history"]);
  });
});
