import { Router } from "express";
import type { makeBus } from "../lib/bus";
type Bus = ReturnType<typeof makeBus>;

export function tradeRoutes(bus: Bus) {
  const r = Router();
  r.post("/create", async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { asset, type, margin, leverage, slippage } = req.body ?? {};

      if (!userId)
        return res.status(401).json({ ok: false, error: "Session nahi hai " });

      if (
        !asset ||
        !["long", "short"].includes(type) ||
        !Number.isFinite(margin) ||
        !Number.isFinite(leverage)
      ) {
        return res.status(400).json({
          error:
            "asset, type('long'|'short'), margin(number), leverage(number) required",
        });
      }

      const reply = await bus.send("create-position", {
        userId,
        asset,
        type,
        margin,
        leverage,
        slippage,
      });

      return res.json({ orderId: reply.orderId });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = /timeout/i.test(msg) ? 504 : 400;
      return res.status(code).json({ error: msg });
    }
  });

  r.post("/close", async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { orderId } = req.body ?? {};

      if (!userId)
        return res.status(401).json({ ok: false, error: "Session nahi hai " });
      if (!orderId) return res.status(400).json({ error: "orderId required" });

      const reply = await bus.send("close-position", { userId, orderId });
      return res.json(reply);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = /timeout/i.test(msg) ? 504 : 400;
      return res.status(code).json({ error: msg });
    }
  });

  return r;
}
