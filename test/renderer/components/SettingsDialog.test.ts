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

import SettingsDialog from "@/components/settings/SettingsDialog.vue";

describe("SettingsDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("should emit update:open false on overlay click", async () => {
    const wrapper = mount(SettingsDialog, { props: { open: true }, attachTo: document.body });
    const overlay = document.querySelector('[data-testid="settings-overlay"]') as HTMLElement;
    overlay.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
  });
});
