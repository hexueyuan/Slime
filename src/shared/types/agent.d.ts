import type { MBTIType } from "../constants/mbti";

export type AgentType = "builtin" | "custom";

export type GenderType = "male" | "female" | "unknown";

export type AgentAvatar =
  | { kind: "lucide"; icon: string; color?: string }
  | { kind: "monogram"; text: string; backgroundColor?: string }
  | { kind: "image"; path: string };

export type UserProfile = {
  name?: string;
  avatar?: AgentAvatar;
  gender?: GenderType;
  birthday?: string;
  bio?: string;
};

export interface AgentConfig {
  capabilityRequirements?: string[];
  /** 附加提示词，追加到 MBTI 性格提示词之后 */
  additionalPrompt?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  /** 启用的工具白名单，必须显式列出可用工具 */
  enabledTools?: string[];
  subagentEnabled?: boolean;
  mcpTools?: string[]; // "{server_id}/{tool_name}"[]
  /** 启用的 skill 名称白名单 */
  enabledSkills?: string[];
  /** 允许的 slime-cli 命令白名单 */
  allowedCliCommands?: string[];
  /** 启用 Anthropic extended thinking 模式 */
  enableThinking?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  protected: boolean;
  description?: string;
  avatar?: AgentAvatar | null;
  mbti: MBTIType;
  gender?: GenderType;
  birthday?: string; // YYYY-MM-DD
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
  createdAt: number;
  updatedAt: number;
}

export type AssistantBlockType =
  | "content"
  | "reasoning_content"
  | "error"
  | "tool_call"
  | "image"
  | "thinking";

export interface AssistantMessageBlock {
  id?: string;
  type: AssistantBlockType;
  content?: string;
  status: "pending" | "success" | "error" | "loading";
  timestamp: number;
  tool_call?: ToolCallBlockData;
  image_data?: { data: string; mimeType: string };
  thinking?: string;
  signature?: string;
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
