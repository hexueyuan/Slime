import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import VerifyStep from "@/components/onboarding/VerifyStep.vue";

describe("VerifyStep", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows loading state when verifying", () => {
    const wrapper = mount(VerifyStep, {
      props: { verifying: true, result: null, skipped: false },
    });
    expect(wrapper.find('[data-testid="verify-loading"]').exists()).toBe(true);
  });

  it("shows success state and next button", () => {
    const wrapper = mount(VerifyStep, {
      props: {
        verifying: false,
        result: { success: true, modelName: "claude-sonnet-4-20250514" },
        skipped: false,
      },
    });
    expect(wrapper.find('[data-testid="verify-success"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("claude-sonnet-4-20250514");
    expect(wrapper.find('[data-testid="next-btn"]').exists()).toBe(true);
  });

  it("shows error state with retry and skip buttons", () => {
    const wrapper = mount(VerifyStep, {
      props: {
        verifying: false,
        result: { success: false, error: "Invalid API key" },
        skipped: false,
      },
    });
    expect(wrapper.find('[data-testid="verify-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Invalid API key");
    expect(wrapper.find('[data-testid="prev-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="skip-btn"]').exists()).toBe(true);
  });

  it("emits skip event when skip button clicked", async () => {
    const wrapper = mount(VerifyStep, {
      props: {
        verifying: false,
        result: { success: false, error: "fail" },
        skipped: false,
      },
    });
    await wrapper.find('[data-testid="skip-btn"]').trigger("click");
    expect(wrapper.emitted("skip")).toBeTruthy();
  });
});
