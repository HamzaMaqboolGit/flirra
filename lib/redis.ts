import Redis from "ioredis";

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

export async function rateLimit(key: string, limit: number, windowSec: number) {
  const client = redis();
  const count = Number(await client.eval(
    "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
    1,
    key,
    windowSec,
  ));
  return count <= limit;
}
