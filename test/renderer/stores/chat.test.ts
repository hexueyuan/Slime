import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useChatStore } from "@/stores/chat";

describe("chatStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should start with empty messages", () => {
    const store = useChatStore();
    expect(store.messages).toEqual([]);
    expect(store.isLoading).toBe(false);
  });

  it("should add a message", () => {
    const store = useChatStore();
    store.addMessage({ role: "user", content: "hello" });
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].role).toBe("user");
    expect(store.messages[0].content).toBe("hello");
    expect(store.messages[0].id).toBeDefined();
    expect(store.messages[0].timestamp).toBeGreaterThan(0);
  });

  it("should compute lastMessage", () => {
    const store = useChatStore();
    store.addMessage({ role: "user", content: "first" });
    store.addMessage({ role: "assistant", content: "second" });
    expect(store.lastMessage?.content).toBe("second");
  });

  it("should clear messages", () => {
    const store = useChatStore();
    store.addMessage({ role: "user", content: "hello" });
    store.clearMessages();
    expect(store.messages).toEqual([]);
  });
});
