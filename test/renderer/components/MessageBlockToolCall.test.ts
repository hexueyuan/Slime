import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBlockToolCall from "@/components/message/MessageBlockToolCall.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockToolCall", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "tool_call",
    id: "tc-1",
    content: "",
    status: "success",
    timestamp: Date.now(),
    tool_call: { name: "search", params: '{"query":"hello"}', response: '{"result":"found"}' },
    ...overrides,
  });

  it("should render tool name", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    expect(wrapper.text()).toContain("search");
  });

  it("should show loading spinner when status is loading", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock({ status: "loading" }) },
    });
    expect(wrapper.find(".animate-spin").exists()).toBe(true);
  });

  it("should show success icon when status is success", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    expect(wrapper.find('[data-testid="tool-status-success"]').exists()).toBe(true);
  });

  it("should emit select-tool-call on click", async () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    await wrapper.find('[data-testid="tool-call-toggle"]').trigger("click");
    expect(wrapper.emitted("select-tool-call")).toBeTruthy();
    expect(wrapper.emitted("select-tool-call")![0]).toEqual(["tc-1"]);
  });

  it("should not expand params on click", async () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    await wrapper.find('[data-testid="tool-call-toggle"]').trigger("click");
    expect(wrapper.text()).not.toContain('"query"');
  });

  it("should highlight when selected", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock(), selectedToolCallId: "tc-1" },
    });
    expect(wrapper.find('[data-testid="tool-call-toggle"]').classes()).toContain("border-primary");
  });

  it("should not highlight when different id selected", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock(), selectedToolCallId: "tc-other" },
    });
    expect(wrapper.find('[data-testid="tool-call-toggle"]').classes()).not.toContain(
      "border-primary",
    );
  });
});
