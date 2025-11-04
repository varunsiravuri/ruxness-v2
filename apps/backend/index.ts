import express from "express";
import "dotenv/config";
import { makeBus } from "./lib/bus";
import { tradeRoutes } from "./routes/trades";
import { balanceRoutes } from "./routes/balance";
import { supportedAssetsRoutes } from "./routes/supportedAssets";
import {authRoutes} from "./routes/auth";
import {makeRequireUser} from "./middleware/requireUser";
import cookieParser from "cookie-parser"; 
import cors from "cors";
import { candlesRoutes } from "./routes/candles";

 
const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

async function main() {
  const app = express();
  app.use(cors({ origin: "http://localhost:3200", credentials: true }));
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
  v1.use("/", candlesRoutes());

  app.use("/api/v1", v1);

  app.get("/health", (_req, res) => res.json({ ok: true }));
  if (app._router && app._router.stack) {
    app._router.stack
      .filter((r: any) => r.route)
      .forEach((r: any) => console.log(r.route.path, Object.keys(r.route.methods)));
  }

  app.get("/test-root", (req, res) => res.json({ test: true }));

  app.listen(PORT, () => {
    console.log(`[backend] listening on :${PORT}`);
  });

  app.use((req, _res, next) => {
    console.log("[dbg] cookie:", req.headers.cookie);
    next();
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
