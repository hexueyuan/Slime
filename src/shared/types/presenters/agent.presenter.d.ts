export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface IAgentPresenter {
  chat(params: { messages: Message[]; stream?: boolean }): Promise<{ content: string }>;
}
