import { randomBytes } from "crypto";
import type { IGatewayPresenter } from "@shared/types/presenters/gateway.presenter";
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
} from "@shared/types/gateway";
import { initDb, getDb, closeDb } from "@/db";
import * as channelDao from "@/db/models/channelDao";
import * as groupDao from "@/db/models/groupDao";
import * as apiKeyDao from "@/db/models/apiKeyDao";
import * as priceDao from "@/db/models/priceDao";
import * as logDao from "@/db/models/logDao";
import * as statsDao from "@/db/models/statsDao";
import * as modelDao from "@/db/models/modelDao";
import {
  createRouter,
  createBalancer,
  createCircuitBreaker,
  createKeyPool,
  createRelay,
  createServer,
  createStatsCollector,
  createScheduledTasks,
  createCapabilitySelector,
  initAdapters,
  calculateCost,
} from "@/gateway";
import type { Router } from "@/gateway/router";
import type { Relay } from "@/gateway/relay";
import type { GatewayServer } from "@/gateway/server";
import type { StatsCollector } from "@/gateway/stats";
import type { ScheduledTasks } from "@/gateway/tasks";
import type { CapabilitySelector } from "@/gateway/selector";
import { eventBus } from "@/eventbus";
import { GATEWAY_EVENTS } from "@shared/events";
import { logger } from "@/utils";

function randomHex(n: number): string {
  return randomBytes(n).toString("hex");
}

export class GatewayPresenter implements IGatewayPresenter {
  private port = 8930;
  private internalKeyValue = "";
  private router: Router;
  private relay: Relay;
  private server: GatewayServer;
  private statsCollector: StatsCollector;
  private scheduledTasks: ScheduledTasks;
  private selector: CapabilitySelector;

  constructor(dbPath?: string) {
    initDb(dbPath);
    const db = getDb();

    initAdapters();
    priceDao.seedPresets(db);

    this.router = createRouter();
    const balancer = createBalancer();
    const circuitBreaker = createCircuitBreaker();
    const keyPool = createKeyPool();
    this.selector = createCapabilitySelector(db, circuitBreaker);

    this.relay = createRelay({ db, router: this.router, balancer, circuitBreaker, keyPool });

    this.statsCollector = createStatsCollector(db);
    this.relay.onStats((data) => {
      const cost = calculateCost(db, data.modelName, data.usage);
      this.statsCollector.record({
        apiKeyId: data.apiKeyId,
        groupName: data.groupName,
        channelId: data.channelId,
        channelName: data.channelName,
        modelName: data.modelName,
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
        cacheReadTokens: data.usage.cacheReadTokens ?? 0,
        cacheWriteTokens: data.usage.cacheWriteTokens ?? 0,
        cost,
        durationMs: data.durationMs,
        status: data.status,
        error: data.error,
        requestBody: data.requestBody,
        responseBody: data.responseBody,
        ttftMs: data.ttftMs,
      });
      this.statsCollector.flush();
      eventBus.sendToRenderer(GATEWAY_EVENTS.LOG_ADDED);
    });

    this.scheduledTasks = createScheduledTasks(db);
    this.ensureInternalKey();
    this.server = createServer({ relay: this.relay, router: this.router, db });
  }

  async init(configPort?: number): Promise<void> {
    if (configPort !== undefined) this.port = configPort;
    const db = getDb();
    groupDao.ensureBuiltinGroups(db);
    groupDao.syncBuiltinGroupItems(db);
    this.router.reload(db);
    await this.server.start(this.port);
    this.scheduledTasks.start();
    logger.info("Gateway started", { port: this.port });
  }

  async destroy(): Promise<void> {
    await this.server.stop();
    this.statsCollector.destroy();
    this.scheduledTasks.stop();
    closeDb();
    logger.info("Gateway destroyed");
  }

  // --- Internal ---

  private ensureInternalKey(): void {
    const db = getDb();
    let internal = apiKeyDao.getInternalKey(db);
    if (!internal) {
      const key = `sk-slime-${randomHex(32)}`;
      internal = apiKeyDao.createApiKey(db, {
        name: "Internal",
        key,
        enabled: true,
        isInternal: true,
      });
    }
    this.internalKeyValue = internal.key;
  }

  // --- Server ---

  getPort(): number {
    return this.port;
  }

  getInternalKey(): string {
    return this.internalKeyValue;
  }

  // --- Channel CRUD ---

  listChannels(): Channel[] {
    return channelDao.listChannels(getDb());
  }

  createChannel(data: Omit<Channel, "id" | "createdAt" | "updatedAt">): Channel {
    return channelDao.createChannel(getDb(), data);
  }

  updateChannel(id: number, data: Partial<Channel>): void {
    channelDao.updateChannel(getDb(), id, data);
  }

  deleteChannel(id: number): void {
    channelDao.deleteChannel(getDb(), id);
    this.syncAndReload();
  }

