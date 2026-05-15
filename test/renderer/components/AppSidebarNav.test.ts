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
});
