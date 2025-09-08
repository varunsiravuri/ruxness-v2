import { createClient, type RedisClientType } from "redis";
import crypto from "crypto";
import { RedisSubscriber } from "../redisSubscriber";

const ORDERS_STREAM = "trade-stream";

export function makeBus(redisUrl: string) {
  const redis : RedisClientType = createClient({ url: redisUrl });
  const sub = new RedisSubscriber({ url: redisUrl });

  async function start() {
    if (!redis.isOpen) await redis.connect();
  }

  async function stop() {
    try {
      await redis.quit();
    } catch {}
  }

  async function send(kind: string, body: any, timeoutMs = 5000) {
    const id = crypto.randomUUID();
    const msg = { id, kind, ...body, ts: Date.now() };
    await redis.xAdd(ORDERS_STREAM, "*", { message: JSON.stringify(msg) });
    return await sub.waitForMessage(id, timeoutMs);
  }

  return { start, stop , send , redis };
}
