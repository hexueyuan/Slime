import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolPanel from "@/components/function/ToolPanel.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const makeToolBlock = (name: string, id: string): AssistantMessageBlock => ({
  type: "tool_call",
  id,
  content: "",
  status: "success",
  timestamp: Date.now(),
  tool_call: { name, params: '{"command":"ls"}', response: '{"stdout":"file.ts"}' },
});

describe("ToolPanel", () => {
  it("should show empty state when no blocks", () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [] },
    });
    expect(wrapper.text()).toContain("暂无工具调用");
  });

  it("should show list of tool calls", () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock("exec", "tc-1"), makeToolBlock("read", "tc-2")] },
    });
    expect(wrapper.text()).toContain("exec");
    expect(wrapper.text()).toContain("read");
  });

  it("should show detail view when selectedId matches", () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock("exec", "tc-1")], selectedId: "tc-1" },
    });
    expect(wrapper.find('[data-testid="tool-detail"]').exists()).toBe(true);
  });

  it("should emit select on list item click", async () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock("exec", "tc-1")] },
    });
    await wrapper.find('[data-testid="tool-list-item"]').trigger("click");
    expect(wrapper.emitted("select")).toBeTruthy();
    expect(wrapper.emitted("select")![0]).toEqual(["tc-1"]);
  });

  it("should emit back on back button click", async () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock("exec", "tc-1")], selectedId: "tc-1" },
    });
    await wrapper.find('[data-testid="tool-detail-back"]').trigger("click");
    expect(wrapper.emitted("back")).toBeTruthy();
  });
});
