import type { GroupChatSession, GroupChatMessageRecord } from "../groupChat";

export interface IGroupChatPresenter {
  createSession(
    participantAgentIds: string[],
    moderatorEnabled?: boolean,
  ): Promise<GroupChatSession>;
  getSessions(): Promise<GroupChatSession[]>;
  deleteSession(sessionId: string): Promise<void>;
  updateSessionTitle(sessionId: string, title: string): Promise<void>;
  getMessages(sessionId: string): Promise<GroupChatMessageRecord[]>;
  sendMessage(sessionId: string, content: string, mentionedAgentIds: string[]): Promise<void>;
  stopAgent(sessionId: string, agentId: string): Promise<void>;
}
