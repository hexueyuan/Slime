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

import AppSidebar from "@/components/AppSidebar.vue";

describe("AppSidebar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should render sidebar with fixed width", () => {
    const wrapper = mount(AppSidebar);
    expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(true);
  });

  it("should render evolution center icon button", () => {
    const wrapper = mount(AppSidebar);
    expect(wrapper.find('[data-testid="sidebar-evolution"]').exists()).toBe(true);
  });

  it("should have active state on evolution button by default", () => {
    const wrapper = mount(AppSidebar);
    const btn = wrapper.find('[data-testid="sidebar-evolution"]');
    expect(btn.classes()).toContain("bg-muted");
  });

  it("should render settings button", () => {
    const wrapper = mount(AppSidebar);
    expect(wrapper.find('[data-testid="sidebar-settings"]').exists()).toBe(true);
  });

  it("should open settings dialog when settings button clicked", async () => {
    const wrapper = mount(AppSidebar, { attachTo: document.body });
    await wrapper.find('[data-testid="sidebar-settings"]').trigger("click");
    expect(document.querySelector('[data-testid="settings-overlay"]')).toBeTruthy();
    wrapper.unmount();
  });
});
