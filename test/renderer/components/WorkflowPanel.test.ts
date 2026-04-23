import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import WorkflowPanel from "@/components/function/WorkflowPanel.vue";
import { useWorkflowStore } from "@/stores/workflow";

describe("WorkflowPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should show empty state when no workflow", () => {
    const wrapper = mount(WorkflowPanel);
    expect(wrapper.text()).toContain("在对话中开始进化");
  });

  it("should render workflow steps", () => {
    const store = useWorkflowStore();
    store.setWorkflow({
      sessionId: "s1",
      steps: [
        { id: "a", title: "Analyze code", status: "completed" },
        { id: "b", title: "Write tests", status: "in_progress" },
        { id: "c", title: "Implement", status: "pending" },
      ],
    });
    const wrapper = mount(WorkflowPanel);
    expect(wrapper.text()).toContain("Analyze code");
    expect(wrapper.text()).toContain("Write tests");
    expect(wrapper.text()).toContain("Implement");
  });

  it("should show step descriptions", () => {
    const store = useWorkflowStore();
    store.setWorkflow({
      sessionId: "s1",
      steps: [{ id: "a", title: "Step", description: "Detailed desc", status: "pending" }],
    });
    const wrapper = mount(WorkflowPanel);
    expect(wrapper.text()).toContain("Detailed desc");
  });
});
