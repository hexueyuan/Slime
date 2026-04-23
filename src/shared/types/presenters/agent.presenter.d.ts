import type { UserMessageContent } from "../chat";

export interface IAgentPresenter {
  chat(sessionId: string, content: UserMessageContent): Promise<void>;
  stopGeneration(sessionId: string): Promise<void>;
  answerQuestion(sessionId: string, toolCallId: string, answer: string): Promise<void>;
}
