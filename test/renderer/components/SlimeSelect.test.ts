import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, ref } from "vue";
import SlimeSelect from "@/components/ui/SlimeSelect.vue";

const options = [
  { value: 1, label: "百度OneApi", description: "Anthropic · 启用", badge: "online" },
  { value: 2, label: "OfoxAI", description: "Anthropic · 停用", badge: "disabled" },
  { value: 3, label: "Deepseek", description: "DeepSeek · 启用", disabled: true },
];

describe("SlimeSelect", () => {
  it("supports single-select without relying on a native select width", async () => {
    const wrapper = mount(
      defineComponent({
        components: { SlimeSelect },
        setup() {
          const selected = ref<number | null>(1);
          return { selected, options };
        },
        template:
          '<SlimeSelect v-model="selected" data-testid="provider-select" :options="options" placeholder="选择供应商" />',
      }),
    );

    expect(wrapper.get('[data-testid="provider-select"]').attributes("data-layout")).toBe(
      "adaptive",
    );
    expect(wrapper.get('[data-testid="slime-select-trigger"]').text()).toContain("百度OneApi");

    await wrapper.get('[data-testid="slime-select-trigger"]').trigger("click");
    await wrapper.get('[data-testid="slime-select-option-2"]').trigger("click");

    expect(wrapper.get('[data-testid="slime-select-trigger"]').text()).toContain("OfoxAI");
    expect(wrapper.find('[data-testid="slime-select-menu"]').exists()).toBe(false);
  });

  it("supports multi-select chips and ignores disabled options", async () => {
    const wrapper = mount(
      defineComponent({
        components: { SlimeSelect },
        setup() {
          const selected = ref<Array<string | number>>([1]);
          return { selected, options };
        },
        template:
          '<SlimeSelect v-model="selected" mode="multiple" :options="options" placeholder="选择渠道" />',
      }),
    );

    expect(wrapper.findAll('[data-testid="slime-select-chip"]')).toHaveLength(1);
    expect(wrapper.text()).toContain("百度OneApi");

    await wrapper.get('[data-testid="slime-select-trigger"]').trigger("click");
    await wrapper.get('[data-testid="slime-select-option-2"]').trigger("click");
    expect(wrapper.findAll('[data-testid="slime-select-chip"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("OfoxAI");

    await wrapper.get('[data-testid="slime-select-option-3"]').trigger("click");
    expect(wrapper.findAll('[data-testid="slime-select-chip"]')).toHaveLength(2);

    await wrapper.get('[data-testid="slime-select-option-1"]').trigger("click");
    const chipLabels = wrapper
      .findAll('[data-testid="slime-select-chip"]')
      .map((chip) => chip.text());
    expect(chipLabels).toEqual(["OfoxAI"]);
  });
});
