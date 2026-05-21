import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppSidebarNav from "@/components/layout/AppSidebarNav.vue";

describe("AppSidebarNav", () => {
  it("emits active view updates from primary navigation", async () => {
    const wrapper = mount(AppSidebarNav, {
      props: { activeView: "chatroom" },
      global: {
        stubs: {
          SettingsDialog: true,
        },
      },
    });

    await wrapper.get('[data-testid="sidebar-groupchat"]').trigger("click");

    expect(wrapper.emitted("update:activeView")).toEqual([["groupchat"]]);
  });

  it("emits sidebar toggle from the chrome control", async () => {
    const wrapper = mount(AppSidebarNav, {
      props: { activeView: "chatroom" },
      global: {
        stubs: {
          SettingsDialog: true,
        },
      },
    });

    await wrapper.get('[data-testid="sidebar-toggle"]').trigger("click");

    expect(wrapper.emitted("toggleSidebar")).toEqual([[]]);
  });

  it("does not toggle the sidebar when selecting a workspace", async () => {
    const wrapper = mount(AppSidebarNav, {
      props: { activeView: "chatroom", collapsed: false },
      global: {
        stubs: {
          SettingsDialog: true,
        },
      },
    });

    await wrapper.get('[data-testid="sidebar-gateway"]').trigger("click");

    expect(wrapper.emitted("update:activeView")).toEqual([["gateway"]]);
    expect(wrapper.emitted("toggleSidebar")).toBeUndefined();
  });

  it("omits the mac traffic-light spacer in fullscreen-like mode", () => {
    const wrapper = mount(AppSidebarNav, {
      props: { activeView: "chatroom", collapsed: false, fullscreenLike: true },
      global: {
        stubs: {
          SettingsDialog: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="sidebar-traffic-spacer"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="sidebar-toggle"]').isVisible()).toBe(true);
  });

  it("keeps project and conversation history in a hidden-scrollbar middle area", () => {
    const wrapper = mount(AppSidebarNav, {
      props: { activeView: "chatroom", collapsed: false },
      global: {
        stubs: {
          SettingsDialog: true,
        },
      },
    });

    const scrollArea = wrapper.get('[data-testid="sidebar-scroll-area"]');

    expect(scrollArea.text()).toContain("项目");
    expect(scrollArea.text()).toContain("对齐第二张图 UI");
    expect(scrollArea.text()).toContain("调整侧边栏滚动");
    expect(scrollArea.text()).toContain("确认设置页信息层级");
    expect(scrollArea.text()).not.toContain("新对话");
    expect(scrollArea.find('[data-testid="sidebar-status"]').exists()).toBe(false);
    expect(scrollArea.find('[data-testid="sidebar-settings"]').exists()).toBe(false);
    expect(scrollArea.classes()).toContain("sidebar-scrollbar-hidden");
  });
});
