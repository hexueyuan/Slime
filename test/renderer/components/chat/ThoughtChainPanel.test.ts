import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("@iconify/vue", () => ({ Icon: { template: "<span />" } }));

import ThoughtChainPanel from "@/components/chat/ThoughtChainPanel.vue";
import type { AssistantMessageBlock } from "@shared/types/agent";

function makeContentBlock(content: string): AssistantMessageBlock {
  return { type: "content", content, status: "success", timestamp: 1 };
}

function makeToolBlock(id: string, name: string): AssistantMessageBlock {
  return {
    id,
    type: "tool_call",
    status: "success",
    timestamp: 1,
    tool_call: { id, name, input: {}, output: "ok" },
  };
}

describe("ThoughtChainPanel", () => {
  it("renders a content step", () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: { blocks: [makeContentBlock("let me check")] },
    });
    expect(wrapper.text()).toContain("let me check");
    expect(wrapper.text()).toContain("1");
  });

  it("renders a tool_call step", () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: { blocks: [makeToolBlock("tc1", "exec")] },
    });
    expect(wrapper.text()).toContain("exec");
  });

  it("emits select-tool-call when tool step clicked", async () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: { blocks: [makeToolBlock("tc1", "exec")] },
    });
    await wrapper.find('[data-testid="tool-step-tc1"]').trigger("click");
    expect(wrapper.emitted("select-tool-call")?.[0]).toEqual(["tc1"]);
  });

  it("renders multiple steps in order", () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: {
        blocks: [
          makeContentBlock("thinking"),
          makeToolBlock("tc2", "read"),
          makeContentBlock("done"),
        ],
      },
    });
    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("3");
  });

  it("highlights selected tool call", () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: {
        blocks: [makeToolBlock("tc1", "exec")],
        selectedToolCallId: "tc1",
      },
    });
    expect(wrapper.find('[data-testid="tool-step-tc1"]').classes()).toContain(
      "border-violet-500/60",
    );
  });
});
