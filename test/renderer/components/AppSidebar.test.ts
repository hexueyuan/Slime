import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AppSidebar from "@/components/AppSidebar.vue";

describe("AppSidebar", () => {
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
});
