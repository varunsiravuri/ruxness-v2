import { MongoClient } from "mongodb";
import { prisma } from "@ruxness/db";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME ?? "ruxness";

export async function startSnapshotter() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const snaps = mongo.db(DB_NAME).collection("engine_snapshots");

  setInterval(async () => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, email: true, usdBalanceCents: true },
      });
      const trades = await prisma.existingTrade.findMany({
        where: { closePrice: null },
        select: {
          id: true,
          userId: true,
          assetId: true,
          openPrice: true,
          leverage: true,
          qty: true,
        },
      });

      await snaps.insertOne({
        ts: new Date(),
        users,
        trades,
      });

      console.log("[snapshotter] snapshot saved", new Date().toISOString());
    } catch (e) {
      console.error("[snapshotter] error", e);
    }
  }, 10_000);
}
