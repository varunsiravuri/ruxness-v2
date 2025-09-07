import express from "express";
import { makeBus } from "./lib/bus";
import { tradeRoutes } from "./routes/trades";
import { balanceRoutes } from "./routes/balance";
import { supportedAssetsRoutes } from "./routes/supportedAssets";
import { prisma } from "@ruxness/db";

const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const user = await prisma.user.findFirst();

async function main() {
  const app = express();
  app.use(express.json());

  const bus = makeBus(REDIS_URL); // bus for handling redis clients and subscriber
  await bus.start();

  const v1 = express.Router();
  v1.use("/trade", tradeRoutes(bus));
  v1.use("/balance", balanceRoutes(bus));
  v1.use("/", supportedAssetsRoutes());
  app.use("/api/v1", v1);

  app.listen(PORT, () => {
    console.log(`[backend] listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("[backend] fatal", err);
  process.exit(1);
});
