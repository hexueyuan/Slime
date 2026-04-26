import type {
  Channel,
  ChannelKey,
  ChannelType,
  Group,
  GroupItem,
  GatewayApiKey,
  ModelPrice,
  ModelSlot,
  DailyStats,
  ModelStats,
  ChannelStats,
  RelayLog,
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

  // Slot
  resolveSlot(slot: ModelSlot): string | undefined;

  // Stats
  getStatsRange(from: string, to: string): DailyStats;
  getStatsByModel(from?: string, to?: string): ModelStats[];
  getStatsByChannel(from?: string, to?: string): ChannelStats[];
  getRecentLogs(limit: number, offset: number): RelayLog[];

  // Prices
  listPrices(): ModelPrice[];
  updatePrice(modelName: string, prices: Partial<ModelPrice>): void;
}