  private async fetchModelsFromApi(
    type: ChannelType,
    baseUrl: string,
    apiKey: string,
  ): Promise<string[]> {
    const base = baseUrl.replace(/\/+$/, "");
    const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (type === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (type === "gemini") {
      headers["x-goog-api-key"] = apiKey;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = (await resp.json()) as Record<string, unknown>;
    return (
      (body.data as Array<{ id: string }>)?.map((m) => m.id) ??
      (body.models as Array<{ name: string }>)?.map((m) => m.name) ??
      []
    );
  }

  async testChannel(id: number): Promise<{ success: boolean; models?: string[]; error?: string }> {
    const channel = channelDao.getChannel(getDb(), id);
    if (!channel) return { success: false, error: "Channel not found" };
    const keys = channelDao.listChannelKeys(getDb(), id);
    if (keys.length === 0) return { success: false, error: "No API keys configured" };

    try {
      const models = await this.fetchModelsFromApi(channel.type, channel.baseUrls[0], keys[0].key);
      return { success: true, models };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async fetchModels(id: number): Promise<string[]> {
    const result = await this.testChannel(id);
    return result.models ?? [];
  }

  async fetchModelsByConfig(type: ChannelType, baseUrl: string, apiKey: string): Promise<string[]> {
    return this.fetchModelsFromApi(type, baseUrl, apiKey);
  }

  // --- Channel Keys ---

  listChannelKeys(channelId: number): ChannelKey[] {
    return channelDao.listChannelKeys(getDb(), channelId);
  }

  addChannelKey(channelId: number, key: string): ChannelKey {
    return channelDao.addChannelKey(getDb(), channelId, key);
  }

  removeChannelKey(id: number): void {
    channelDao.removeChannelKey(getDb(), id);
  }

  // --- Group CRUD ---

  listGroups(): Group[] {
    return groupDao.listGroups(getDb());
  }

  createGroup(data: Omit<Group, "id" | "createdAt" | "updatedAt">): Group {
    const result = groupDao.createGroup(getDb(), data);
    this.router.reload(getDb());
    return result;
  }

  updateGroup(id: number, data: Partial<Group>): void {
    groupDao.updateGroup(getDb(), id, data);
    this.router.reload(getDb());
  }

  deleteGroup(id: number): void {
    const group = groupDao.getGroup(getDb(), id);
    if (group?.isBuiltin) return;
    groupDao.deleteGroup(getDb(), id);
    this.router.reload(getDb());
  }

  // --- Group Items ---

  listGroupItems(groupId: number): GroupItem[] {
    return groupDao.listGroupItems(getDb(), groupId);
  }

  setGroupItems(groupId: number, items: Omit<GroupItem, "id" | "groupId">[]): void {
    groupDao.setGroupItems(getDb(), groupId, items);
    this.router.reload(getDb());
  }

  // --- API Key CRUD ---

  listApiKeys(): GatewayApiKey[] {
    return apiKeyDao.listApiKeys(getDb());
  }

  createApiKey(data: {
    name: string;
    expiresAt?: string;
    maxCost?: number;
    allowedModels?: string[];
  }): GatewayApiKey {
    const key = `sk-gw-${randomHex(24)}`;
    return apiKeyDao.createApiKey(getDb(), {
      name: data.name,
      key,
      enabled: true,
      isInternal: false,
      expiresAt: data.expiresAt,
      maxCost: data.maxCost,
      allowedModels: data.allowedModels,
    });
  }

  updateApiKey(id: number, data: Partial<GatewayApiKey>): void {
    apiKeyDao.updateApiKey(getDb(), id, data);
  }

  deleteApiKey(id: number): void {
    apiKeyDao.deleteApiKey(getDb(), id);
  }

  // --- Models ---

  listModels(): Model[] {
    return modelDao.listModels(getDb());
  }

  listModelsByChannel(channelId: number): Model[] {
    return modelDao.listModelsByChannel(getDb(), channelId);
  }

  createModel(data: Omit<Model, "id" | "createdAt" | "updatedAt">): Model {
    const result = modelDao.createModel(getDb(), data);
    this.syncAndReload();
    return result;
  }

  updateModel(id: number, data: Partial<Model>): void {
    modelDao.updateModel(getDb(), id, data);
    this.syncAndReload();
  }

  deleteModel(id: number): void {
    modelDao.deleteModel(getDb(), id);
    this.syncAndReload();
  }

  private syncAndReload(): void {
    groupDao.syncBuiltinGroupItems(getDb());
    this.router.reload(getDb());
  }

  // --- Capability Selection ---

  select(requirements: CapabilityRequirement): SelectResult {
    return this.selector.select(requirements);
  }

  hasCapability(cap: Capability): boolean {
    return this.selector.hasCapability(cap);
  }

  availableCapabilities(): Capability[] {
    return this.selector.availableCapabilities();
  }

  // --- Stats ---

  getStatsRange(from: string, to: string): DailyStats {
    return statsDao.getStatsRange(getDb(), from, to);
  }

  getStatsByModel(from?: string, to?: string): ModelStats[] {
    return statsDao.getStatsByModel(getDb(), from, to);
  }

  getStatsByChannel(from?: string, to?: string): ChannelStats[] {
    return statsDao.getStatsByChannel(getDb(), from, to);
  }

  getRecentLogs(limit: number, offset: number): RelayLog[] {
    return logDao.getRecentLogs(getDb(), limit, offset);
  }

  getLogDetail(id: number): RelayLog | undefined {
    return logDao.getLogDetail(getDb(), id);
  }

  // --- Prices ---

  listPrices(): ModelPrice[] {
    return priceDao.listPrices(getDb());
  }

  updatePrice(modelName: string, prices: Partial<ModelPrice>): void {
    priceDao.upsertPrice(getDb(), modelName, {
      inputPrice: prices.inputPrice ?? 0,
      outputPrice: prices.outputPrice ?? 0,
      cacheReadPrice: prices.cacheReadPrice,
      cacheWritePrice: prices.cacheWritePrice,
      source: prices.source,
    });
  }
}
