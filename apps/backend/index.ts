// src/index.ts
import express from "express";
import { makeBus } from "./lib/bus";
import { tradeRoutes } from "./routes/trades";
import { balanceRoutes } from "./routes/balance";
import { supportedAssetsRoutes } from "./routes/supportedAssets";
import { prisma, Side } from "@ruxness/db";

const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const user = await prisma.user.findFirst();

async function main() {
  const app = express();
  app.use(express.json());

  // bus for handling redis clients and subscriber 
  const bus = makeBus(REDIS_URL);
  await bus.start();

  // routes 
  const v1 = express.Router();
  v1.use("/trade", tradeRoutes(bus));
  v1.use("/balance", balanceRoutes(bus));
  v1.use("/", supportedAssetsRoutes());
  app.use("/api/v1", v1);

  app.listen(PORT, () => {                           // starting the server 
    console.log(`[backend] listening on :${PORT}`);  
  });
}

main().catch((err) => {
  console.error("[backend] fatal", err);
  process.exit(1);
});
