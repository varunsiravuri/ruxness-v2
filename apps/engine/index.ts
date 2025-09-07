
import { createClient } from "redis";
import { startSnapshotter } from "./snapShotter";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const ORDERS_STREAM = "trade-stream";
const CALLBACK_STREAM = "callback-queue";

const r = createClient({ url: REDIS_URL });
await r.connect();

const balances: Record<string, { usd: number }> = { user1: { usd: 5000 } };

async function getPrice(asset: string): Promise<number> {
  const key = `px:${asset.toUpperCase()}`;
  const h = await r.hGetAll(key);
  if (!h?.price || !h?.decimal) {
    throw new Error(`price not available for ${asset} (key ${key})`);
  }
  const p = Number(h.price); 
  const d = Number(h.decimal); 
  return p / Math.pow(10, d); 
}
startSnapshotter();

async function run() {
  let lastId = "$";

  for (;;) {
    const resp = (await r.xRead([{ key: ORDERS_STREAM, id: lastId }], {
      BLOCK: 0,
      COUNT: 10,
    })) as Array<{
      name: string;
      messages: Array<{ id: string; message: any }>;
    }> | null;

    if (!resp?.[0]?.messages?.length) continue;

    for (const m of resp[0].messages) {
      lastId = m.id;

      const raw = (m.message as any).message ?? m.message;
      const order = typeof raw === "string" ? JSON.parse(raw) : raw;

      try {
        const asset = String(order.asset ?? "").toUpperCase();
        const qty = Number(order.qty);
        if (!asset || !Number.isFinite(qty) || qty <= 0) {
          throw new Error("invalid order: asset and positive qty required");
        }

        const price = await getPrice(asset);
        const cost = qty * price;

        (balances.user1 ??= { usd: 0 }).usd -= cost;

        await r.xAdd(CALLBACK_STREAM, "*", {
          message: JSON.stringify({
            id: order.id,
            status: "accepted",
            asset,
            qty,
            price,
            cost,
            balance_usd: balances.user1.usd,
            ts: Date.now(),
          }),
        });
      } catch (err: any) {
        await r.xAdd(CALLBACK_STREAM, "*", {
          message: JSON.stringify({
            id: order?.id ?? null,
            status: "rejected",
            error: String(err?.message ?? err),
            ts: Date.now(),
          }),
        });
      }
    }
  }
}

run().catch((e) => {
  console.error("[engine] fatal", e);
  process.exit(1);
});

process.on("SIGINT", async () => {
  try {
    await r.quit();
  } finally {
    process.exit(0);
  }
});
