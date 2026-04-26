import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type BetterSqlite3 from "better-sqlite3";
import type { Relay } from "./relay";
import type { Router } from "./router";
import { createAuthHook } from "./auth";
import { registerAnthropicInbound } from "./inbound/anthropic";
import { registerOpenAIResponsesInbound } from "./inbound/openai-responses";

export interface ServerDeps {
  relay: Relay;
  router: Router;
  db: BetterSqlite3.Database;
}

export interface GatewayServer {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  getAddress(): string | null;
  getFastify(): FastifyInstance;
}

export function createServer(deps: ServerDeps): GatewayServer {
  const fastify = Fastify({ logger: false });
  let address: string | null = null;

  fastify.addHook("preHandler", createAuthHook(deps.db));
  registerAnthropicInbound(fastify, deps.relay, deps.router);
  registerOpenAIResponsesInbound(fastify, deps.relay, deps.router);

  return {
    async start(port) {
      await fastify.listen({ host: "127.0.0.1", port });
      address = `http://127.0.0.1:${port}`;
    },
    async stop() {
      await fastify.close();
      address = null;
    },
    getAddress() {
      return address;
    },
    getFastify() {
      return fastify;
    },
  };
}
