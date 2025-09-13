import { createClient, type RedisClientType } from "redis";
import { MongoClient } from "mongodb";
import crypto from "node:crypto";
type Side = "long" | "short";

export type Bal = { balance: number; decimal: number };
export type Px = { mid: number; decimal: number; ts: number };
export type PriceUpdate = { asset: string; price: number; decimal: number };
export type StreamPriceBatch = { price_updates: PriceUpdate[] };

export type CreateCmd = {
  id: string;
  kind: "trade-open";
  userId: string;
  asset: string;
  type: Side;
  leverage: number;
  margin: number;
  expectedPrice?: number;
  slippage?: number;
};

export type CloseCmd = {
  id: string;
  kind: "trade-close";
  userId: string;
  orderId: string;
};

export type GetUserBalCmd = {
  id: string;
  kind: "get-user-bal";
  userId: string;
};

export type OpenOrder = {
  id: string;
  userId: string;
  asset: string;
  side: Side;
  leverage: number;
  margin: number; 
  quantity: number;
  openPrice: number;
  decimal: number;
  closePrice?: number;
  pnl?: number; 
  liquidated?: boolean;
};

const ORDERS_STREAM = process.env.ORDERS_STREAM ?? "trade-stream";
const CALLBACK_STREAM = process.env.CALLBACK_STREAM ?? "callback-queue";
const PRICES_STREAM = process.env.PRICES_STREAM ?? "prices:updates";
const SNAPCOLL = process.env.SNAPSHOT_COLL ?? "engine_snapshots";

const toInt4 = (x: number) => Math.round(x * 10_000);
const fromInt4 = (i: number) => i / 10_000;

export class Engine {
  private r: RedisClientType;
  private m: MongoClient;
  private balances: Record<string, Bal> = {};
  private openOrders: Record<string, OpenOrder[]> = {};
  private prices: Record<string, Px> = {};
  private lastOrderId = "$";
  private lastPriceId = "$";
  private snaps!: import("mongodb").Collection;

  private ensureBucket(userId: string): OpenOrder[] {
    return (this.openOrders[userId] ??= []);
  }
  private ensureBalance(userId: string): { balance: number; decimal: number } {
    return (this.balances[userId] ??= { balance: 0, decimal: 2 });
  }

  constructor(
    private redisUrl: string,
    private mongoUrl: string,
    private dbName: string
  ) {
    this.r = createClient({ url: redisUrl });
    this.m = new MongoClient(mongoUrl);
  }

  async start() {
    await this.r.connect();
    await this.m.connect();

    this.snaps = this.m.db(this.dbName).collection(SNAPCOLL);
    const snap = await this.snaps.findOne({}, { sort: { ts: -1 } });
    if (snap) {
      this.balances = snap.balances ?? {};
      this.openOrders = snap.openOrders ?? {};
      this.prices = snap.prices ?? {};
      this.lastOrderId = snap.lastOrderId ?? "$";
      this.lastPriceId = snap.lastPriceId ?? "$";
      console.log(
        "[engine] restored snapshot @",
        new Date(snap.ts).toISOString()
      );
    }
    setInterval(() => this.snapshot().catch(() => {}), 10_000);
    setInterval(() => this.checkLiquidations().catch(() => {}), 1_000);
    this.runOrdersLoop().catch(this.crash);
    this.runPricesLoop().catch(this.crash);

    console.log("[engine] up:", {
      ordersStream: ORDERS_STREAM,
      pricesStream: PRICES_STREAM,
      callbackStream: CALLBACK_STREAM,
    });
  }

  private crash = (e: any) => {
    console.error("[engine] fatal", e);
    process.exit(1);
  };

  private async snapshot() {
    await this.snaps.insertOne({
      ts: Date.now(),
      balances: this.balances,
      openOrders: this.openOrders,
      prices: this.prices,
      lastOrderId: this.lastOrderId,
      lastPriceId: this.lastPriceId,
    });
    console.log("[engine] snapshot saved");
  }

  private async runPricesLoop() {
    for (;;) {
      const res = (await this.r.xRead(
        [{ key: PRICES_STREAM, id: this.lastPriceId }],
        { BLOCK: 0, COUNT: 100 }
      )) as Array<{
        name: string;
        messages: Array<{ id: string; message: any }>;
      }> | null;

      if (!res?.[0]?.messages?.length) continue;

      for (const msg of res[0].messages) {
        this.lastPriceId = msg.id;
        const raw = (msg.message as any).payload ?? msg.message;

        let batch: StreamPriceBatch | null = null;
        try {
          const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
          batch = obj as StreamPriceBatch;
        } catch {
          continue;
        }
        if (!batch?.price_updates?.length) continue;

        for (const u of batch.price_updates) {
          const { asset, price, decimal } = u;
          const mid = price / Math.pow(10, decimal);
          this.prices[asset] = { mid, decimal, ts: Date.now() };
        }
        await this.checkLiquidations();
      }
    }
  }

