import express from "express";
import "dotenv/config";
import { makeBus } from "./lib/bus";
import { tradeRoutes } from "./routes/trades";
import { balanceRoutes } from "./routes/balance";
import { supportedAssetsRoutes } from "./routes/supportedAssets";
import { prisma } from "@ruxness/db";
import {authRoutes} from "./routes/auth";
import {makeRequireUser} from "./middleware/requireUser";
import cookieParser from "cookie-parser"; 
 
const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const user = await prisma.user.findFirst();

async function main() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());  
  const bus = makeBus(REDIS_URL);
  await bus.start();
  
  const requireUser = makeRequireUser(bus.redis);
  const v1 = express.Router();
  v1.use("/auth" , authRoutes(bus.redis));
  v1.use("/trade",requireUser, tradeRoutes(bus));
  v1.use("/balance",requireUser,balanceRoutes(bus));
  v1.use("/", supportedAssetsRoutes());
  app.use("/api/v1", v1);

  app.listen(PORT, () => {
    console.log(`[backend] listening on :${PORT}`);
  });

  app.use((req, _res, next) => {
    console.log("[dbg] cookie:", req.headers.cookie);
    next();
  });
  app.get("/api/v1/debug/whoami", async (req, res) => {
    const sid = req.cookies?.ssid;
    const email = sid ? await bus.redis.get(`auth:sid:${sid}`) : null;
    res.json({ sid: sid ?? null, email: email ?? null });
  });

  app.get("/api/v1/debug/cookies", (req, res) => {
    res.json({ raw: req.headers.cookie ?? null, parsed: req.cookies ?? null });
  });

}

function mask(k?: string) {
  if (!k) return "(missing)";
  return `${k.slice(0, 4)}…${k.slice(-4)} (len ${k.length})`;
}
console.log("[env] RESEND_API_KEY:", mask(process.env.RESEND_API_KEY));



main().catch((err) => {
  console.error("[backend] fatal", err);
  process.exit(1);
});
