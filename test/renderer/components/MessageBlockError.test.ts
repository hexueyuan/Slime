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
});
