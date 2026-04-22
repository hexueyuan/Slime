import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBlockError from "@/components/message/MessageBlockError.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockError", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "error",
    content: "API rate limit exceeded",
    status: "error",
    timestamp: Date.now(),
    ...overrides,
  });

  it("should render error message", () => {
    const wrapper = mount(MessageBlockError, {
      props: { block: makeBlock() },
    });
    expect(wrapper.text()).toContain("API rate limit exceeded");
  });

  it("should have red styling", () => {
    const wrapper = mount(MessageBlockError, {
      props: { block: makeBlock() },
    });
    expect(wrapper.find(".border-red-500").exists()).toBe(true);
  });

  it("should render cancel state with muted style", () => {
    const wrapper = mount(MessageBlockError, {
      props: { block: makeBlock({ status: "cancel", content: "已取消" }) },
    });
    expect(wrapper.find(".text-muted-foreground").exists()).toBe(true);
    expect(wrapper.text()).toContain("已取消");
  });
});
