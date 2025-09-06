import express from "express";
import { createClient } from "redis";
import { RedisSubscriber, CALLBACK_QUEUE } from "./redisSubscriber";
import crypto from "crypto";

export const CREATE_ORDER_QUEUE = "trade-stream";

async function main() {
  const app = express();
  app.use(express.json());

  const client = createClient({
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  });
  await client.connect();

  const redisSubscriber = new RedisSubscriber({
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  });

  app.get("/trade/open", async (req, res) => {
    const startTime = Date.now();
    const asset = String(req.query.asset ?? "");
    const qty = Number(req.query.qty ?? NaN);
    const type = String(req.query.type ?? "");

    if (!asset || !Number.isFinite(qty) || !type) {
      return res.status(400).json({ error: "asset, qty, type are required" });
    }

    const id = crypto.randomUUID();

    // Enqueue order for the trade engine
    const payload = {
      kind: "create-order" as const,
      asset,
      qty,
      type,
      id,
      ts: Date.now(),
    };

    await client.xAdd(CREATE_ORDER_QUEUE, "*", {
      message: JSON.stringify(payload),
    });

    try {
      // Wait for the engine to reply on the callback queue
      const responseFromEngine = await redisSubscriber.waitForMessage(id, 5000);

      return res.json({
        ok: true,
        latency_ms: Date.now() - startTime,
        engine: responseFromEngine,
      });
    } catch (e) {
      return res.status(504).json({
        ok: false,
        error: "Engine did not respond in time",
      });
    }
  });

  // Stub for closing a trade (wire similarly to /trade/open)
  app.post("/trade/close", async (req, res) => {
    const { asset, qty, reason } = req.body ?? {};
    if (!asset || !qty) {
      return res.status(400).json({ error: "asset and qty are required" });
    }
    const id = crypto.randomUUID();
    const payload = {
      kind: "close-order" as const,
      asset,
      qty,
      reason: reason ?? null,
      id,
      ts: Date.now(),
    };

    await client.xAdd(CREATE_ORDER_QUEUE, "*", {
      message: JSON.stringify(payload),
    });

    try {
      const responseFromEngine = await redisSubscriber.waitForMessage(id, 5000);
      return res.json({ ok: true, engine: responseFromEngine });
    } catch {
      return res.status(504).json({ ok: false, error: "Engine timeout" });
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(
      `[backend] HTTP on :${port} | using queues: { orders: "${CREATE_ORDER_QUEUE}", callbacks: "${CALLBACK_QUEUE}" }`
    );
  });

  // graceful shutdown
  process.on("SIGINT", async () => {
    try {
      await client.quit();
      await redisSubscriber.quit();
    } finally {
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error("[backend] fatal", err);
  process.exit(1);
});
