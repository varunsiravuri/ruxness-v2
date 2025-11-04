import { createClient, type RedisClientType } from "redis";
import { MongoClient } from "mongodb";
import crypto from "node:crypto";
import { PrismaClient, Symbol as AssetSymbol } from "@prisma/client"; 
type Side = "long" | "short";
import { CloseReason } from "@prisma/client";

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
  private prices: Record<string, Px> = {};
  private lastOrderId = "$";
  private lastPriceId = "$";
  private snaps!: import("mongodb").Collection;

  constructor(
    private redisUrl: string,
    private mongoUrl: string,
    private dbName: string,
<<<<<<< HEAD
    private prisma: PrismaClient
=======
    private prisma: PrismaClient 
>>>>>>> 0f6789623b3999f4abbdb26c3318ffb023ff4853
  ) {
    this.r = createClient({ url: redisUrl });
    this.m = new MongoClient(mongoUrl);
    this.prisma = prisma;
  }

  async start() {
    await this.r.connect();
    await this.m.connect();

    this.snaps = this.m.db(this.dbName).collection(SNAPCOLL);
    const snap = await this.snaps.findOne({}, { sort: { ts: -1 } });
    if (snap) {
      this.prices = snap.prices ?? {};
      this.lastOrderId = snap.lastOrderId ?? "$";
      this.lastPriceId = snap.lastPriceId ?? "$";
      console.log(
        "[engine] restored price cache @",
        new Date(snap.ts).toISOString()
      );
    }
    setInterval(() => this.snapshot().catch(() => {}), 10_000);
    setInterval(() => this.checkLiquidations().catch(() => {}), 1_000);

    this.runOrdersLoop().catch(this.crash);
    this.runOrdersLoop().catch((e) => console.error("RUNLOOP ERROR", e));

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
    console.log("[engine] starting runOrdersLoop");
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

            case "createPosition":
              await this.onTradeOpen({
                id: cmd.id,
                kind: "trade-open",
                userId: cmd.userId,
                asset: cmd.asset,
                type: cmd.type,
                leverage: cmd.leverage,
                margin: cmd.margin,
                expectedPrice: undefined,
                slippage: cmd.slippage,
              } as CreateCmd);
              break;

            case "closePosition":
              await this.onTradeClose({
                id: cmd.id,
                kind: "trade-close",
                userId: cmd.userId,
                orderId: cmd.orderId,
              } as CloseCmd);
              break;

            case "getBalanceUsd": {
              const userId = String(cmd.userId ?? "");
              const usdcAsset = await this.prisma.asset.findUnique({
                where: {
                  user_symbol_unique: { userId, symbol: "USDC" as AssetSymbol },
                },
              });
              await this.reply(cmd.id, { balance: usdcAsset?.balance ?? 0 });
              break;
            }

            case "getOpenOrders": {
              const userId = String(cmd.userId ?? "");
              const openOrders = await this.prisma.order.findMany({
                where: { userId, status: "open" },
                orderBy: { createdAt: "desc" },
              });
              await this.reply(cmd.id, { orders: openOrders });
              break;
            }

            case "getBalances": {
              const userId = String(cmd.userId ?? "");
              const assets = await this.prisma.asset.findMany({
                where: { userId },
              });
              const out: Record<string, { balance: number; decimals: number }> =
                {};

              for (const asset of assets) {
                out[asset.symbol] = {
                  balance: asset.balance,
                  decimals: asset.decimals,
                };
              }

              for (const s of ["BTC", "ETH", "SOL", "USDC"]) {
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
        } catch (err) {
          console.error("runOrdersLoop ERROR", err); 
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  private async onUserInit(cmd: any) {
    const userId = String(cmd.userId ?? "");
    if (!userId) throw new Error("userId required");

    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: userId,
          email: cmd.email ?? `${userId}@example.com`,
          password: cmd.password ?? "hashed",
          name: cmd.name ?? "User",
        },
      });
    }
    const symbols: AssetSymbol[] = ["BTC", "ETH", "SOL", "USDC"];
    for (const symbol of symbols) {
      const existing = await this.prisma.asset.findUnique({
        where: { user_symbol_unique: { userId, symbol } },
      });

      if (!existing) {
        await this.prisma.asset.create({
          data: {
            userId,
            symbol,
            balance: symbol === "USDC" ? 5_000_00 : 0,
            decimals: 2,
          },
        });
      }
    }

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

    const assetRow = await this.prisma.asset.findUnique({
<<<<<<< HEAD
      where: { user_symbol_unique: { userId, symbol: asset as AssetSymbol } },
=======
      where: { user_symbol_unique: { userId, symbol: asset as AssetSymbol} },
>>>>>>> 0f6789623b3999f4abbdb26c3318ffb023ff4853
    });
    const walletBalance = assetRow?.balance ?? 0;
    const needCents = Math.round(marginDollars * 100);
    if (walletBalance < needCents) throw new Error("INSUFFICIENT_FUNDS");

    await this.prisma.asset.update({
<<<<<<< HEAD
      where: { user_symbol_unique: { userId, symbol: asset as AssetSymbol } },
      data: { balance: { decrement: needCents } },
    });
    const marginInt4 = toInt4(marginDollars);
    const { mid4 } = this.currentPx(asset);
