import { Router } from "express";
import { createPosition } from "engine/handlers/createPosition";
import { closePosition } from "engine/handlers/closePosition";
export function tradeRoutes(bus: any) {
  const r = Router();

  r.post("/create", async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId)
        return res.status(401).json({ ok: false, error: "Session nahi hai " });

      const { asset, type, margin, leverage, slippage } = req.body ?? {};
      const out = await createPosition(bus, {
        userId,
        asset,
        type,
        margin,
        leverage,
        slippage,
      });
      return res.json(out);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = /timeout/i.test(msg) ? 504 : 400;
      return res.status(code).json({ error: msg });
    }
  });

  r.post("/close", async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId)
        return res.status(401).json({ ok: false, error: "Session nahi hai " });

      const { orderId } = req.body ?? {};
      if (!orderId) return res.status(400).json({ error: "orderId required" });

      const out = await closePosition(bus, userId, orderId);
      return res.json(out);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = /timeout/i.test(msg) ? 504 : 400;
      return res.status(code).json({ error: msg });
    }
  });

  return r;
}
