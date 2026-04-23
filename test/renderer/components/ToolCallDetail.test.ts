import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolCallDetail from "@/components/function/ToolCallDetail.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const makeBlock = (name: string, params: string, response?: string): AssistantMessageBlock => ({
  type: "tool_call",
  id: "tc-1",
  content: "",
  status: "success",
  timestamp: Date.now(),
  tool_call: { name, params, response },
});

describe("ToolCallDetail", () => {
  it("should render exec detail for exec tool", () => {
    const wrapper = mount(ToolCallDetail, {
      props: {
        block: makeBlock("exec", '{"command":"ls"}', '{"stdout":"ok","stderr":"","exit_code":0}'),
      },
    });
    expect(wrapper.text()).toContain("ls");
    expect(wrapper.text()).toContain("命令");
  });

  it("should render read detail for read tool", () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock("read", '{"path":"f.ts"}', '"content here"') },
    });
    expect(wrapper.text()).toContain("f.ts");
  });

  it("should render edit detail for edit tool", () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock("edit", '{"path":"f.ts","old_text":"a","new_text":"b"}') },
    });
    expect(wrapper.html()).toContain("f.ts");
  });

  it("should render write detail for write tool", () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock("write", '{"path":"f.ts","content":"hello"}') },
    });
    expect(wrapper.text()).toContain("f.ts");
    expect(wrapper.text()).toContain("hello");
  });

  it("should render generic detail for unknown tool", () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock("workflow_query", "{}", '{"steps":[]}') },
    });
    expect(wrapper.text()).toContain("参数");
  });

  it("should emit back on back button", async () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock("exec", '{"command":"ls"}') },
    });
    await wrapper.find('[data-testid="tool-detail-back"]').trigger("click");
    expect(wrapper.emitted("back")).toBeTruthy();
  });
});
