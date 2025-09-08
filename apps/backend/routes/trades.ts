import { Router } from "express";

export function tradeRoutes(
  bus: ReturnType<typeof import("../lib/bus").makeBus>
) {
  const r = Router();

  // create orderss chai aur cofeeee
  r.post("/create", async (req, res) => {
    const userId = (req as any).user.id;
    const { asset, type, margin, leverage, slippage } = req.body ?? {};
    if (
      !asset ||
      !["long", "short"].includes(type) ||
      !Number.isFinite(margin) ||
      !Number.isFinite(leverage)
    ) {
      return res
        .status(400)
        .json({
          error:
            "asset, type('long'|'short'), margin(number), leverage(number)",
        });
    }
    try {
      const reply = await bus.send("create-position", {
        userId,
        asset,
        type,
        margin,
        leverage,
        slippage,
      },);
      return res.json({ orderId: reply.orderId });
    } catch {
      return res.status(504).json({ error: "engine timeout" });
    }
  });

  //closing the orders , last order chai .
  r.post("/close", async (req, res) => {
    const userId = (req as any).user.id;
    const { orderId } = req.body ?? {};
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    try {
      const reply = await bus.send("close-position", { userId,orderId });
      return res.json(reply);
    } catch {
      return res.status(504).json({ error: "engine timeout" });
    }
  });

  return r;
}
