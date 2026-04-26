import type BetterSqlite3 from "better-sqlite3";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getApiKeyByKey } from "@/db/models/apiKeyDao";

function extractKey(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const xApiKey = request.headers["x-api-key"];
  if (typeof xApiKey === "string") return xApiKey;
  return undefined;
}

function authError(reply: FastifyReply, message: string) {
  return reply.code(401).send({ error: { type: "authentication_error", message } });
}

export function createAuthHook(db: BetterSqlite3.Database) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = extractKey(request);
    if (!key) return authError(reply, "missing api key");

    const apiKey = getApiKeyByKey(db, key);
    if (!apiKey) return authError(reply, "invalid api key");
    if (!apiKey.enabled) return authError(reply, "api key disabled");
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return authError(reply, "api key expired");
    }

    request.apiKeyId = apiKey.id;
    request.allowedModels = apiKey.allowedModels;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    apiKeyId: number;
    allowedModels?: string[];
  }
}
