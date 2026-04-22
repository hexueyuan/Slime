import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-node-renderer">{{ content }}</div>',
  },
}));

import MessageBlockReasoning from "@/components/message/MessageBlockReasoning.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockReasoning", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "reasoning_content",
    content: "thinking about the problem...",
    status: "success",
    timestamp: Date.now(),
    reasoning_time: { start: 1000, end: 4500 },
    ...overrides,
  });

  it("should render collapsed by default with duration", () => {
    const wrapper = mount(MessageBlockReasoning, {
      props: { block: makeBlock() },
    });
    expect(wrapper.text()).toContain("3.5");
    expect(wrapper.find(".mock-node-renderer").exists()).toBe(false);
  });

  it("should expand on click to show content", async () => {
    const wrapper = mount(MessageBlockReasoning, {
      props: { block: makeBlock() },
    });
    await wrapper.find('[data-testid="reasoning-toggle"]').trigger("click");
    expect(wrapper.find(".mock-node-renderer").exists()).toBe(true);
    expect(wrapper.text()).toContain("thinking about the problem...");
  });

  it("should show loading state with pulse animation", () => {
    const wrapper = mount(MessageBlockReasoning, {
      props: {
        block: makeBlock({ status: "loading", reasoning_time: { start: Date.now(), end: 0 } }),
      },
    });
    expect(wrapper.find(".animate-pulse").exists()).toBe(true);
  });
});