  private async runOrdersLoop() {
    for (;;) {
      const res = (await this.r.xRead(
        [{ key: ORDERS_STREAM, id: this.lastOrderId }],
        { BLOCK: 0, COUNT: 50 }
      )) as Array<{
        name: string;
        messages: Array<{ id: string; message: any }>;
      }> | null;

      if (!res?.[0]?.messages?.length) continue;

      for (const msg of res[0].messages) {
        this.lastOrderId = msg.id;

        const raw = (msg.message as any).message ?? msg.message;
        const cmd = typeof raw === "string" ? JSON.parse(raw) : raw;

        try {
          switch (cmd.kind) {
            case "user-signup":
            case "user-signin":
              await this.onUserInit(cmd);
              break;

            case "trade-open":
              await this.onTradeOpen(cmd as CreateCmd);
              break;

            case "trade-close":
              await this.onTradeClose(cmd as CloseCmd);
              break;

            case "get-user-bal":
              await this.onGetUserBal(cmd as GetUserBalCmd);
              break;

            case "closePosition":
              await this.onTradeOpen({
                id: cmd.id,
                kind: "trade-open",
                userId: cmd.userId,
                asset: cmd.asset,
                type: cmd.type,
                leverage: cmd.leverage,
                margin: cmd.margin, // dollars
                expectedPrice: undefined,
                slippage: cmd.slippage,
              } as CreateCmd);
              break;

            case "createPosition":
              await this.onTradeClose({
                id: cmd.id,
                kind: "trade-close",
                userId: cmd.userId,
                orderId: cmd.orderId,
              } as CloseCmd);
              break;

            case "getBalanceUsd": {
              const b = this.ensureBalance(String(cmd.userId ?? ""));
              await this.reply(cmd.id, { balance: b.balance });
              break;
            }

            case "getBalances": {
              const userId = String(cmd.userId ?? "");
              const out: Record<string, { balance: number; decimals: number }> =
                {};
              for (const o of this.openOrders[userId] ?? []) {
                const sym = o.asset.toUpperCase();
                if (!out[sym]) out[sym] = { balance: 0, decimals: 4 };
                out[sym].balance += (o.side === "long" ? 1 : -1) * o.margin;
              }
              for (const s of ["BTC", "ETH", "SOL"]) {
                if (!out[s]) out[s] = { balance: 0, decimals: 4 };
              }
              await this.reply(cmd.id, out);
              break;
            }

            default:
              await this.reply(cmd.id ?? crypto.randomUUID(), {
                status: "rejected",
                error: "UNKNOWN_KIND",
              });
          }
        } catch (e: any) {
          await this.reply(cmd?.id ?? crypto.randomUUID(), {
            status: "rejected",
            error: String(e?.message ?? e),
          });
        }
      }
    }
  }

  private async onUserInit(cmd: any) {
    const userId = String(cmd.userId ?? "");
    if (!userId) throw new Error("userId required");

    if (!this.balances[userId]) {
      this.balances[userId] = { balance: 5_000_00, decimal: 2 };
    }
    if (!this.openOrders[userId]) this.openOrders[userId] = [];

    await this.reply(cmd.id, { status: "ok", note: "user initialized" });
  }

  private currentPx(asset: string): { mid4: number; decimal: number } {
    const px = this.prices[asset];
    if (!px) throw new Error(`no price yet for ${asset}`);
    return { mid4: toInt4(px.mid), decimal: 4 };
  }

  private ensureSlippageOK(
    expectedPrice?: number,
    actualPrice?: number,
    maxBps?: number
  ) {
    if (expectedPrice == null || actualPrice == null || maxBps == null) return;
    const diffBps =
      Math.abs((actualPrice - expectedPrice) / expectedPrice) * 10_000;
    if (diffBps > maxBps) {
      throw new Error(
        `slippage exceeded: ${diffBps.toFixed(2)} bps > ${maxBps} bps`
      );
    }
  }

