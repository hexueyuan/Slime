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
});
