import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-node-renderer">{{ content }}</div>',
  },
}));

import MessageItemAssistant from "@/components/message/MessageItemAssistant.vue";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/chat";

describe("MessageItemAssistant", () => {
  const makeMessage = (blocks: AssistantMessageBlock[]): ChatMessageRecord => ({
    id: "msg-1",
    sessionId: "s1",
    role: "assistant",
    content: JSON.stringify(blocks),
    status: "sent",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it("should render content block text", () => {
    const blocks: AssistantMessageBlock[] = [
      { type: "content", content: "Hello from AI", status: "success", timestamp: Date.now() },
    ];
    const wrapper = mount(MessageItemAssistant, {
      props: { message: makeMessage(blocks) },
    });
    expect(wrapper.text()).toContain("Hello from AI");
  });

  it("should render streaming blocks when provided", () => {
    const streamBlocks: AssistantMessageBlock[] = [
      { type: "content", content: "Streaming...", status: "loading", timestamp: Date.now() },
    ];
    const wrapper = mount(MessageItemAssistant, {
      props: {
        message: makeMessage([]),
        streamingBlocks: streamBlocks,
      },
    });
    expect(wrapper.text()).toContain("Streaming...");
  });

  it("should have left-aligned layout", () => {
    const blocks: AssistantMessageBlock[] = [
      { type: "content", content: "test", status: "success", timestamp: Date.now() },
    ];
    const wrapper = mount(MessageItemAssistant, {
      props: { message: makeMessage(blocks) },
    });
    expect(wrapper.find(".flex.flex-col").exists()).toBe(true);
  });

  it("should render reasoning block", () => {
    const blocks: AssistantMessageBlock[] = [
      {
        type: "reasoning_content",
        content: "thinking...",
        status: "success",
        timestamp: Date.now(),
        reasoning_time: { start: 1000, end: 3000 },
      },
    ];
    const wrapper = mount(MessageItemAssistant, {
      props: { message: makeMessage(blocks) },
    });
    expect(wrapper.find('[data-testid="reasoning-toggle"]').exists()).toBe(true);
  });

  it("should render error block", () => {
    const blocks: AssistantMessageBlock[] = [
      { type: "error", content: "Something went wrong", status: "error", timestamp: Date.now() },
    ];
    const wrapper = mount(MessageItemAssistant, {
      props: { message: makeMessage(blocks) },
    });
    expect(wrapper.text()).toContain("Something went wrong");
  });

  it("should render toolbar on hover", () => {
    const blocks: AssistantMessageBlock[] = [
      { type: "content", content: "hello", status: "success", timestamp: Date.now() },
    ];
    const wrapper = mount(MessageItemAssistant, {
      props: { message: makeMessage(blocks) },
    });
    expect(wrapper.find('[data-testid="toolbar-copy"]').exists()).toBe(true);
  });
});
