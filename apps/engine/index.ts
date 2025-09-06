// engine/index.ts
import { createClient } from "redis";
import { MongoClient } from "mongodb";

type Order = {
  id: string;
  kind: "create-order" | "close-order";
  asset: string; // e.g., "BTC"
  qty: number | string; // backend might send as string from query
  type?: string; // e.g., "market"
  ts?: number;
};

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME ?? "ruxness";

// --- Redis ---
const client = createClient({ url: REDIS_URL });
await client.connect();

// --- Mongo ---
const mongo = new MongoClient(MONGO_URI);
await mongo.connect();
const snaps = mongo.db(DB_NAME).collection("price_snapshots");

async function getPrice(asset: string): Promise<number> {
  const doc = await snaps.findOne<{
    asset: string;
    price: number;
    decimal: number;
  }>({ asset });
  if (!doc) throw new Error(`No snapshot for asset ${asset}`);
  // Convert integer price + decimal -> float
  return doc.price / Math.pow(10, doc.decimal);
}

// demo in-memory state
const balances: Record<string, { usd: number }> = { user1: { usd: 1000 } };
const openOrders: Order[] = [];

async function main() {
  let lastId = "$"; // only new messages since start

  for (;;) {
    const resp = await client.xRead([{ key: "trade-stream", id: lastId }], {
      BLOCK: 0,
      COUNT: 10,
    });
    if (!resp) continue;

    const { messages } = resp[0];

    for (const msg of messages) {
      lastId = msg.id;

      // unwrap message
      const raw = (msg.message as any).message ?? msg.message;
      const order: Order = typeof raw === "string" ? JSON.parse(raw) : raw;

      try {
        // basic validation
        const asset = String(order.asset ?? "").toUpperCase();
        const qty = Number(order.qty);
        if (!asset || !Number.isFinite(qty) || qty <= 0) {
          throw new Error("invalid order: asset and positive qty required");
        }

        // fetch live price from Mongo snapshots
        const px = await getPrice(asset); // e.g., 58942.13
        const cost = qty * px; // very simple example

        // update state (demo user only)
        balances.user1.usd -= cost;
        openOrders.push(order);

        console.log(
          `[engine] order ${order.id} accepted: ${qty} ${asset} @ ${px.toFixed(2)}; balance=${balances.user1.usd.toFixed(2)}`
        );

        // reply success
        await client.xAdd("callback-queue", "*", {
          message: JSON.stringify({
            id: order.id,
            status: "accepted",
            asset,
            qty,
            price: px,
            cost,
            balance_usd: balances.user1.usd,
            ts: Date.now(),
          }),
        });
      } catch (err: any) {
        console.error("[engine] order failed:", err?.message ?? err);

        // reply failure so backend doesn't hang
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

main().catch((e) => {
  console.error("[engine] fatal", e);
  process.exit(1);
});
