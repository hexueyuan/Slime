import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-node-renderer">{{ content }}</div>',
  },
}));

import MessageList from "@/components/chat/MessageList.vue";
import type { ChatMessageRecord } from "@shared/types/chat";

describe("MessageList", () => {
  const userMsg: ChatMessageRecord = {
    id: "m1",
    sessionId: "s1",
    role: "user",
    content: JSON.stringify({ text: "Hello", files: [] }),
    status: "sent",
    createdAt: 1,
    updatedAt: 1,
  };

  const assistantMsg: ChatMessageRecord = {
    id: "m2",
    sessionId: "s1",
    role: "assistant",
    content: JSON.stringify([
      { type: "content", content: "Hi there", status: "success", timestamp: 1 },
    ]),
    status: "sent",
    createdAt: 2,
    updatedAt: 2,
  };

  it("should render user and assistant messages", () => {
    const wrapper = mount(MessageList, {
      props: {
        messages: [userMsg, assistantMsg],
        streamingBlocks: [],
        currentStreamMessageId: null,
      },
    });
    expect(wrapper.text()).toContain("Hello");
    expect(wrapper.text()).toContain("Hi there");
  });

  it("should render empty state when no messages", () => {
    const wrapper = mount(MessageList, {
      props: {
        messages: [],
        streamingBlocks: [],
        currentStreamMessageId: null,
      },
    });
    expect(wrapper.find(".space-y-1").exists()).toBe(true);
  });
});
