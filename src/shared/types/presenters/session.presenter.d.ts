import type { ChatSession, ChatMessageRecord } from "../chat";

export interface ISessionPresenter {
  getSessions(): Promise<ChatSession[]>;
  createSession(title?: string): Promise<ChatSession>;
  deleteSession(id: string): Promise<boolean>;
  getMessages(sessionId: string): Promise<ChatMessageRecord[]>;
  clearMessages(sessionId: string): Promise<void>;
}
