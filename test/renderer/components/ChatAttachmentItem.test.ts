import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatAttachmentItem from "@/components/chat/ChatAttachmentItem.vue";
import type { MessageFile } from "@shared/types/chat";

describe("ChatAttachmentItem", () => {
  const file: MessageFile = {
    id: "f1",
    name: "document.pdf",
    path: "/tmp/document.pdf",
    mimeType: "application/pdf",
    size: 1024,
  };

  it("should render file name", () => {
    const wrapper = mount(ChatAttachmentItem, {
      props: { file },
    });
    expect(wrapper.text()).toContain("document.pdf");
  });

  it("should emit remove on x click", async () => {
    const wrapper = mount(ChatAttachmentItem, {
      props: { file },
    });
    await wrapper.find('[data-testid="remove-file"]').trigger("click");
    expect(wrapper.emitted("remove")).toBeTruthy();
    expect(wrapper.emitted("remove")![0]).toEqual(["f1"]);
  });

  it("should have pill styling", () => {
    const wrapper = mount(ChatAttachmentItem, {
      props: { file },
    });
    expect(wrapper.find(".rounded-full").exists()).toBe(true);
  });
});
