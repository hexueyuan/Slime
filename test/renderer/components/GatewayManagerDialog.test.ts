import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayManagerDialog from "@/components/gateway/GatewayManagerDialog.vue";

describe("GatewayManagerDialog", () => {
  it("renders when open and emits close from overlay and close button", async () => {
    const wrapper = mount(GatewayManagerDialog, {
      props: { open: true, title: "模型管理" },
      slots: {
        default: "<div data-testid='dialog-body'>body</div>",
        actions: "<button data-testid='dialog-action'>action</button>",
      },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("模型管理");
    expect(wrapper.get('[data-testid="dialog-body"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="dialog-action"]').exists()).toBe(true);

    await wrapper.get('[data-testid="manager-close"]').trigger("click");
    await wrapper.get('[data-testid="manager-overlay"]').trigger("click");

    expect(wrapper.emitted("close")).toEqual([[], []]);
  });

  it("does not render content when closed", () => {
    const wrapper = mount(GatewayManagerDialog, {
      props: { open: false, title: "密钥管理" },
      slots: { default: "hidden" },
    });

    expect(wrapper.text()).not.toContain("hidden");
  });
});
