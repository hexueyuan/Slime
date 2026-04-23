import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);

(window as any).electron = {
  ipcRenderer: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), removeAllListeners: vi.fn() },
};

import ProviderSettings from "@/components/settings/ProviderSettings.vue";

describe("ProviderSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  it("should render provider select", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="provider-select"]').exists()).toBe(true);
  });

  it("should render api key input", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="api-key-input"]').exists()).toBe(true);
  });

  it("should render model input", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="model-input"]').exists()).toBe(true);
  });

  it("should render base url input", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="base-url-input"]').exists()).toBe(true);
  });

  it("should render save button", () => {
    const wrapper = mount(ProviderSettings);
    expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(true);
  });

  it("should toggle api key visibility", async () => {
    const wrapper = mount(ProviderSettings);
    const input = wrapper.find('[data-testid="api-key-input"]');
    expect(input.attributes("type")).toBe("password");
    await wrapper.find('[data-testid="toggle-key-visibility"]').trigger("click");
    expect(wrapper.find('[data-testid="api-key-input"]').attributes("type")).toBe("text");
  });

  it("should call configPresenter.set on save", async () => {
    mockInvoke.mockResolvedValue(true);
    const wrapper = mount(ProviderSettings);
    await flushPromises();

    await wrapper.find('[data-testid="api-key-input"]').setValue("sk-test-key");
    await wrapper.find('[data-testid="model-input"]').setValue("gpt-4o");
    await wrapper.find('[data-testid="save-btn"]').trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "configPresenter",
      "set",
      "ai.apiKey",
      "sk-test-key",
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "configPresenter",
      "set",
      "ai.model",
      "gpt-4o",
    );
  });
});
