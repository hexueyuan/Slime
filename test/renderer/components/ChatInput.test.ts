import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatInput from "@/components/chat/ChatInput.vue";

describe("ChatInput", () => {
  it("should render textarea", () => {
    const wrapper = mount(ChatInput, {
      props: { isStreaming: false },
    });
    expect(wrapper.find("textarea").exists()).toBe(true);
  });

  it("should emit submit on Enter", async () => {
    const wrapper = mount(ChatInput, {
      props: { isStreaming: false },
    });
    const textarea = wrapper.find("textarea");
    await textarea.setValue("hello");
    await textarea.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("submit")).toBeTruthy();
    expect(wrapper.emitted("submit")![0]).toEqual(["hello"]);
  });

  it("should not submit on Shift+Enter", async () => {
    const wrapper = mount(ChatInput, {
      props: { isStreaming: false },
    });
    const textarea = wrapper.find("textarea");
    await textarea.setValue("hello");
    await textarea.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(wrapper.emitted("submit")).toBeFalsy();
  });

  it("should emit stop when streaming", async () => {
    const wrapper = mount(ChatInput, {
      props: { isStreaming: true },
    });
    const stopBtn = wrapper.find('[data-testid="stop-btn"]');
    expect(stopBtn.exists()).toBe(true);
    await stopBtn.trigger("click");
    expect(wrapper.emitted("stop")).toBeTruthy();
  });

  it("should show send button when not streaming", () => {
    const wrapper = mount(ChatInput, {
      props: { isStreaming: false },
    });
    expect(wrapper.find('[data-testid="send-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stop-btn"]').exists()).toBe(false);
  });

  it("should render file input element", () => {
    const wrapper = mount(ChatInput, {
      props: { isStreaming: false, files: [] },
    });
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
  });

  it("should render attachment items when files provided", () => {
    const wrapper = mount(ChatInput, {
      props: {
        isStreaming: false,
        files: [
          {
            id: "f1",
            name: "test.txt",
            path: "/tmp/test.txt",
            mimeType: "text/plain",
            size: 100,
          },
        ],
      },
    });
    expect(wrapper.text()).toContain("test.txt");
  });

  it("should emit remove-file on attachment remove", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        isStreaming: false,
        files: [
          {
            id: "f1",
            name: "test.txt",
            path: "/tmp/test.txt",
            mimeType: "text/plain",
            size: 100,
          },
        ],
      },
    });
    await wrapper.find('[data-testid="remove-file"]').trigger("click");
    expect(wrapper.emitted("remove-file")).toBeTruthy();
  });
});
