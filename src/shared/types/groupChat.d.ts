export interface GroupChatSession {
  id: string;
  title: string;
  participantAgentIds: string[];
  moderatorEnabled: boolean;
  workspacePaths: string[];
  createdAt: number;
  updatedAt: number;
}

export interface GroupChatMessageRecord {
  id: string;
  sessionId: string;
  orderSeq: number;
  senderAgentId: string | null; // null = 用户，非 null = Agent id
  role: "user" | "assistant";
  content: string; // 用户消息为纯文本；Agent 消息为 AssistantMessageBlock[] JSON
  hidden: boolean; // true = 主持人注入的隐藏指令，不展示在 UI
  createdAt: number;
}
