export type AgentType = "builtin" | "custom";

export type AgentAvatar =
  | { kind: "lucide"; icon: string; color?: string }
  | { kind: "monogram"; text: string; backgroundColor?: string }
  | { kind: "image"; path: string };

export type UserProfile = {
  name?: string;
  avatar?: AgentAvatar;
};

export interface AgentConfig {
  capabilityRequirements?: string[];
  /** @deprecated 使用 agentSoul 替代 */
  systemPrompt?: string;
  /** 内置 agent 的系统 prompt，非空时优先于 SOUL.md。支持异步函数用于动态注入运行时数据 */
  agentSoul?: string | (() => Promise<string>);
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  disabledTools?: string[];
  subagentEnabled?: boolean;
  mcpTools?: string[]; // "{server_id}/{tool_name}"[]
  /** @deprecated 改为 disabledSkills 黑名单 */
  skills?: string[];
  /** 禁用的 skill 名称列表，目录下存在的 skill 默认启用 */
  disabledSkills?: string[];
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
  themeColor?: string | null; // CSS hex，如 "#a855f7"
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
