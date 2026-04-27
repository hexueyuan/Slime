import type { SessionRecord, ChatMessageRecord } from "../agent";

export interface IAgentChatPresenter {
  createSession(agentId: string): Promise<SessionRecord>;
  getSessions(agentId?: string): Promise<SessionRecord[]>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  deleteSession(sessionId: string): Promise<void>;
  updateSessionTitle(sessionId: string, title: string): Promise<void>;
  togglePin(sessionId: string): Promise<void>;

  getMessages(sessionId: string): Promise<ChatMessageRecord[]>;

  chat(sessionId: string, content: string): Promise<void>;
  stopGeneration(sessionId: string): void;
  retryLastMessage(sessionId: string): Promise<void>;
  answerQuestion(sessionId: string, toolCallId: string, answer: string): void;

  getSessionState(sessionId: string): "idle" | "generating" | "error";
}
