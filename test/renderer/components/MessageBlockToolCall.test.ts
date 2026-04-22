import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBlockToolCall from "@/components/message/MessageBlockToolCall.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockToolCall", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "tool_call",
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

  it("should expand to show params on click", async () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    await wrapper.find('[data-testid="tool-call-toggle"]').trigger("click");
    expect(wrapper.text()).toContain('"query"');
    expect(wrapper.text()).toContain('"hello"');
  });
});
