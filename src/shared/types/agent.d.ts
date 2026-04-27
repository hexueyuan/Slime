export type AgentType = "builtin" | "custom";

export type AgentAvatar =
  | { kind: "lucide"; icon: string; color?: string }
  | { kind: "monogram"; text: string; backgroundColor?: string };

export type UserProfile = {
  name?: string;
  avatar?: AgentAvatar;
};

export interface AgentConfig {
  capabilityRequirements?: string[];
  systemPrompt?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  thinkingBudget?: number;
  disabledTools?: string[];
  subagentEnabled?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  protected: boolean;
  description?: string;
  avatar?: AgentAvatar | null;
  config?: AgentConfig | null;
  createdAt: number;
  updatedAt: number;
}

// --- Session & Message types ---

export interface SessionRecord {
  id: string;
  agentId: string;
  title: string;
  isPinned: boolean;
  sessionKind: "regular" | "subagent";
  parentSessionId?: string | null;
  subagentMeta?: SubagentMeta | null;
  metadata?: SessionMetadata | null;
  createdAt: number;
  updatedAt: number;
}

export interface SubagentMeta {
  mode: "inherit" | "new";
  prompt: string;
  parentSessionId: string;
}

export interface SessionMetadata {
  titleGeneratedCount?: number;
  titleManuallyEdited?: boolean;
}

export interface SessionConfig {
  id: string;
  capabilityRequirements: string[];
  systemPrompt?: string | null;
  temperature?: number | null;
  contextLength?: number | null;
  maxTokens?: number | null;
  thinkingBudget?: number | null;
  summaryText?: string | null;
  summaryCursorSeq: number;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  orderSeq: number;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "sent" | "error";
  isContextEdge: boolean;
  metadata: string;
  createdAt: number;
  updatedAt: number;
}

export type AssistantBlockType = "content" | "reasoning_content" | "error" | "tool_call" | "image";

export interface AssistantMessageBlock {
  id?: string;
  type: AssistantBlockType;
  content?: string;
  status: "pending" | "success" | "error" | "loading";
  timestamp: number;
  tool_call?: ToolCallBlockData;
  image_data?: { data: string; mimeType: string };
}

export interface ToolCallBlockData {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
}

export interface MessageMetadata {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  generationTime?: number;
  model?: string;
}

export interface UsageStatsRecord {
  messageId: string;
  sessionId: string;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd?: number | null;
  createdAt: number;
}
