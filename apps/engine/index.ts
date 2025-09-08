import { createClient } from "redis";
import { startSnapshotter } from "./snapShotter";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const ORDERS_STREAM = "trade-stream";
const CALLBACK_STREAM = "callback-queue";
const balances: Record<string, { usd: number }> = {};

const r = createClient({ url: REDIS_URL });
await r.connect();



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

async function reply(id: string, payload: any) {
  await r.xAdd(CALLBACK_STREAM, "*", {
    message: JSON.stringify({ id, ...payload }),
  });
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
      const msg = typeof raw === "string" ? JSON.parse(raw) : raw;

      function ensureUser(userId: string, initialUsd = 5000) {
        if (!balances[userId]) balances[userId] = { usd: initialUsd };
        return balances[userId];
      }

      try {
        const kind = msg.kind as string;
        switch (kind) {
          case "getBalanceUsd": {
            const userId = String(msg.userId ?? "user1");
            const acct = ensureUser(userId,5000);
            await reply(msg.id, { balance: Math.round(acct.usd * 100) });
            break;
          }

          case "get-balances": {
            const userId = String(msg.userId ?? "user1");
            ensureUser(userId,5000);
            await reply(msg.id, {
              BTC: { balance: 0, decimals: 4 },
              ETH: { balance: 0, decimals: 4 },
              SOL: { balance: 0, decimals: 6 },
            });
            break;
          }

          case "create-position": {
            const userId = String(msg.userId ?? "user1");
            const asset = String(msg.asset ?? "").toUpperCase();
            const type = String(msg.type ?? "").toLowerCase();
            const margin = Number(msg.margin);
            const leverage = Number(msg.leverage);

            if (
              !asset ||
              !["long", "short"].includes(type) ||
              !Number.isFinite(margin) ||
              !Number.isFinite(leverage) ||
              margin <= 0 ||
              leverage <= 0
            ) {
              throw new Error("invalid create-position payload");
            }

            const px = await getPrice(asset);
            const notional = margin * leverage;
            const qty = notional / px;
            const acct = ensureUser(userId,5000);
            acct.usd -= Number(margin);
            await reply(msg.id, {
              orderId: msg.id,
              asset,
              type,
              qty,
              price: px,
              margin,
              leverage,
              balance_usd: acct.usd,
            });
            break;
          }
          case "close-position": {
            const userId = String(msg.userId ?? "user1");
            const orderId = String(msg.orderId ?? "");
            if (!orderId) throw new Error("orderId required");

            const acct = ensureUser(userId);
            acct.usd += 100;

            await reply(msg.id, { ok: true, orderId, balance_usd: acct.usd });
            break;
          }
          default:
            await reply(msg.id, { error: `unknown kind: ${kind}` });
        }
      } catch (err: any) {
        await reply((msg && msg.id) || "n/a", {
          status: "rejected",
          error: String(err?.message ?? err),
          ts: Date.now(),
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
