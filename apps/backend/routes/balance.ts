import { Router } from "express";
import type { makeBus } from "../lib/bus";

type Bus = ReturnType<typeof makeBus>;

export function balanceRoutes(bus: Bus) {
  const r = Router();

  r.get("/usd", async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: "Session nahi hai " });
      }
      const reply = await bus.send("get-user-bal", { userId });
      const cents = Number(reply?.balance ?? 0);
      const dollars = Math.round(cents / 100);

      return res.json({ balance: dollars });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = /timeout/i.test(msg) ? 504 : 400;
      return res.status(code).json({ error: msg });
    }
  });
  r.get("/", async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: "Session nahi hai " });
      }
      const reply = await bus.send("get-asset-bal", { userId });
      return res.json(reply?.assetBal ?? {});
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = /timeout/i.test(msg) ? 504 : 400;
      return res.status(code).json({ error: msg });
    }
  });

  return r;
}
