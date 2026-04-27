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

export type ModelType = "chat";

export type Capability = "reasoning" | "vision" | "image_gen" | "tool_call";

export interface Model {
  id: number;
  channelId: number;
  modelName: string;
  type: ModelType;
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
  apiKeyName?: string;
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
  ttftMs?: number | null;
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
  avgLatencyMs: number;
}

export interface ModelStats extends DailyStats {
  modelName: string;
}

export interface ChannelStats extends DailyStats {
  channelId: number;
  channelName: string;
}

export interface TrendPoint {
  date: string;
  hour?: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface StabilityPoint {
  hour: string; // "2026-04-27T10"
  successCount: number;
  failCount: number;
  avgLatencyMs: number;
}

export interface ChannelRankItem {
  channelId: number;
  channelName: string;
  requests: number;
  successCount: number;
  failCount: number;
  avgLatencyMs: number;
  cost: number;
}

export interface ModelRankItem {
  modelName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  ttftP50: number | null;
}