=======
      where: { user_symbol_unique: { userId, symbol: asset as AssetSymbol} },
      data: { balance: { decrement: needCents } },
    });
    const marginInt4 = toInt4(marginDollars);  
    const { mid4 } = this.currentPx(asset);  
>>>>>>> 0f6789623b3999f4abbdb26c3318ffb023ff4853
    const qty4 = Math.max(1, Math.floor((marginInt4 * lev) / mid4));
    this.ensureSlippageOK(cmd.expectedPrice, fromInt4(mid4), cmd.slippage);
    const order = await this.prisma.order.create({
      data: {
        userId,
        side,
        symbol: asset as AssetSymbol,
        status: "open",
        leverage: lev,
        margin: needCents,
        openingPrice: mid4,
        qty: qty4,
        decimals: 4,
        pnl: 0,
      },
    });

<<<<<<< HEAD
    const updatedAsset = await this.prisma.asset.findUnique({
      where: { user_symbol_unique: { userId, symbol: asset as AssetSymbol } },
    });
=======

    const order = await this.prisma.order.create({
      data: {
        userId,
        side,
        symbol: asset as AssetSymbol,
        status: "open",
        leverage: lev,
        margin: needCents,
        openingPrice: mid4,
        qty: qty4,
        decimals: 4,
        pnl: 0,
      },
    });

     const updatedAsset = await this.prisma.asset.findUnique({
       where: { user_symbol_unique: { userId, symbol: asset as AssetSymbol } },
     });
>>>>>>> 0f6789623b3999f4abbdb26c3318ffb023ff4853

    await this.reply(cmd.id, {
      status: "accepted",
      orderId: order.id,
      userBalanceCents: updatedAsset?.balance ?? 0,
    });
  }

  private async onTradeClose(cmd: CloseCmd) {
    const userId = String(cmd.userId ?? "");
    const orderId = String(cmd.orderId ?? "");
    if (!userId || !orderId) throw new Error("userId/orderId required");
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== "open") {
      throw new Error("order not found or already closed");
    }

    const { mid4 } = this.currentPx(order.symbol);

    const change =
      order.side === "long"
        ? mid4 - order.openingPrice
        : order.openingPrice - mid4;
    const pnl4 = Math.floor((change * order.leverage * order.qty) / 10_000);

    const credit4 = order.margin + pnl4;
    const creditCents = Math.round(fromInt4(credit4) * 100);

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: "closed",
        pnl: pnl4,
        closingPrice: mid4,
        closedAt: new Date(),
      },
    });
    await this.prisma.asset.update({
      where: {
        user_symbol_unique: { userId, symbol: order.symbol as AssetSymbol },
      },
      data: { balance: { increment: creditCents } },
    });

    const updatedAsset = await this.prisma.asset.findUnique({
      where: {
        user_symbol_unique: { userId, symbol: order.symbol as AssetSymbol },
      },
    });

    await this.reply(cmd.id, {
      status: "closed",
      orderId: order.id,
      pnl4,
      userBalanceCents: updatedAsset?.balance ?? 0,
    });
  }

  private async onGetUserBal(cmd: GetUserBalCmd) {
    const userId = String(cmd.userId ?? "");
    if (!userId) throw new Error("userId required");
    const usdcAsset = await this.prisma.asset.findUnique({
      where: {
        user_symbol_unique: { userId, symbol: "USDC" as AssetSymbol },
      },
    });

    await this.reply(cmd.id, { balance: usdcAsset?.balance ?? 0 });
  }

  private async checkLiquidations() {
    const now = Date.now();

    const openOrders = await this.prisma.order.findMany({
      where: { status: "open" },
    });

    const ops: Array<Promise<any>> = [];

    for (const o of openOrders) {
      const px = this.prices[o.symbol];
      if (!px) continue;

      const cur4 = toInt4(px.mid);

      const change =
        o.side === "long" ? cur4 - o.openingPrice : o.openingPrice - cur4;
      const pnl4 = Math.floor((change * o.leverage * o.qty) / 10_000);

      const lossCapacity4 = Math.floor(o.margin / o.leverage);

      if (pnl4 < -Math.floor(0.9 * lossCapacity4)) {
        const credit4 = o.margin + pnl4;
        const creditCents = Math.round(fromInt4(credit4) * 100);
        ops.push(
          this.prisma.order.update({
            where: { id: o.id },
            data: {
              status: "closed",
              pnl: pnl4,
              closingPrice: cur4,
              closedAt: new Date(),
              closeReason: CloseReason.Liquidation,
            },
          })
        );
        ops.push(
          this.prisma.asset.update({
            where: {
              user_symbol_unique: {
                userId: o.userId,
                symbol: o.symbol as AssetSymbol,
              },
            },
            data: { balance: { increment: creditCents } },
          })
        );
        ops.push(
          this.reply(crypto.randomUUID(), {
            status: "liquidated",
            orderId: o.id,
            userId: o.userId,
            asset: o.symbol,
            pnl4,
            ts: now,
          })
        );
      }
    }

    if (ops.length) await Promise.allSettled(ops);
  }

  private async reply(id: string, payload: any) {
    await this.r.xAdd(CALLBACK_STREAM, "*", {
      message: JSON.stringify({ id, ...payload }),
    });
  }
}

