import type { ISessionPresenter } from "@shared/types/presenters";
import type { ChatSession, ChatMessageRecord } from "@shared/types/chat";
import { JsonStore } from "@/utils";
import { logger } from "@/utils";

export class SessionPresenter implements ISessionPresenter {
  private sessionsStore = new JsonStore<ChatSession[]>("sessions.json", []);

  private messageStore(sessionId: string) {
    return new JsonStore<ChatMessageRecord[]>(`messages/${sessionId}.json`, []);
  }

  async getSessions(): Promise<ChatSession[]> {
    return this.sessionsStore.read();
  }

  async createSession(title?: string): Promise<ChatSession> {
    const sessions = await this.sessionsStore.read();
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: title || "新对话",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.push(session);
    await this.sessionsStore.write(sessions);
    logger.info("Session created", { id: session.id, title: session.title });
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    const sessions = await this.sessionsStore.read();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    sessions.splice(idx, 1);
    await this.sessionsStore.write(sessions);
    logger.info("Session deleted", { id });
    return true;
  }

  async getMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    return this.messageStore(sessionId).read();
  }

  async clearMessages(sessionId: string): Promise<void> {
    const store = this.messageStore(sessionId);
    await store.write([]);
    logger.info("Messages cleared", { sessionId });
  }

  async saveMessage(message: ChatMessageRecord): Promise<void> {
    const store = this.messageStore(message.sessionId);
    const messages = await store.read();
    const idx = messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      messages[idx] = message;
    } else {
      messages.push(message);
    }
    await store.write(messages);
  }
}
