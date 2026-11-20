import Redis from "ioredis";
import { prisma } from "./db";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function redis() {
  if (!globalForRedis.redis) {
    const client = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 2_000,
      commandTimeout: 2_500,
      retryStrategy: (attempt) => Math.min(attempt * 100, 500),
    });
    client.on("error", (error) => {
      console.error("[redis]", error.message);
    });
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}

export class RateLimitUnavailableError extends Error {
  readonly code = "RATE_LIMIT_UNAVAILABLE";
  constructor() {
    super("Authentication throttling is unavailable");
    this.name = "RateLimitUnavailableError";
  }
}

export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSec * 1000);
  // Authentication throttling must not depend on a local Redis daemon. The
  // conditional update is atomic in PostgreSQL and works across instances.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const bucket = await tx.rateLimitBucket.findUnique({ where: { key } });
      if (!bucket || bucket.expiresAt <= now) {
        await tx.rateLimitBucket.upsert({
          where: { key },
          create: { key, count: 1, windowStart: now, expiresAt },
          update: { count: 1, windowStart: now, expiresAt },
        });
        return 1;
      }
      const updated = await tx.rateLimitBucket.updateMany({
        where: { key, expiresAt: { gt: now }, count: { lt: limit + 1 } },
        data: { count: { increment: 1 } },
      });
      return updated.count ? bucket.count + 1 : limit + 1;
    }, { isolationLevel: "Serializable" });
    return result <= limit;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as {code?: unknown}).code) : "UNKNOWN";
    console.error("[rate-limit] database operation failed", code);
    // A missing migration or unavailable database is operationally different
    // from a real limit. Never turn an infrastructure outage into a misleading
    // 429, and never fail open for authentication throttles.
    throw new RateLimitUnavailableError();
  }
}
