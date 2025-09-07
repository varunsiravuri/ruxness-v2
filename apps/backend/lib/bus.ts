import { createClient } from "redis";
import crypto from "crypto";
import { RedisSubscriber } from "../redisSubscriber";

const ORDERS_STREAM = "trade-stream";

export function makeBus(redisUrl: string) {
  const client = createClient({ url: redisUrl });
  const sub = new RedisSubscriber({ url: redisUrl });

  async function start() {
    await client.connect();
  }

  async function send(kind: string, body: any, timeoutMs = 5000) {
    const id = crypto.randomUUID();
    const msg = { id, kind, ...body, ts: Date.now() };
    await client.xAdd(ORDERS_STREAM, "*", { message: JSON.stringify(msg) });
    return await sub.waitForMessage(id, timeoutMs);
  }

  return { start, send };
}
