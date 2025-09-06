// engine/index.ts
import { createClient } from "redis";
import { MongoClient } from "mongodb";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME ?? "ruxness";

// --- Redis ---
const client = createClient({ url: REDIS_URL });
await client.connect();

// --- Mongo (for price snapshots) ---
const mongo = new MongoClient(MONGO_URI);
await mongo.connect();
const snaps = mongo.db(DB_NAME).collection("price_snapshots");

async function getPrice(asset: string): Promise<number> {
  const doc = (await snaps.findOne({ asset })) as any;
  if (!doc) throw new Error(`No snapshot for asset ${asset}`);
  return doc.price / Math.pow(10, doc.decimal);
}

// simple demo balance
const balances: Record<string, { usd: number }> = { user1: { usd: 1000 } };

async function run() {
  let lastId = "$"; // only new orders

  for (;;) {
    const resp = (await client.xRead([{ key: "trade-stream", id: lastId }], {
      BLOCK: 0,
      COUNT: 10,
    })) as any; // <-- keep it simple

    if (!resp || !resp[0]?.messages?.length) continue;

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

        balances.user1 ??= { usd: 0 };
        balances.user1.usd -= cost;

        await client.xAdd("callback-queue", "*", {
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
        await client.xAdd("callback-queue", "*", {
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
