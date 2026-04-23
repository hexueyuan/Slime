import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useMessageStore } from "@/stores/chat";

export type GeneratingPhase = "preparing" | "thinking" | "toolCalling" | "generating";

const phaseConfig: Record<GeneratingPhase, { text: string; color: string }> = {
  preparing: { text: "正在准备...", color: "hsl(220 14% 60%)" },
  thinking: { text: "正在思考...", color: "hsl(265 90% 66%)" },
  toolCalling: { text: "正在调用工具...", color: "hsl(25 95% 60%)" },
  generating: { text: "正在生成...", color: "hsl(145 65% 50%)" },
};

export function useGeneratingPhase() {
  const store = useMessageStore();
  const { isStreaming, streamingBlocks } = storeToRefs(store);

  const isGenerating = computed(() => isStreaming.value);

  const generatingPhase = computed<GeneratingPhase | null>(() => {
    if (!isStreaming.value) return null;
    const blocks = streamingBlocks.value;
    if (blocks.length === 0) return "preparing";
    const last = blocks[blocks.length - 1];
    switch (last.type) {
      case "reasoning_content":
        return "thinking";
      case "tool_call":
        return "toolCalling";
      default:
        return "generating";
    }
  });

  const generatingPhaseText = computed(() =>
    generatingPhase.value ? phaseConfig[generatingPhase.value].text : "",
  );

  const phaseColor = computed(() =>
    generatingPhase.value ? phaseConfig[generatingPhase.value].color : "",
  );

  return { isGenerating, generatingPhase, generatingPhaseText, phaseColor };
}
