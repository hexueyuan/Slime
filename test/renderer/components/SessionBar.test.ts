import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import SessionBar from "@/components/chat/SessionBar.vue";

describe("SessionBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should render new session button", () => {
    const wrapper = mount(SessionBar);
    expect(wrapper.find('[data-testid="new-session-btn"]').exists()).toBe(true);
  });

  it("should emit new-session on button click", async () => {
    const wrapper = mount(SessionBar);
    await wrapper.find('[data-testid="new-session-btn"]').trigger("click");
    expect(wrapper.emitted("new-session")).toBeTruthy();
  });

  it("should show session title", () => {
    const wrapper = mount(SessionBar, {
      props: { title: "测试会话", sessionCount: 3 },
    });
    expect(wrapper.text()).toContain("测试会话");
  });

  it("should toggle dropdown on title click", async () => {
    const wrapper = mount(SessionBar, {
      props: {
        title: "test",
        sessionCount: 2,
        sessions: [
          { id: "s1", title: "会话1", createdAt: 1, updatedAt: 1 },
          { id: "s2", title: "会话2", createdAt: 2, updatedAt: 2 },
        ],
        activeSessionId: "s1",
      },
    });
    await wrapper.find('[data-testid="session-title"]').trigger("click");
    expect(wrapper.find('[data-testid="session-dropdown"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("会话1");
    expect(wrapper.text()).toContain("会话2");
  });
});
