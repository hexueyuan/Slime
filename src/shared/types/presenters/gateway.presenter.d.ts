import type {
  Channel,
  ChannelKey,
  ChannelType,
  Group,
  GroupItem,
  GatewayApiKey,
  ModelPrice,
  Model,
  Capability,
  CapabilityRequirement,
  SelectResult,
  DailyStats,
  ModelStats,
  ChannelStats,
  RelayLog,
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  TrendPoint,
} from "../gateway";

export interface IGatewayPresenter {
  // Server
  getPort(): number;
  getInternalKey(): string;

  // Channel CRUD
  listChannels(): Channel[];
  createChannel(data: Omit<Channel, "id" | "createdAt" | "updatedAt">): Channel;
  updateChannel(id: number, data: Partial<Channel>): void;
  deleteChannel(id: number): void;
  testChannel(id: number): Promise<{ success: boolean; models?: string[]; error?: string }>;
  fetchModels(id: number): Promise<string[]>;
  fetchModelsByConfig(type: ChannelType, baseUrl: string, apiKey: string): Promise<string[]>;

  // Channel Keys
  listChannelKeys(channelId: number): ChannelKey[];
  addChannelKey(channelId: number, key: string): ChannelKey;
  removeChannelKey(id: number): void;

  // Group CRUD
  listGroups(): Group[];
  createGroup(data: Omit<Group, "id" | "createdAt" | "updatedAt">): Group;
  updateGroup(id: number, data: Partial<Group>): void;
  deleteGroup(id: number): void;

  // Group Items
  listGroupItems(groupId: number): GroupItem[];
  setGroupItems(groupId: number, items: Omit<GroupItem, "id" | "groupId">[]): void;

  // API Key CRUD
  listApiKeys(): GatewayApiKey[];
  createApiKey(data: {
    name: string;
    expiresAt?: string;
    maxCost?: number;
    allowedModels?: string[];
  }): GatewayApiKey;
  updateApiKey(id: number, data: Partial<GatewayApiKey>): void;
  deleteApiKey(id: number): void;

  // Models
  listModels(): Model[];
  listModelsByChannel(channelId: number): Model[];
  createModel(data: Omit<Model, "id" | "createdAt" | "updatedAt">): Model;
  updateModel(id: number, data: Partial<Model>): void;
  deleteModel(id: number): void;

  // Capability Selection
  select(requirements: CapabilityRequirement): SelectResult;
  hasCapability(cap: Capability): boolean;
  availableCapabilities(): Capability[];

  // Stats
  getStatsRange(from: string, to: string): DailyStats;
  getStatsByModel(from?: string, to?: string): ModelStats[];
  getStatsByChannel(from?: string, to?: string): ChannelStats[];
  getRecentLogs(limit: number, offset: number): RelayLog[];
  getLogDetail(id: number): RelayLog | undefined;
  getChannelRanking(from: string, to: string): ChannelRankItem[];
  getModelRanking(from: string, to: string): ModelRankItem[];
  getLatencyPercentiles(from: string, to: string, channelId?: number): LatencyPercentiles;
  getChannelStability(channelId: number, from: string, to: string): StabilityPoint[];
  getStatsDailyTrend(from: string, to: string): TrendPoint[];
  getStatsHourlyTrend(from: string, to: string): TrendPoint[];

  // Prices
  listPrices(): ModelPrice[];
  updatePrice(modelName: string, prices: Partial<ModelPrice>): void;
}
