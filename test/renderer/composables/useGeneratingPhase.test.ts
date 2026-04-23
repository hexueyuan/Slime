import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

// Mock store
const mockIsStreaming = ref(false);
const mockStreamingBlocks = ref<Array<{ type: string }>>([]);

vi.mock("@/stores/chat", () => ({
  useMessageStore: () => ({
    get isStreaming() {
      return mockIsStreaming.value;
    },
    get streamingBlocks() {
      return mockStreamingBlocks.value;
    },
  }),
}));

import { useGeneratingPhase } from "@/composables/useGeneratingPhase";

describe("useGeneratingPhase", () => {
  beforeEach(() => {
    mockIsStreaming.value = false;
    mockStreamingBlocks.value = [];
  });

  it("returns null phase when not streaming", () => {
    const { isGenerating, generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
    expect(isGenerating.value).toBe(false);
    expect(generatingPhase.value).toBeNull();
    expect(generatingPhaseText.value).toBe("");
    expect(phaseColor.value).toBe("");
  });

  it("returns preparing when streaming but no blocks", () => {
    mockIsStreaming.value = true;
    mockStreamingBlocks.value = [];
    const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
    expect(generatingPhase.value).toBe("preparing");
    expect(generatingPhaseText.value).toBe("正在准备...");
    expect(phaseColor.value).toBe("hsl(220 14% 60%)");
  });

  it("returns thinking when last block is reasoning_content", () => {
    mockIsStreaming.value = true;
    mockStreamingBlocks.value = [{ type: "reasoning_content" }];
    const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
    expect(generatingPhase.value).toBe("thinking");
    expect(generatingPhaseText.value).toBe("正在思考...");
    expect(phaseColor.value).toBe("hsl(265 90% 66%)");
  });

  it("returns toolCalling when last block is tool_call", () => {
    mockIsStreaming.value = true;
    mockStreamingBlocks.value = [{ type: "tool_call" }];
    const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
    expect(generatingPhase.value).toBe("toolCalling");
    expect(generatingPhaseText.value).toBe("正在调用工具...");
    expect(phaseColor.value).toBe("hsl(25 95% 60%)");
  });

  it("returns generating when last block is content", () => {
    mockIsStreaming.value = true;
    mockStreamingBlocks.value = [{ type: "content" }];
    const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
    expect(generatingPhase.value).toBe("generating");
    expect(generatingPhaseText.value).toBe("正在生成...");
    expect(phaseColor.value).toBe("hsl(145 65% 50%)");
  });

  it("uses last block when multiple blocks exist", () => {
    mockIsStreaming.value = true;
    mockStreamingBlocks.value = [{ type: "reasoning_content" }, { type: "tool_call" }];
    const { generatingPhase } = useGeneratingPhase();
    expect(generatingPhase.value).toBe("toolCalling");
  });
});
