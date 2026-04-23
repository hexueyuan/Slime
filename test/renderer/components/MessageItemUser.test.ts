import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageItemUser from "@/components/message/MessageItemUser.vue";
import type { ChatMessageRecord } from "@shared/types/chat";

describe("MessageItemUser", () => {
  const makeMessage = (text: string): ChatMessageRecord => ({
    id: "msg-1",
    sessionId: "s1",
    role: "user",
    content: JSON.stringify({ text, files: [] }),
    status: "sent",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it("should render user message text", () => {
    const wrapper = mount(MessageItemUser, {
      props: { message: makeMessage("Hello world") },
    });
    expect(wrapper.text()).toContain("Hello world");
  });

  it("should have right-aligned layout", () => {
    const wrapper = mount(MessageItemUser, {
      props: { message: makeMessage("test") },
    });
    expect(wrapper.find(".flex-row-reverse").exists()).toBe(true);
  });

  it("should have bubble styling", () => {
    const wrapper = mount(MessageItemUser, {
      props: { message: makeMessage("test") },
    });
    expect(wrapper.find(".rounded-md").exists()).toBe(true);
  });
});