  private async onTradeOpen(cmd: CreateCmd) {
    const userId = String(cmd.userId ?? "");
    const asset = String(cmd.asset ?? "").toUpperCase();
    const side = cmd.type;
    const lev = Number(cmd.leverage);
    const marginDollars = Number(cmd.margin);

    if (
      !userId ||
      !asset ||
      (side !== "long" && side !== "short") ||
      !Number.isFinite(lev) ||
      lev <= 0
    ) {
      throw new Error("invalid input");
    }
    if (!Number.isFinite(marginDollars) || marginDollars <= 0) {
      throw new Error("invalid margin");
    }

    const wallet = this.ensureBalance(userId);
    const needCents = Math.round(marginDollars * 100);
    if (wallet.balance < needCents) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    const { mid4 } = this.currentPx(asset);
    this.ensureSlippageOK(cmd.expectedPrice, fromInt4(mid4), cmd.slippage);
    const marginInt4 = toInt4(marginDollars);
    wallet.balance -= needCents;
    const qty4 = Math.max(1, Math.floor((marginInt4 * lev) / mid4));

    const order: OpenOrder = {
      id: crypto.randomUUID(),
      userId,
      asset,
      side,
      leverage: lev,
      margin: marginInt4,
      quantity: qty4,
      openPrice: mid4,
      decimal: 4,
    };

    (this.openOrders[userId] ??= []).push(order);

    await this.reply(cmd.id, {
      status: "accepted",
      orderId: order.id,
      userBalanceCents: wallet.balance,
    });
  }

  private async onTradeClose(cmd: CloseCmd) {
    const userId = String(cmd.userId ?? "");
    const orderId = String(cmd.orderId ?? "");
    if (!userId || !orderId) throw new Error("userId/orderId required");

    const bucket: OpenOrder[] = this.openOrders[userId] ?? [];
    const idx = bucket.findIndex((o) => o.id === orderId);
    if (idx === -1) throw new Error("order not found");
    const order = bucket[idx]!;

    const { mid4 } = this.currentPx(order.asset);
    const pnl4 = this.computePnl(order, mid4);
    const credit4 = order.margin + pnl4;
    const creditCents = Math.round(fromInt4(credit4) * 100);

    this.ensureBalance(userId).balance += creditCents;
    const wallet = this.ensureBalance(userId);
    wallet.balance += creditCents;
    order.closePrice = mid4;
    order.pnl = pnl4;
    order.liquidated = false;

    bucket.splice(idx, 1);
    this.openOrders[userId] = bucket;

    await this.reply(cmd.id, {
      status: "closed",
      orderId: order.id,
      pnl4,
      userBalanceCents: wallet.balance,
    });
  }

  private async onGetUserBal(cmd: GetUserBalCmd) {
    const userId = String(cmd.userId ?? "");
    if (!userId) throw new Error("userId required");
    const bal = this.ensureBalance(userId);
    await this.reply(cmd.id, { balance: bal.balance });
  }

  private async checkLiquidations() {
    const now = Date.now();
    const ops: Array<Promise<any>> = [];

    for (const [userId, orders] of Object.entries(this.openOrders)) {
      const bucket = this.ensureBucket(userId);

      for (const o of [...orders]) {
        const px = this.prices[o.asset];
        if (!px) continue;

        const cur4 = toInt4(px.mid);
        const pnl4 = this.computePnl(o, cur4);
        const lossCapacity4 = Math.floor(o.margin / o.leverage);

        if (pnl4 < -Math.floor(0.9 * lossCapacity4)) {
          const credit4 = o.margin + pnl4;
          const creditCents = Math.round(fromInt4(credit4) * 100);

          this.ensureBalance(userId).balance += creditCents;

          o.closePrice = cur4;
          o.pnl = pnl4;
          o.liquidated = true;

          this.openOrders[userId] = bucket.filter((x) => x.id !== o.id);

          ops.push(
            this.reply(crypto.randomUUID(), {
              status: "liquidated",
              orderId: o.id,
              userId,
              asset: o.asset,
              pnl4,
              ts: now,
            })
          );
        }
      }
    }

    if (ops.length) await Promise.allSettled(ops);
  }

  private computePnl(o: OpenOrder, cur4: number): number {
    const change = o.side === "long" ? cur4 - o.openPrice : o.openPrice - cur4;
    return Math.floor((change * o.leverage * o.quantity) / 10_000);
  }

  private async reply(id: string, payload: any) {
    await this.r.xAdd(CALLBACK_STREAM, "*", {
      message: JSON.stringify({ id, ...payload }),
    });
  }
}
