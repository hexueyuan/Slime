import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn(async () => null);

(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import OnboardingWizard from "@/components/onboarding/OnboardingWizard.vue";

describe("OnboardingWizard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  it("renders WelcomeStep as the first step", () => {
    const wrapper = mount(OnboardingWizard);
    expect(wrapper.text()).toContain("Slime");
    expect(wrapper.find('[data-testid="welcome-step"]').exists()).toBe(true);
  });

  it("navigates to AddChannelStep when clicking next on WelcomeStep", async () => {
    const wrapper = mount(OnboardingWizard);
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="add-channel-step"]').exists()).toBe(true);
  });
});
