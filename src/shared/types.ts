// IPC 通道定义：channel -> { request, response }
export interface IpcChannels {
  // Agent 相关
  "agent:chat": {
    request: { messages: Message[]; stream?: boolean };
    response: { content: string };
  };

  // 文件操作
  "file:read": {
    request: { path: string };
    response: { content: string };
  };
  "file:write": {
    request: { path: string; content: string };
    response: { success: boolean };
  };

  // Git 操作
  "git:tag": {
    request: { name: string; message: string };
    response: { success: boolean };
  };

  // 配置
  "config:get": {
    request: { key: string };
    response: { value: unknown };
  };
  "config:set": {
    request: { key: string; value: unknown };
    response: { success: boolean };
  };

  // 应用
  "app:getVersion": {
    request: void;
    response: string;
  };
}

export type IpcChannel = keyof IpcChannels;

// Message 类型（Agent 聊天用）
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// 渲染进程 API 类型
export interface SlimeApi {
  invoke<C extends IpcChannel>(
    channel: C,
    ...args: IpcChannels[C]["request"] extends void ? [] : [IpcChannels[C]["request"]]
  ): Promise<IpcChannels[C]["response"]>;
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    slime: SlimeApi;
  }
}

export {};
