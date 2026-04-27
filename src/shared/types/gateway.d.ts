export type ChannelType = "anthropic" | "openai" | "gemini" | "deepseek" | "volcengine" | "custom";

export interface Channel {
  id: number;
  name: string;
  type: ChannelType;
  baseUrls: string[];
  models: string[];
  enabled: boolean;
  priority: number;
  weight: number;
  proxy?: string;
  timeout?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelKey {
  id: number;
  channelId: number;
  key: string;
  enabled: boolean;
  createdAt: string;
}

export type Capability = "reasoning" | "chat" | "vision" | "image_gen";

export interface Model {
  id: number;
  channelId: number;
  modelName: string;
  capabilities: Capability[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CapabilityRequirement = (Capability | Capability[])[];

export interface ModelMatch {
  modelId: number;
  modelName: string;
  channelId: number;
  groupName: string;
  capabilities: Capability[];
}

export interface SelectResult {
  matched: Record<string, ModelMatch>;
  missing: string[];
}

export interface Group {
  id: number;
  name: string;
  balanceMode: "round_robin" | "random" | "failover" | "weighted";
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GroupItem {
  id: number;
  groupId: number;
  channelId: number;
  modelName: string;
  priority: number;
  weight: number;
}

export interface GatewayApiKey {
  id: number;
  name: string;
  key: string;
  enabled: boolean;
  isInternal: boolean;
  expiresAt?: string;
  maxCost?: number;
  allowedModels?: string[];
  createdAt: string;
}

export interface ModelPrice {
  id: number;
  modelName: string;
  inputPrice: number;
  outputPrice: number;
  cacheReadPrice: number;
  cacheWritePrice: number;
  source: "preset" | "manual";
  updatedAt: string;
}

export interface RelayLog {
  id: number;
  apiKeyId?: number;
  groupName: string;
  channelId?: number;
  channelName?: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  durationMs: number;
  status: "success" | "error";
  error?: string;
  requestBody?: string;
  responseBody?: string;
  createdAt: string;
}

export interface StatsHourly {
  date: string;
  hour: number;
  modelName: string;
  channelId: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface StatsDaily {
  date: string;
  modelName: string;
  channelId: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface DailyStats {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface ModelStats extends DailyStats {
  modelName: string;
}

export interface ChannelStats extends DailyStats {
  channelId: number;
  channelName: string;
}
