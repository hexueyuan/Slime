export type BlockType = "content" | "reasoning_content" | "tool_call" | "error" | "image";
export type BlockStatus = "success" | "loading" | "error" | "cancel";

export interface AssistantMessageBlock {
  type: BlockType;
  id?: string;
  content?: string;
  status: BlockStatus;
  timestamp: number;
  tool_call?: { name: string; params: string; response?: string };
  image_data?: { data: string; mimeType: string };
  reasoning_time?: { start: number; end: number };
}

export interface MessageFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

export interface UserMessageContent {
  text: string;
  files: MessageFile[];
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  status: "sent" | "pending" | "error";
  createdAt: number;
  updatedAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface PendingQuestion {
  messageId: string;
  toolCallId: string;
  question: string;
  options?: string[];
}
